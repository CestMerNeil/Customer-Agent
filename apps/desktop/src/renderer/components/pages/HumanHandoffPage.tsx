import React, { useMemo, useState } from "react";
import { Alert, Box, Button, Card, CardContent, Chip, Stack, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, TextField, Typography } from "@mui/material";
import type { MessageRecord, ReplyDraftRecord } from "@customer-agent/core";
import { useAsync } from "../useAsync";

export const HumanHandoffPage: React.FC = () => {
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [status, setStatus] = useState<string | undefined>();
  const drafts = useAsync(() => window.customerAgent.invoke("reply.draft.list", undefined), []);
  const messages = useAsync(() => window.customerAgent.invoke("message.list", { limit: 300 }), []);
  const messageById = useMemo(() => new Map((messages.data?.messages ?? []).map((message) => [message.id, message])), [messages.data]);
  const escalatedDrafts = (drafts.data?.drafts ?? []).filter((draft) => draft.state === "escalated");

  const refresh = () => {
    void drafts.refresh();
    void messages.refresh();
  };

  const resumeAi = async (draft: ReplyDraftRecord) => {
    const response = await window.customerAgent.invoke("reply.draft.ignore", { draftId: draft.id });
    setStatus(response.ok ? "已恢复 AI 队列处理入口" : response.error ?? "恢复失败");
    refresh();
  };

  const saveNote = async (draft: ReplyDraftRecord) => {
    const response = await window.customerAgent.invoke("reply.draft.note", { draftId: draft.id, note: notes[draft.id] ?? draft.operatorNote ?? "" });
    setStatus(response.ok ? "备注已保存" : response.error ?? "保存备注失败");
    refresh();
  };

  return (
    <Stack spacing={2.5}>
      {status && <Alert severity={status.includes("失败") ? "error" : "info"}>{status}</Alert>}
      <Card variant="outlined">
        <CardContent>
          <Stack direction={{ xs: "column", md: "row" }} spacing={1.5} sx={{ justifyContent: "space-between", mb: 2 }}>
            <Box>
              <Typography variant="h6">人工处理工作台</Typography>
              <Typography variant="body2" color="text.secondary">查看关键词、意图、营业时间或转接失败进入人工处理的会话。</Typography>
            </Box>
            <Button variant="outlined" onClick={refresh} startIcon={<span className="material-symbols-outlined">refresh</span>}>刷新</Button>
          </Stack>
          <TableContainer sx={{ border: "1px solid", borderColor: "divider", borderRadius: 1 }}>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>时间</TableCell>
                  <TableCell>店铺</TableCell>
                  <TableCell>买家</TableCell>
                  <TableCell>原因/状态</TableCell>
                  <TableCell>备注</TableCell>
                  <TableCell align="right">操作</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {escalatedDrafts.map((draft) => {
                  const message = messageById.get(draft.messageId);
                  return (
                    <TableRow key={draft.id} hover>
                      <TableCell>{new Date(draft.updatedAt).toLocaleString()}</TableCell>
                      <TableCell>{draft.shopId}</TableCell>
                      <TableCell>{message?.buyerNickname ?? message?.buyerId ?? draft.messageId}</TableCell>
                      <TableCell><Chip size="small" color="warning" label={handoffReason(message)} /></TableCell>
                      <TableCell>
                        <Stack direction="row" spacing={1}>
                          <TextField
                            size="small"
                            value={notes[draft.id] ?? draft.operatorNote ?? ""}
                            onChange={(event) => setNotes((current) => ({ ...current, [draft.id]: event.target.value }))}
                            placeholder="人工处理备注"
                          />
                          <Button size="small" variant="outlined" onClick={() => void saveNote(draft)}>保存</Button>
                        </Stack>
                      </TableCell>
                      <TableCell align="right">
                        <Button size="small" variant="outlined" onClick={() => void resumeAi(draft)}>恢复 AI</Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
                {!drafts.loading && escalatedDrafts.length === 0 && (
                  <TableRow><TableCell colSpan={6} align="center" sx={{ py: 5 }}>暂无人工处理会话。</TableCell></TableRow>
                )}
                {drafts.loading && (
                  <TableRow><TableCell colSpan={6} align="center" sx={{ py: 5 }}>正在读取人工处理会话...</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </TableContainer>
        </CardContent>
      </Card>
    </Stack>
  );
};

function handoffReason(message: MessageRecord | undefined): string {
  if (!message) return "人工处理";
  if (message.error) return message.error;
  if (message.state === "escalated") return "AI 已停止";
  return "等待人工";
}
