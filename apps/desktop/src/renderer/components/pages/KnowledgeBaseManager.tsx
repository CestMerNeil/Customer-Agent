import React, { useEffect, useState } from "react";
import {
  Alert,
  Box,
  Button,
  InputBase,
  MenuItem,
  Select,
  Stack,
  Typography,
} from "@mui/material";
import type { AccountRecord, GovernedKnowledgeRecord, ProductSyncMode, ProductSyncProgress } from "@customer-agent/core";
import { useAsync } from "../useAsync";
import { tokens } from "../../theme";
import { EmptyState, Panel, Pill } from "../mistral";

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
    setStatus(`正在用 AI 解析 ${picked.fileName} …`);
    const result = await window.customerAgent.invoke("knowledge.document.import", {
      shopId: selectedAccount.shopId,
      filePath: picked.filePath,
    });
    setStatus(
      result.ok
        ? `已解析 ${picked.fileName}：抽取 ${result.entries ?? 0} 条，新建 ${result.created}，跳过重复 ${result.skippedDuplicates}`
        : result.error ?? "文档解析失败",
    );
    await customerServiceKnowledge.refresh();
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
      setProductStatus("商品同步启动失败，请稍后重试。");
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
              sx={{ height: 34, borderRadius: "9px", fontSize: 12, fontWeight: 600, color: "#525252", minWidth: 150 }}
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
          <Typography sx={{ fontSize: 12, fontWeight: 500, color: "#525252" }}>
            {syncProgress
              ? `${syncProgress.current}/${syncProgress.total} · 新增 ${syncProgress.added} · 更新 ${syncProgress.updated} · 跳过 ${syncProgress.skipped} · 失败 ${syncProgress.failed}`
              : "尚未同步"}
          </Typography>
        </Box>
        <Box sx={{ height: 5, borderRadius: "3px", bgcolor: "#f0f0f0", overflow: "hidden" }}>
          <Box sx={{ width: `${syncPct}%`, height: "100%", bgcolor: tokens.color.state.success, transition: "width .4s" }} />
        </Box>
        {syncProgress?.currentGoodsName && (
          <Typography sx={{ fontSize: 11, fontWeight: 500, color: tokens.color.text.tertiary, mt: 1 }}>
            当前：{syncProgress.currentGoodsName}
          </Typography>
        )}
        {syncProgress?.failures[0] && (
          <Alert severity="warning" sx={{ mt: 1 }}>
            有商品同步失败，请稍后重试或检查账号/模型状态。
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
              disabled={!selectedAccount}
              startIcon={<span className="material-symbols-rounded" aria-hidden="true" style={{ fontSize: 16 }}>upload_file</span>}
              sx={{ height: 32, minHeight: 32, px: "14px", fontSize: 12, fontWeight: 600, borderRadius: "8px" }}
            >
              解析文档
            </Button>
          </Stack>
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
                <Box
                  key={record.citationId}
                  onClick={() =>
                    void setKnowledgeState(
                      record,
                      record.enabled ? { enabled: false } : { reviewState: "reviewed", enabled: true },
                    )
                  }
                  sx={{
                    display: "flex",
                    alignItems: "center",
                    gap: "10px",
                    py: "11px",
                    borderBottom: index === customerServiceEntries.length - 1 ? "none" : "1px solid #f0f0f0",
                    cursor: "pointer",
                  }}
                >
                  <Typography noWrap sx={{ fontSize: 13, fontWeight: 600, flex: 1 }}>
                    {record.title}
                  </Typography>
                  <Pill label={record.enabled ? "已启用" : "未启用"} tone={record.enabled ? "success" : "neutral"} />
                </Box>
              ))}
            </Box>
          )}
        </Panel>
      </Box>
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
              borderColor: "#f0d9a8",
              bgcolor: "#fffbf2",
              color: tokens.color.state.warning,
              "&:hover": { borderColor: "#f0d9a8", bgcolor: "#fdf3dd" },
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
