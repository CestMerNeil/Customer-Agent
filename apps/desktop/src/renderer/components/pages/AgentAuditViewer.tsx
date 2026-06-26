import React from "react";
import { Box, Button, Card, CardContent, Chip, Divider, IconButton, Stack, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, TextField, Typography } from "@mui/material";
import { useAsync } from "../useAsync";

export const AgentAuditViewer: React.FC = () => {
  const [shopId, setShopId] = React.useState("");
  const [messageId, setMessageId] = React.useState("");
  const audit = useAsync(() => window.customerAgent.invoke("agent.audit.list", {
    limit: 100,
    ...(shopId.trim() ? { shopId: shopId.trim() } : {}),
    ...(messageId.trim() ? { messageId: messageId.trim() } : {}),
  }), [shopId, messageId]);
  const records = audit.data?.records ?? [];
  return (
    <Card variant="outlined">
      <CardContent>
        <Box sx={{ mb: 2, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <Box>
            <Typography variant="h6">Agent 审计</Typography>
            <Typography variant="body2" color="text.secondary">
              最近 100 条工具调用、结果、引用与最终回复事件。
            </Typography>
          </Box>
          <Stack direction="row" spacing={1}>
            <TextField size="small" label="店铺" value={shopId} onChange={(event) => setShopId(event.target.value)} />
            <TextField size="small" label="消息ID" value={messageId} onChange={(event) => setMessageId(event.target.value)} />
            <Button size="small" variant="outlined" onClick={() => { setShopId(""); setMessageId(""); }}>清空</Button>
            <IconButton size="small" onClick={audit.refresh} aria-label="刷新 Agent 审计">
              <span className="material-symbols-outlined">refresh</span>
            </IconButton>
          </Stack>
        </Box>
        <Divider sx={{ mb: 2 }} />
        {audit.error ? (
          <Typography color="error">{audit.error}</Typography>
        ) : (
          <TableContainer sx={{ maxHeight: 560, border: "1px solid", borderColor: "divider", borderRadius: 1 }}>
            <Table stickyHeader size="small">
              <TableHead>
                <TableRow>
                  <TableCell sx={{ width: 170 }}>时间</TableCell>
                  <TableCell sx={{ width: 150 }}>消息</TableCell>
                  <TableCell sx={{ width: 120 }}>事件</TableCell>
                  <TableCell sx={{ width: 170 }}>工具</TableCell>
                  <TableCell sx={{ width: 90 }}>状态</TableCell>
                  <TableCell>摘要</TableCell>
                  <TableCell sx={{ width: 180 }}>引用</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {records.map((record) => (
                  <TableRow key={record.id} hover>
                    <TableCell>{new Date(record.createdAt).toLocaleString()}</TableCell>
                    <TableCell>{record.messageId}</TableCell>
                    <TableCell>{eventLabel(record.eventType)}</TableCell>
                    <TableCell>{record.toolName ?? "—"}</TableCell>
                    <TableCell>
                      {record.ok === undefined ? "—" : (
                        <Chip size="small" label={record.ok ? "成功" : "失败"} color={record.ok ? "success" : "error"} variant="outlined" />
                      )}
                    </TableCell>
                    <TableCell sx={{ whiteSpace: "normal", wordBreak: "break-word" }}>{record.summary}</TableCell>
                    <TableCell>{record.citations.map((citation) => `${citation.documentId}/${citation.chunkId}`).join("\n") || "—"}</TableCell>
                  </TableRow>
                ))}
                {!audit.loading && records.length === 0 && (
                  <TableRow><TableCell colSpan={7} align="center" sx={{ py: 5 }}>暂无 Agent 审计记录。</TableCell></TableRow>
                )}
                {audit.loading && (
                  <TableRow><TableCell colSpan={7} align="center" sx={{ py: 5 }}>正在读取 Agent 审计...</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </CardContent>
    </Card>
  );
};

function eventLabel(value: string): string {
  switch (value) {
    case "tool_call":
      return "工具调用";
    case "tool_result":
      return "工具结果";
    case "final":
      return "最终回复";
    case "loop_limit":
      return "循环上限";
    case "model":
      return "模型输出";
    default:
      return value;
  }
}
