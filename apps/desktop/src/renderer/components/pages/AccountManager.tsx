import React, { useState } from "react";
import { Box, Button, Card, CardContent, Stack, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, TextField, Typography, Chip } from "@mui/material";
import { useAsync } from "../useAsync";

export const AccountManager: React.FC = () => {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const accounts = useAsync(() => window.customerAgent.invoke("account.list", undefined), []);

  const login = async () => {
    const result = await window.customerAgent.invoke("account.login", { channel: "pinduoduo", username, password });
    setMessage(result.ok ? "登录成功" : result.error ?? "登录失败");
    await accounts.refresh();
  };

  return (
    <Box>
      <Box sx={{ mb: 3, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 2 }}>
        <Typography variant="body1">管理拼多多客服账号及其登录状态。</Typography>
        <Stack direction="row" spacing={1}>
          <TextField size="small" label="账号" value={username} onChange={(event) => setUsername(event.target.value)} />
          <TextField size="small" label="密码" type="password" value={password} onChange={(event) => setPassword(event.target.value)} />
          <Button variant="contained" onClick={login} startIcon={<span className="material-symbols-outlined">login</span>}>
            登录
          </Button>
        </Stack>
      </Box>
      {message && <Typography sx={{ mb: 2 }} color={message.includes("成功") ? "success.main" : "error.main"}>{message}</Typography>}

      <TableContainer component={Card} variant="outlined">
        <Table>
          <TableHead sx={{ bgcolor: "action.hover" }}>
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
                <TableCell colSpan={5} align="center" sx={{ py: 3 }}>
                  <Typography variant="body2" color="text.secondary">
                    {accounts.loading ? "正在读取账号..." : "等待添加拼多多客服账号。"}
                  </Typography>
                </TableCell>
              </TableRow>
            ) : accounts.data?.accounts.map((account) => (
              <TableRow key={account.id}>
                <TableCell>{account.username}</TableCell>
                <TableCell>{account.shopName ?? account.shopId}</TableCell>
                <TableCell><Chip size="small" label={account.status} /></TableCell>
                <TableCell>{account.error ?? "-"}</TableCell>
                <TableCell align="right">
                  <Button size="small" onClick={() => window.customerAgent.invoke("account.start", { accountId: account.id })}>启动</Button>
                  <Button size="small" onClick={() => window.customerAgent.invoke("account.stop", { accountId: account.id })}>停止</Button>
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

      <Box sx={{ mt: 4 }}>
        <Card variant="outlined" sx={{ bgcolor: "primary.light", color: "primary.contrastText" }}>
          <CardContent>
            <Typography variant="h6">提示</Typography>
            <Typography variant="body2">
              MVP 已接好登录 IPC 边界；真实 Playwright 登录适配器完成后，这里会打开受控浏览器完成手动登录。
            </Typography>
          </CardContent>
        </Card>
      </Box>
    </Box>
  );
};
