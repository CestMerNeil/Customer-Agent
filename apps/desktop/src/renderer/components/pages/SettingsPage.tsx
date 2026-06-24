import React, { useEffect, useState } from "react";
import { Box, Button, Card, CardContent, Stack, Switch, TextField, Typography } from "@mui/material";
import type { ReplyMode } from "@customer-agent/core";
import { tokens } from "../../theme";
import { FieldRow, InfoRow, SectionLabel } from "../SettingsKit";

const DATA_DIR = "~/Library/Application Support/Customer-Agent";

export const SettingsPage: React.FC = () => {
  const [replyMode, setReplyMode] = useState<ReplyMode>("human_review");
  const [businessStart, setBusinessStart] = useState("09:00");
  const [businessEnd, setBusinessEnd] = useState("21:00");
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    void window.customerAgent.invoke("settings.get", undefined).then((response) => {
      setReplyMode(response.settings.replyMode);
      if (response.settings.businessHours) {
        setBusinessStart(response.settings.businessHours.start);
        setBusinessEnd(response.settings.businessHours.end);
      }
    });
  }, []);

  const save = async () => {
    await window.customerAgent.invoke("settings.save", {
      replyMode,
      businessHours: { start: businessStart, end: businessEnd },
    });
    setMessage("设置已保存");
  };

  return (
    <Box sx={{ maxWidth: 720 }}>
      <Stack spacing={3}>
        <Box>
          <SectionLabel>回复策略</SectionLabel>
          <Card>
            <CardContent sx={{ px: 2.5, py: 1.5 }}>
              <Stack direction="row" sx={{ alignItems: "center", gap: 2 }}>
                <Box sx={{ flexGrow: 1 }}>
                  <Typography variant="subtitle2">先人工审核后发送</Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ mt: 0.25 }}>
                    {replyMode === "human_review"
                      ? "AI 回复都存为草稿，在审核工作台确认后再发送。"
                      : "AI 生成回复后直接发送给买家，不经人工确认。"}
                  </Typography>
                </Box>
                <Switch
                  checked={replyMode === "human_review"}
                  onChange={(_, checked) => setReplyMode(checked ? "human_review" : "automatic")}
                  slotProps={{ input: { "aria-label": "先人工审核后发送" } }}
                />
              </Stack>
            </CardContent>
          </Card>
        </Box>

        <Box>
          <SectionLabel>营业时间</SectionLabel>
          <Card>
            <CardContent sx={{ px: 2.5, py: 1 }}>
              <FieldRow label="开始时间">
                <TextField
                  size="small"
                  type="time"
                  value={businessStart}
                  onChange={(event) => setBusinessStart(event.target.value)}
                  slotProps={{ inputLabel: { shrink: true } }}
                  sx={{ width: 140 }}
                />
              </FieldRow>
              <FieldRow label="结束时间" last>
                <TextField
                  size="small"
                  type="time"
                  value={businessEnd}
                  onChange={(event) => setBusinessEnd(event.target.value)}
                  slotProps={{ inputLabel: { shrink: true } }}
                  sx={{ width: 140 }}
                />
              </FieldRow>
            </CardContent>
          </Card>
        </Box>

        <Box>
          <SectionLabel>本地数据</SectionLabel>
          <Card>
            <CardContent sx={{ px: 2.5, py: 1 }}>
              <InfoRow
                label="数据目录"
                value={
                  <Typography variant="body2" sx={{ fontFamily: "ui-monospace, SFMono-Regular, monospace" }}>
                    {DATA_DIR}
                  </Typography>
                }
                last
              />
            </CardContent>
          </Card>
        </Box>

        <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
          <Button variant="contained" onClick={save} startIcon={<span className="material-symbols-outlined">save</span>}>
            保存设置
          </Button>
          {message && (
            <Typography variant="body2" sx={{ color: tokens.color.state.success }}>
              {message}
            </Typography>
          )}
        </Box>
      </Stack>
    </Box>
  );
};
