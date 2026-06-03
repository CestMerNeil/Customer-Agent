import React, { useEffect, useState } from "react";
import { Box, Button, Card, CardContent, Chip, Divider, Stack, TextField, Typography } from "@mui/material";
import Grid from "@mui/material/Grid";

export const ModelSettings: React.FC = () => {
  const [baseUrl, setBaseUrl] = useState("http://localhost:8000/v1");
  const [apiKey, setApiKey] = useState("");
  const [chatModel, setChatModel] = useState("qwen2.5-7b-instruct");
  const [embeddingModel, setEmbeddingModel] = useState("text-embedding-nomic-embed-text-v1.5");
  const [health, setHealth] = useState<{ ok: boolean; error?: string } | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    void window.customerAgent.invoke("inference.config.get", undefined).then((response) => {
      if (response.config) {
        setBaseUrl(response.config.baseUrl);
        setApiKey(response.config.apiKey ?? "");
        setChatModel(response.config.chatModel);
        setEmbeddingModel(response.config.embeddingModel);
      }
    });
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
    setSaved(true);
  };

  const test = async () => {
    setHealth(await window.customerAgent.invoke("inference.health", undefined));
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
            <Typography variant="h6">ModelScope / vLLM</Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.75 }}>
              本地模型生命周期已经有运行时管理器，当前界面保留部署入口。
            </Typography>
            <Divider sx={{ my: 2 }} />
            <TextField fullWidth size="small" label="Model ID" placeholder="qwen/Qwen2.5-7B-Instruct" />
            <Button fullWidth sx={{ mt: 1.5 }} variant="outlined" startIcon={<span className="material-symbols-outlined">deployed_code_update</span>}>
              下载并部署
            </Button>
          </CardContent>
        </Card>
      </Grid>
    </Grid>
  );
};
