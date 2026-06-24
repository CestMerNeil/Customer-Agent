import React, { useEffect, useState } from "react";
import { Alert, Box, Button, Card, CardContent, Chip, Stack, TextField, Typography } from "@mui/material";
import type { InferenceRuntimeConfig } from "@customer-agent/core";
import { tokens } from "../../theme";
import { FieldRow, InfoRow, SectionLabel } from "../SettingsKit";

export const ModelSettings: React.FC = () => {
  const [baseUrl, setBaseUrl] = useState("http://localhost:8000/v1");
  const [apiKey, setApiKey] = useState("");
  const [chatModel, setChatModel] = useState("qwen2.5-7b-instruct");
  const [embeddingModel, setEmbeddingModel] = useState("text-embedding-nomic-embed-text-v1.5");
  const [health, setHealth] = useState<{ ok: boolean; error?: string } | null>(null);
  const [saved, setSaved] = useState(false);
  const [runtimeConfig, setRuntimeConfig] = useState<InferenceRuntimeConfig>({
    provider: "llama_cpp",
    modelId: "",
    modelPath: "",
    command: "llama-server",
    host: "127.0.0.1",
    port: 8000,
  });
  const [runtimeStatus, setRuntimeStatus] = useState<{
    running: boolean;
    pid?: number;
    baseUrl?: string;
    host?: string;
    port?: number;
    modelPath?: string;
    modelId?: string;
    runtimeReady?: boolean;
    runtimeCommand?: string;
    runtimeError?: string;
  } | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  useEffect(() => {
    void window.customerAgent.invoke("inference.config.get", undefined).then((response) => {
      if (response.config) {
        setBaseUrl(response.config.baseUrl);
        setApiKey(response.config.apiKey ?? "");
        setChatModel(response.config.chatModel);
        setEmbeddingModel(response.config.embeddingModel);
      }
    });
    void window.customerAgent.invoke("settings.get", undefined).then((response) => {
      if (response.settings.inferenceRuntime) {
        setRuntimeConfig((current) => ({ ...current, ...response.settings.inferenceRuntime }));
      }
    });
    refreshRuntimeStatus();
  }, []);

  const save = async () => {
    await window.customerAgent.invoke("inference.config.save", {
      baseUrl,
      chatModel,
      embeddingModel,
      temperature: 0.3,
      maxTokens: 1000,
      ...(apiKey ? { apiKey } : {}),
    });
    await window.customerAgent.invoke("settings.save", {
      inferenceRuntime: runtimeConfig,
    });
    setSaved(true);
    setActionMessage("配置已保存。");
  };

  const test = async () => {
    setHealth(await window.customerAgent.invoke("inference.health", undefined));
  };

  const refreshRuntimeStatus = async () => {
    const status = await window.customerAgent.invoke("inference.runtime.status", undefined);
    setRuntimeStatus(status);
    if (status.baseUrl) {
      setBaseUrl(status.baseUrl);
      setRuntimeConfig((current) => ({
        ...current,
        host: status.host ?? current.host,
        port: status.port ?? current.port,
        modelPath: status.modelPath ?? current.modelPath,
        modelId: status.modelId ?? current.modelId,
        command: status.runtimeCommand ?? current.command,
      }));
    }
    setHealth(null);
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
    const response = await window.customerAgent.invoke("inference.modelscope.download", {
      modelId: runtimeConfig.modelId,
    });
    if (response.ok) {
      setRuntimeConfig((current) => ({ ...current, modelPath: response.modelPath }));
      await window.customerAgent.invoke("settings.save", {
        inferenceRuntime: { ...runtimeConfig, modelPath: response.modelPath },
      });
      setActionMessage(`模型下载完成：${response.modelPath}`);
      await refreshRuntimeStatus();
    } else {
      setActionMessage(response.error ?? "模型下载失败。");
    }
  };

  const startRuntime = async () => {
    setActionMessage("正在启动本地推理服务，请稍候...");
    const response = await window.customerAgent.invoke("inference.runtime.start", runtimeConfig);
    if (response.ok) {
      setRuntimeStatus((current) => ({
        ...(current ?? {}),
        running: response.running,
        ...(response.baseUrl ? { baseUrl: response.baseUrl } : {}),
        ...(response.pid === undefined ? {} : { pid: response.pid }),
      }));
      if (response.baseUrl) {
        setBaseUrl(response.baseUrl);
      }
      setActionMessage("本地推理服务已启动。");
      await refreshRuntimeStatus();
    } else {
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
    setActionMessage(response.ok ? "已停止本地推理服务。" : response.error ?? "停止失败。");
    await refreshRuntimeStatus();
  };

  const updateRuntime = (next: Partial<InferenceRuntimeConfig>) => {
    setRuntimeConfig((current) => ({ ...current, ...next }));
  };

  return (
    <Box sx={{ maxWidth: 880 }}>
      <Stack spacing={3}>
        <Box>
          <SectionLabel>运行状态</SectionLabel>
          <Card>
            <CardContent sx={{ p: 2.5 }}>
              <Stack direction="row" spacing={1} sx={{ mb: 2, flexWrap: "wrap", gap: 1 }}>
                <Chip
                  size="small"
                  color={runtimeStatus?.running ? "success" : "default"}
                  label={runtimeStatus?.running ? `运行中 · PID ${runtimeStatus.pid ?? "—"}` : "未运行"}
                />
                <Chip
                  size="small"
                  variant="outlined"
                  color={runtimeStatus?.runtimeReady ? "success" : runtimeStatus?.runtimeError ? "error" : "default"}
                  label={runtimeStatus?.runtimeReady ? "运行时就绪" : runtimeStatus?.runtimeError ? "运行时未就绪" : "运行时未检测"}
                />
                <Chip
                  size="small"
                  variant="outlined"
                  color={health?.ok ? "success" : health ? "error" : "default"}
                  label={health ? (health.ok ? "API 可用" : "API 不可用") : "API 未测试"}
                />
              </Stack>

              <Box>
                <InfoRow
                  label="服务地址"
                  value={runtimeStatus?.baseUrl ?? `http://${runtimeConfig.host}:${runtimeConfig.port}/v1`}
                />
                <InfoRow
                  label="模型路径"
                  value={runtimeStatus?.modelPath || runtimeConfig.modelPath || `模型ID: ${runtimeConfig.modelId || "—"}`}
                />
                <InfoRow
                  label="运行时命令"
                  value={runtimeStatus?.runtimeCommand || runtimeConfig.command}
                  last
                />
              </Box>

              <Stack direction="row" spacing={1} sx={{ mt: 2, flexWrap: "wrap", gap: 1 }}>
                <Button
                  variant={runtimeStatus?.running ? "outlined" : "contained"}
                  color={runtimeStatus?.running ? "warning" : "primary"}
                  onClick={runtimeStatus?.running ? stopRuntime : startRuntime}
                  startIcon={<span className="material-symbols-outlined">bolt</span>}
                >
                  {runtimeStatus?.running ? "停止服务" : "启动本地服务"}
                </Button>
                <Button variant="outlined" onClick={prepareRuntime} startIcon={<span className="material-symbols-outlined">build</span>}>
                  准备运行时
                </Button>
                <Button variant="outlined" onClick={download} startIcon={<span className="material-symbols-outlined">download</span>}>
                  下载模型
                </Button>
                <Button variant="text" onClick={refreshRuntimeStatus} startIcon={<span className="material-symbols-outlined">refresh</span>}>
                  刷新
                </Button>
              </Stack>

              {actionMessage && (
                <Alert sx={{ mt: 2 }} severity={actionMessage.includes("失败") ? "error" : "info"}>
                  {actionMessage}
                </Alert>
              )}
            </CardContent>
          </Card>
        </Box>

        <Box>
          <SectionLabel>推理服务 · OpenAI 兼容</SectionLabel>
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
              {saved && <Typography variant="body2" color="success.main" sx={{ ml: 0.5 }}>已保存</Typography>}
              {health?.error && <Typography variant="body2" color="error.main" sx={{ ml: 0.5 }}>{health.error}</Typography>}
            </Box>
          </Card>
        </Box>

        <Box>
          <SectionLabel>本地运行时 · llama.cpp</SectionLabel>
          <Card>
            <CardContent sx={{ px: 2.5, py: 1 }}>
              <FieldRow label="Model ID">
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
                  placeholder="留空将自动解析 / 下载本地模型"
                  onChange={(event) => updateRuntime({ modelPath: event.target.value })}
                />
              </FieldRow>
              <FieldRow label="主机 / 端口">
                <Stack direction="row" spacing={1}>
                  <TextField
                    fullWidth
                    size="small"
                    value={runtimeConfig.host}
                    onChange={(event) => updateRuntime({ host: event.target.value })}
                  />
                  <TextField
                    size="small"
                    type="number"
                    value={runtimeConfig.port}
                    onChange={(event) => updateRuntime({ port: Number(event.target.value) })}
                    sx={{ width: 120 }}
                  />
                </Stack>
              </FieldRow>
              <FieldRow label="运行时命令">
                <TextField
                  fullWidth
                  size="small"
                  placeholder="llama-server"
                  value={runtimeConfig.command}
                  onChange={(event) => updateRuntime({ command: event.target.value })}
                />
              </FieldRow>
              <FieldRow label="命令参数">
                <TextField
                  fullWidth
                  size="small"
                  placeholder="空格分隔"
                  value={runtimeConfig.commandArgs?.join(" ") ?? ""}
                  onChange={(event) =>
                    updateRuntime({
                      commandArgs: event.target.value
                        .split(" ")
                        .map((item) => item.trim())
                        .filter((item) => item.length > 0),
                    })
                  }
                />
              </FieldRow>
              <FieldRow label="下载链接">
                <TextField
                  fullWidth
                  size="small"
                  placeholder="可选，留空仅用 PATH / 打包二进制"
                  value={runtimeConfig.runtimeDownloadUrl ?? ""}
                  onChange={(event) => updateRuntime({ runtimeDownloadUrl: event.target.value })}
                />
              </FieldRow>
              <FieldRow label="SHA256" last>
                <TextField
                  fullWidth
                  size="small"
                  placeholder="可选，校验下载二进制"
                  value={runtimeConfig.runtimeDownloadSha256 ?? ""}
                  onChange={(event) => updateRuntime({ runtimeDownloadSha256: event.target.value })}
                />
              </FieldRow>
            </CardContent>
            <Box sx={{ px: 2.5, py: 1.5, borderTop: `1px solid ${tokens.color.border.hairline}` }}>
              <Typography variant="caption" color="text.secondary">
                .gguf 路径支持本地或 HTTPS 链接，由 llama.cpp 或兼容二进制启动为 OpenAI 兼容服务。
              </Typography>
            </Box>
          </Card>
        </Box>
      </Stack>
    </Box>
  );
};
