import React, { useEffect, useState } from "react";
import { Box, Button, Card, CardContent, Typography, TextField, Chip, Stack } from "@mui/material";
import Grid from "@mui/material/Grid";

export const ModelSettings: React.FC = () => {
  const [baseUrl, setBaseUrl] = useState("http://localhost:8000/v1");
  const [apiKey, setApiKey] = useState("");
  const [chatModel, setChatModel] = useState("qwen2.5-7b-instruct");
  const [embeddingModel, setEmbeddingModel] = useState("text-embedding-nomic-embed-text-v1.5");
  const [health, setHealth] = useState<{ ok: boolean; error?: string } | null>(null);

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
  };

  const test = async () => {
    setHealth(await window.customerAgent.invoke("inference.health", undefined));
  };

  return (
    <Box>
      <Grid container spacing={3}>
        <Grid size={{ xs: 12, md: 8 }}>
          <Card variant="outlined">
            <CardContent>
              <Typography variant="h6" gutterBottom>推理 Endpoint 配置</Typography>
              <Stack spacing={2}>
                <TextField
                  fullWidth
                  label="API URL"
                  placeholder="http://localhost:8000/v1"
                  value={baseUrl}
                  onChange={(event) => setBaseUrl(event.target.value)}
                  helperText="本地 vLLM 或外部 OpenAI 兼容接口地址"
                />
                <TextField
                  fullWidth
                  label="API Key"
                  type="password"
                  placeholder="如果需要请填写"
                  value={apiKey}
                  onChange={(event) => setApiKey(event.target.value)}
                />
                <TextField
                  fullWidth
                  label="模型名称"
                  placeholder="qwen2.5-7b-instruct"
                  value={chatModel}
                  onChange={(event) => setChatModel(event.target.value)}
                />
                <TextField
                  fullWidth
                  label="Embedding 模型"
                  placeholder="text-embedding-nomic-embed-text-v1.5"
                  value={embeddingModel}
                  onChange={(event) => setEmbeddingModel(event.target.value)}
                />
                <Box>
                  <Button variant="contained" onClick={save}>保存配置</Button>
                  <Button variant="outlined" sx={{ ml: 2 }} onClick={test}>测试连接</Button>
                </Box>
              </Stack>

              <Typography variant="h6" gutterBottom sx={{ mt: 4 }}>模型来源 (ModelScope)</Typography>
              <Box sx={{ p: 2, border: "1px solid", borderColor: "divider", borderRadius: 1 }}>
                <Typography variant="body2" gutterBottom>
                  您可以从 ModelScope 自动拉取模型并由应用自动管理 vLLM 服务。
                </Typography>
                <TextField
                  fullWidth
                  size="small"
                  label="Model ID"
                  placeholder="qwen/Qwen2.5-7B-Instruct"
                  sx={{ mt: 1, mb: 1 }}
                />
                <Button size="small">下载并部署</Button>
              </Box>

              <Typography variant="h6" gutterBottom sx={{ mt: 4 }}>健康检查</Typography>
              <Stack direction="row" spacing={1}>
                <Chip label={`API: ${health ? (health.ok ? "可用" : "不可用") : "未测试"}`} color={health?.ok ? "success" : "error"} size="small" />
                {health?.error && <Chip label={health.error} variant="outlined" size="small" />}
              </Stack>
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </Box>
  );
};
