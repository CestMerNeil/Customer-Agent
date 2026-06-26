import React, { useEffect, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Divider,
  LinearProgress,
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  MenuItem,
  Select,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import Grid from "@mui/material/Grid";
import type { AccountRecord, GovernedKnowledgeRecord, KnowledgeScope, ProductSyncMode, ProductSyncProgress } from "@customer-agent/core";
import { useAsync } from "../useAsync";

export const KnowledgeBaseManager: React.FC = () => {
  const [filePath, setFilePath] = useState("");
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [productStatus, setProductStatus] = useState<string | null>(null);
  const [syncProgress, setSyncProgress] = useState<ProductSyncProgress | null>(null);
  const [scope, setScope] = useState<KnowledgeScope>("global");
  const [selectedAccountId, setSelectedAccountId] = useState("");
  const accounts = useAsync(() => window.customerAgent.invoke("account.list", undefined), []);
  const documents = useAsync(() => window.customerAgent.invoke("knowledge.list", { scope }), [scope]);
  const selectedAccount = accounts.data?.accounts.find((account) => account.id === selectedAccountId) ?? accounts.data?.accounts[0];
  const productKnowledge = useAsync(async () => {
    if (!selectedAccount) {
      return { records: [] as GovernedKnowledgeRecord[] };
    }
    return window.customerAgent.invoke("knowledge.governed.list", {
      kind: "product",
      shopId: selectedAccount.shopId,
    });
  }, [selectedAccount?.shopId]);
  const customerServiceKnowledge = useAsync(async () => {
    if (!selectedAccount) {
      return { records: [] as GovernedKnowledgeRecord[] };
    }
    return window.customerAgent.invoke("knowledge.governed.list", {
      kind: "customer_service",
      shopId: selectedAccount.shopId,
    });
  }, [selectedAccount?.shopId]);
  const [results, setResults] = useState<string[]>([]);
  const [customerServiceRows, setCustomerServiceRows] = useState("");

  useEffect(() => {
    if (!selectedAccountId && accounts.data?.accounts[0]) {
      setSelectedAccountId(accounts.data.accounts[0].id);
    }
  }, [accounts.data?.accounts, selectedAccountId]);

  useEffect(() => {
    return window.customerAgent.on("product.sync.progress", (progress) => {
      if (!selectedAccount?.shopId || progress.shopId === selectedAccount.shopId) {
        setSyncProgress(progress);
        if (progress.phase === "completed" || progress.phase === "failed" || progress.phase === "cancelled") {
          void productKnowledge.refresh();
        }
      }
    });
  }, [productKnowledge.refresh, selectedAccount?.shopId]);

  const importFile = async () => {
    const result = await window.customerAgent.invoke("knowledge.import", { filePath, scope });
    setStatus(result.ok ? `已导入 ${result.document?.fileName}` : result.error ?? "导入失败");
    await documents.refresh();
  };

  const search = async () => {
    const response = await window.customerAgent.invoke("knowledge.search", { query });
    setResults(response.results.map((item) => item.content));
  };

  const startProductSync = async (mode: ProductSyncMode) => {
    if (!selectedAccount) {
      setProductStatus("请先登录一个拼多多账号。");
      return;
    }
    const response = await window.customerAgent.invoke("product.sync.start", {
      accountId: selectedAccount.id,
      mode,
    });
    if (!response.ok || !response.run) {
      setProductStatus(response.error ?? "商品同步启动失败");
      return;
    }
    setSyncProgress(response.run);
    setProductStatus(`${mode === "incremental" ? "增量" : "全量"}同步已启动`);
  };

  const setKnowledgeState = async (
    record: GovernedKnowledgeRecord,
    patch: { enabled?: boolean; reviewState?: GovernedKnowledgeRecord["reviewState"] },
  ) => {
    const response = await window.customerAgent.invoke("knowledge.governed.state", {
      citationId: record.citationId,
      ...patch,
    });
    setProductStatus(response.ok ? "商品知识状态已更新" : response.error ?? "商品知识状态更新失败");
    await productKnowledge.refresh();
    await customerServiceKnowledge.refresh();
  };

  const rollbackKnowledge = async (record: GovernedKnowledgeRecord) => {
    const response = await window.customerAgent.invoke("knowledge.governed.rollback", {
      citationId: record.citationId,
      version: record.version - 1,
    });
    setProductStatus(response.ok ? "已回滚到上一版" : response.error ?? "回滚失败");
    await productKnowledge.refresh();
  };

  const cancelProductSync = async () => {
    if (!syncProgress) {
      return;
    }
    const response = await window.customerAgent.invoke("product.sync.cancel", { runId: syncProgress.runId });
    setProductStatus(response.ok ? "商品同步已取消" : response.error ?? "取消失败");
    if (response.run) {
      setSyncProgress(response.run);
    }
  };

  const importCustomerServiceKnowledge = async () => {
    if (!selectedAccount) {
      setStatus("请先选择店铺。");
      return;
    }
    const rows = customerServiceRows.split(/\r?\n/u).map((line) => {
      const [title, content, tags] = line.split(/[,，]/u);
      return { title: title?.trim() ?? "", content: content?.trim() ?? "", tags: tags?.split("|").map((tag) => tag.trim()).filter(Boolean) ?? [] };
    }).filter((row) => row.title && row.content);
    const response = await window.customerAgent.invoke("knowledge.customer_service.import", {
      shopId: selectedAccount.shopId,
      rows,
      reviewState: "reviewed",
    });
    setStatus(response.ok ? `客服知识已导入 ${response.created} 条，跳过 ${response.skippedDuplicates} 条` : response.error ?? "导入失败");
    await customerServiceKnowledge.refresh();
  };

  return (
    <Grid container spacing={2.5}>
      <Grid size={{ xs: 12, md: 4 }}>
        <Card variant="outlined" sx={{ height: "100%" }}>
          <CardContent>
            <Typography variant="h6">知识分区</Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.75, mb: 2 }}>
              全局知识优先覆盖通用售前、售后和物流问题；店铺知识可做差异化补充。
            </Typography>
            <Divider sx={{ mb: 1 }} />
            <List>
              <ListItem disablePadding>
                <ListItemButton selected={scope === "global"} onClick={() => setScope("global")}>
                  <ListItemIcon sx={{ minWidth: 36 }}>
                    <span className="material-symbols-outlined">public</span>
                  </ListItemIcon>
                  <ListItemText
                    primary="全局知识"
                    secondary={scope === "global" ? `${documents.data?.documents.length ?? 0} 个文档` : "通用售前售后物流"}
                  />
                </ListItemButton>
              </ListItem>
              <ListItem disablePadding>
                <ListItemButton selected={scope === "shop"} onClick={() => setScope("shop")}>
                  <ListItemIcon sx={{ minWidth: 36 }}>
                    <span className="material-symbols-outlined">store</span>
                  </ListItemIcon>
                  <ListItemText
                    primary="店铺专属"
                    secondary={scope === "shop" ? `${documents.data?.documents.length ?? 0} 个文档` : "店铺差异化补充"}
                  />
                </ListItemButton>
              </ListItem>
            </List>
            <Button fullWidth variant="outlined" size="small" startIcon={<span className="material-symbols-outlined">refresh</span>} onClick={documents.refresh}>
              刷新索引
            </Button>
          </CardContent>
        </Card>
      </Grid>

      <Grid size={{ xs: 12, md: 8 }}>
        <Stack spacing={2.5}>
          <Card variant="outlined">
            <CardContent>
              <Stack direction={{ xs: "column", md: "row" }} spacing={1.25} sx={{ alignItems: { md: "center" } }}>
                <Box sx={{ flex: 1 }}>
                  <Typography variant="h6">商品同步</Typography>
                  <Typography variant="body2" color="text.secondary">
                    从真实拼多多商品列表和详情生成待审核商品知识。
                  </Typography>
                </Box>
                <Select
                  size="small"
                  displayEmpty
                  value={selectedAccount?.id ?? ""}
                  onChange={(event) => setSelectedAccountId(event.target.value)}
                  sx={{ minWidth: 220 }}
                >
                  {(accounts.data?.accounts ?? []).map((account: AccountRecord) => (
                    <MenuItem key={account.id} value={account.id}>
                      {account.shopName || account.username} · {account.shopId}
                    </MenuItem>
                  ))}
                  {(accounts.data?.accounts ?? []).length === 0 && <MenuItem value="">暂无账号</MenuItem>}
                </Select>
                <Button
                  variant="contained"
                  size="small"
                  aria-label="增量同步"
                  onClick={() => void startProductSync("incremental")}
                  startIcon={<span className="material-symbols-outlined">sync</span>}
                  disabled={!selectedAccount}
                >
                  增量同步
                </Button>
                <Button
                  variant="outlined"
                  size="small"
                  aria-label="全量同步"
                  onClick={() => void startProductSync("full")}
                  startIcon={<span className="material-symbols-outlined">refresh</span>}
                  disabled={!selectedAccount}
                >
                  全量同步
                </Button>
                <Button
                  variant="outlined"
                  size="small"
                  color="warning"
                  aria-label="取消同步"
                  onClick={() => void cancelProductSync()}
                  disabled={!syncProgress || syncProgress.phase === "completed" || syncProgress.phase === "failed" || syncProgress.phase === "cancelled"}
                >
                  取消
                </Button>
              </Stack>
              {syncProgress && (
                <Box sx={{ mt: 2 }}>
                  <Stack direction="row" spacing={1} sx={{ alignItems: "center", mb: 1, flexWrap: "wrap" }}>
                    <Chip size="small" label={phaseLabel(syncProgress.phase)} color={syncProgress.phase === "failed" ? "error" : "default"} />
                    <Typography variant="body2" color="text.secondary">
                      {syncProgress.current}/{syncProgress.total} · 新增 {syncProgress.added} · 更新 {syncProgress.updated} · 跳过 {syncProgress.skipped} · 失败 {syncProgress.failed}
                    </Typography>
                  </Stack>
                  <LinearProgress
                    variant={syncProgress.total > 0 ? "determinate" : "indeterminate"}
                    value={syncProgress.total > 0 ? Math.min(100, (syncProgress.current / syncProgress.total) * 100) : 0}
                  />
                  {syncProgress.currentGoodsName && (
                    <Typography variant="caption" color="text.secondary">
                      当前：{syncProgress.currentGoodsName}
                    </Typography>
                  )}
                  {syncProgress.failures[0] && (
                    <Alert severity="warning" sx={{ mt: 1 }}>
                      {syncProgress.failures[0].goodsId ? `${syncProgress.failures[0].goodsId}: ` : ""}{syncProgress.failures[0].error}
                    </Alert>
                  )}
                </Box>
              )}
              {productStatus && <Alert severity={productStatus.includes("失败") ? "error" : "info"} sx={{ mt: 2 }}>{productStatus}</Alert>}
            </CardContent>
          </Card>

          <Card variant="outlined">
            <CardContent>
              <Stack direction="row" sx={{ justifyContent: "space-between", alignItems: "center", mb: 2 }}>
                <Typography variant="h6">商品知识审核</Typography>
                <Button size="small" variant="outlined" onClick={productKnowledge.refresh} startIcon={<span className="material-symbols-outlined">refresh</span>}>
                  刷新
                </Button>
              </Stack>
              <List sx={{ p: 0 }}>
                {(productKnowledge.data?.records ?? []).map((record) => (
                  <ListItem
                    key={record.id}
                    alignItems="flex-start"
                    sx={{ border: "1px solid", borderColor: "divider", borderRadius: 1, mb: 1 }}
                    secondaryAction={
                      <Stack direction="row" spacing={0.75}>
                        <Button
                          size="small"
                          variant="contained"
                          aria-label={`审核通过并启用 ${record.title}`}
                          onClick={() => void setKnowledgeState(record, { reviewState: "reviewed", enabled: true })}
                        >
                          启用
                        </Button>
                        <Button size="small" variant="outlined" onClick={() => void setKnowledgeState(record, { enabled: false })}>
                          禁用
                        </Button>
                        <Button size="small" variant="outlined" color="warning" onClick={() => void setKnowledgeState(record, { reviewState: "rejected", enabled: false })}>
                          拒绝
                        </Button>
                        <Button size="small" variant="outlined" disabled={record.version <= 1} onClick={() => void rollbackKnowledge(record)}>
                          回滚
                        </Button>
                      </Stack>
                    }
                  >
                    <ListItemText
                      primary={
                        <Stack direction="row" spacing={1} sx={{ alignItems: "center", flexWrap: "wrap" }}>
                          <span>{record.title}</span>
                          <Chip size="small" label={`v${record.version}`} variant="outlined" />
                          <Chip size="small" label={reviewStateLabel(record.reviewState)} color={record.reviewState === "reviewed" ? "success" : "default"} />
                          <Chip size="small" label={record.enabled ? "已启用" : "未启用"} color={record.enabled ? "success" : "default"} />
                        </Stack>
                      }
                      secondary={
                        <Typography variant="body2" color="text.secondary" component="span" sx={{ whiteSpace: "pre-line", display: "block", pr: 28 }}>
                          {record.content.slice(0, 360)}
                          {"\n\n"}
                          {record.sourceMetadata ? `来源差异/元数据：${JSON.stringify(record.sourceMetadata).slice(0, 240)}` : "暂无来源差异元数据"}
                        </Typography>
                      }
                    />
                  </ListItem>
                ))}
                {(productKnowledge.data?.records ?? []).length === 0 && <ListItem><ListItemText secondary="暂无商品知识。请先执行商品同步。" /></ListItem>}
              </List>
            </CardContent>
          </Card>

          <Card variant="outlined">
            <CardContent>
              <Typography variant="h6">客服知识治理</Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5, mb: 2 }}>
                每行格式：标题，内容，标签1|标签2
              </Typography>
              <Stack direction={{ xs: "column", md: "row" }} spacing={1.25}>
                <TextField
                  fullWidth
                  multiline
                  minRows={3}
                  size="small"
                  label="批量导入客服知识"
                  value={customerServiceRows}
                  onChange={(event) => setCustomerServiceRows(event.target.value)}
                />
                <Button variant="contained" size="small" onClick={() => void importCustomerServiceKnowledge()} startIcon={<span className="material-symbols-outlined">upload</span>}>
                  导入
                </Button>
              </Stack>
              <List sx={{ p: 0, mt: 2 }}>
                {(customerServiceKnowledge.data?.records ?? []).map((record) => (
                  <ListItem
                    key={record.id}
                    sx={{ border: "1px solid", borderColor: "divider", borderRadius: 1, mb: 1 }}
                    secondaryAction={
                      <Stack direction="row" spacing={0.75}>
                        <Button size="small" variant="outlined" onClick={() => void setKnowledgeState(record, { reviewState: "reviewed", enabled: true })}>启用</Button>
                        <Button size="small" variant="outlined" color="warning" onClick={() => void setKnowledgeState(record, { enabled: false })}>禁用</Button>
                      </Stack>
                    }
                  >
                    <ListItemText
                      primary={`${record.title} · ${record.tags.join("/") || "无标签"}`}
                      secondary={record.content.slice(0, 240)}
                    />
                  </ListItem>
                ))}
                {(customerServiceKnowledge.data?.records ?? []).length === 0 && <ListItem><ListItemText secondary="暂无客服知识。" /></ListItem>}
              </List>
            </CardContent>
          </Card>

          <Card variant="outlined">
            <CardContent>
              <Stack direction={{ xs: "column", md: "row" }} spacing={1.25}>
                <TextField
                  fullWidth
                  label="搜索知识"
                  size="small"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                />
                <Button variant="contained" size="small" onClick={search} startIcon={<span className="material-symbols-outlined">search</span>}>
                  检索
                </Button>
              </Stack>
              <Stack direction={{ xs: "column", md: "row" }} spacing={1.25} sx={{ mt: 2 }}>
                <TextField fullWidth size="small" label="本地文件路径" value={filePath} onChange={(event) => setFilePath(event.target.value)} />
                <Button variant="outlined" size="small" onClick={importFile} startIcon={<span className="material-symbols-outlined">upload</span>}>
                  导入
                </Button>
              </Stack>
              {status && <Typography sx={{ mt: 1.5 }} variant="body2" color={status.includes("失败") ? "error.main" : "success.main"}>{status}</Typography>}
            </CardContent>
          </Card>

          <Card variant="outlined">
            <CardContent>
              <Stack direction="row" sx={{ justifyContent: "space-between", alignItems: "center", mb: 2 }}>
                <Typography variant="h6">文档与命中片段</Typography>
                <Chip size="small" label={`${documents.data?.documents.length ?? 0} docs`} variant="outlined" />
              </Stack>
              <List sx={{ p: 0 }}>
                {(documents.data?.documents ?? []).map((document) => (
                  <ListItem key={document.id} sx={{ border: "1px solid", borderColor: "divider", borderRadius: 1, mb: 1 }}>
                    <ListItemText
                      primary={document.fileName}
                      secondary={`${document.scope} · ${document.chunkCount} 个片段 · ${new Date(document.indexedAt).toLocaleString()}`}
                    />
                  </ListItem>
                ))}
                {(documents.data?.documents ?? []).length === 0 && <ListItem><ListItemText secondary="暂无导入文档。" /></ListItem>}
                {results.map((result, index) => (
                  <ListItem key={`${result}-${index}`} sx={{ bgcolor: "action.hover", borderRadius: 1, mb: 1 }}>
                    <ListItemText primary={`检索结果 ${index + 1}`} secondary={result} />
                  </ListItem>
                ))}
              </List>
            </CardContent>
          </Card>
        </Stack>
      </Grid>
    </Grid>
  );
};

function phaseLabel(phase: ProductSyncProgress["phase"]): string {
  switch (phase) {
    case "fetching":
      return "抓取商品";
    case "saving":
      return "生成知识";
    case "completed":
      return "完成";
    case "cancelled":
      return "已取消";
    case "failed":
      return "有失败";
  }
}

function reviewStateLabel(state: GovernedKnowledgeRecord["reviewState"]): string {
  switch (state) {
    case "draft":
      return "待审核";
    case "reviewed":
      return "已审核";
    case "rejected":
      return "已拒绝";
  }
}
