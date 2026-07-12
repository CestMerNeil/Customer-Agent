import React, { useEffect, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Checkbox,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  InputBase,
  LinearProgress,
  MenuItem,
  Select,
  Stack,
  Typography,
} from "@mui/material";
import type { AccountRecord, DocumentKnowledgePreviewEntry, DocumentKnowledgeProgressEvent, GovernedKnowledgeRecord, ProductSyncMode, ProductSyncProgress } from "@customer-agent/core";
import { useAsync } from "../useAsync";
import { tokens } from "../../theme";
import { EmptyState, Panel, Pill } from "../mistral";

/** Renders governed product/customer-service knowledge and Model Provider-backed synchronization. */
export const KnowledgeBaseManager: React.FC = () => {
  const [status, setStatus] = useState<string | null>(null);
  const [productStatus, setProductStatus] = useState<string | null>(null);
  const [syncProgress, setSyncProgress] = useState<ProductSyncProgress | null>(null);
  const [selectedAccountId, setSelectedAccountId] = useState("");
  const accounts = useAsync(() => window.customerAgent.invoke("account.list", undefined), []);
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
  const [customerServiceRows, setCustomerServiceRows] = useState("");
  const [documentProgress, setDocumentProgress] = useState<DocumentKnowledgeProgressEvent | null>(null);
  const [documentPreview, setDocumentPreview] = useState<{
    fileName: string;
    fileType: string;
    segmentsTotal: number;
    failures: Array<{ segment: number; error: string }>;
    entries: Array<DocumentKnowledgePreviewEntry & { selected: boolean }>;
  } | null>(null);
  const [documentBusy, setDocumentBusy] = useState(false);
  const [detailRecord, setDetailRecord] = useState<GovernedKnowledgeRecord | null>(null);
  const [deleteRecord, setDeleteRecord] = useState<GovernedKnowledgeRecord | null>(null);

  const productEntries = latestPerCitation(productKnowledge.data?.records ?? []);
  const customerServiceEntries = latestPerCitation(customerServiceKnowledge.data?.records ?? []);

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

  const uploadDocument = async () => {
    if (!selectedAccount) {
      setStatus("请先选择店铺。");
      return;
    }
    const picked = await window.customerAgent.invoke("knowledge.document.pick", undefined);
    if (!picked.ok) {
      setStatus(picked.error ?? "选择文档失败");
      return;
    }
    if (picked.canceled || !picked.filePath) {
      return;
    }
    const requestId = window.crypto.randomUUID();
    setDocumentBusy(true);
    setDocumentProgress({ requestId, fileName: picked.fileName ?? "文档", completed: 0, total: 0, entries: 0, failed: 0 });
    setStatus(`正在读取并解析 ${picked.fileName} …`);
    const unsubscribe = window.customerAgent.on("knowledge.document.progress", (progress) => {
      if (progress.requestId === requestId) setDocumentProgress(progress);
    });
    try {
      const result = await window.customerAgent.invoke("knowledge.document.import", {
        shopId: selectedAccount.shopId,
        filePath: picked.filePath,
        requestId,
      });
      if (!result.ok) {
        setStatus(result.error ?? "文档解析失败");
        return;
      }
      setDocumentPreview({
        fileName: result.fileName ?? picked.fileName ?? "文档",
        fileType: result.fileType ?? "",
        segmentsTotal: result.segmentsTotal,
        failures: result.failures,
        entries: result.entries.map((entry) => ({ ...entry, selected: true })),
      });
      setStatus(`解析完成：${result.segmentsCompleted}/${result.segmentsTotal} 个片段，提取 ${result.entries.length} 条，请预览后确认。`);
    } finally {
      unsubscribe();
      setDocumentBusy(false);
    }
  };

  const confirmDocumentPreview = async () => {
    if (!selectedAccount || !documentPreview) return;
    const rows = documentPreview.entries.filter((entry) => entry.selected).map(({ selected: _selected, ...entry }) => entry);
    if (rows.length === 0) {
      setStatus("请至少选择一条知识后再确认。");
      return;
    }
    setDocumentBusy(true);
    try {
      const response = await window.customerAgent.invoke("knowledge.customer_service.import", {
        shopId: selectedAccount.shopId,
        rows,
        reviewState: "draft",
        enabled: false,
        sourceType: "llm_extraction",
        sourceId: documentPreview.fileName,
        sourceMetadata: {
          fileName: documentPreview.fileName,
          fileType: documentPreview.fileType,
          segments: documentPreview.segmentsTotal,
          ingestion: "segmented-model-provider",
        },
      });
      setStatus(response.ok
        ? `已保存 ${response.created} 条待审核知识，跳过重复 ${response.skippedDuplicates} 条。`
        : response.error ?? "保存解析结果失败。");
      if (response.ok) {
        setDocumentPreview(null);
        await customerServiceKnowledge.refresh();
      }
    } finally {
      setDocumentBusy(false);
    }
  };

  const deleteCustomerServiceKnowledge = async () => {
    if (!deleteRecord) return;
    const response = await window.customerAgent.invoke("knowledge.governed.delete", { citationId: deleteRecord.citationId });
    setStatus(response.ok ? `已删除“${deleteRecord.title}”。` : response.error ?? "删除失败，请稍后重试。");
    if (response.ok) {
      setDeleteRecord(null);
      if (detailRecord?.citationId === deleteRecord.citationId) setDetailRecord(null);
      await customerServiceKnowledge.refresh();
    }
  };

  /** Starts product synchronization through the selected Model Provider. */
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
      setProductStatus(response.error ?? "商品同步启动失败，请稍后重试。");
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
    setProductStatus(response.ok ? "知识状态已更新" : "知识状态更新失败，请稍后重试。");
    await productKnowledge.refresh();
    await customerServiceKnowledge.refresh();
  };

  const rollbackKnowledge = async (record: GovernedKnowledgeRecord) => {
    const response = await window.customerAgent.invoke("knowledge.governed.rollback", {
      citationId: record.citationId,
      version: record.version - 1,
    });
    setProductStatus(response.ok ? "已回滚到上一版" : "回滚失败，请稍后重试。");
    await productKnowledge.refresh();
  };

  const cancelProductSync = async () => {
    if (!syncProgress) {
      return;
    }
    const response = await window.customerAgent.invoke("product.sync.cancel", { runId: syncProgress.runId });
    setProductStatus(response.ok ? "商品同步已取消" : "取消失败，请稍后重试。");
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
    setStatus(response.ok ? `客服知识已导入 ${response.created} 条，跳过 ${response.skippedDuplicates} 条` : "导入失败，请检查文档后重试。");
    await customerServiceKnowledge.refresh();
  };

  const syncPill = syncPillState(syncProgress);
  const syncPct = syncProgress && syncProgress.total > 0
    ? Math.min(100, (syncProgress.current / syncProgress.total) * 100)
    : syncProgress?.phase === "completed"
      ? 100
      : 0;

  const smallActionButton = { height: 34, minHeight: 34, px: "13px", fontSize: 12, fontWeight: 600, borderRadius: "9px" } as const;

  return (
    <Box>
      {/* 商品同步 card */}
      <Box sx={{ border: `1px solid ${tokens.color.border.hairline}`, borderRadius: "14px", p: "18px 20px", mb: 2 }}>
        <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", mb: "14px", flexWrap: "wrap", gap: 1.5 }}>
          <Box>
            <Typography sx={{ fontSize: 13, fontWeight: 700 }}>商品同步</Typography>
            <Typography sx={{ fontSize: 11, fontWeight: 500, color: tokens.color.text.tertiary, mt: "3px" }}>
              从真实拼多多商品列表和详情生成待审核商品知识
            </Typography>
          </Box>
          <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
            <Select
              size="small"
              displayEmpty
              value={selectedAccount?.id ?? ""}
              onChange={(event) => setSelectedAccountId(event.target.value)}
              sx={{ height: 34, borderRadius: "9px", fontSize: 12, fontWeight: 600, color: tokens.color.text.secondary, minWidth: 150 }}
            >
              {(accounts.data?.accounts ?? []).map((account: AccountRecord) => (
                <MenuItem key={account.id} value={account.id}>
                  {account.shopName || account.username}
                </MenuItem>
              ))}
              {(accounts.data?.accounts ?? []).length === 0 && <MenuItem value="">暂无账号</MenuItem>}
            </Select>
            <Button variant="contained" onClick={() => void startProductSync("incremental")} disabled={!selectedAccount} sx={smallActionButton}>
              增量同步
            </Button>
            <Button variant="outlined" onClick={() => void startProductSync("full")} disabled={!selectedAccount} sx={smallActionButton}>
              全量同步
            </Button>
            {syncProgress && !["completed", "failed", "cancelled"].includes(syncProgress.phase) && (
              <Button variant="outlined" color="warning" onClick={() => void cancelProductSync()} sx={smallActionButton}>
                取消
              </Button>
            )}
          </Stack>
        </Box>
        <Box sx={{ display: "flex", alignItems: "center", gap: "10px", mb: 1 }}>
          <Pill label={syncPill.label} tone={syncPill.tone} />
          <Typography sx={{ fontSize: 12, fontWeight: 500, color: tokens.color.text.secondary }}>
            {syncProgress
              ? `${syncProgress.current}/${syncProgress.total} · 新增 ${syncProgress.added} · 更新 ${syncProgress.updated} · 跳过 ${syncProgress.skipped} · 失败 ${syncProgress.failed}`
              : "尚未同步"}
          </Typography>
        </Box>
        <Box sx={{ height: 5, borderRadius: "3px", bgcolor: tokens.color.control.fill, overflow: "hidden" }}>
          <Box sx={{ width: `${syncPct}%`, height: "100%", bgcolor: tokens.color.state.success, transition: "width .4s" }} />
        </Box>
        {syncProgress?.currentGoodsName && (
          <Typography sx={{ fontSize: 11, fontWeight: 500, color: tokens.color.text.tertiary, mt: 1 }}>
            当前：{syncProgress.currentGoodsName}
          </Typography>
        )}
        {syncProgress?.failures[0] && (
          <Alert severity="warning" sx={{ mt: 1 }}>
            {syncProgress.failures[0].error}
          </Alert>
        )}
        {productStatus && <Alert severity={productStatus.includes("失败") ? "error" : "info"} sx={{ mt: 2 }}>{productStatus}</Alert>}
      </Box>

      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "minmax(0, 1fr) minmax(0, 1fr)" }, gap: 4, alignItems: "start" }}>
        <Panel
          title="商品知识审核"
          action={
            <Typography sx={{ fontSize: 9, fontWeight: 700, letterSpacing: ".14em", color: tokens.color.text.tertiary }}>
              {productEntries.length} 个商品
            </Typography>
          }
        >
          {productEntries.length === 0 ? (
            <EmptyState primary="暂无商品知识" secondary="请先执行商品同步。" />
          ) : (
            <Box sx={{ maxHeight: 520, overflowY: "auto" }}>
              {productEntries.map((record) => (
                <ProductKnowledgeCard
                  key={record.citationId}
                  record={record}
                  onEnable={() => void setKnowledgeState(record, { reviewState: "reviewed", enabled: true })}
                  onDisable={() => void setKnowledgeState(record, { enabled: false })}
                  onReject={() => void setKnowledgeState(record, { reviewState: "rejected", enabled: false })}
                  onRollback={() => void rollbackKnowledge(record)}
                />
              ))}
            </Box>
          )}
        </Panel>

        <Panel
          title="客服知识治理"
          action={
            <Typography sx={{ fontSize: 9, fontWeight: 700, letterSpacing: ".14em", color: tokens.color.text.tertiary }}>
              {customerServiceEntries.length} 条
            </Typography>
          }
        >
          <InputBase
            fullWidth
            multiline
            minRows={2}
            value={customerServiceRows}
            onChange={(event) => setCustomerServiceRows(event.target.value)}
            placeholder="批量导入 · 每行格式：标题，内容，标签1|标签2"
            sx={{
              border: `1px solid ${tokens.color.border.hairline}`,
              borderRadius: "10px",
              p: "11px 13px",
              fontSize: 12,
              fontWeight: 500,
              minHeight: 60,
              alignItems: "flex-start",
              mb: "10px",
              "& textarea::placeholder": { color: tokens.color.text.tertiary, opacity: 1 },
            }}
          />
          <Stack direction="row" spacing={1} sx={{ mb: 2 }}>
            <Button
              variant="contained"
              onClick={() => void importCustomerServiceKnowledge()}
              startIcon={<span className="material-symbols-rounded" aria-hidden="true" style={{ fontSize: 16 }}>upload</span>}
              sx={{ height: 32, minHeight: 32, px: "14px", fontSize: 12, fontWeight: 600, borderRadius: "8px" }}
            >
              导入
            </Button>
            <Button
              variant="outlined"
              onClick={uploadDocument}
              disabled={!selectedAccount || documentBusy}
              startIcon={<span className="material-symbols-rounded" aria-hidden="true" style={{ fontSize: 16 }}>upload_file</span>}
              sx={{ height: 32, minHeight: 32, px: "14px", fontSize: 12, fontWeight: 600, borderRadius: "8px" }}
            >
              解析文档
            </Button>
          </Stack>
          {documentBusy && (
            <Box sx={{ mb: 1.5 }}>
              <LinearProgress
                variant={documentProgress?.total ? "determinate" : "indeterminate"}
                value={documentProgress?.total ? (documentProgress.completed / documentProgress.total) * 100 : undefined}
              />
              <Typography sx={{ mt: 0.75, fontSize: 11, color: tokens.color.text.secondary }}>
                {documentProgress?.total
                  ? `正在解析 ${documentProgress.completed}/${documentProgress.total} 个片段 · 已提取 ${documentProgress.entries} 条`
                  : "正在读取文档…"}
              </Typography>
            </Box>
          )}
          {status && (
            <Typography sx={{ mb: 1.5 }} variant="body2" color={status.includes("失败") ? "error.main" : "success.main"}>
              {status}
            </Typography>
          )}
          {customerServiceEntries.length === 0 ? (
            <EmptyState primary="暂无客服知识" />
          ) : (
            <Box sx={{ maxHeight: 420, overflowY: "auto" }}>
              {customerServiceEntries.map((record, index) => (
                <Box key={record.citationId} sx={{ py: "13px", borderBottom: index === customerServiceEntries.length - 1 ? "none" : `1px solid ${tokens.color.border.hairline}` }}>
                  <Box sx={{ display: "flex", alignItems: "center", gap: 1, flexWrap: "wrap" }}>
                    <Typography sx={{ fontSize: 14, fontWeight: 700, flex: 1, minWidth: 180 }}>{record.title}</Typography>
                    <Pill label={reviewPill(record).label} tone={reviewPill(record).tone} />
                    <Pill label={record.enabled && record.reviewState === "reviewed" ? "Agent 可用" : "Agent 不可用"} tone={record.enabled && record.reviewState === "reviewed" ? "success" : "neutral"} />
                  </Box>
                  <Stack direction="row" spacing={1} sx={{ mt: 1.25, flexWrap: "wrap", rowGap: 1 }}>
                    <Button variant="outlined" onClick={() => setDetailRecord(record)} sx={{ fontSize: 12 }}>查看详情</Button>
                    {!(record.enabled && record.reviewState === "reviewed") && <Button variant="contained" onClick={() => void setKnowledgeState(record, { reviewState: "reviewed", enabled: true })} sx={{ fontSize: 12 }}>审核并启用</Button>}
                    {record.enabled && <Button variant="outlined" onClick={() => void setKnowledgeState(record, { enabled: false })} sx={{ fontSize: 12 }}>禁用</Button>}
                    <Button color="error" variant="outlined" onClick={() => setDeleteRecord(record)} sx={{ fontSize: 12 }}>删除</Button>
                  </Stack>
                </Box>
              ))}
            </Box>
          )}
        </Panel>
      </Box>

      <Dialog open={Boolean(documentPreview)} onClose={() => !documentBusy && setDocumentPreview(null)} fullWidth maxWidth="md">
        <DialogTitle>AI 文档解析结果</DialogTitle>
        <DialogContent dividers>
          {documentPreview && (
            <>
              <Typography sx={{ fontSize: 12, color: tokens.color.text.secondary, mb: 1.5 }}>
                {documentPreview.fileName} · {documentPreview.segmentsTotal} 个片段 · {documentPreview.entries.length} 条结果
              </Typography>
              {documentPreview.failures.length > 0 && (
                <Alert severity="warning" sx={{ mb: 1.5 }}>
                  {documentPreview.failures.length} 个片段未返回有效条目，请检查预览内容是否完整。
                </Alert>
              )}
              <Stack spacing={1.25}>
                {documentPreview.entries.map((entry, index) => (
                  <Box key={`${entry.title}-${index}`} sx={{ display: "flex", gap: 1, border: `1px solid ${tokens.color.border.hairline}`, borderRadius: "10px", p: 1.25 }}>
                    <Checkbox
                      checked={entry.selected}
                      onChange={(event) => setDocumentPreview((current) => current ? {
                        ...current,
                        entries: current.entries.map((item, itemIndex) => itemIndex === index ? { ...item, selected: event.target.checked } : item),
                      } : current)}
                      slotProps={{ input: { "aria-label": `选择 ${entry.title}` } }}
                    />
                    <Box sx={{ minWidth: 0 }}>
                      <Typography sx={{ fontSize: 13, fontWeight: 700 }}>{entry.title}</Typography>
                      <Typography sx={{ mt: 0.5, fontSize: 12, lineHeight: 1.65, whiteSpace: "pre-wrap" }}>{entry.content}</Typography>
                      <Typography sx={{ mt: 0.5, fontSize: 10, color: tokens.color.text.tertiary }}>{entry.tags.length ? entry.tags.join(" · ") : "无标签"}</Typography>
                    </Box>
                  </Box>
                ))}
              </Stack>
            </>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDocumentPreview(null)} disabled={documentBusy}>取消</Button>
          <Button variant="contained" onClick={() => void confirmDocumentPreview()} disabled={documentBusy || !documentPreview?.entries.some((entry) => entry.selected)}>
            保存所选知识
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={Boolean(detailRecord)} onClose={() => setDetailRecord(null)} fullWidth maxWidth="sm">
        <DialogTitle>知识详情</DialogTitle>
        <DialogContent dividers>
          {detailRecord && (
            <Stack spacing={2}>
              <Box>
                <Typography sx={{ fontSize: 12, color: tokens.color.text.tertiary }}>标题</Typography>
                <Typography sx={{ mt: 0.5, fontSize: 18, fontWeight: 750 }}>{detailRecord.title}</Typography>
              </Box>
              <Box>
                <Typography sx={{ fontSize: 12, color: tokens.color.text.tertiary }}>知识内容</Typography>
                <Typography sx={{ mt: 0.75, fontSize: 14, lineHeight: 1.8, whiteSpace: "pre-wrap" }}>{detailRecord.content}</Typography>
              </Box>
              <Box>
                <Typography sx={{ fontSize: 12, color: tokens.color.text.tertiary }}>标签</Typography>
                <Typography sx={{ mt: 0.5, fontSize: 14 }}>{detailRecord.tags.length ? detailRecord.tags.join(" · ") : "无标签"}</Typography>
              </Box>
              <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 2 }}>
                <Box>
                  <Typography sx={{ fontSize: 12, color: tokens.color.text.tertiary }}>审核状态</Typography>
                  <Typography sx={{ mt: 0.5, fontSize: 14 }}>{reviewPill(detailRecord).label}</Typography>
                </Box>
                <Box>
                  <Typography sx={{ fontSize: 12, color: tokens.color.text.tertiary }}>Agent 状态</Typography>
                  <Typography sx={{ mt: 0.5, fontSize: 14 }}>{detailRecord.enabled && detailRecord.reviewState === "reviewed" ? "可用" : "不可用"}</Typography>
                </Box>
                <Box>
                  <Typography sx={{ fontSize: 12, color: tokens.color.text.tertiary }}>来源</Typography>
                  <Typography sx={{ mt: 0.5, fontSize: 14 }}>{detailRecord.sourceId ?? detailRecord.sourceType}</Typography>
                </Box>
                <Box>
                  <Typography sx={{ fontSize: 12, color: tokens.color.text.tertiary }}>版本</Typography>
                  <Typography sx={{ mt: 0.5, fontSize: 14 }}>v{detailRecord.version}</Typography>
                </Box>
              </Box>
            </Stack>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDetailRecord(null)}>关闭</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={Boolean(deleteRecord)} onClose={() => setDeleteRecord(null)} maxWidth="xs" fullWidth>
        <DialogTitle>删除知识</DialogTitle>
        <DialogContent>
          <Typography sx={{ fontSize: 14, lineHeight: 1.7 }}>
            确定删除“{deleteRecord?.title}”吗？该知识的全部版本都会被删除，此操作无法撤销。
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteRecord(null)}>取消</Button>
          <Button color="error" variant="contained" onClick={() => void deleteCustomerServiceKnowledge()}>确认删除</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

/** Product knowledge review card, per design: bordered 12px card, title + version
 * pill + review pill, tag line, small action buttons. */
const ProductKnowledgeCard: React.FC<{
  record: GovernedKnowledgeRecord;
  onEnable: () => void;
  onDisable: () => void;
  onReject: () => void;
  onRollback: () => void;
}> = ({ record, onEnable, onDisable, onReject, onRollback }) => {
  const review = reviewPill(record);
  const cardButton = { height: 28, minHeight: 28, px: "12px", fontSize: 11, fontWeight: 600, borderRadius: "7px" } as const;
  return (
    <Box sx={{ border: `1px solid ${tokens.color.border.hairline}`, borderRadius: "12px", p: "13px 15px", mb: "10px" }}>
      <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: "6px" }}>
        <Typography noWrap sx={{ fontSize: 13, fontWeight: 600, flex: 1, minWidth: 0 }}>{record.title}</Typography>
        <Typography
          component="span"
          sx={{
            fontSize: 9,
            fontWeight: 600,
            color: tokens.color.text.secondary,
            border: `1px solid ${tokens.color.border.hairline}`,
            borderRadius: "999px",
            p: "2px 6px",
          }}
        >
          v{record.version}
        </Typography>
        <Pill label={review.label} tone={review.tone} />
      </Box>
      <Typography sx={{ fontSize: 11, fontWeight: 500, color: tokens.color.text.tertiary, mb: "11px" }}>
        {record.tags.length > 0 ? record.tags.join(" · ") : "—"}
      </Typography>
      <Stack direction="row" spacing="7px">
        {!(record.enabled && record.reviewState === "reviewed") && (
          <Button variant="contained" onClick={onEnable} aria-label={`审核通过并启用 ${record.title}`} sx={cardButton}>
            启用
          </Button>
        )}
        <Button variant="outlined" onClick={onDisable} sx={cardButton}>
          禁用
        </Button>
        {record.reviewState !== "rejected" && (
          <Button
            variant="outlined"
            onClick={onReject}
            sx={{
              ...cardButton,
              borderColor: tokens.color.state.warning,
              bgcolor: tokens.color.state.warningSoft,
              color: tokens.color.state.warning,
              "&:hover": { borderColor: tokens.color.state.warning, bgcolor: tokens.color.state.warningSoft },
            }}
          >
            拒绝
          </Button>
        )}
        {record.version > 1 && (
          <Button variant="outlined" onClick={onRollback} sx={cardButton}>
            回滚
          </Button>
        )}
      </Stack>
    </Box>
  );
};

function reviewPill(record: GovernedKnowledgeRecord): { label: string; tone: "success" | "warning" | "error" | "neutral" } {
  if (record.reviewState === "rejected") return { label: "已拒绝", tone: "error" };
  if (record.reviewState === "draft") return { label: "待审核", tone: "warning" };
  return record.enabled ? { label: "已启用", tone: "success" } : { label: "已禁用", tone: "neutral" };
}

function syncPillState(progress: ProductSyncProgress | null): { label: string; tone: "success" | "warning" | "error" | "neutral" } {
  if (!progress) return { label: "待同步", tone: "neutral" };
  switch (progress.phase) {
    case "fetching":
      return { label: "抓取商品中", tone: "success" };
    case "saving":
      return { label: "生成知识中", tone: "success" };
    case "completed":
      return { label: "同步完成", tone: "success" };
    case "cancelled":
      return { label: "已取消", tone: "neutral" };
    case "failed":
      return { label: "有失败", tone: "error" };
    default:
      return { label: "待同步", tone: "neutral" };
  }
}

/** Collapse governed records to the latest version per citationId. The store may
 * return every historical version; the UI only ever acts on the newest. */
function latestPerCitation(records: GovernedKnowledgeRecord[]): GovernedKnowledgeRecord[] {
  const byCitation = new Map<string, GovernedKnowledgeRecord>();
  for (const record of records) {
    const current = byCitation.get(record.citationId);
    if (!current || record.version > current.version) {
      byCitation.set(record.citationId, record);
    }
  }
  return [...byCitation.values()];
}
