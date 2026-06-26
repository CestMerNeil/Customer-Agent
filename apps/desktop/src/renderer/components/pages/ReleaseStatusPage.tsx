import React from "react";
import {
  Alert,
  Box,
  Card,
  CardContent,
  Chip,
  Divider,
  IconButton,
  List,
  ListItem,
  ListItemText,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from "@mui/material";
import Grid from "@mui/material/Grid";
import type { AcceptanceCapabilityMatrixRow } from "@customer-agent/core";
import { useAsync } from "../useAsync";

export const ReleaseStatusPage: React.FC = () => {
  const status = useAsync(() => window.customerAgent.invoke("acceptance.status", undefined), []);
  const data = status.data;

  return (
    <Box>
      {status.error && <Alert severity="error" sx={{ mb: 2 }}>{status.error}</Alert>}
      <Grid container spacing={2.5}>
        <Grid size={{ xs: 12, md: 5 }}>
          <Card variant="outlined">
            <CardContent>
              <Stack direction="row" sx={{ alignItems: "center", justifyContent: "space-between", mb: 2 }}>
                <Box>
                  <Typography variant="h6">Release Gate</Typography>
                  <Typography variant="body2" color="text.secondary">当前提交的发布门禁状态。</Typography>
                </Box>
                <IconButton size="small" onClick={status.refresh} aria-label="刷新发布状态">
                  <span className="material-symbols-outlined">refresh</span>
                </IconButton>
              </Stack>
              <Chip
                color={data?.ok ? "success" : "error"}
                label={data?.ok ? "Release Gate 已通过" : "Release Gate 未通过"}
                sx={{ mb: 2 }}
              />
              <Stack spacing={1.25}>
                <StatusLine label="Commit" value={data?.commitSha ?? "读取中"} />
                <StatusLine label="Platform" value={data?.platform ?? "读取中"} />
                <StatusLine label="Tag" value={data?.tag ?? "未指定"} />
                <StatusLine label="Acceptance Records" value={String(data?.records ?? 0)} />
              </Stack>
            </CardContent>
          </Card>
        </Grid>

        <Grid size={{ xs: 12, md: 7 }}>
          <Card variant="outlined" sx={{ height: "100%" }}>
            <CardContent>
              <Typography variant="h6">阻塞项</Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                这里来自本地 sanitized acceptance records 校验，不会读取或要求 PDD 凭据。
              </Typography>
              <Divider sx={{ my: 2 }} />
              <List dense>
                {(data?.errors ?? []).slice(0, 8).map((error) => (
                  <ListItem key={error} sx={{ px: 0 }}>
                    <ListItemText primary={error} />
                  </ListItem>
                ))}
                {!status.loading && (data?.errors.length ?? 0) === 0 && (
                  <ListItem sx={{ px: 0 }}>
                    <ListItemText primary={data?.ok ? "当前发布门禁无阻塞。" : "暂无校验结果。"} />
                  </ListItem>
                )}
                {status.loading && (
                  <ListItem sx={{ px: 0 }}>
                    <ListItemText primary="正在读取发布状态..." />
                  </ListItem>
                )}
              </List>
            </CardContent>
          </Card>
        </Grid>

        <Grid size={{ xs: 12 }}>
          <Card variant="outlined">
            <CardContent>
              <Typography variant="h6">Release-blocking 能力矩阵</Typography>
              <Divider sx={{ my: 2 }} />
              <TableContainer sx={{ border: "1px solid", borderColor: "divider", borderRadius: 1 }}>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>Capability</TableCell>
                      <TableCell>Scope</TableCell>
                      <TableCell>Gate</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {(data?.matrix ?? []).map((row) => (
                      <CapabilityRow key={row.capability} row={row} />
                    ))}
                    {!status.loading && (data?.matrix.length ?? 0) === 0 && (
                      <TableRow><TableCell colSpan={3} align="center" sx={{ py: 4 }}>暂无能力矩阵。</TableCell></TableRow>
                    )}
                  </TableBody>
                </Table>
              </TableContainer>
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </Box>
  );
};

function StatusLine({ label, value }: { label: string; value: string }) {
  return (
    <Box sx={{ display: "flex", justifyContent: "space-between", gap: 2 }}>
      <Typography color="text.secondary">{label}</Typography>
      <Typography sx={{ fontFamily: label === "Commit" ? "monospace" : undefined, wordBreak: "break-all" }}>{value}</Typography>
    </Box>
  );
}

function CapabilityRow({ row }: { row: AcceptanceCapabilityMatrixRow }) {
  return (
    <TableRow hover>
      <TableCell>{row.capability}</TableCell>
      <TableCell>{row.requiredScopes === "two-shop" ? "双账号/双店铺" : "平台"}</TableCell>
      <TableCell><Chip size="small" color="warning" variant="outlined" label={row.releaseBlocking ? "release-blocking" : "optional"} /></TableCell>
    </TableRow>
  );
}
