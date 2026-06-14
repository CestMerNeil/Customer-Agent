import React, { useEffect, useState } from "react";
import { Alert, Box, Button, Card, CardContent, Chip, Divider, Stack, TextField, Typography } from "@mui/material";
import Grid from "@mui/material/Grid";
import type { InferenceRuntimeConfig } from "@customer-agent/core";

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
    <Grid container spacing={2.5}>
      <Grid size={{ xs: 12, md: 8 }}>
        <Card variant="outlined">
          <CardContent sx={{ p: 3 }}>
            <Stack direction="row" sx={{ justifyContent: "space-between", alignItems: "center", mb: 2 }}>
              <Box>
                <Typography variant="h6">推理 Endpoint</Typography>
                <Typography variant="body2" color="text.secondary">
                  兼容 OpenAI `/chat/completions` 和 `/embeddings` 的本地或远程服务。
                </Typography>
              </Box>
              <Chip
                label={health ? (health.ok ? "API 可用" : "API 不可用") : "未测试"}
                color={health?.ok ? "success" : health ? "error" : "default"}
              />
            </Stack>
            <Stack spacing={2}>
              <TextField fullWidth label="API URL" value={baseUrl} onChange={(event) => setBaseUrl(event.target.value)} />
              <TextField fullWidth label="API Key" type="password" value={apiKey} onChange={(event) => setApiKey(event.target.value)} />
              <TextField fullWidth label="模型名称" value={chatModel} onChange={(event) => setChatModel(event.target.value)} />
              <TextField fullWidth label="Embedding 模型" value={embeddingModel} onChange={(event) => setEmbeddingModel(event.target.value)} />
              <Stack direction="row" spacing={1}>
                <Button variant="contained" onClick={save} startIcon={<span className="material-symbols-outlined">save</span>}>保存配置</Button>
                <Button variant="outlined" onClick={test} startIcon={<span className="material-symbols-outlined">network_ping</span>}>测试连接</Button>
              </Stack>
              {saved && <Typography color="success.main" variant="body2">配置已保存。</Typography>}
              {health?.error && <Typography color="error.main" variant="body2">{health.error}</Typography>}
            </Stack>
          </CardContent>
        </Card>
      </Grid>

      <Grid size={{ xs: 12, md: 4 }}>
        <Card variant="outlined" sx={{ height: "100%" }}>
          <CardContent>
              <Typography variant="h6">本地推理 Runtime</Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mt: 0.75 }}>
              本地模型请提供 .gguf 文件路径（支持本地路径或 HTTPS 下载链接），由 llama.cpp 或兼容二进制启动为 OpenAI 兼容服务。
            </Typography>
              <Divider sx={{ my: 2 }} />
            <Stack spacing={2}>
              <TextField
                fullWidth
                size="small"
                label="Model ID"
                value={runtimeConfig.modelId}
                onChange={(event) => updateRuntime({ modelId: event.target.value })}
              />
              <TextField
                fullWidth
                size="small"
                label="运行时命令（如 llama-server）"
                value={runtimeConfig.command}
                onChange={(event) => updateRuntime({ command: event.target.value })}
              />
              <TextField
                fullWidth
                size="small"
                label="运行时下载链接（可选）"
                value={runtimeConfig.runtimeDownloadUrl ?? ""}
                onChange={(event) => updateRuntime({ runtimeDownloadUrl: event.target.value })}
                helperText="留空时仅使用 PATH / 打包二进制。"
              />
              <TextField
                fullWidth
                size="small"
                label="SHA256（可选）"
                value={runtimeConfig.runtimeDownloadSha256 ?? ""}
                onChange={(event) => updateRuntime({ runtimeDownloadSha256: event.target.value })}
              />
              <TextField
                fullWidth
                size="small"
                label="命令参数（空格分隔）"
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
              <TextField
                fullWidth
                size="small"
                label="模型路径"
                value={runtimeConfig.modelPath}
                placeholder="留空将自动从模型配置中解析/下载本地模型路径"
                onChange={(event) => updateRuntime({ modelPath: event.target.value })}
              />
              <TextField
                fullWidth
                size="small"
                label="主机"
                value={runtimeConfig.host}
                onChange={(event) => updateRuntime({ host: event.target.value })}
              />
              <TextField
                fullWidth
                size="small"
                label="端口"
                type="number"
                value={runtimeConfig.port}
                onChange={(event) => updateRuntime({ port: Number(event.target.value) })}
              />
              <Divider />
              <Stack direction="row" spacing={1}>
                <Button
                  fullWidth
                  variant="outlined"
                  onClick={download}
                  startIcon={<span className="material-symbols-outlined">download</span>}
                >
                  下载模型
                </Button>
                <Button
                  fullWidth
                  variant="outlined"
                  onClick={prepareRuntime}
                  startIcon={<span className="material-symbols-outlined">build</span>}
                >
                  准备运行时
                </Button>
                <Button
                  fullWidth
                  variant={runtimeStatus?.running ? "outlined" : "contained"}
                  color={runtimeStatus?.running ? "warning" : "primary"}
                  onClick={runtimeStatus?.running ? stopRuntime : startRuntime}
                  startIcon={<span className="material-symbols-outlined">bolt</span>}
                >
                  {runtimeStatus?.running ? "停止服务" : "启动本地服务"}
                </Button>
              </Stack>
              <Button
                fullWidth
                variant="text"
                onClick={refreshRuntimeStatus}
                startIcon={<span className="material-symbols-outlined">refresh</span>}
              >
                刷新运行时状态
              </Button>
              <Typography variant="body2" color="text.secondary">
                当前状态：{runtimeStatus?.running ? `运行中（PID: ${runtimeStatus.pid ?? "未知"}）` : "未运行"}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                运行时：{runtimeStatus?.runtimeReady ? "已就绪" : runtimeStatus?.runtimeError ? `未就绪：${runtimeStatus.runtimeError}` : "未检测"}
              </Typography>
              <Typography variant="caption" color="text.secondary" component="div">
                {runtimeStatus?.baseUrl ? `本地服务: ${runtimeStatus.baseUrl}` : `地址: http://${runtimeConfig.host}:${runtimeConfig.port}/v1`}
              </Typography>
              <Typography variant="caption" color="text.secondary" component="div">
                {runtimeStatus?.modelPath ? `模型路径: ${runtimeStatus.modelPath}` : `模型ID: ${runtimeConfig.modelId}`}
              </Typography>
              <Typography variant="caption" color="text.secondary" component="div">
                {runtimeStatus?.runtimeCommand ? `运行时命令: ${runtimeStatus.runtimeCommand}` : `运行时命令: ${runtimeConfig.command}`}
              </Typography>
            </Stack>
            {actionMessage && <Alert sx={{ mt: 2 }} severity={actionMessage.includes("失败") ? "error" : "info"}>{actionMessage}</Alert>}
          </CardContent>
        </Card>
      </Grid>
    </Grid>
  );
};
