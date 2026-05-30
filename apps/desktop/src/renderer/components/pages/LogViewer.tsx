import React from "react";
import { Box, Card, CardContent, Divider, Typography, Paper, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, IconButton } from "@mui/material";
import { useAsync } from "../useAsync";

export const LogViewer: React.FC = () => {
  const logs = useAsync(() => window.customerAgent.invoke("log.list", { limit: 100 }), []);
  return (
    <Box>
      <Card variant="outlined">
        <CardContent>
          <Box sx={{ mb: 2, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <Typography variant="h6">系统运行日志</Typography>
            <Box>
              <IconButton size="small" onClick={logs.refresh}>
                <span className="material-symbols-outlined">refresh</span>
              </IconButton>
              <IconButton size="small">
                <span className="material-symbols-outlined">delete</span>
              </IconButton>
            </Box>
          </Box>
          <Divider sx={{ mb: 2 }} />
          <TableContainer component={Paper} elevation={0} sx={{ maxHeight: 500, border: "1px solid", borderColor: "divider" }}>
            <Table stickyHeader size="small">
              <TableHead>
                <TableRow>
                  <TableCell sx={{ width: 180 }}>时间</TableCell>
                  <TableCell sx={{ width: 100 }}>级别</TableCell>
                  <TableCell>消息内容</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {(logs.data?.logs ?? []).map((log) => (
                  <TableRow key={log.id}>
                    <TableCell>{new Date(log.createdAt).toLocaleString()}</TableCell>
                    <TableCell sx={{ color: log.level === "error" ? "error.main" : "info.main" }}>{log.level.toUpperCase()}</TableCell>
                    <TableCell>{log.message}</TableCell>
                  </TableRow>
                ))}
                {(logs.data?.logs ?? []).length === 0 && (
                  <TableRow><TableCell colSpan={3} align="center">暂无运行日志。</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </TableContainer>
        </CardContent>
      </Card>
    </Box>
  );
};
