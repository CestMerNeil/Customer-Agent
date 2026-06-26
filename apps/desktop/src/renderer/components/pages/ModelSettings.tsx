import React, { useEffect, useState } from "react";
import { Alert, Box, Button, Card, CardContent, Chip, LinearProgress, MenuItem, Stack, TextField, ToggleButton, ToggleButtonGroup, Typography } from "@mui/material";
import { createDefaultLocalRuntimeConfig } from "@customer-agent/core";
import type { InferenceRuntimeConfig, LocalModelProfile, ModelProviderMode } from "@customer-agent/core";
import { tokens } from "../../theme";
import { FieldRow, InfoRow, SectionLabel } from "../SettingsKit";

export const ModelSettings: React.FC = () => {
  const [modelProvider, setModelProvider] = useState<ModelProviderMode>("local");
  const [baseUrl, setBaseUrl] = useState("http://localhost:8000/v1");
  const [apiKey, setApiKey] = useState("");
  const [chatModel, setChatModel] = useState("ggml-org/gemma-3n-E2B-it-GGUF:Q8_0");
  const [embeddingModel, setEmbeddingModel] = useState("");
  const [health, setHealth] = useState<{ ok: boolean; error?: string } | null>(null);
  const [saved, setSaved] = useState(false);
  const [runtimeConfig, setRuntimeConfig] = useState<InferenceRuntimeConfig>({
    ...createDefaultLocalRuntimeConfig(),
  });
  const [runtimeStatus, setRuntimeStatus] = useState<{
    running: boolean;
    pid?: number;
    baseUrl?: string;
    runtimeKind?: "managed_llama_server";
    runtimeName?: string;
    host?: string;
    port?: number;
    modelPath?: string;
    modelId?: string;
    modelReady?: boolean;
    runtimeReady?: boolean;
    runtimeCommand?: string;
    runtimeError?: string;
  } | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [profiles, setProfiles] = useState<LocalModelProfile[]>([]);
  const [selectedProfileId, setSelectedProfileId] = useState("");
  const [downloadRequestId, setDownloadRequestId] = useState<string | null>(null);
  const [downloadProgress, setDownloadProgress] = useState<{
    receivedBytes: number;
    totalBytes?: number;
    percent?: number;
  } | null>(null);

  useEffect(() => {
    void (async () => {
      const [configResponse, settingsResponse] = await Promise.all([
        window.customerAgent.invoke("inference.config.get", undefined),
        window.customerAgent.invoke("settings.get", undefined),
      ]);
      if (configResponse.config) {
        setBaseUrl(configResponse.config.baseUrl);
        setApiKey(configResponse.config.apiKey ?? "");
        setChatModel(configResponse.config.chatModel);
        setEmbeddingModel(configResponse.config.embeddingModel ?? "");
      }
      const nextProvider = settingsResponse.settings.modelProvider
        ?? (configResponse.config && !isLocalInferenceEndpoint(configResponse.config.baseUrl) ? "remote" : "local");
      setModelProvider(nextProvider);
      if (settingsResponse.settings.inferenceRuntime) {
        setRuntimeConfig((current) => ({ ...current, ...settingsResponse.settings.inferenceRuntime }));
      }
      if (nextProvider === "local") {
        await loadLocalModelState();
      }
    })();
  }, []);

  useEffect(() => {
    return window.customerAgent.on("inference.modelscope.download.progress", (event) => {
      if (downloadRequestId && event.requestId !== downloadRequestId) {
        return;
      }
      setDownloadProgress({
        receivedBytes: event.receivedBytes,
        ...(event.totalBytes === undefined ? {} : { totalBytes: event.totalBytes }),
        ...(event.percent === undefined ? {} : { percent: event.percent }),
      });
    });
  }, [downloadRequestId]);

  const save = async () => {
    if (modelProvider === "remote") {
      await window.customerAgent.invoke("inference.config.save", {
        baseUrl,
        chatModel,
        embeddingModel,
        temperature: 0.3,
        maxTokens: 1000,
        ...(apiKey ? { apiKey } : {}),
      });
      await window.customerAgent.invoke("settings.save", { modelProvider });
    } else {
      await window.customerAgent.invoke("settings.save", {
        modelProvider,
        inferenceRuntime: runtimeConfig,
      });
    }
    setSaved(true);
    setActionMessage("配置已保存。");
  };

  const test = async () => {
    const label = modelProvider === "local" ? "本地推理" : "远端连接";
    setActionMessage(`正在测试${label}...`);
    const result = await window.customerAgent.invoke("inference.health", undefined);
    setHealth(result);
    window.dispatchEvent(new CustomEvent("customer-agent:inference-health-changed", {
      detail: {
        modelProvider,
        ok: result.ok,
        ...(result.error ? { error: result.error } : {}),
      },
    }));
    setActionMessage(result.ok ? `${label}测试通过。` : result.error ?? `${label}测试失败。`);
  };

  const clearApiKey = async () => {
    await window.customerAgent.invoke("inference.config.clearApiKey", undefined);
    setApiKey("");
    setSaved(false);
    setActionMessage("API Key 已清除。");
    setHealth(null);
  };

  async function refreshRuntimeStatus() {
    const status = await window.customerAgent.invoke("inference.runtime.status", undefined);
    setRuntimeStatus(status);
    if (status.baseUrl) {
      setRuntimeConfig((current) => ({
        ...current,
        ...(status.host ?? current.host ? { host: status.host ?? current.host } : {}),
        ...(status.port ?? current.port ? { port: status.port ?? current.port } : {}),
        modelPath: status.modelPath ?? current.modelPath,
        modelId: status.modelId ?? current.modelId,
        ...(status.runtimeCommand ? { command: status.runtimeCommand } : {}),
      }));
    }
    setHealth(null);
  }

  async function loadLocalModelState() {
    const response = await window.customerAgent.invoke("inference.local.profiles", undefined);
    setProfiles(response.profiles);
    const defaultProfile = response.profiles.find((profile) => profile.defaultFor === "chat");
    if (defaultProfile) {
      setSelectedProfileId((current) => current || defaultProfile.id);
      setRuntimeConfig((current) => ({
        ...current,
        provider: defaultProfile.runtime.provider,
        modelId: current.modelId || defaultProfile.model.url,
      }));
    }
    await refreshRuntimeStatus();
  }

  const selectModelProvider = async (_event: React.MouseEvent<HTMLElement>, nextProvider: ModelProviderMode | null) => {
    if (!nextProvider || nextProvider === modelProvider) {
      return;
    }
    setModelProvider(nextProvider);
    setHealth(null);
    setSaved(false);
    setActionMessage(nextProvider === "local" ? "已切换到本地模型，请保存配置。" : "已切换到 Responses API，请保存配置。");
    if (nextProvider === "local") {
      await loadLocalModelState();
    }
  };

  const prepareRuntime = async () => {
    setActionMessage("正在准备本地运行时，请稍候...");
    const response = await window.customerAgent.invoke("inference.runtime.prepare", undefined);
    if (response.ok) {
      setActionMessage(response.runtimeCommand ? `运行时已就绪：${response.runtimeCommand}` : "运行时已就绪。");
      await refreshRuntimeStatus();
    } else {
      setActionMessage(response.error ?? "运行时准备失败。");
    }
  };

  const download = async () => {
    setActionMessage("正在解析/下载模型文件，请稍候...");
    const selectedProfile = profiles.find((profile) => profile.id === selectedProfileId);
    const requestId = crypto.randomUUID();
    setDownloadRequestId(requestId);
    setDownloadProgress({ receivedBytes: 0, ...profileDownloadSize(selectedProfile) });
    const response = await window.customerAgent.invoke("inference.modelscope.download", {
      modelId: runtimeConfig.modelId,
      requestId,
      ...(selectedProfile?.model.sha256 ? { expectedSha256: selectedProfile.model.sha256 } : {}),
    });
    if (response.ok) {
      setRuntimeConfig((current) => ({ ...current, modelPath: response.modelPath }));
      await window.customerAgent.invoke("settings.save", {
        inferenceRuntime: { ...runtimeConfig, modelPath: response.modelPath },
      });
      setDownloadProgress((current) => current ? { ...current, percent: 100 } : current);
      setDownloadRequestId(null);
      setActionMessage(`模型下载完成：${response.modelPath}`);
      await refreshRuntimeStatus();
    } else {
      setDownloadProgress(null);
      setDownloadRequestId(null);
      setActionMessage(response.error ?? "模型下载失败。");
    }
  };

  const startRuntime = async () => {
    setActionMessage("正在准备本地 AI，请稍候...");
    const selectedProfile = profiles.find((profile) => profile.id === selectedProfileId);
    const requestId = crypto.randomUUID();
    setDownloadRequestId(requestId);
    setDownloadProgress({ receivedBytes: 0, ...profileDownloadSize(selectedProfile) });
    const response = await window.customerAgent.invoke("inference.runtime.start", { ...runtimeConfig, requestId });
    if (response.ok) {
      setRuntimeStatus((current) => ({
        ...(current ?? {}),
        running: response.running,
        ...(response.baseUrl ? { baseUrl: response.baseUrl } : {}),
        ...(response.pid === undefined ? {} : { pid: response.pid }),
      }));
      setDownloadProgress(null);
      setDownloadRequestId(null);
      setActionMessage("本地 AI 已就绪。");
      await refreshRuntimeStatus();
    } else {
      setDownloadProgress(null);
      setDownloadRequestId(null);
      setActionMessage(response.error ?? "启动失败。");
      await refreshRuntimeStatus();
    }
  };

  const stopRuntime = async () => {
    const response = await window.customerAgent.invoke("inference.runtime.stop", undefined);
    setRuntimeStatus((current) => ({
      ...(current ?? {}),
      running: response.running,
      ...(response.running ? {} : {}),
    }));
    setActionMessage(response.ok ? "已释放本地 AI。" : response.error ?? "停止失败。");
    await refreshRuntimeStatus();
  };

  const updateRuntime = (next: Partial<InferenceRuntimeConfig>) => {
    setRuntimeConfig((current) => ({ ...current, ...next }));
  };

  const selectProfile = (profileId: string) => {
    setSelectedProfileId(profileId);
    const profile = profiles.find((item) => item.id === profileId);
    if (!profile) {
      return;
    }
    setChatModel(profile.model.id);
    setRuntimeConfig((current) => ({
      ...current,
      provider: profile.runtime.provider,
      modelId: profile.model.url,
      modelPath: "",
    }));
    setActionMessage(`已选择：${profile.label}`);
  };

  const localEndpoint = modelProvider === "local";

  return (
    <Box sx={{ maxWidth: 880 }}>
      <Stack spacing={3}>
        <Box>
          <SectionLabel>运行模式</SectionLabel>
          <Card>
            <CardContent sx={{ p: 2.5 }}>
              <ToggleButtonGroup
                exclusive
                value={modelProvider}
                onChange={selectModelProvider}
                aria-label="模型运行模式"
                size="small"
              >
                <ToggleButton value="local" aria-label="使用本地模型">
                  本地模型
                </ToggleButton>
                <ToggleButton value="remote" aria-label="使用 Responses API">
                  Responses API
                </ToggleButton>
              </ToggleButtonGroup>
            </CardContent>
          </Card>
        </Box>

        <Box>
          <SectionLabel>运行状态</SectionLabel>
          <Card>
            <CardContent sx={{ p: 2.5 }}>
              <Stack direction="row" spacing={1} sx={{ mb: 2, flexWrap: "wrap", gap: 1 }}>
                {localEndpoint ? (
                  <>
                    <Chip
                      size="small"
                      color={runtimeStatus?.running ? "success" : "default"}
                      label={runtimeStatus?.running ? "本地 AI 已加载" : "未加载"}
                    />
                    <Chip
                      size="small"
                      variant="outlined"
                      color={runtimeStatus?.runtimeReady ? "success" : runtimeStatus?.runtimeError ? "error" : "default"}
                      label={runtimeStatus?.runtimeReady ? "llama-server 就绪" : runtimeStatus?.runtimeError ? "运行时未就绪" : "运行时未检测"}
                    />
                    <Chip
                      size="small"
                      variant="outlined"
                      color={runtimeStatus?.modelReady ? "success" : "default"}
                      label={runtimeStatus?.modelReady ? "模型已缓存" : "模型未下载"}
                    />
                  </>
                ) : (
                  <>
                    <Chip size="small" color="info" label="Responses API 调试" />
                    <Chip
                      size="small"
                      variant="outlined"
                      color={apiKey ? "success" : "warning"}
                      label={apiKey ? "API Key 已配置" : "API Key 未配置"}
                    />
                    <Chip
                      size="small"
                      variant="outlined"
                      color={chatModel ? "success" : "warning"}
                      label={chatModel ? "模型已配置" : "模型未配置"}
                    />
                  </>
                )}
                <Chip
                  size="small"
                  variant="outlined"
                  color={health?.ok ? "success" : health ? "error" : "default"}
                  label={health ? (health.ok ? "推理可用" : "推理不可用") : "推理未测试"}
                />
              </Stack>

              <Box>
                {localEndpoint ? (
                  <>
                    <InfoRow
                      label="运行方式"
                      value={runtimeStatus?.runtimeName ?? "应用托管 llama-server"}
                    />
                    <InfoRow
                      label="模型"
                      value={runtimeStatus?.modelPath || runtimeConfig.modelPath || `模型ID: ${runtimeConfig.modelId || "—"}`}
                      last
                    />
                  </>
                ) : (
                  <>
                    <InfoRow label="运行方式" value="Responses API 调试" />
                    <InfoRow label="API URL" value={baseUrl || "—"} />
                    <InfoRow label="对话模型" value={chatModel || "—"} last />
                  </>
                )}
              </Box>

              <Stack direction="row" spacing={1} sx={{ mt: 2, flexWrap: "wrap", gap: 1 }}>
                {localEndpoint && (
                  <>
                    <Button
                      variant={runtimeStatus?.running ? "outlined" : "contained"}
                      color={runtimeStatus?.running ? "warning" : "primary"}
                      onClick={runtimeStatus?.running ? stopRuntime : startRuntime}
                      startIcon={<span className="material-symbols-outlined">bolt</span>}
                    >
                      {runtimeStatus?.running ? "释放本地 AI" : "准备本地 AI"}
                    </Button>
                    <Button variant="outlined" onClick={download} startIcon={<span className="material-symbols-outlined">download</span>}>
                      下载模型
                    </Button>
                    <Button variant="outlined" onClick={save} startIcon={<span className="material-symbols-outlined">save</span>}>
                      保存本地配置
                    </Button>
                  </>
                )}
                <Button variant="outlined" onClick={test} startIcon={<span className="material-symbols-outlined">network_ping</span>}>
                  {localEndpoint ? "测试本地推理" : "测试 Responses API"}
                </Button>
                {localEndpoint && (
                  <Button variant="text" onClick={refreshRuntimeStatus} startIcon={<span className="material-symbols-outlined">refresh</span>}>
                    刷新
                  </Button>
                )}
              </Stack>

              {actionMessage && (
                <Alert sx={{ mt: 2 }} severity={actionMessage.includes("失败") ? "error" : "info"}>
                  {actionMessage}
                </Alert>
              )}
              {downloadProgress && (
                <Box sx={{ mt: 2 }}>
                  <Stack direction="row" sx={{ justifyContent: "space-between", mb: 0.75 }}>
                    <Typography variant="caption" color="text.secondary">
                      {downloadProgress.totalBytes
                        ? `${formatBytes(downloadProgress.receivedBytes)} / ${formatBytes(downloadProgress.totalBytes)}`
                        : `${formatBytes(downloadProgress.receivedBytes)} 已下载`}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {downloadProgress.percent === undefined ? "下载中" : `${downloadProgress.percent}%`}
                    </Typography>
                  </Stack>
                  <LinearProgress
                    variant={downloadProgress.percent === undefined ? "indeterminate" : "determinate"}
                    value={downloadProgress.percent ?? 0}
                  />
                </Box>
              )}
            </CardContent>
          </Card>
        </Box>

        {!localEndpoint && (
          <Box>
            <SectionLabel>Responses API</SectionLabel>
            <Card>
              <CardContent sx={{ px: 2.5, py: 1 }}>
                <FieldRow label="API URL">
                  <TextField fullWidth size="small" value={baseUrl} onChange={(event) => setBaseUrl(event.target.value)} />
                </FieldRow>
                <FieldRow label="API Key">
                  <TextField fullWidth size="small" type="password" value={apiKey} onChange={(event) => setApiKey(event.target.value)} />
                </FieldRow>
                <FieldRow label="对话模型">
                  <TextField fullWidth size="small" value={chatModel} onChange={(event) => setChatModel(event.target.value)} />
                </FieldRow>
                <FieldRow label="Embedding 模型" last>
                  <TextField fullWidth size="small" value={embeddingModel} onChange={(event) => setEmbeddingModel(event.target.value)} />
                </FieldRow>
              </CardContent>
              <Box
                sx={{
                  px: 2.5,
                  py: 2,
                  borderTop: `1px solid ${tokens.color.border.hairline}`,
                  display: "flex",
                  alignItems: "center",
                  gap: 1,
                  flexWrap: "wrap",
                }}
              >
                <Button variant="contained" onClick={save} startIcon={<span className="material-symbols-outlined">save</span>}>
                  保存配置
                </Button>
                <Button variant="outlined" onClick={test} startIcon={<span className="material-symbols-outlined">network_ping</span>}>
                  测试连接
                </Button>
                <Button variant="text" color="error" onClick={clearApiKey} startIcon={<span className="material-symbols-outlined">key_off</span>}>
                  清除 Key
                </Button>
                {saved && <Typography variant="body2" color="success.main" sx={{ ml: 0.5 }}>已保存</Typography>}
                {health?.error && <Typography variant="body2" color="error.main" sx={{ ml: 0.5 }}>{health.error}</Typography>}
              </Box>
            </Card>
          </Box>
        )}

        {localEndpoint && (
          <Box>
            <SectionLabel>本地 AI</SectionLabel>
            <Card>
              <CardContent sx={{ px: 2.5, py: 1 }}>
                <FieldRow label="模型档案">
                  <TextField
                    select
                    fullWidth
                    size="small"
                    value={selectedProfileId}
                    onChange={(event) => selectProfile(event.target.value)}
                  >
                    {profiles.map((profile) => (
                      <MenuItem key={profile.id} value={profile.id}>
                        {profile.label} · {profile.capabilities.join("/")}
                      </MenuItem>
                    ))}
                  </TextField>
                </FieldRow>
                <FieldRow label="模型来源">
                  <TextField
                    fullWidth
                    size="small"
                    value={runtimeConfig.modelId}
                    onChange={(event) => updateRuntime({ modelId: event.target.value })}
                  />
                </FieldRow>
                <FieldRow label="模型路径">
                  <TextField
                    fullWidth
                    size="small"
                    value={runtimeConfig.modelPath}
                    placeholder="留空将由应用自动下载和缓存"
                    onChange={(event) => updateRuntime({ modelPath: event.target.value })}
                  />
                </FieldRow>
                <FieldRow label="SHA256" last>
                  <TextField
                    fullWidth
                    size="small"
                    value={profiles.find((profile) => profile.id === selectedProfileId)?.model.sha256 ?? ""}
                    disabled
                  />
                </FieldRow>
              </CardContent>
              <Box sx={{ px: 2.5, py: 1.5, borderTop: `1px solid ${tokens.color.border.hairline}` }}>
                <Typography variant="caption" color="text.secondary">
                  默认模型由应用从审核过的 ModelScope 档案下载并在主进程内加载，不需要安装外部推理工具。
                </Typography>
              </Box>
            </Card>
          </Box>
        )}
      </Stack>
    </Box>
  );
};

function isLocalInferenceEndpoint(baseUrl: string): boolean {
  try {
    const url = new URL(baseUrl);
    return ["127.0.0.1", "localhost", "::1"].includes(url.hostname);
  } catch {
    return true;
  }
}

function formatBytes(value: number): string {
  if (value < 1024 * 1024) {
    return `${(value / 1024).toFixed(1)} KB`;
  }
  return `${(value / 1024 / 1024).toFixed(1)} MB`;
}

function profileDownloadSize(profile: LocalModelProfile | undefined): { totalBytes?: number } {
  const totalBytes =
    (profile?.model.sizeBytes ?? 0)
    + (profile?.auxiliaryModels ?? []).reduce((sum, model) => sum + (model.sizeBytes ?? 0), 0);
  return totalBytes > 0 ? { totalBytes } : {};
}
