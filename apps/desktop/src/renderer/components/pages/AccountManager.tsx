import React, { useState } from "react";
import {
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { useAsync } from "../useAsync";
import { tokens } from "../../theme";
import { FieldRow } from "../SettingsKit";
import { Hero, Panel, Pill, Stat, StatRow } from "../mistral";
import type { AccountStatus } from "@customer-agent/core";

type PddRuntimeFailureCategory = "network" | "pdd-token" | "cookie" | "session-expiry" | "account-offline" | "risk-control" | "manual-relogin" | "unknown";

type RuntimeState = {
  accountId: string;
  state: "running" | "stopped" | "error";
  lastHeartbeatAt?: string;
  reconnectCount: number;
  requiresRelogin?: boolean;
  lastError?: string;
  websocketConnected?: boolean;
  failureCategory?: PddRuntimeFailureCategory;
};

export const AccountManager: React.FC = () => {
  const [addOpen, setAddOpen] = useState(false);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const accounts = useAsync(() => window.customerAgent.invoke("account.list", undefined), []);
  const runtimeStates = useAsync(() => window.customerAgent.invoke("account.runtime.list", undefined), []);

  const refreshAll = async () => {
    await Promise.all([accounts.refresh(), runtimeStates.refresh()]);
  };

  const login = async () => {
    const result = await window.customerAgent.invoke("account.login", { channel: "pinduoduo", username, password });
    setMessage(result.ok ? "登录成功" : "登录没有完成，请检查账号状态后重试。");
    if (result.ok) {
      setAddOpen(false);
      setUsername("");
      setPassword("");
    }
    await refreshAll();
  };

  const startAccount = async (accountId: string) => {
    const result = await window.customerAgent.invoke("account.start", { accountId });
    setMessage(result.ok ? "账号启动成功" : "账号启动失败，请稍后重试或重新登录。");
    await refreshAll();
  };

  const stopAccount = async (accountId: string) => {
    const result = await window.customerAgent.invoke("account.stop", { accountId });
    setMessage(result.ok ? "账号已停止" : "账号停止失败，请稍后重试。");
    await refreshAll();
  };

  const setAvailability = async (accountId: string, status: Extract<AccountStatus, "online" | "busy" | "offline">) => {
    const result = await window.customerAgent.invoke("account.availability.set", { accountId, status });
    setMessage(result.ok ? `接待状态已切换为${availabilityLabel(status)}` : "接待状态切换失败，请稍后重试或重新登录。");
    await refreshAll();
  };

  const logoutAccount = async (accountId: string) => {
    const result = await window.customerAgent.invoke("account.logout", { accountId });
    setMessage(result.ok ? "账号已退出登录" : "退出登录失败，请稍后重试。");
    await refreshAll();
  };

  const accountList = accounts.data?.accounts ?? [];
  const states = runtimeStates.data?.states ?? [];
  const onlineCount = accountList.filter((account) => account.status === "online").length;

  return (
    <Box>
      <Box sx={{ mb: "22px" }}>
        <Hero
          title="账号"
          subtitle="拼多多客服账号登录与会话"
          actions={
            <Button
              variant="contained"
              onClick={() => setAddOpen(true)}
              startIcon={<span className="material-symbols-rounded" aria-hidden="true" style={{ fontSize: 18 }}>add</span>}
            >
              添加账号
            </Button>
          }
        />
      </Box>

      <Box sx={{ mb: 3 }}>
        <StatRow>
          <Stat compact label="账号总数" value={accountList.length} />
          <Stat compact label="在线" value={onlineCount} tone={onlineCount ? "success" : "default"} />
          <Stat compact label="离线 / 停止" value={accountList.length - onlineCount} tone="default" />
        </StatRow>
      </Box>

      {message && !addOpen && (
        <Typography
          variant="body2"
          sx={{ mb: 2, color: message.includes("成功") ? tokens.color.state.success : tokens.color.state.error }}
        >
          {message}
        </Typography>
      )}

      <Dialog open={addOpen} onClose={() => setAddOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>添加账号</DialogTitle>
        <DialogContent>
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
          <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 2 }}>
            登录会打开受控浏览器；验证码、扫码或风控校验需人工完成。登录后会提取店铺与会话并写入本地加密存储。
          </Typography>
          {message && (
            <Typography
              variant="body2"
              sx={{ mt: 1.5, color: message.includes("成功") ? tokens.color.state.success : tokens.color.state.error }}
            >
              {message}
            </Typography>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setAddOpen(false)}>取消</Button>
          <Button variant="contained" onClick={login} startIcon={<span className="material-symbols-rounded" aria-hidden="true">login</span>}>
            登录
          </Button>
        </DialogActions>
      </Dialog>

      <Panel title="账号列表" flushBody>
        <Box
          sx={{
            display: "flex",
            p: "9px 2px",
            fontSize: 9,
            fontWeight: 700,
            letterSpacing: ".1em",
            color: tokens.color.text.tertiary,
            borderBottom: `1px solid ${tokens.color.border.hairline}`,
          }}
        >
          <Box sx={{ flex: 1 }}>账号 / 店铺</Box>
          <Box sx={{ width: 160 }}>接待状态</Box>
          <Box sx={{ width: 96 }}>连接状态</Box>
          <Box sx={{ width: 70, textAlign: "center" }}>重连</Box>
          <Box sx={{ width: 130 }}>心跳</Box>
          <Box sx={{ width: 150 }}>建议动作</Box>
          <Box sx={{ width: 150, textAlign: "right" }}>操作</Box>
        </Box>
        {accountList.length === 0 && (
          <Typography sx={{ p: "22px 2px", fontSize: 12, fontWeight: 500, color: tokens.color.text.tertiary }}>
            {accounts.loading ? "正在读取账号…" : "等待添加拼多多客服账号"}
          </Typography>
        )}
        {accountList.map((account, index) => {
          const runtime = getRuntimeForAccount(account.id, states);
          const reconnecting =
            runtime.state === "running" && runtime.websocketConnected === false && runtime.failureCategory === "network";
          const running = runtime.state === "running";
          const pill = runtime.requiresRelogin
            ? { label: "需重登", tone: "error" as const }
            : reconnecting
              ? { label: "后台重连中", tone: "warning" as const }
              : running
                ? { label: "运行中", tone: "success" as const }
                : runtime.state === "error"
                  ? { label: "异常", tone: "error" as const }
                  : { label: "已停止", tone: "neutral" as const };
          const heartbeat = getRuntimeHeartbeatText(account.id, states);
          const heartbeatColor = reconnecting
            ? tokens.color.state.warning
            : running && heartbeat.startsWith("正常")
              ? tokens.color.state.success
              : tokens.color.text.tertiary;
          const suggestion = getRuntimeSuggestedAction(account.id, states);
          const suggestionColor = runtime.requiresRelogin
            ? tokens.color.state.error
            : reconnecting
              ? tokens.color.state.warning
              : tokens.color.text.secondary;
          return (
            <Box
              key={account.id}
              sx={{
                display: "flex",
                alignItems: "center",
                p: "14px 2px",
                borderBottom: index === accountList.length - 1 ? "none" : `1px solid ${tokens.color.border.hairline}`,
              }}
            >
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography sx={{ fontSize: 13, fontWeight: 600 }}>{account.username}</Typography>
                <Typography sx={{ fontSize: 11, fontWeight: 500, color: tokens.color.text.tertiary }}>
                  shop · {account.shopName ?? account.shopId}
                </Typography>
              </Box>
              <Stack direction="row" spacing="5px" sx={{ width: 160 }}>
                {(["online", "busy", "offline"] as const).map((status) => (
                  <Typography
                    key={status}
                    component="button"
                    onClick={() => void setAvailability(account.id, status)}
                    sx={{
                      all: "unset",
                      cursor: "pointer",
                      fontSize: 11,
                      fontWeight: 700,
                      px: "7px",
                      py: "5px",
                      borderRadius: "7px",
                      color: account.status === status ? tokens.color.surface.onInverse : tokens.color.text.secondary,
                      bgcolor: account.status === status ? availabilityColor(status) : tokens.color.control.fill,
                    }}
                  >
                    {availabilityLabel(status)}
                  </Typography>
                ))}
              </Stack>
              <Box sx={{ width: 96 }}>
                <Pill label={pill.label} tone={pill.tone} />
              </Box>
              <Typography
                sx={{ width: 70, textAlign: "center", fontFamily: tokens.font.display, fontSize: 12, fontWeight: 500, color: tokens.color.text.secondary }}
              >
                {runtime.reconnectCount}
              </Typography>
              <Typography sx={{ width: 130, fontSize: 11, fontWeight: 500, color: heartbeatColor }}>
                {heartbeat}
              </Typography>
              <Typography sx={{ width: 150, fontSize: 12, fontWeight: 500, color: suggestionColor }}>
                {suggestion}
              </Typography>
              <Stack direction="row" spacing="6px" sx={{ width: 150, justifyContent: "flex-end" }}>
                <Typography
                  component="button"
                  onClick={() => (running ? stopAccount(account.id) : startAccount(account.id))}
                  sx={{
                    all: "unset",
                    fontSize: 11,
                    fontWeight: 600,
                    cursor: "pointer",
                    color: running ? tokens.color.text.secondary : tokens.color.text.primary,
                  }}
                >
                  {running ? "停止" : "启动"}
                </Typography>
                <Typography
                  component="button"
                  onClick={() => logoutAccount(account.id)}
                  sx={{ all: "unset", fontSize: 11, fontWeight: 600, cursor: "pointer", color: tokens.color.state.error }}
                >
                  退出
                </Typography>
              </Stack>
            </Box>
          );
        })}
        {accounts.error && (
          <Typography sx={{ p: "14px 2px", fontSize: 12, color: tokens.color.state.error }}>账号列表读取失败，请稍后重试。</Typography>
        )}
      </Panel>
    </Box>
  );
};

function getRuntimeForAccount(accountId: string, states: RuntimeState[]): RuntimeState {
  return (
    states.find((state) => state.accountId === accountId) ?? {
      accountId,
      state: "stopped",
      reconnectCount: 0,
    }
  );
}

function getRuntimeHeartbeatText(accountId: string, states: RuntimeState[]): string {
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
  return `正常 · ${heartbeatDate.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}`;
}

function getRuntimeSuggestedAction(accountId: string, states: RuntimeState[]): string {
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

function availabilityLabel(status: Extract<AccountStatus, "online" | "busy" | "offline">): string {
  if (status === "online") return "在线";
  if (status === "busy") return "忙碌";
  return "离线";
}

function availabilityColor(status: Extract<AccountStatus, "online" | "busy" | "offline">): string {
  if (status === "online") return tokens.color.state.success;
  if (status === "busy") return tokens.color.state.warning;
  return tokens.color.text.tertiary;
}
