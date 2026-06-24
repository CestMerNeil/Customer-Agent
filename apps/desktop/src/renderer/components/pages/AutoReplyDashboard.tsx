import React, { useEffect, useState } from "react";
import {
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Divider,
  LinearProgress,
  List,
  ListItem,
  ListItemText,
  Stack,
  Typography,
} from "@mui/material";
import Grid from "@mui/material/Grid";
import { useAsync } from "../useAsync";

interface AutoReplyDashboardProps {
  onNavigate?: (id: string) => void;
}

export const AutoReplyDashboard: React.FC<AutoReplyDashboardProps> = ({ onNavigate }) => {
  const [health, setHealth] = useState<{ ok: boolean; worker: string } | null>(null);
  const accounts = useAsync(() => window.customerAgent.invoke("account.list", undefined), []);
  const messages = useAsync(() => window.customerAgent.invoke("message.list", { limit: 10 }), []);
  const drafts = useAsync(() => window.customerAgent.invoke("reply.draft.list", undefined), []);
  const logs = useAsync(() => window.customerAgent.invoke("log.list", { limit: 20 }), []);
  const inference = useAsync(() => window.customerAgent.invoke("inference.health", undefined), []);

  const refreshAll = () => {
    void accounts.refresh();
    void messages.refresh();
    void drafts.refresh();
    void logs.refresh();
    void inference.refresh();
  };

  const modelReady = inference.data?.ok ?? false;

  useEffect(() => {
    const checkHealth = async () => {
      try {
        const result = await window.customerAgent.invoke("app.health", undefined);
        setHealth(result);
      } catch (error) {
        console.error("Health check failed:", error);
        setHealth({ ok: false, worker: "error" });
      }
    };

    void checkHealth();
    const interval = setInterval(() => void checkHealth(), 10000);
    return () => clearInterval(interval);
  }, []);

  const onlineCount = accounts.data?.accounts.filter((account) => account.status === "online").length ?? 0;
  const accountCount = accounts.data?.accounts.length ?? 0;
  const draftItems = drafts.data?.drafts ?? [];
  const pendingDraftCount = draftItems.filter((draft) => draft.state === "draft_ready" || draft.state === "failed").length;
  const ignoredDraftCount = draftItems.filter((draft) => draft.state === "ignored").length;
  const escalatedDraftCount = draftItems.filter((draft) => draft.state === "escalated").length;
  const recentMessages = messages.data?.messages ?? [];
  const recentDrafts = draftItems.slice(0, 5);

  return (
    <Box>
      <Grid container spacing={2.5}>
        <Grid size={{ xs: 12, md: 7 }}>
          <Card sx={{ minHeight: 230 }}>
            <CardContent sx={{ p: 3 }}>
              <Stack direction="row" spacing={1} sx={{ mb: 3, flexWrap: "wrap" }}>
                <Chip
                  label="实时接入"
                  size="small"
                  color="primary"
                />
                <Chip
                  label={health?.ok ? "Worker 就绪" : "Worker 未知"}
                  size="small"
                  color={health?.ok ? "success" : "default"}
                  variant="outlined"
                />
              </Stack>
              <Typography variant="h3" sx={{ maxWidth: 560 }}>
                把店铺消息、知识命中和人工审核集中在一张工作台里。
              </Typography>
              <Stack direction="row" spacing={1.5} sx={{ mt: 3 }}>
                <Button
                  variant="contained"
                  color="primary"
                  onClick={() => onNavigate?.("review")}
                  startIcon={<span className="material-symbols-outlined">bolt</span>}
                >
                  查看待处理
                </Button>
                <Button
                  variant="outlined"
                  onClick={refreshAll}
                  startIcon={<span className="material-symbols-outlined">refresh</span>}
                >
                  刷新状态
                </Button>
              </Stack>
            </CardContent>
          </Card>
        </Grid>

        <Grid size={{ xs: 12, md: 5 }}>
          <Grid container spacing={2}>
            <Grid size={{ xs: 12, sm: 6 }}>
              <Card variant="outlined" sx={{ height: "100%" }}>
                <CardContent>
                  <Typography color="text.secondary" gutterBottom variant="overline">
                    运行账号
                  </Typography>
                  <Typography variant="h4">{onlineCount} 个在线</Typography>
                  <Typography variant="body2" sx={{ mt: 1, color: "text.secondary" }}>
                    已配置账号 {accountCount} 个
                  </Typography>
                </CardContent>
              </Card>
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <Card variant="outlined" sx={{ height: "100%" }}>
                <CardContent>
                  <Typography color="text.secondary" gutterBottom variant="overline">
                    应用状态
                  </Typography>
                  <Typography variant="h4" color={health?.ok ? "success.main" : "error.main"}>
                    {health ? (health.ok ? "正常" : "异常") : "连接中"}
                  </Typography>
                  <Typography variant="body2" sx={{ mt: 1, color: "text.secondary" }}>
                    Worker: {health?.worker ?? "未知"}
                  </Typography>
                </CardContent>
              </Card>
            </Grid>
            <Grid size={{ xs: 12 }}>
              <Card variant="outlined">
                <CardContent>
                  <Stack direction="row" sx={{ justifyContent: "space-between", alignItems: "center", mb: 1 }}>
                    <Typography color="text.secondary" variant="overline">
                      模型准备度
                    </Typography>
                    <Chip
                      size="small"
                      color={inference.loading && !inference.data ? "default" : modelReady ? "success" : "warning"}
                      label={inference.loading && !inference.data ? "检测中" : modelReady ? "已就绪" : "未就绪"}
                      variant="outlined"
                    />
                  </Stack>
                  <LinearProgress
                    variant={inference.loading && !inference.data ? "indeterminate" : "determinate"}
                    value={modelReady ? 100 : 0}
                    color={modelReady ? "success" : "warning"}
                    sx={{ height: 8, borderRadius: 1, mb: 1.5 }}
                  />
                  <Typography variant="body2" color="text.secondary">
                    {modelReady
                      ? "推理 endpoint 健康检查通过。"
                      : inference.data?.error
                        ? sanitizeDiagnosticText(inference.data.error)
                        : "配置 OpenAI 兼容 endpoint 后可进行健康检查。"}
                  </Typography>
                </CardContent>
              </Card>
            </Grid>
            <Grid size={{ xs: 12 }}>
              <Card variant="outlined">
                <CardContent>
                  <Typography color="text.secondary" gutterBottom variant="overline">
                    最近诊断
                  </Typography>
                  <Stack spacing={1}>
                    {(logs.data?.logs ?? []).filter((log) => log.message.startsWith("诊断[")).slice(0, 3).map((log) => (
                      <Box key={log.id}>
                        <Typography variant="body2">{sanitizeDiagnosticText(log.message)}</Typography>
                        <Typography variant="caption" color="text.secondary">
                          {new Date(log.createdAt).toLocaleString()}
                        </Typography>
                      </Box>
                    ))}
                    {(logs.data?.logs ?? []).filter((log) => log.message.startsWith("诊断[")).length === 0 && (
                      <Typography variant="body2" color="text.secondary">
                        暂无诊断记录。
                      </Typography>
                    )}
                  </Stack>
                </CardContent>
              </Card>
            </Grid>
          </Grid>
        </Grid>

        <Grid size={{ xs: 12, md: 8 }}>
          <Card variant="outlined">
            <CardContent>
              <Stack direction="row" sx={{ justifyContent: "space-between", alignItems: "center", mb: 1 }}>
                <Typography variant="h6">最近消息流水</Typography>
                <Chip size="small" label={`待审核草稿 ${pendingDraftCount}`} color={pendingDraftCount ? "warning" : "default"} />
              </Stack>
              <Divider sx={{ mb: 2 }} />
              <List>
                {recentMessages.length === 0 ? (
                  <ListItem sx={{ px: 0 }}>
                    <ListItemText
                      primary={messages.loading ? "正在读取消息..." : "暂无真实消息"}
                      secondary={messages.loading ? "正在同步本地消息库。" : "启动拼多多账号后会在这里显示。"}
                    />
                  </ListItem>
                ) : recentMessages.map((message) => (
                  <React.Fragment key={message.id}>
                    <ListItem sx={{ px: 0 }}>
                      <ListItemText
                        primary={
                          <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
                            <Typography variant="subtitle2">{message.buyerNickname ?? message.buyerId}</Typography>
                            <Chip label={message.state} size="small" variant="outlined" />
                          </Stack>
                        }
                        secondary={message.content}
                      />
                      <Typography variant="caption" color="text.secondary">
                        {new Date(message.receivedAt).toLocaleTimeString()}
                      </Typography>
                    </ListItem>
                    <Divider component="li" />
                  </React.Fragment>
                ))}
              </List>
            </CardContent>
          </Card>
        </Grid>

        <Grid size={{ xs: 12, md: 4 }}>
          <Card variant="outlined" sx={{ height: "100%" }}>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                今日队列
              </Typography>
              <Stack spacing={2} sx={{ mt: 2, mb: 2 }}>
                  {[
                  ["新消息", recentMessages.length],
                  ["待审核", pendingDraftCount],
                  ["已忽略", ignoredDraftCount],
                  ["已升级", escalatedDraftCount],
                  ["在线账号", onlineCount],
                ].map(([label, value]) => (
                  <Box key={label} sx={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <Typography color="text.secondary">{label}</Typography>
                    <Typography variant="h5">{value}</Typography>
                  </Box>
                ))}
              </Stack>
              <Typography variant="body2" color="text.secondary">
                当前是空数据状态，接入真实店铺后这里会变成实时工作队列。
              </Typography>
            </CardContent>
          </Card>
        </Grid>

        <Grid size={{ xs: 12 }}>
          <Card variant="outlined">
            <CardContent>
              <Typography variant="h6" gutterBottom>
                最近草稿记录
              </Typography>
              <List>
                {recentDrafts.length === 0 ? (
                  <ListItem sx={{ px: 0 }}>
                    <ListItemText primary="暂无草稿记录" secondary="处理结果会在此保留发送、忽略、升级和失败历史。" />
                  </ListItem>
                ) : (
                  recentDrafts.map((draft) => (
                    <React.Fragment key={draft.id}>
                      <ListItem sx={{ px: 0 }}>
                        <ListItemText
                          primary={
                            <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
                              <Typography variant="subtitle2">{draft.id.slice(-8)}</Typography>
                              <Chip label={draft.state} size="small" variant="outlined" />
                            </Stack>
                          }
                          secondary={draft.reply.text}
                        />
                      </ListItem>
                      <Divider component="li" />
                    </React.Fragment>
                  ))
                )}
              </List>
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </Box>
  );
};

function sanitizeDiagnosticText(value: string): string {
  return value.replace(/^诊断\[[^\]]+\]\s*/u, "").replace(/\b(error|message)=/g, "").replace(/\s+/g, " ").trim();
}
