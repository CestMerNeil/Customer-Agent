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

export const AccountManager: React.FC = () => {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const accounts = useAsync(() => window.customerAgent.invoke("account.list", undefined), []);
  const logs = useAsync(() => window.customerAgent.invoke("log.list", { limit: 20 }), []);

  const login = async () => {
    const result = await window.customerAgent.invoke("account.login", { channel: "pinduoduo", username, password });
    setMessage(result.ok ? "登录成功" : result.error ?? "登录失败");
    await accounts.refresh();
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
              <TableCell>会话状态</TableCell>
              <TableCell align="right">操作</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {(accounts.data?.accounts ?? []).length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} align="center" sx={{ py: 5 }}>
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
                <TableCell>{sanitizeDiagnosticText(account.error) ?? "会话可启动"}</TableCell>
                <TableCell align="right">
                  <Button size="small" onClick={() => window.customerAgent.invoke("account.start", { accountId: account.id })}>
                    启动
                  </Button>
                  <Button size="small" color="secondary" onClick={() => window.customerAgent.invoke("account.stop", { accountId: account.id })}>
                    停止
                  </Button>
                </TableCell>
              </TableRow>
            ))}
            {accounts.error && (
              <TableRow>
                <TableCell colSpan={5} align="center">
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
