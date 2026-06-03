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

export const AutoReplyDashboard: React.FC = () => {
  const [health, setHealth] = useState<{ ok: boolean; worker: string } | null>(null);
  const accounts = useAsync(() => window.customerAgent.invoke("account.list", undefined), []);
  const messages = useAsync(() => window.customerAgent.invoke("message.list", { limit: 10 }), []);
  const drafts = useAsync(() => window.customerAgent.invoke("reply.draft.list", undefined), []);
  const logs = useAsync(() => window.customerAgent.invoke("log.list", { limit: 20 }), []);

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
          <Card
            variant="outlined"
            sx={{
              minHeight: 230,
              bgcolor: "#17211f",
              color: "#f5f7f2",
              overflow: "hidden",
              position: "relative",
              "&::after": {
                content: '""',
                position: "absolute",
                inset: "auto -12% -52% 36%",
                height: 260,
                background: "radial-gradient(circle, rgba(232, 196, 104, 0.35), transparent 62%)",
              },
            }}
          >
            <CardContent sx={{ position: "relative", zIndex: 1, p: 3 }}>
              <Stack direction="row" spacing={1} sx={{ mb: 4, flexWrap: "wrap" }}>
                <Chip label="Live intake" size="small" sx={{ bgcolor: "#e8c468", color: "#17211f", fontWeight: 800 }} />
                <Chip
                  label={health?.ok ? "Worker ready" : "Worker unknown"}
                  size="small"
                  sx={{ color: "#f5f7f2", borderColor: "rgba(255,255,255,.32)" }}
                  variant="outlined"
                />
              </Stack>
              <Typography variant="h3" sx={{ maxWidth: 560 }}>
                把店铺消息、知识命中和人工审核集中在一张工作台里。
              </Typography>
              <Stack direction="row" spacing={2} sx={{ mt: 4 }}>
                <Button variant="contained" color="primary" startIcon={<span className="material-symbols-outlined">bolt</span>}>
                  查看待处理
                </Button>
                <Button variant="outlined" sx={{ color: "#f5f7f2", borderColor: "rgba(255,255,255,.28)" }}>
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
                    <Chip size="small" color="warning" label="未就绪" variant="outlined" />
                  </Stack>
                  <LinearProgress variant="determinate" value={32} color="warning" sx={{ height: 8, borderRadius: 1, mb: 1.5 }} />
                  <Typography variant="body2" color="text.secondary">
                    配置 OpenAI 兼容 endpoint 后可进行健康检查。
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
