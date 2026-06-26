import React, { useState } from "react";
import {
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from "@mui/material";
import { useAsync } from "../useAsync";
import { tokens } from "../../theme";
import { FieldRow, SectionLabel } from "../SettingsKit";

type PddRuntimeFailureCategory = "network" | "pdd-token" | "cookie" | "session-expiry" | "account-offline" | "risk-control" | "manual-relogin" | "unknown";

export const AccountManager: React.FC = () => {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const accounts = useAsync(() => window.customerAgent.invoke("account.list", undefined), []);
  const logs = useAsync(() => window.customerAgent.invoke("log.list", { limit: 20 }), []);
  const runtimeStates = useAsync(() => window.customerAgent.invoke("account.runtime.list", undefined), []);

  const refreshAll = async () => {
    await Promise.all([accounts.refresh(), runtimeStates.refresh()]);
  };

  const login = async () => {
    const result = await window.customerAgent.invoke("account.login", { channel: "pinduoduo", username, password });
    setMessage(result.ok ? "登录成功" : result.error ?? "登录失败");
    await refreshAll();
  };

  const startAccount = async (accountId: string) => {
    const result = await window.customerAgent.invoke("account.start", { accountId });
    setMessage(result.ok ? "账号启动成功" : result.error ?? "启动失败");
    await refreshAll();
  };

  const stopAccount = async (accountId: string) => {
    const result = await window.customerAgent.invoke("account.stop", { accountId });
    setMessage(result.ok ? "账号已停止" : result.error ?? "停止失败");
    await refreshAll();
  };

  const logoutAccount = async (accountId: string) => {
    const result = await window.customerAgent.invoke("account.logout", { accountId });
    setMessage(result.ok ? "账号已退出登录" : result.error ?? "退出登录失败");
    await refreshAll();
  };

  return (
    <Box sx={{ maxWidth: 980 }}>
      <Stack spacing={3}>
        <Box>
          <SectionLabel>添加账号</SectionLabel>
          <Card>
            <CardContent sx={{ px: 2.5, py: 1 }}>
              <FieldRow label="账号">
                <TextField fullWidth size="small" value={username} onChange={(event) => setUsername(event.target.value)} />
              </FieldRow>
              <FieldRow label="密码" last>
                <TextField
                  fullWidth
                  size="small"
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                />
              </FieldRow>
            </CardContent>
            <Box
              sx={{
                px: 2.5,
                py: 2,
                borderTop: `1px solid ${tokens.color.border.hairline}`,
                display: "flex",
                alignItems: "center",
                gap: 1.5,
                flexWrap: "wrap",
              }}
            >
              <Button variant="contained" onClick={login} startIcon={<span className="material-symbols-outlined">login</span>}>
                登录
              </Button>
              {message && (
                <Typography
                  variant="body2"
                  sx={{ color: message.includes("成功") ? tokens.color.state.success : tokens.color.state.error }}
                >
                  {message}
                </Typography>
              )}
            </Box>
          </Card>
          <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 1, px: 0.5 }}>
            登录会打开受控浏览器；验证码、扫码或风控校验需人工完成。登录后会提取店铺与会话并写入本地加密存储。
          </Typography>
        </Box>

        <Box>
          <SectionLabel>账号列表</SectionLabel>
          <TableContainer component={Card}>
            <Table>
              <TableHead sx={{ bgcolor: tokens.color.surface.sunken }}>
                <TableRow>
                  <TableCell>账号名称</TableCell>
                  <TableCell>所属店铺</TableCell>
                  <TableCell>登录状态</TableCell>
                  <TableCell>连接状态</TableCell>
                  <TableCell>重连</TableCell>
                  <TableCell>心跳</TableCell>
                  <TableCell>最后错误</TableCell>
                  <TableCell>建议动作</TableCell>
                  <TableCell align="right">操作</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {(accounts.data?.accounts ?? []).length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={9} align="center" sx={{ py: 5 }}>
                      <Typography variant="body2" color="text.secondary">
                        {accounts.loading ? "正在读取账号..." : "等待添加拼多多客服账号。"}
                      </Typography>
                    </TableCell>
                  </TableRow>
                ) : accounts.data?.accounts.map((account) => (
                  <TableRow key={account.id} hover>
                    <TableCell>
                      <Typography sx={{ fontWeight: 700 }}>{account.username}</Typography>
                      <Typography variant="caption" color="text.secondary">
                        {account.userId}
                      </Typography>
                    </TableCell>
                    <TableCell>{account.shopName ?? account.shopId}</TableCell>
                    <TableCell>
                      <Chip size="small" label={account.status} color={account.status === "online" ? "success" : "default"} />
                    </TableCell>
                    <TableCell>
                      <RuntimeStatus accountId={account.id} states={runtimeStates.data?.states ?? []} />
                    </TableCell>
                    <TableCell>{getRuntimeReconnectCount(account.id, runtimeStates.data?.states ?? [])}</TableCell>
                    <TableCell>{getRuntimeHeartbeatText(account.id, runtimeStates.data?.states ?? [])}</TableCell>
                    <TableCell>{getRuntimeLastError(account.id, runtimeStates.data?.states ?? [])}</TableCell>
                    <TableCell>{getRuntimeSuggestedAction(account.id, runtimeStates.data?.states ?? [])}</TableCell>
                    <TableCell align="right">
                      <Button size="small" onClick={() => startAccount(account.id)}>
                        启动
                      </Button>
                      <Button size="small" color="secondary" onClick={() => stopAccount(account.id)}>
                        停止
                      </Button>
                      <Button size="small" color="error" onClick={() => logoutAccount(account.id)}>
                        退出登录
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
                {accounts.error && (
                  <TableRow>
                    <TableCell colSpan={9} align="center">
                      <Typography color="error">{accounts.error}</Typography>
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </TableContainer>
        </Box>

        <Box>
          <SectionLabel>最近诊断</SectionLabel>
          <Card>
            <CardContent sx={{ px: 2.5, py: 2 }}>
              {(logs.data?.logs ?? []).filter((log) => log.message.startsWith("诊断[")).slice(0, 5).map((log) => (
                <Typography key={log.id} variant="body2" color="text.secondary" sx={{ mb: 0.75 }}>
                  {new Date(log.createdAt).toLocaleString()} · {sanitizeDiagnosticText(log.message)}
                </Typography>
              ))}
              {(logs.data?.logs ?? []).filter((log) => log.message.startsWith("诊断[")).length === 0 && (
                <Typography variant="body2" color="text.secondary">
                  暂无诊断记录。
                </Typography>
              )}
            </CardContent>
          </Card>
        </Box>
      </Stack>
    </Box>
  );
};

function sanitizeDiagnosticText(value?: string): string | undefined {
  if (!value) return value;
  return value
    .replace(/^诊断\[[^\]]+\]\s*/u, "")
    .replace(/\b(error|message)=/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function getRuntimeForAccount(accountId: string, states: Array<{
  accountId: string;
  state: "running" | "stopped" | "error";
  lastHeartbeatAt?: string;
  reconnectCount: number;
  requiresRelogin?: boolean;
  lastError?: string;
  websocketConnected?: boolean;
  failureCategory?: PddRuntimeFailureCategory;
}>): {
  accountId: string;
  state: "running" | "stopped" | "error";
  lastHeartbeatAt?: string;
  reconnectCount: number;
  requiresRelogin?: boolean;
  lastError?: string;
  websocketConnected?: boolean;
  failureCategory?: PddRuntimeFailureCategory;
} {
  return states.find((state) => state.accountId === accountId) ?? {
    accountId,
    state: "stopped",
    reconnectCount: 0,
  };
}

function getRuntimeReconnectCount(accountId: string, states: Array<{ accountId: string; reconnectCount?: number }>): number {
  const runtimeState = states.find((state) => state.accountId === accountId);
  return runtimeState?.reconnectCount ?? 0;
}

function getRuntimeHeartbeatText(
  accountId: string,
  states: Array<{
    accountId: string;
    state?: "running" | "stopped" | "error";
    lastHeartbeatAt?: string;
    websocketConnected?: boolean;
  }>,
): string {
  const runtimeState = states.find((state) => state.accountId === accountId);
  if (!runtimeState?.lastHeartbeatAt) {
    return runtimeState?.state === "running" ? "启动中" : "暂无";
  }
  const heartbeatDate = new Date(runtimeState.lastHeartbeatAt);
  const elapsed = Date.now() - heartbeatDate.getTime();
  if (Number.isNaN(elapsed)) {
    return "异常";
  }
  if (!runtimeState.websocketConnected) {
    return "已断开";
  }
  if (elapsed > 45_000) {
    return `超时 ${Math.floor(elapsed / 1000)}s`;
  }
  return `正常 · ${heartbeatDate.toLocaleString()}`;
}

function getRuntimeLastError(
  accountId: string,
  states: Array<{ accountId: string; lastError?: string }>,
): string {
  const runtimeState = states.find((state) => state.accountId === accountId);
  if (!runtimeState?.lastError) {
    return "-";
  }
  return sanitizeDiagnosticText(runtimeState.lastError) ?? "-";
}

function getRuntimeSuggestedAction(
  accountId: string,
  states: Array<{ accountId: string; state?: string; requiresRelogin?: boolean; failureCategory?: PddRuntimeFailureCategory; websocketConnected?: boolean }>,
): string {
  const runtimeState = states.find((state) => state.accountId === accountId);
  if (runtimeState?.requiresRelogin) {
    return "建议重登录账号";
  }
  if (runtimeState?.state === "running" && runtimeState.websocketConnected === false && runtimeState.failureCategory === "network") {
    return "等待自动恢复";
  }
  switch (runtimeState?.failureCategory) {
    case "network":
      return "检查网络/重试";
    case "cookie":
    case "session-expiry":
      return "刷新会话并重登";
    case "account-offline":
      return "确认账号在线状态";
    case "risk-control":
      return "风控干预，稍后重试";
    case "pdd-token":
      return "检查账号授权";
    default:
      return runtimeState?.failureCategory ? `查看错误：${runtimeState.failureCategory}` : "正常运行";
  }
}

function RuntimeStatus(props: { accountId: string; states: Array<{
  accountId: string;
  state: "running" | "stopped" | "error";
  reconnectCount: number;
  requiresRelogin?: boolean;
  lastError?: string;
  failureCategory?: PddRuntimeFailureCategory;
  websocketConnected?: boolean;
}>; }) {
  const runtime = getRuntimeForAccount(props.accountId, props.states);
  const reconnecting = runtime.state === "running" && runtime.websocketConnected === false && runtime.failureCategory === "network";
  const color = runtime.state === "running" ? (reconnecting ? "warning" : "success") : runtime.state === "error" ? "error" : "default";
  const label = runtime.requiresRelogin ? "需重登" : reconnecting ? "后台重连中" : runtime.state;
  return (
    <div>
      <Chip size="small" label={label} color={color} sx={{ mr: 0.5, mb: 0.5 }} />
      {runtime.lastError ? (
        <Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>
          {sanitizeDiagnosticText(runtime.lastError)}
        </Typography>
      ) : null}
    </div>
  );
}
