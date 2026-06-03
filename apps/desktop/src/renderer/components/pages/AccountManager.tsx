import React, { useState } from "react";
import {
  Alert,
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
    <Stack spacing={2.5}>
      <Card variant="outlined">
        <CardContent sx={{ p: 3 }}>
          <Stack direction={{ xs: "column", lg: "row" }} spacing={2.5} sx={{ alignItems: { lg: "flex-end" } }}>
            <Box sx={{ flexGrow: 1 }}>
              <Typography variant="h6">拼多多会话入口</Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mt: 0.75, maxWidth: 560 }}>
                登录后会提取店铺、客服身份和 Cookie，并把会话状态写入本地加密存储。
              </Typography>
            </Box>
            <Stack direction={{ xs: "column", md: "row" }} spacing={1.25} sx={{ minWidth: { lg: 620 } }}>
              <TextField size="small" label="账号" value={username} onChange={(event) => setUsername(event.target.value)} />
              <TextField size="small" label="密码" type="password" value={password} onChange={(event) => setPassword(event.target.value)} />
              <Button variant="contained" onClick={login} startIcon={<span className="material-symbols-outlined">login</span>}>
                登录
              </Button>
            </Stack>
          </Stack>
        </CardContent>
      </Card>

      {message && <Alert severity={message.includes("成功") ? "success" : "error"}>{message}</Alert>}

      <TableContainer component={Card} variant="outlined">
        <Table>
          <TableHead sx={{ bgcolor: "rgba(23, 33, 31, 0.04)" }}>
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

      <Alert severity="info" variant="outlined">
        当前登录会打开受控浏览器；验证码、扫码或风控校验需要人工完成。
      </Alert>

      <Card variant="outlined">
        <CardContent>
          <Typography variant="h6" gutterBottom>
            最近诊断
          </Typography>
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
    </Stack>
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
