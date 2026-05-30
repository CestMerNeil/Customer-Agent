import React, { useEffect, useState } from "react";
import { Box, Card, CardContent, Typography, List, ListItem, ListItemText, Chip, Divider, Stack } from "@mui/material";
import Grid from "@mui/material/Grid";
import { useAsync } from "../useAsync";

export const AutoReplyDashboard: React.FC = () => {
  const [health, setHealth] = useState<{ ok: boolean; worker: string } | null>(null);
  const accounts = useAsync(() => window.customerAgent.invoke("account.list", undefined), []);
  const messages = useAsync(() => window.customerAgent.invoke("message.list", { limit: 10 }), []);
  const drafts = useAsync(() => window.customerAgent.invoke("reply.draft.list", undefined), []);

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

  return (
    <Box>
      <Grid container spacing={3}>
        {/* Status Cards */}
        <Grid size={{ xs: 12, md: 4 }}>
          <Card variant="outlined">
            <CardContent>
              <Typography color="text.secondary" gutterBottom variant="overline">
                运行账号
              </Typography>
              <Typography variant="h5">{accounts.data?.accounts.filter((account) => account.status === "online").length ?? 0} 个在线</Typography>
              <Typography variant="body2" sx={{ mt: 1, color: "text.secondary" }}>
                已配置账号 {accounts.data?.accounts.length ?? 0} 个
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid size={{ xs: 12, md: 4 }}>
          <Card variant="outlined">
            <CardContent>
              <Typography color="text.secondary" gutterBottom variant="overline">
                应用状态
              </Typography>
              <Typography variant="h5" color={health?.ok ? "success.main" : "error.main"}>
                {health ? (health.ok ? "运行正常" : "异常") : "连接中..."}
              </Typography>
              <Typography variant="body2" sx={{ mt: 1, color: "text.secondary" }}>
                Worker: {health?.worker ?? "未知"}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid size={{ xs: 12, md: 4 }}>
          <Card variant="outlined">
            <CardContent>
              <Typography color="text.secondary" gutterBottom variant="overline">
                模型状态
              </Typography>
              <Typography variant="h5" color="warning.main">未就绪</Typography>
              <Typography variant="body2" sx={{ mt: 1, color: "text.secondary" }}>
                请配置 OpenAI 兼容 endpoint 后测试连接
              </Typography>
            </CardContent>
          </Card>
        </Grid>

        {/* Message Flow Preview (Mock) */}
        <Grid size={{ xs: 12 }}>
          <Card variant="outlined">
            <CardContent>
              <Typography variant="h6" gutterBottom>
                最近消息流水
              </Typography>
              <Divider sx={{ mb: 2 }} />
              <List>
                {(messages.data?.messages ?? []).length === 0 ? (
                  <ListItem sx={{ px: 0 }}>
                    <ListItemText secondary={messages.loading ? "正在读取消息..." : "暂无真实消息。启动拼多多账号后会在这里显示。"} />
                  </ListItem>
                ) : messages.data?.messages.map((message) => (
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
              <Typography variant="body2" color="text.secondary">
                待审核草稿：{drafts.data?.drafts.filter((draft) => draft.state === "draft_ready").length ?? 0}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </Box>
  );
};
