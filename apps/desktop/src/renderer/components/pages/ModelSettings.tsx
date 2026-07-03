import React, { useEffect, useRef, useState } from "react";
import { Alert, Box, Button, Collapse, InputBase, LinearProgress, MenuItem, Select, Stack, Typography } from "@mui/material";
import { createDefaultLocalRuntimeConfig } from "@customer-agent/core";
import type { InferenceRuntimeConfig, LocalModelProfile, ModelProvider } from "@customer-agent/core";
import { tokens } from "../../theme";

/** Design banner: colored icon circle + title + description + trailing chip. */
const StatusBanner: React.FC<{
  tone: "success" | "warning";
  title: string;
  description: React.ReactNode;
  badge: string;
  icon: string;
}> = ({ tone, title, description, badge, icon }) => {
  const palette = tone === "success"
    ? { border: "#cdebd8", bg: "#f4fbf6", iconBg: "#059669", sub: "#3f7a5a", chipCol: tokens.color.state.success, chipBg: tokens.color.state.successSoft }
    : { border: "#f0d9a8", bg: "#fffbf2", iconBg: "#e0900a", sub: "#9a6a12", chipCol: tokens.color.state.warning, chipBg: tokens.color.state.warningSoft };
  return (
    <Box
      sx={{
        border: `1px solid ${palette.border}`,
        bgcolor: palette.bg,
        borderRadius: "14px",
        p: "15px 18px",
        mb: "12px",
        display: "flex",
        alignItems: "center",
        gap: "14px",
      }}
    >
      <Box sx={{ width: 38, height: 38, flex: "none", borderRadius: "50%", bgcolor: palette.iconBg, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <span className="material-symbols-rounded" aria-hidden="true" style={{ fontSize: 23, color: "#fff" }}>{icon}</span>
      </Box>
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography sx={{ fontWeight: 700, fontSize: 15 }}>{title}</Typography>
        <Typography sx={{ fontSize: 12, fontWeight: 500, color: palette.sub, mt: "3px" }}>{description}</Typography>
      </Box>
      <Typography
        component="span"
        sx={{ fontSize: 11, fontWeight: 600, color: palette.chipCol, bgcolor: palette.chipBg, p: "6px 13px", borderRadius: "999px", flex: "none" }}
      >
        {badge}
      </Typography>
    </Box>
  );
};

/** Small check chip row item, design: green soft pill with leading icon. */
const CheckChip: React.FC<{ ok: boolean; label: string }> = ({ ok, label }) => (
  <Typography
    component="span"
    sx={{
      fontSize: 11,
      fontWeight: 600,
      color: ok ? tokens.color.state.success : tokens.color.text.secondary,
      bgcolor: ok ? tokens.color.state.successSoft : "#7373731a",
      p: "5px 11px",
      borderRadius: "999px",
      display: "flex",
      alignItems: "center",
      gap: "5px",
    }}
  >
    <span className="material-symbols-rounded" aria-hidden="true" style={{ fontSize: 15 }}>{ok ? "check" : "remove"}</span>
    {label}
  </Typography>
);

/** "常用操作" list row: label + description on the left, one action on the right. */
const ActionRow: React.FC<{ label: string; description: string; action: React.ReactNode; labelColor?: string; borderTop?: boolean }> = ({
  label,
  description,
  action,
  labelColor,
  borderTop,
}) => (
  <Stack
    direction="row"
    sx={{
      alignItems: "center",
      gap: "14px",
      p: "11px 2px",
      ...(borderTop ? { borderTop: "1px solid #f0f0f0" } : { borderBottom: "1px solid #f0f0f0" }),
    }}
  >
    <Box sx={{ flex: 1, minWidth: 0 }}>
      <Typography sx={{ fontWeight: 600, fontSize: 13, ...(labelColor ? { color: labelColor } : {}) }}>{label}</Typography>
      <Typography sx={{ fontSize: 11, fontWeight: 500, color: tokens.color.text.tertiary, mt: "1px" }}>{description}</Typography>
    </Box>
    <Box sx={{ flexShrink: 0 }}>{action}</Box>
  </Stack>
);

const actionButton = { height: 34, minHeight: 34, px: "15px", fontSize: 12, fontWeight: 600, borderRadius: "9px", flex: "none" } as const;

export const ModelSettings: React.FC = () => {
  const [modelProvider, setModelProvider] = useState<ModelProvider>("local");
  const [baseUrl, setBaseUrl] = useState("http://localhost:8000/v1");
  const [apiKey, setApiKey] = useState("");
  const [showApiKey, setShowApiKey] = useState(false);
  const [chatModel, setChatModel] = useState("ggml-org/gemma-3n-E2B-it-GGUF:Q8_0");
  const [health, setHealth] = useState<{ ok: boolean; error?: string } | null>(null);
  const [saved, setSaved] = useState(false);
  const [queuePaused, setQueuePaused] = useState(false);
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
  const [advOpen, setAdvOpen] = useState(false);
  const [profiles, setProfiles] = useState<LocalModelProfile[]>([]);
  const [selectedProfileId, setSelectedProfileId] = useState("");
  const [downloadRequestId, setDownloadRequestId] = useState<string | null>(null);
  const downloadProgressByModel = useRef<Record<string, { receivedBytes: number; totalBytes?: number }>>({});
  const downloadTotalBytes = useRef<number | undefined>(undefined);
  const [downloadProgress, setDownloadProgress] = useState<{
    receivedBytes: number;
    totalBytes?: number;
    percent?: number;
  } | null>(null);

  useEffect(() => {
    void (async () => {
      const [configResponse, settingsResponse, healthResponse] = await Promise.all([
        window.customerAgent.invoke("inference.config.get", undefined),
        window.customerAgent.invoke("settings.get", undefined),
        window.customerAgent.invoke("inference.health", undefined).catch((error) => ({
          ok: false,
          error: error instanceof Error ? error.message : "AI 状态读取失败。",
        })),
      ]);
      if (configResponse.config) {
        setBaseUrl(configResponse.config.baseUrl);
        setApiKey(configResponse.config.apiKey ?? "");
        setChatModel(configResponse.config.chatModel);
      }
      const nextProvider = settingsResponse.settings.modelProvider
        ?? (configResponse.config && !isLocalInferenceEndpoint(configResponse.config.baseUrl) ? "remote" : "local");
      setModelProvider(nextProvider);
      setQueuePaused(Boolean(settingsResponse.settings.queue?.paused));
      const persistedRuntime = settingsResponse.settings.inferenceRuntime;
      if (persistedRuntime) {
        setRuntimeConfig((current) => ({ ...current, ...persistedRuntime }));
      }
      if (nextProvider === "local") {
        await loadLocalModelState(persistedRuntime);
      }
      setHealth(healthResponse);
    })();
  }, []);

  useEffect(() => {
    return window.customerAgent.on("inference.modelscope.download.progress", (event) => {
      if (downloadRequestId && event.requestId !== downloadRequestId) {
        return;
      }
      downloadProgressByModel.current[event.modelId] = {
        receivedBytes: event.receivedBytes,
        ...(event.totalBytes === undefined ? {} : { totalBytes: event.totalBytes }),
      };
      setDownloadProgress(aggregateDownloadProgress(downloadProgressByModel.current, downloadTotalBytes.current));
    });
  }, [downloadRequestId]);

  useEffect(() => {
    const id = window.setInterval(() => {
      if (document.visibilityState !== "visible") {
        return;
      }
      if (modelProvider === "local") {
        void refreshRuntimeStatus();
        return;
      }
      void window.customerAgent
        .invoke("inference.health", undefined)
        .then(setHealth)
        .catch(() => setHealth({ ok: false, error: "AI 状态读取失败。" }));
    }, 5_000);
    return () => window.clearInterval(id);
  }, [modelProvider]);

  const save = async () => {
    if (modelProvider === "remote") {
      await window.customerAgent.invoke("inference.config.save", {
        baseUrl,
        chatModel,
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

  const toggleAutoReply = async () => {
    if (queuePaused) {
      const result = await window.customerAgent.invoke("queue.resume", undefined);
      setQueuePaused(Boolean(result.settings?.queue?.paused ?? false));
      setActionMessage("已恢复自动回复。");
    } else {
      const result = await window.customerAgent.invoke("queue.pause", undefined);
      setQueuePaused(Boolean(result.settings?.queue?.paused ?? true));
      setActionMessage("已暂停自动回复。");
    }
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
  }

  async function loadLocalModelState(preferredRuntime?: Partial<InferenceRuntimeConfig>) {
    const response = await window.customerAgent.invoke("inference.local.profiles", undefined);
    setProfiles(response.profiles);
    const defaultProfile = response.profiles.find((profile) => profile.defaultFor === "chat");
    if (defaultProfile) {
      setRuntimeConfig((current) => {
        const baseRuntime = preferredRuntime ? { ...current, ...preferredRuntime } : current;
        const profile = response.profiles.find((item) => item.model.url === baseRuntime.modelId || item.model.id === baseRuntime.modelId) ?? defaultProfile;
        setSelectedProfileId((selected) => selected || profile.id);
        return {
          ...baseRuntime,
          ...runtimeFieldsForProfile(profile, baseRuntime),
        };
      });
    }
    await refreshRuntimeStatus();
  }

  const selectModelProvider = async (nextProvider: ModelProvider) => {
    if (nextProvider === modelProvider) {
      return;
    }
    setModelProvider(nextProvider);
    setHealth(null);
    setSaved(false);
    setActionMessage(nextProvider === "local" ? "已切换到本地模型，请保存配置。" : "已切换到云端 AI，请保存配置。");
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
    if (!selectedProfile) {
      setActionMessage("请先选择本地模型档案。");
      return;
    }
    const requestId = crypto.randomUUID();
    const totalBytes = profileDownloadSize(selectedProfile).totalBytes;
    downloadProgressByModel.current = {};
    downloadTotalBytes.current = totalBytes;
    setDownloadRequestId(requestId);
    setDownloadProgress({ receivedBytes: 0, ...(totalBytes === undefined ? {} : { totalBytes }) });
    const response = await window.customerAgent.invoke("inference.modelscope.download", {
      modelId: selectedProfile.model.url,
      requestId,
      ...(selectedProfile.model.sha256 ? { expectedSha256: selectedProfile.model.sha256 } : {}),
    });
    if (response.ok) {
      setRuntimeConfig((current) => ({
        ...current,
        ...runtimeFieldsForProfile(selectedProfile, current),
        modelPath: response.modelPath,
        ...(response.mmprojPath ? { mmprojPath: response.mmprojPath } : {}),
      }));
      setDownloadProgress((current) => current ? { ...current, percent: 100 } : current);
      setDownloadRequestId(null);
      downloadProgressByModel.current = {};
      downloadTotalBytes.current = undefined;
      setActionMessage(`模型下载完成：${response.modelPath}`);
      await refreshRuntimeStatus();
    } else {
      setDownloadProgress(null);
      setDownloadRequestId(null);
      downloadProgressByModel.current = {};
      downloadTotalBytes.current = undefined;
      setActionMessage(response.error ?? "模型下载失败。");
    }
  };

  const startRuntime = async () => {
    setActionMessage("正在准备本地 AI，请稍候...");
    const selectedProfile = profiles.find((profile) => profile.id === selectedProfileId);
    if (!selectedProfile) {
      setActionMessage("请先选择本地模型档案。");
      return;
    }
    const nextRuntimeConfig = {
      ...runtimeConfig,
      ...runtimeFieldsForProfile(selectedProfile, runtimeConfig),
    };
    const requestId = crypto.randomUUID();
    const totalBytes = profileDownloadSize(selectedProfile).totalBytes;
    downloadProgressByModel.current = {};
    downloadTotalBytes.current = totalBytes;
    setDownloadRequestId(requestId);
    setDownloadProgress({ receivedBytes: 0, ...(totalBytes === undefined ? {} : { totalBytes }) });
    const response = await window.customerAgent.invoke("inference.runtime.start", { ...nextRuntimeConfig, requestId });
    if (response.ok) {
      setRuntimeStatus((current) => ({
        ...(current ?? {}),
        running: response.running,
        ...(response.baseUrl ? { baseUrl: response.baseUrl } : {}),
        ...(response.pid === undefined ? {} : { pid: response.pid }),
      }));
      setDownloadProgress(null);
      setDownloadRequestId(null);
      downloadProgressByModel.current = {};
      downloadTotalBytes.current = undefined;
      setActionMessage("本地 AI 已就绪。");
      await refreshRuntimeStatus();
    } else {
      setDownloadProgress(null);
      setDownloadRequestId(null);
      downloadProgressByModel.current = {};
      downloadTotalBytes.current = undefined;
      setActionMessage(response.error ?? "启动失败。");
      await refreshRuntimeStatus();
    }
  };

  const stopRuntime = async () => {
    const response = await window.customerAgent.invoke("inference.runtime.stop", undefined);
    setRuntimeStatus((current) => ({
      ...(current ?? {}),
      running: response.running,
    }));
    setActionMessage(response.ok ? "已释放本地 AI。" : response.error ?? "停止失败。");
    await refreshRuntimeStatus();
  };

  const restartRuntime = async () => {
    setActionMessage("正在重新启动本地 AI，请稍候...");
    if (runtimeStatus?.running) {
      await window.customerAgent.invoke("inference.runtime.stop", undefined);
    }
    await startRuntime();
  };

  const deleteWeights = async () => {
    const selectedProfile = profiles.find((profile) => profile.id === selectedProfileId);
    if (!selectedProfile) {
      setActionMessage("请先选择本地模型档案。");
      return;
    }
    if (!window.confirm(`删除 ${selectedProfile.label} 已下载的模型权重？`)) {
      return;
    }

    setActionMessage("正在删除模型权重...");
    const response = await window.customerAgent.invoke("inference.model.delete", {
      modelId: selectedProfile.model.url,
      auxiliaryModelIds: selectedProfile.auxiliaryModels?.map((model) => model.url) ?? [],
    });
    if (response.ok) {
      setRuntimeConfig((current) => ({
        ...current,
        ...(current.modelId === selectedProfile.model.url ? { modelPath: "" } : {}),
        ...(selectedProfile.auxiliaryModels?.some((model) => model.url === current.mmprojModelId) ? { mmprojPath: "" } : {}),
      }));
      setActionMessage(response.deleted > 0 ? `已删除 ${response.deleted} 个缓存权重。` : "没有找到可删除的缓存权重。");
      await refreshRuntimeStatus();
    } else {
      setActionMessage(response.error ?? "删除模型权重失败。");
    }
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
      ...runtimeFieldsForProfile(profile, current, { resetPaths: true }),
    }));
    setActionMessage(`已选择：${profile.label}`);
  };

  const localEndpoint = modelProvider === "local";
  const running = runtimeStatus?.running ?? false;

  const cloudConnected = Boolean(health?.ok) && !localEndpoint;

  const fieldLabelRow = { display: "flex", alignItems: "baseline", gap: 1, mb: "6px" } as const;
  const fieldInput = {
    height: 40,
    px: "13px",
    border: "1px solid #e0e0e0",
    borderRadius: "9px",
    fontFamily: tokens.font.display,
    fontSize: 13,
    fontWeight: 500,
    width: "100%",
    "& input": { p: 0 },
  } as const;

  return (
    <Box sx={{ maxWidth: 780 }}>
      {/* mode toggle */}
      <Box sx={{ display: "inline-flex", bgcolor: "#f4f4f4", borderRadius: "10px", p: "4px", gap: "4px", mb: 1 }}>
        {([
          ["local", "computer", "本地 AI"],
          ["remote", "cloud", "云端 AI"],
        ] as const).map(([value, icon, label]) => {
          const selected = modelProvider === value;
          return (
            <Box
              key={value}
              component="button"
              type="button"
              aria-label={label}
              aria-pressed={selected}
              onClick={() => void selectModelProvider(value)}
              sx={{
                all: "unset",
                p: "8px 20px",
                borderRadius: "7px",
                bgcolor: selected ? "#fff" : "transparent",
                color: selected ? tokens.color.text.primary : "#8a8a8a",
                boxShadow: selected ? "0 1px 2px rgba(0,0,0,.08)" : "none",
                fontSize: 12,
                fontWeight: 600,
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: "7px",
              }}
            >
              <span className="material-symbols-rounded" aria-hidden="true" style={{ fontSize: 17 }}>{icon}</span>
              {label}
            </Box>
          );
        })}
      </Box>

      {localEndpoint ? (
        <Box>
          <Typography sx={{ fontSize: 12, fontWeight: 500, color: tokens.color.text.tertiary, mb: 2 }}>
            在本机运行，免费、聊天内容不外传；对电脑配置有一定要求。
          </Typography>

          <StatusBanner
            tone={running ? "success" : "warning"}
            icon={running ? "check" : "pause"}
            title={running ? "AI 正在工作" : "本地 AI 未加载"}
            description={
              running
                ? runtimeStatus?.runtimeName ?? "运行中 · 应用托管 llama-server"
                : "点击下方「重启」或在高级设置中准备本地 AI"
            }
            badge={running ? "一切正常" : "未加载"}
          />

          <Stack direction="row" spacing={1} sx={{ mb: "22px" }}>
            <CheckChip ok={Boolean(runtimeStatus?.runtimeReady)} label={runtimeStatus?.runtimeReady ? "程序已安装" : "程序未安装"} />
            <CheckChip ok={Boolean(runtimeStatus?.modelReady)} label={runtimeStatus?.modelReady ? "语言能力就绪" : "语言能力未就绪"} />
            <CheckChip ok={Boolean(health?.ok)} label={health?.ok ? "回复功能正常" : "回复未测试"} />
          </Stack>

          <Box sx={{ pb: "10px", borderBottom: `1px solid ${tokens.color.text.primary}`, mb: "2px" }}>
            <Typography sx={{ fontSize: 12, fontWeight: 700 }}>常用操作</Typography>
          </Box>
          <ActionRow
            label="检查 AI 是否正常"
            description="试答一条测试消息，约 5 秒"
            action={<Button variant="contained" onClick={test} sx={actionButton}>检查</Button>}
          />
          <ActionRow
            label={queuePaused ? "恢复自动回复" : "暂停自动回复"}
            description="暂停后新消息需在「队列」手动处理"
            action={<Button variant="outlined" onClick={() => void toggleAutoReply()} sx={actionButton}>{queuePaused ? "恢复" : "暂停"}</Button>}
          />
          <Box sx={{ mb: "20px" }}>
            <ActionRow
              label="重新启动 AI"
              description="回复变慢或异常时使用，约 1 分钟"
              action={<Button variant="outlined" onClick={() => void restartRuntime()} sx={actionButton}>重启</Button>}
            />
          </Box>

          <Stack
            direction="row"
            onClick={() => setAdvOpen((open) => !open)}
            sx={{ alignItems: "center", gap: 1, p: "11px 2px", borderTop: `1px solid ${tokens.color.border.hairline}`, cursor: "pointer" }}
          >
            <Typography sx={{ fontWeight: 700, fontSize: 12 }}>高级设置</Typography>
            <Typography sx={{ fontSize: 11, fontWeight: 500, color: tokens.color.text.tertiary }}>通常无需改动</Typography>
            <span
              className="material-symbols-rounded" aria-hidden="true"
              style={{ fontSize: 20, color: "#a3a3a3", marginLeft: "auto", transform: advOpen ? "rotate(180deg)" : "none", transition: "transform 150ms" }}
            >
              expand_more
            </span>
          </Stack>
          <Collapse in={advOpen}>
            <Box>
              <Stack direction="row" sx={{ alignItems: "center", gap: "14px", p: "11px 2px", borderTop: "1px solid #f0f0f0" }}>
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography sx={{ fontWeight: 600, fontSize: 13 }}>模型档案</Typography>
                  <Typography sx={{ fontSize: 11, fontWeight: 500, color: tokens.color.text.tertiary, mt: "1px" }}>
                    {runtimeConfig.modelId || "—"}
                  </Typography>
                </Box>
                <Select
                  size="small"
                  value={selectedProfileId}
                  onChange={(event) => selectProfile(event.target.value)}
                  sx={{ height: 34, borderRadius: "9px", fontSize: 12, fontWeight: 600, minWidth: 220 }}
                >
                  {profiles.map((profile) => (
                    <MenuItem key={profile.id} value={profile.id}>
                      {profile.label} · {profile.capabilities.join("/")}
                    </MenuItem>
                  ))}
                </Select>
              </Stack>
              <ActionRow
                borderTop
                label="更新 AI 能力"
                description="下载所选模型权重，建议空闲时进行"
                action={
                  <Stack direction="row" spacing={1.5} sx={{ alignItems: "center" }}>
                    {runtimeStatus?.modelReady && (
                      <Typography sx={{ fontSize: 11, fontWeight: 500, color: tokens.color.state.success }}>已缓存</Typography>
                    )}
                    <Button variant="outlined" onClick={() => void download()} sx={actionButton}>下载模型</Button>
                  </Stack>
                }
              />
              <ActionRow
                borderTop
                label="修复 AI"
                description="重新安装本地运行时，仅在自检出现异常时使用"
                action={<Button variant="outlined" onClick={() => void prepareRuntime()} sx={actionButton}>修复</Button>}
              />
              <ActionRow
                borderTop
                label="保存本地配置"
                description="保存当前模型与运行时设置"
                action={<Button variant="outlined" onClick={() => void save()} sx={actionButton}>保存</Button>}
              />
              <ActionRow
                borderTop
                label="清理 AI 数据"
                description="释放磁盘空间，清理后需重新下载才能使用"
                labelColor={tokens.color.state.error}
                action={
                  <Button
                    variant="outlined"
                    onClick={() => void deleteWeights()}
                    sx={{
                      ...actionButton,
                      borderColor: "#e6b9b9",
                      bgcolor: "#fdf5f5",
                      color: tokens.color.state.error,
                      "&:hover": { borderColor: "#e6b9b9", bgcolor: "#fbecec" },
                    }}
                  >
                    清理
                  </Button>
                }
              />
            </Box>
          </Collapse>

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
        </Box>
      ) : (
        <Box>
          <Typography sx={{ fontSize: 12, fontWeight: 500, color: tokens.color.text.tertiary, mb: "22px" }}>
            借助在线 AI 服务，回复更快更聪明；需要联网、填写服务商密钥，聊天内容会发送给该服务商。
          </Typography>

          <StatusBanner
            tone={cloudConnected ? "success" : "warning"}
            icon={cloudConnected ? "check" : "cloud_off"}
            title={cloudConnected ? "已连接" : "尚未连接"}
            description={
              cloudConnected
                ? "云端 AI 已启用，正在生成客服回复。"
                : "填写下方密钥并测试连接后，即可启用云端 AI 回复。"
            }
            badge={cloudConnected ? "已连接" : "待配置"}
          />

          <Box sx={{ pb: 1.5, borderBottom: `1px solid ${tokens.color.text.primary}`, mb: 2, mt: "14px" }}>
            <Typography sx={{ fontSize: 12, fontWeight: 700 }}>连接信息</Typography>
          </Box>

          <Stack spacing={2} sx={{ mb: 3 }}>
            <Box>
              <Box sx={fieldLabelRow}>
                <Typography sx={{ fontSize: 12, fontWeight: 600 }}>服务商密钥</Typography>
                <Typography sx={{ fontSize: 10, fontWeight: 500, color: tokens.color.text.tertiary }}>
                  服务商提供给你的一串账号密钥
                </Typography>
              </Box>
              <InputBase
                type={showApiKey ? "text" : "password"}
                value={apiKey}
                onChange={(event) => setApiKey(event.target.value)}
                sx={fieldInput}
                endAdornment={
                  <Box
                    component="button"
                    type="button"
                    aria-label={showApiKey ? "隐藏密钥" : "显示密钥"}
                    onClick={() => setShowApiKey((current) => !current)}
                    sx={{ all: "unset", cursor: "pointer", display: "flex" }}
                  >
                    <span className="material-symbols-rounded" aria-hidden="true" style={{ fontSize: 18, color: "#a3a3a3" }}>
                      {showApiKey ? "visibility" : "visibility_off"}
                    </span>
                  </Box>
                }
              />
            </Box>
            <Box>
              <Box sx={fieldLabelRow}>
                <Typography sx={{ fontSize: 12, fontWeight: 600 }}>服务地址</Typography>
                <Typography sx={{ fontSize: 10, fontWeight: 500, color: tokens.color.text.tertiary }}>默认无需修改</Typography>
              </Box>
              <InputBase value={baseUrl} onChange={(event) => setBaseUrl(event.target.value)} sx={{ ...fieldInput, color: "#525252" }} />
            </Box>
            <Box>
              <Box sx={fieldLabelRow}>
                <Typography sx={{ fontSize: 12, fontWeight: 600 }}>使用的模型</Typography>
                <Typography sx={{ fontSize: 10, fontWeight: 500, color: tokens.color.text.tertiary }}>回复所用的 AI 型号</Typography>
              </Box>
              <InputBase
                value={chatModel}
                onChange={(event) => setChatModel(event.target.value)}
                sx={{ ...fieldInput, fontFamily: tokens.font.family }}
              />
            </Box>
          </Stack>

          <Stack direction="row" spacing={1.5} sx={{ alignItems: "center", flexWrap: "wrap", gap: 1.5 }}>
            <Button
              variant="contained"
              onClick={test}
              startIcon={<span className="material-symbols-rounded" aria-hidden="true" style={{ fontSize: 18 }}>wifi_tethering</span>}
            >
              测试连接
            </Button>
            <Button variant="outlined" onClick={save}>
              保存并启用
            </Button>
            <Typography sx={{ fontSize: 11, fontWeight: 500, color: tokens.color.text.tertiary }}>
              测试连接会验证密钥是否可用
            </Typography>
            <Button variant="text" color="error" onClick={clearApiKey} sx={{ fontSize: 11 }}>
              清除 Key
            </Button>
          </Stack>
          {saved && <Typography variant="body2" color="success.main" sx={{ mt: 1.5 }}>已保存</Typography>}
          {health?.error && <Typography variant="body2" color="error.main" sx={{ mt: 1.5 }}>{health.error}</Typography>}
          {actionMessage && !localEndpoint && (
            <Alert sx={{ mt: 2 }} severity={actionMessage.includes("失败") ? "error" : "info"}>
              {actionMessage}
            </Alert>
          )}
        </Box>
      )}
    </Box>
  );
};

function runtimeFieldsForProfile(
  profile: LocalModelProfile,
  current: Partial<InferenceRuntimeConfig> = {},
  options: { resetPaths?: boolean } = {},
): Partial<InferenceRuntimeConfig> {
  const mmproj = profile.auxiliaryModels?.find((model) => model.purpose === "mmproj");
  const sameProfile = current.modelId === profile.model.url || current.modelId === profile.model.id;
  const keepPaths = sameProfile && !options.resetPaths;
  return {
    runtimeKind: profile.runtime.runtimeKind,
    modelId: profile.model.url,
    modelPath: keepPaths ? current.modelPath ?? "" : "",
    ...(mmproj ? {
      mmprojModelId: mmproj.url,
      mmprojPath: keepPaths && (current.mmprojModelId === mmproj.url || current.mmprojModelId === mmproj.id) ? current.mmprojPath ?? "" : "",
    } : {}),
  };
}

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

function aggregateDownloadProgress(
  byModel: Record<string, { receivedBytes: number; totalBytes?: number }>,
  expectedTotalBytes?: number,
): { receivedBytes: number; totalBytes?: number; percent?: number } {
  const receivedBytes = Object.values(byModel).reduce((sum, progress) => sum + progress.receivedBytes, 0);
  const observedTotalBytes = Object.values(byModel).reduce((sum, progress) => sum + (progress.totalBytes ?? 0), 0);
  const totalBytes = expectedTotalBytes ?? (observedTotalBytes > 0 ? observedTotalBytes : undefined);
  return {
    receivedBytes,
    ...(totalBytes === undefined ? {} : { totalBytes }),
    ...(totalBytes ? { percent: Math.min(100, Math.round((receivedBytes / totalBytes) * 100)) } : {}),
  };
}
