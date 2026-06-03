import React, { useEffect, useState } from "react";
import { Alert, Box, Button, Card, CardContent, Divider, FormControl, InputLabel, List, ListItem, ListItemText, MenuItem, Select, Stack, Switch, Typography } from "@mui/material";
import Grid from "@mui/material/Grid";
import type { ReplyMode } from "@customer-agent/core";

export const SettingsPage: React.FC = () => {
  const [replyMode, setReplyMode] = useState<ReplyMode>("human_review");
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    void window.customerAgent.invoke("settings.get", undefined).then((response) => {
      setReplyMode(response.settings.replyMode);
    });
  }, []);

  const save = async () => {
    await window.customerAgent.invoke("settings.save", { replyMode });
    setMessage("设置已保存");
  };

  return (
    <Grid container spacing={2.5}>
      <Grid size={{ xs: 12, md: 8 }}>
        <Card variant="outlined">
          <CardContent sx={{ p: 3 }}>
            <Stack direction="row" sx={{ justifyContent: "space-between", alignItems: "center" }}>
              <Box>
                <Typography variant="h6">回复策略</Typography>
                <Typography variant="body2" color="text.secondary">
                  控制 AI 回复是直接发送，还是先进入人工审核队列。
                </Typography>
              </Box>
              <Button variant="contained" onClick={save} startIcon={<span className="material-symbols-outlined">save</span>}>
                保存设置
              </Button>
            </Stack>
            <List sx={{ mt: 2 }}>
              <ListItem>
                <ListItemText primary="自动发送回复" secondary="AI 生成回复后直接发送给用户。" />
                <Switch checked={replyMode === "automatic"} onChange={(_, checked) => setReplyMode(checked ? "automatic" : "human_review")} />
              </ListItem>
              <Divider />
              <ListItem>
                <ListItemText primary="人工审核模式" secondary="所有 AI 回复都存为草稿，待人工确认后发送。" />
                <Switch checked={replyMode === "human_review"} onChange={(_, checked) => setReplyMode(checked ? "human_review" : "automatic")} />
              </ListItem>
            </List>
            {message && <Alert sx={{ mt: 2 }} severity="success">{message}</Alert>}
          </CardContent>
        </Card>
      </Grid>

      <Grid size={{ xs: 12, md: 4 }}>
        <Stack spacing={2.5}>
          <Card variant="outlined">
            <CardContent>
              <Typography variant="h6">营业时间</Typography>
              <FormControl fullWidth size="small" sx={{ mt: 2 }}>
                <InputLabel>营业时间策略</InputLabel>
                <Select label="营业时间策略" defaultValue="24h">
                  <MenuItem value="24h">24 小时自动回复</MenuItem>
                  <MenuItem value="scheduled">仅非营业时间自动回复</MenuItem>
                </Select>
              </FormControl>
            </CardContent>
          </Card>
          <Card variant="outlined">
            <CardContent>
              <Typography variant="h6">本地数据</Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                /Users/neil/Library/Application Support/Customer-Agent
              </Typography>
            </CardContent>
          </Card>
        </Stack>
      </Grid>
    </Grid>
  );
};
