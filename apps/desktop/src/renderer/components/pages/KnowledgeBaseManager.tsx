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
import { EmptyState, Pill } from "../mistral";

type KnowledgeTab = "service" | "product";
type KnowledgeFilter = "all" | "pending" | "enabled" | "rejected";

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

  // Design: tabbed table with filter chips, batch selection bar and an upload modal.
  const [tab, setTab] = useState<KnowledgeTab>("service");
  const [filter, setFilter] = useState<KnowledgeFilter>("all");
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploadMode, setUploadMode] = useState<"file" | "text">("file");

  const productEntries = latestPerCitation(productKnowledge.data?.records ?? []);
  const customerServiceEntries = latestPerCitation(customerServiceKnowledge.data?.records ?? []);
  const tabEntries = tab === "service" ? customerServiceEntries : productEntries;
  const filteredEntries = tabEntries.filter((record) => matchesFilter(record, filter));
  const counts: Record<KnowledgeFilter, number> = {
    all: tabEntries.length,
    pending: tabEntries.filter((record) => matchesFilter(record, "pending")).length,
    enabled: tabEntries.filter((record) => matchesFilter(record, "enabled")).length,
    rejected: tabEntries.filter((record) => matchesFilter(record, "rejected")).length,
  };

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

  const refreshAll = async () => {
    await productKnowledge.refresh();
    await customerServiceKnowledge.refresh();
  };

  const switchTab = (nextTab: KnowledgeTab) => {
    setTab(nextTab);
    setFilter("all");
    setSelected(new Set());
  };

  const toggleSelected = (citationId: string) => {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(citationId)) next.delete(citationId);
      else next.add(citationId);
      return next;
    });
  };

  /** Selects a main-owned document handle and requests one-time extraction. */
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
    if (picked.canceled || !picked.documentId) {
      return;
    }
    const requestId = window.crypto.randomUUID();
    setDocumentBusy(true);
    setDocumentProgress({ requestId, fileName: picked.basename ?? "文档", completed: 0, total: 0, entries: 0, failed: 0 });
    setStatus(`正在读取并解析 ${picked.basename} …`);
    const unsubscribe = window.customerAgent.on("knowledge.document.progress", (progress) => {
      if (progress.requestId === requestId) setDocumentProgress(progress);
    });
    try {
      const result = await window.customerAgent.invoke("knowledge.document.import", {
        shopId: selectedAccount.shopId,
        documentId: picked.documentId,
        requestId,
      });
      if (!result.ok) {
        setStatus(result.error ?? "文档解析失败");
        return;
      }
      setDocumentPreview({
        fileName: result.fileName ?? picked.basename ?? "文档",
        fileType: result.fileType ?? "",
        segmentsTotal: result.segmentsTotal,
        failures: result.failures,
        entries: result.entries.map((entry) => ({ ...entry, selected: true })),
      });
      setUploadOpen(false);
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
      await refreshAll();
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
    await refreshAll();
  };

  const bulkSetState = async (patch: { enabled?: boolean; reviewState?: GovernedKnowledgeRecord["reviewState"] }) => {
    for (const citationId of selected) {
      await window.customerAgent.invoke("knowledge.governed.state", { citationId, ...patch });
    }
    setSelected(new Set());
    setStatus("知识状态已批量更新");
    await refreshAll();
  };

  const bulkDelete = async () => {
    if (!window.confirm(`确定删除已选 ${selected.size} 条知识吗？全部版本都会被删除，此操作无法撤销。`)) {
      return;
    }
    for (const citationId of selected) {
      await window.customerAgent.invoke("knowledge.governed.delete", { citationId });
    }
    setSelected(new Set());
    setStatus("已删除所选知识");
    await refreshAll();
  };

  const rollbackKnowledge = async (record: GovernedKnowledgeRecord) => {
    const response = await window.customerAgent.invoke("knowledge.governed.rollback", {
      citationId: record.citationId,
      version: record.version - 1,
    });
    setProductStatus(response.ok ? "已回滚到上一版" : "回滚失败，请稍后重试。");
    setDetailRecord(null);
    await refreshAll();
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
    if (response.ok) {
      setUploadOpen(false);
      setCustomerServiceRows("");
    }
    await customerServiceKnowledge.refresh();
  };

  const syncPill = syncPillState(syncProgress);
  const syncing = Boolean(syncProgress && !["completed", "failed", "cancelled"].includes(syncProgress.phase));
  const syncPct = syncProgress && syncProgress.total > 0
    ? Math.min(100, (syncProgress.current / syncProgress.total) * 100)
    : syncProgress?.phase === "completed"
      ? 100
      : 0;

  const columnHeader = { fontSize: 9, fontWeight: 700, letterSpacing: ".1em", color: tokens.color.text.tertiary } as const;
  const smallActionButton = { height: 28, minHeight: 28, px: "12px", fontSize: 11, fontWeight: 600, borderRadius: "8px" } as const;
  const bulkButton = {
    height: 26,
    minHeight: 26,
    px: "12px",
    fontSize: 11,
    fontWeight: 600,
    borderRadius: "7px",
    color: tokens.color.text.onAccent,
    borderColor: "rgba(255,255,255,.3)",
    "&:hover": { borderColor: "rgba(255,255,255,.5)", bgcolor: "rgba(255,255,255,.08)" },
  } as const;

  return (
    <Box>
      {/* tabs + upload */}
      <Box sx={{ display: "flex", alignItems: "flex-end", gap: 3, borderBottom: `1px solid ${tokens.color.border.hairline}`, mb: "14px" }}>
        {([
          ["service", "客服知识", customerServiceEntries.length],
          ["product", "商品知识", productEntries.length],
        ] as const).map(([id, label, count]) => (
          <Box
            key={id}
            component="button"
            type="button"
            onClick={() => switchTab(id)}
            aria-selected={tab === id}
            role="tab"
            sx={{
              all: "unset",
              cursor: "pointer",
              p: "2px 2px 11px",
              display: "flex",
              gap: "6px",
              alignItems: "baseline",
              borderBottom: `2px solid ${tab === id ? tokens.color.text.primary : "transparent"}`,
              color: tab === id ? tokens.color.text.primary : tokens.color.text.secondary,
              fontSize: 13,
              fontWeight: tab === id ? 700 : 500,
            }}
          >
            {label}
            <Typography component="span" sx={{ fontFamily: tokens.font.display, fontSize: 11, fontWeight: 600, color: tokens.color.text.tertiary }}>
              {count}
            </Typography>
          </Box>
        ))}
        <Box sx={{ ml: "auto", pb: 1 }}>
          <Button
            variant="contained"
            onClick={() => {
              setUploadMode("file");
              setUploadOpen(true);
            }}
            startIcon={<span className="material-symbols-rounded" aria-hidden="true" style={{ fontSize: 17 }}>upload_file</span>}
            sx={{ height: 34, minHeight: 34, px: "15px", fontSize: 12, fontWeight: 600, borderRadius: "9px" }}
          >
            上传文档
          </Button>
        </Box>
      </Box>

      {/* product sync strip — only relevant to the 商品知识 tab */}
      {tab === "product" && (
        <Box sx={{ border: `1px solid ${tokens.color.border.hairline}`, borderRadius: "12px", p: "11px 16px", mb: "14px" }}>
          <Box sx={{ display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap", rowGap: 1 }}>
            <span
              className={syncing ? "material-symbols-rounded ca-spin" : "material-symbols-rounded"}
              aria-hidden="true"
              style={{ fontSize: 18, color: syncing ? tokens.color.state.success : tokens.color.text.secondary }}
            >
              {syncing ? "progress_activity" : "sync"}
            </span>
            <Typography sx={{ fontSize: 12, fontWeight: 600 }}>商品同步 ·</Typography>
            <Select
              size="small"
              displayEmpty
              value={selectedAccount?.id ?? ""}
              onChange={(event) => setSelectedAccountId(event.target.value)}
              sx={{ height: 28, borderRadius: "7px", fontSize: 12, fontWeight: 600, minWidth: 140 }}
            >
              {(accounts.data?.accounts ?? []).map((account: AccountRecord) => (
                <MenuItem key={account.id} value={account.id}>
                  {account.shopName || account.username}
                </MenuItem>
              ))}
              {(accounts.data?.accounts ?? []).length === 0 && <MenuItem value="">暂无账号</MenuItem>}
            </Select>
            <Pill label={syncPill.label} tone={syncPill.tone} />
            <Typography sx={{ fontSize: 11, fontWeight: 500, color: tokens.color.text.tertiary }}>
              {syncProgress
                ? `${syncProgress.current}/${syncProgress.total} · 新增 ${syncProgress.added} · 更新 ${syncProgress.updated} · 跳过 ${syncProgress.skipped} · 失败 ${syncProgress.failed}`
                : "尚未同步"}
            </Typography>
            <Stack direction="row" spacing={1} sx={{ ml: "auto" }}>
              <Button variant="outlined" onClick={() => void startProductSync("incremental")} disabled={!selectedAccount || syncing} sx={smallActionButton}>
                增量同步
              </Button>
              <Button variant="outlined" onClick={() => void startProductSync("full")} disabled={!selectedAccount || syncing} sx={smallActionButton}>
                全量同步
              </Button>
              {syncing && (
                <Button variant="outlined" color="warning" onClick={() => void cancelProductSync()} sx={smallActionButton}>
                  取消
                </Button>
              )}
            </Stack>
          </Box>
          {syncing && (
            <Box sx={{ mt: "10px", display: "flex", alignItems: "center", gap: "10px" }}>
              <Box sx={{ flex: 1, height: 5, borderRadius: "3px", bgcolor: tokens.color.control.fill, overflow: "hidden", maxWidth: 260 }}>
                <Box sx={{ width: `${syncPct}%`, height: "100%", bgcolor: tokens.color.state.success, transition: "width .4s" }} />
              </Box>
              <Typography sx={{ fontFamily: tokens.font.display, fontSize: 11, fontWeight: 600, color: tokens.color.state.success }}>
                {Math.round(syncPct)}%
              </Typography>
              {syncProgress?.currentGoodsName && (
                <Typography noWrap sx={{ fontSize: 11, fontWeight: 500, color: tokens.color.text.tertiary }}>
                  当前：{syncProgress.currentGoodsName}
                </Typography>
              )}
            </Box>
          )}
          {syncProgress?.failures[0] && (
            <Alert severity="warning" sx={{ mt: 1 }}>
              {syncProgress.failures[0].error}
            </Alert>
          )}
        </Box>
      )}

      <Typography sx={{ fontSize: 11, fontWeight: 500, color: tokens.color.text.tertiary, mb: "14px" }}>
        点击标题可查看完整内容并审核；上传 PDF / Word / 表格，AI 自动提取为知识条目并进入「待审核」
      </Typography>

      {status && <Alert severity={status.includes("失败") ? "error" : "info"} sx={{ mb: 1.5 }} onClose={() => setStatus(null)}>{status}</Alert>}
      {productStatus && <Alert severity={productStatus.includes("失败") ? "error" : "info"} sx={{ mb: 1.5 }} onClose={() => setProductStatus(null)}>{productStatus}</Alert>}

      {/* filter chips */}
      <Stack direction="row" spacing={1} sx={{ mb: "12px" }}>
        {([
          ["all", "全部"],
          ["pending", "待审核"],
          ["enabled", "已启用"],
          ["rejected", "已拒绝"],
        ] as const).map(([id, label]) => (
          <Box
            key={id}
            component="button"
            type="button"
            onClick={() => {
              setFilter(id);
              setSelected(new Set());
            }}
            sx={{
              all: "unset",
              cursor: "pointer",
              fontSize: 11,
              fontWeight: filter === id ? 700 : 500,
              color: filter === id ? tokens.color.text.onAccent : tokens.color.text.secondary,
              bgcolor: filter === id ? tokens.color.accent.main : tokens.color.control.fill,
              p: "5px 12px",
              borderRadius: "999px",
            }}
          >
            {label} {counts[id]}
          </Box>
        ))}
      </Stack>

      {/* batch bar */}
      {selected.size > 0 && (
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            gap: "14px",
            bgcolor: tokens.color.accent.main,
            color: tokens.color.text.onAccent,
            borderRadius: "10px",
            p: "9px 14px",
            mb: "2px",
          }}
        >
          <Typography sx={{ fontSize: 12, fontWeight: 600, color: "inherit" }}>已选 {selected.size} 条</Typography>
          <Stack direction="row" spacing={1}>
            <Button variant="outlined" onClick={() => void bulkSetState({ reviewState: "reviewed", enabled: true })} sx={bulkButton}>审核并启用</Button>
            <Button variant="outlined" onClick={() => void bulkSetState({ enabled: false })} sx={bulkButton}>禁用</Button>
            <Button variant="outlined" onClick={() => void bulkSetState({ reviewState: "rejected", enabled: false })} sx={bulkButton}>拒绝</Button>
            <Button variant="outlined" onClick={() => void bulkDelete()} sx={{ ...bulkButton, color: "#ff8d85", borderColor: "rgba(242,85,75,.6)" }}>删除</Button>
          </Stack>
          <Typography
            component="button"
            type="button"
            onClick={() => setSelected(new Set())}
            sx={{ all: "unset", ml: "auto", cursor: "pointer", fontSize: 11, fontWeight: 600, color: "rgba(255,255,255,.6)" }}
          >
            取消选择
          </Typography>
        </Box>
      )}

      {/* table */}
      <Box sx={{ display: "flex", alignItems: "center", p: "10px 2px", borderBottom: `1px solid ${tokens.color.border.hairline}` }}>
        <Box sx={{ width: 34 }} />
        <Typography sx={{ ...columnHeader, flex: 1.6 }}>标题</Typography>
        <Typography sx={{ ...columnHeader, flex: 1 }}>标签</Typography>
        <Typography sx={{ ...columnHeader, width: 52 }}>版本</Typography>
        <Typography sx={{ ...columnHeader, width: 84 }}>审核状态</Typography>
        <Typography sx={{ ...columnHeader, width: 92 }}>AGENT</Typography>
        <Typography sx={{ ...columnHeader, width: 64 }}>更新</Typography>
      </Box>
      {filteredEntries.map((record) => {
        const review = reviewPill(record);
        const agentReady = record.enabled && record.reviewState === "reviewed";
        return (
          <Box
            key={record.citationId}
            onClick={() => setDetailRecord(record)}
            sx={{
              display: "flex",
              alignItems: "center",
              p: "8px 2px",
              borderBottom: `1px solid ${tokens.color.border.hairline}`,
              cursor: "pointer",
              bgcolor: selected.has(record.citationId) ? tokens.color.surface.hover : "transparent",
              "&:hover": { bgcolor: tokens.color.surface.hover },
            }}
          >
            <Box sx={{ width: 34 }} onClick={(event) => event.stopPropagation()}>
              <Checkbox
                size="small"
                checked={selected.has(record.citationId)}
                onChange={() => toggleSelected(record.citationId)}
                slotProps={{ input: { "aria-label": `选择 ${record.title}` } }}
                sx={{ p: "4px" }}
              />
            </Box>
            <Typography noWrap sx={{ flex: 1.6, fontSize: 13, fontWeight: 600, display: "flex", alignItems: "center", gap: "4px", pr: 1 }}>
              {record.title}
              <span className="material-symbols-rounded" aria-hidden="true" style={{ fontSize: 16, color: tokens.color.border.strong }}>chevron_right</span>
            </Typography>
            <Typography noWrap sx={{ flex: 1, fontSize: 11, fontWeight: 500, color: tokens.color.text.tertiary, pr: 1 }}>
              {record.tags.length > 0 ? record.tags.join(" · ") : "—"}
            </Typography>
            <Typography sx={{ width: 52, fontFamily: tokens.font.display, fontSize: 11, fontWeight: 500, color: tokens.color.text.secondary }}>
              v{record.version}
            </Typography>
            <Box sx={{ width: 84 }}>
              <Pill label={review.label} tone={review.tone} />
            </Box>
            <Box sx={{ width: 92 }}>
              <Pill label={agentReady ? "可用" : "不可用"} tone={agentReady ? "success" : "neutral"} />
            </Box>
            <Typography sx={{ width: 64, fontFamily: tokens.font.display, fontSize: 11, fontWeight: 500, color: tokens.color.text.tertiary }}>
              {formatUpdated(record.updatedAt)}
            </Typography>
          </Box>
        );
      })}
      {filteredEntries.length === 0 && (
        <EmptyState
          primary={tab === "service" ? "暂无客服知识" : "暂无商品知识"}
          secondary={tab === "product" ? "请先执行商品同步。" : "点击「上传文档」导入知识。"}
        />
      )}

      {/* upload modal */}
      <Dialog open={uploadOpen} onClose={() => !documentBusy && setUploadOpen(false)} fullWidth maxWidth="xs">
        <DialogTitle sx={{ fontSize: 16, fontWeight: 700 }}>上传文档</DialogTitle>
        <DialogContent>
          {documentBusy ? (
            <Box className="ca-fade-in" sx={{ py: "30px", display: "flex", flexDirection: "column", alignItems: "center", gap: "14px" }}>
              <span className="material-symbols-rounded ca-spin" aria-hidden="true" style={{ fontSize: 28, color: tokens.color.state.success }}>auto_awesome</span>
              <Typography sx={{ fontSize: 13, fontWeight: 600 }}>AI 正在提取知识条目…</Typography>
              <Typography sx={{ fontSize: 11, fontWeight: 500, color: tokens.color.text.tertiary, textAlign: "center" }}>
                {documentProgress?.total
                  ? `已解析 ${documentProgress.completed}/${documentProgress.total} 个片段 · 已提取 ${documentProgress.entries} 条`
                  : "识别文档结构并生成待审核条目"}
              </Typography>
              {documentProgress?.total ? (
                <Box sx={{ width: "100%", height: 5, borderRadius: "3px", bgcolor: tokens.color.control.fill, overflow: "hidden" }}>
                  <Box sx={{ width: `${(documentProgress.completed / documentProgress.total) * 100}%`, height: "100%", bgcolor: tokens.color.state.success, transition: "width .18s linear" }} />
                </Box>
              ) : (
                <LinearProgress sx={{ width: "100%", height: 5, borderRadius: "3px" }} />
              )}
            </Box>
          ) : (
            <>
              <Box sx={{ display: "inline-flex", bgcolor: tokens.color.control.fill, borderRadius: "10px", p: "4px", gap: "4px", mb: 2 }}>
                {([
                  ["file", "上传文件", "upload_file"],
                  ["text", "粘贴文本", "content_paste"],
                ] as const).map(([id, label, icon]) => (
                  <Box
                    key={id}
                    component="button"
                    type="button"
                    onClick={() => setUploadMode(id)}
                    sx={{
                      all: "unset",
                      cursor: "pointer",
                      p: "8px 20px",
                      borderRadius: "7px",
                      fontSize: 12,
                      fontWeight: 600,
                      display: "flex",
                      alignItems: "center",
                      gap: "7px",
                      bgcolor: uploadMode === id ? tokens.color.surface.base : "transparent",
                      color: uploadMode === id ? tokens.color.text.primary : tokens.color.text.secondary,
                      boxShadow: uploadMode === id ? tokens.elevation[1] : "none",
                    }}
                  >
                    <span className="material-symbols-rounded" aria-hidden="true" style={{ fontSize: 16 }}>{icon}</span>
                    {label}
                  </Box>
                ))}
              </Box>
              {uploadMode === "file" ? (
                <Box
                  onClick={() => void uploadDocument()}
                  sx={{
                    border: `1.5px dashed ${tokens.color.border.strong}`,
                    borderRadius: "14px",
                    p: "28px",
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    gap: "10px",
                    cursor: "pointer",
                  }}
                >
                  <Box sx={{ width: 42, height: 42, borderRadius: "12px", bgcolor: tokens.color.control.fill, display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <span className="material-symbols-rounded" aria-hidden="true" style={{ fontSize: 22, color: tokens.color.text.secondary }}>upload_file</span>
                  </Box>
                  <Typography sx={{ fontSize: 13, fontWeight: 700 }}>点击选择文档</Typography>
                  <Typography sx={{ fontSize: 11, fontWeight: 500, color: tokens.color.text.tertiary, textAlign: "center" }}>
                    支持 PDF / Word / 表格，AI 自动提取知识条目，先进入待审核，不会直接生效
                  </Typography>
                  <Button variant="contained" sx={{ mt: "6px" }}>选择文件</Button>
                </Box>
              ) : (
                <Box>
                  <InputBase
                    fullWidth
                    multiline
                    minRows={5}
                    value={customerServiceRows}
                    onChange={(event) => setCustomerServiceRows(event.target.value)}
                    placeholder={"批量导入 · 每行格式：标题，内容，标签1|标签2"}
                    sx={{
                      border: `1px solid ${tokens.color.border.strong}`,
                      borderRadius: "12px",
                      p: "12px 14px",
                      fontSize: 13,
                      lineHeight: 1.6,
                      alignItems: "flex-start",
                      "& textarea::placeholder": { color: tokens.color.text.tertiary, opacity: 1 },
                    }}
                  />
                  <Button
                    fullWidth
                    variant="contained"
                    onClick={() => void importCustomerServiceKnowledge()}
                    sx={{ mt: 1.5 }}
                    startIcon={<span className="material-symbols-rounded" aria-hidden="true" style={{ fontSize: 17 }}>upload</span>}
                  >
                    导入
                  </Button>
                </Box>
              )}
            </>
          )}
        </DialogContent>
      </Dialog>

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

      {/* detail overlay — per design: title, status pill, tag · version, content, review actions */}
      <Dialog open={Boolean(detailRecord)} onClose={() => setDetailRecord(null)} fullWidth maxWidth="sm">
        <DialogTitle sx={{ fontSize: 16, fontWeight: 700 }}>{detailRecord?.title ?? "知识详情"}</DialogTitle>
        <DialogContent>
          {detailRecord && (
            <>
              <Stack direction="row" spacing={1} sx={{ alignItems: "center", mb: 2 }}>
                <Pill label={reviewPill(detailRecord).label} tone={reviewPill(detailRecord).tone} />
                <Typography sx={{ fontSize: 11, fontWeight: 500, color: tokens.color.text.tertiary }}>
                  {(detailRecord.tags.length > 0 ? detailRecord.tags.join(" · ") : detailRecord.sourceId ?? detailRecord.sourceType) + ` · v${detailRecord.version}`}
                </Typography>
              </Stack>
              <Box
                sx={{
                  fontSize: 13,
                  lineHeight: 1.7,
                  color: tokens.color.text.secondary,
                  bgcolor: tokens.color.surface.sunken,
                  border: `1px solid ${tokens.color.border.hairline}`,
                  borderRadius: "12px",
                  p: "14px 16px",
                  whiteSpace: "pre-wrap",
                }}
              >
                {detailRecord.content}
              </Box>
            </>
          )}
        </DialogContent>
        <DialogActions>
          {detailRecord && (
            <>
              <Button color="error" onClick={() => setDeleteRecord(detailRecord)} sx={{ mr: "auto" }}>删除</Button>
              {detailRecord.version > 1 && (
                <Button variant="outlined" onClick={() => void rollbackKnowledge(detailRecord)}>回滚</Button>
              )}
              {detailRecord.enabled && (
                <Button
                  variant="outlined"
                  onClick={() => {
                    void setKnowledgeState(detailRecord, { enabled: false });
                    setDetailRecord(null);
                  }}
                >
                  禁用
                </Button>
              )}
              <Button
                variant="outlined"
                color="error"
                onClick={() => {
                  void setKnowledgeState(detailRecord, { reviewState: "rejected", enabled: false });
                  setDetailRecord(null);
                }}
              >
                拒绝
              </Button>
              <Button
                variant="contained"
                onClick={() => {
                  void setKnowledgeState(detailRecord, { reviewState: "reviewed", enabled: true });
                  setDetailRecord(null);
                }}
              >
                审核并启用
              </Button>
            </>
          )}
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

function matchesFilter(record: GovernedKnowledgeRecord, filter: KnowledgeFilter): boolean {
  switch (filter) {
    case "pending":
      return record.reviewState === "draft";
    case "enabled":
      return record.reviewState === "reviewed" && record.enabled;
    case "rejected":
      return record.reviewState === "rejected";
    default:
      return true;
  }
}

function formatUpdated(value: string): string {
  const date = new Date(value);
  const now = new Date();
  if (date.toDateString() === now.toDateString()) {
    return date.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" });
  }
  return date.toLocaleDateString("zh-CN", { month: "numeric", day: "numeric" });
}

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
