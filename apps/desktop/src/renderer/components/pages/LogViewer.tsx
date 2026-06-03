import React from "react";
import { Box, Card, CardContent, Chip, Divider, IconButton, Stack, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Typography } from "@mui/material";
import { useAsync } from "../useAsync";

export const LogViewer: React.FC = () => {
  const logs = useAsync(() => window.customerAgent.invoke("log.list", { limit: 100 }), []);
  return (
    <Card variant="outlined">
      <CardContent>
        <Box sx={{ mb: 2, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <Box>
            <Typography variant="h6">系统运行日志</Typography>
            <Typography variant="body2" color="text.secondary">
              最近 100 条本地事件，用于排查登录、模型和发送链路。
            </Typography>
          </Box>
          <Stack direction="row" spacing={1}>
            <IconButton size="small" onClick={logs.refresh} aria-label="刷新日志">
              <span className="material-symbols-outlined">refresh</span>
            </IconButton>
            <IconButton size="small" aria-label="清空日志">
              <span className="material-symbols-outlined">delete</span>
            </IconButton>
          </Stack>
        </Box>
        <Divider sx={{ mb: 2 }} />
        <TableContainer sx={{ maxHeight: 560, border: "1px solid", borderColor: "divider", borderRadius: 1 }}>
          <Table stickyHeader size="small">
            <TableHead>
              <TableRow>
                <TableCell sx={{ width: 190 }}>时间</TableCell>
                <TableCell sx={{ width: 120 }}>级别</TableCell>
                <TableCell>消息内容</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {(logs.data?.logs ?? []).map((log) => (
                <TableRow key={log.id} hover>
                  <TableCell>{new Date(log.createdAt).toLocaleString()}</TableCell>
                  <TableCell>
                    <Chip size="small" label={log.level.toUpperCase()} color={log.level === "error" ? "error" : log.level === "warning" ? "warning" : "success"} variant="outlined" />
                  </TableCell>
                  <TableCell>{sanitizeDiagnosticText(log.message)}</TableCell>
                </TableRow>
              ))}
              {(logs.data?.logs ?? []).length === 0 && (
                <TableRow><TableCell colSpan={3} align="center" sx={{ py: 5 }}>暂无运行日志。</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </TableContainer>
      </CardContent>
    </Card>
  );
};

function sanitizeDiagnosticText(value: string): string {
  return value.replace(/^诊断\[[^\]]+\]\s*/u, "").replace(/\b(error|message)=/g, "").replace(/\s+/g, " ").trim();
}
