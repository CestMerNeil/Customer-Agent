import React, { useEffect, useState } from "react";
import { Box, Card, CardContent, Divider, List, ListItem, ListItemText, Typography, Switch, Select, MenuItem, FormControl, InputLabel, Button } from "@mui/material";
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
    <Box>
      <Grid container spacing={3}>
        <Grid size={{ xs: 12, md: 8 }}>
          <Card variant="outlined">
            <CardContent>
              <Typography variant="h6" gutterBottom>回复模式</Typography>
              <List>
                <ListItem>
                  <ListItemText primary="自动发送回复" secondary="AI 生成回复后直接发送给用户，无需人工干预。" />
                  <Switch checked={replyMode === "automatic"} onChange={(_, checked) => setReplyMode(checked ? "automatic" : "human_review")} />
                </ListItem>
                <Divider />
                <ListItem>
                  <ListItemText primary="人工审核模式" secondary="所有 AI 回复都将存为草稿，待人工确认后发送。" />
                  <Switch checked={replyMode === "human_review"} onChange={(_, checked) => setReplyMode(checked ? "human_review" : "automatic")} />
                </ListItem>
              </List>

              <Typography variant="h6" gutterBottom sx={{ mt: 4 }}>营业时间设置</Typography>
              <Box sx={{ p: 2, border: "1px solid", borderColor: "divider", borderRadius: 1 }}>
                <FormControl fullWidth size="small" sx={{ mb: 2 }}>
                  <InputLabel>营业时间策略</InputLabel>
                  <Select label="营业时间策略" defaultValue="24h">
                    <MenuItem value="24h">24 小时自动回复</MenuItem>
                    <MenuItem value="scheduled">仅非营业时间自动回复</MenuItem>
                  </Select>
                </FormControl>
                <Typography variant="caption" color="text.secondary">
                  非营业时间将自动切换至全自动回复模式。
                </Typography>
              </Box>

              <Typography variant="h6" gutterBottom sx={{ mt: 4 }}>本地数据管理</Typography>
              <List>
                <ListItem>
                  <ListItemText primary="数据目录" secondary="/Users/neil/Library/Application Support/Customer-Agent" />
                  <Button size="small" onClick={save}>保存设置</Button>
                </ListItem>
              </List>
              {message && <Typography color="success.main">{message}</Typography>}
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </Box>
  );
};
