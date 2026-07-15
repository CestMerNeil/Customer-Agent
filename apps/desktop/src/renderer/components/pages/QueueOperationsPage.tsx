import React from "react";
import { Alert, Box, Button, MenuItem, Select, Stack, Typography } from "@mui/material";
import type { DependencySnapshot, InboundQueueRecord } from "@customer-agent/core";
import { tokens } from "../../theme";
import { useAsync } from "../useAsync";
import { EmptyState, Hero, Panel, Pill, Stat, StatRow } from "../mistral";

export const QueueOperationsPage: React.FC = () => {
  const [actionError, setActionError] = React.useState<string | undefined>();
  const [shopId, setShopId] = React.useState("");
  const [paused, setPaused] = React.useState(false);
  const accounts = useAsync(() => window.customerAgent.invoke("account.list", undefined), []);
  const metrics = useAsync(() => window.customerAgent.invoke("queue.metrics", undefined), []);
  const queue = useAsync(() => window.customerAgent.invoke("queue.list", shopId ? { shopId } : undefined), [shopId]);
  const dependencies = useAsync(() => window.customerAgent.invoke("dependency.health", undefined), []);

  React.useEffect(() => {
    void window.customerAgent
      .invoke("settings.get", undefined)
      .then((response) => setPaused(Boolean(response.settings?.queue?.paused)))
      .catch(() => {});
  }, []);

  const refreshAll = () => {
    void metrics.refresh();
    void queue.refresh();
    void dependencies.refresh();
  };

  const pauseQueue = async () => {
    const result = await window.customerAgent.invoke("queue.pause", undefined);
    setPaused(Boolean(result.settings?.queue?.paused ?? true));
    refreshAll();
  };

  const resumeQueue = async () => {
    const result = await window.customerAgent.invoke("queue.resume", undefined);
    setPaused(Boolean(result.settings?.queue?.paused ?? false));
    refreshAll();
  };

  const retryDeadLetters = async () => {
    setActionError(undefined);
    const result = await window.customerAgent.invoke("queue.retryDeadLetters", undefined);
    if (!result.ok) {
      setActionError("重试没有完成，请稍后再试。");
    }
    refreshAll();
  };

  const metric = metrics.data?.metrics;
  const items = queue.data?.items ?? [];
  const dependencyItems = dependencies.data?.dependencies ?? [];

  const smallButton = {
    height: 34,
    minHeight: 34,
    px: "12px",
    fontSize: 12,
    fontWeight: 600,
    borderRadius: "9px",
    gap: "6px",
  } as const;

  return (
    <Box>
      <Box sx={{ mb: "22px" }}>
        <Hero
          title="消息工作流"
          subtitle="本地持久化队列的真实处理状态、重试与依赖健康"
          actions={
            <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
              <Select
                size="small"
                displayEmpty
                value={shopId}
                onChange={(event) => setShopId(event.target.value)}
                sx={{
                  height: 34,
                  borderRadius: "9px",
                  fontSize: 12,
                  fontWeight: 600,
                  color: tokens.color.text.secondary,
                  minWidth: 110,
                }}
              >
                <MenuItem value="">全部店铺</MenuItem>
                {(accounts.data?.accounts ?? []).map((account) => (
                  <MenuItem key={account.id} value={account.shopId}>
                    {account.shopName || account.username} · {account.shopId}
                  </MenuItem>
                ))}
              </Select>
              <Button
                variant="outlined"
                onClick={pauseQueue}
                sx={{ ...smallButton, bgcolor: paused ? tokens.color.control.fill : "transparent" }}
                startIcon={<span className="material-symbols-rounded" aria-hidden="true" style={{ fontSize: 16 }}>pause</span>}
              >
                暂停
              </Button>
              <Button
                variant="outlined"
                onClick={resumeQueue}
                sx={{ ...smallButton, bgcolor: paused ? "transparent" : tokens.color.control.fill }}
                startIcon={<span className="material-symbols-rounded" aria-hidden="true" style={{ fontSize: 16 }}>play_arrow</span>}
              >
                恢复
              </Button>
              <Button
                variant="outlined"
                onClick={retryDeadLetters}
                disabled={(metric?.deadLetter ?? 0) === 0}
                sx={{
                  ...smallButton,
                  borderColor: tokens.color.state.warning,
                  bgcolor: tokens.color.state.warningSoft,
                  color: tokens.color.state.warning,
                  "&:hover": { borderColor: tokens.color.state.warning, bgcolor: tokens.color.state.warningSoft },
                }}
                startIcon={<span className="material-symbols-rounded" aria-hidden="true" style={{ fontSize: 16 }}>replay</span>}
              >
                重试处理失败
              </Button>
            </Stack>
          }
        />
      </Box>

      {(actionError || metrics.error || queue.error || dependencies.error) && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {actionError ?? "消息工作流暂时无法更新，请稍后重试。"}
        </Alert>
      )}

      <Box sx={{ mb: "14px" }}>
        <StatRow>
          <Stat compact label="积压深度" value={metric?.depth ?? 0} tone={(metric?.depth ?? 0) > 0 ? "warning" : "default"} />
          <Stat compact label="待处理" value={metric?.pending ?? 0} />
          <Stat compact label="处理中" value={metric?.processing ?? 0} tone="accent" />
          <Stat compact label="等待重试" value={metric?.retryWaiting ?? 0} />
          <Stat compact label="已完成" value={metric?.completed ?? 0} />
          <Stat compact label="处理失败" value={metric?.deadLetter ?? 0} tone={(metric?.deadLetter ?? 0) > 0 ? "error" : "default"} />
        </StatRow>
      </Box>

      <Typography
        sx={{
          fontSize: 11,
          fontWeight: 600,
          color: paused ? tokens.color.state.warning : tokens.color.state.success,
          mb: "10px",
        }}
      >
        队列状态：{paused ? "已暂停" : "运行中"}
      </Typography>

      <Stack direction="row" spacing={1} sx={{ mb: 3 }}>
        {([
          ["平均处理", formatDuration(metric?.averageProcessingLatencyMs ?? 0)],
          ["最老待处理", formatDuration(metric?.oldestPendingAgeMs ?? 0)],
          [
            "下次重试",
            metric?.nextRetryAt
              ? new Date(metric.nextRetryAt).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })
              : "无",
          ],
        ] as const).map(([label, value]) => (
          <Typography
            key={label}
            component="span"
            sx={{
              fontSize: 11,
              fontWeight: 500,
              color: tokens.color.text.secondary,
              border: `1px solid ${tokens.color.border.hairline}`,
              borderRadius: "999px",
              p: "5px 11px",
            }}
          >
            {label}{" "}
            <Box component="b" sx={{ fontFamily: tokens.font.display, fontWeight: 600 }}>
              {value}
            </Box>
          </Typography>
        ))}
      </Stack>

      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: { xs: "1fr", md: "minmax(0, 2.2fr) minmax(0, 1fr)" },
          gap: 4,
          alignItems: "start",
        }}
      >
        <Panel title="消息工作流" flushBody>
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
            <Box sx={{ width: 64 }}>入队</Box>
            <Box sx={{ width: 96 }}>买家</Box>
            <Box sx={{ flex: 1 }}>处理结果</Box>
            <Box sx={{ width: 78 }}>状态</Box>
            <Box sx={{ width: 44, textAlign: "right" }}>尝试</Box>
          </Box>
          {items.map((item, index) => (
            <QueueRow key={item.id} item={item} last={index === items.length - 1} />
          ))}
          {!queue.loading && items.length === 0 && (
            <Typography sx={{ p: "22px 2px", fontSize: 12, fontWeight: 500, color: tokens.color.text.tertiary }}>
              暂无队列记录
            </Typography>
          )}
          {queue.loading && (
            <Typography sx={{ p: "22px 2px", fontSize: 12, fontWeight: 500, color: tokens.color.text.tertiary }}>
              正在读取队列…
            </Typography>
          )}
        </Panel>

        <Panel title="依赖健康">
          <Stack spacing={2}>
            {dependencyItems.map((item) => (
              <DependencyRow key={item.id} item={item} />
            ))}
            {!dependencies.loading && dependencyItems.length === 0 && <EmptyState primary="暂无依赖健康快照。" />}
            {dependencies.loading && <EmptyState primary="正在读取依赖健康…" />}
          </Stack>
        </Panel>
      </Box>
    </Box>
  );
};

function DependencyRow({ item }: { item: DependencySnapshot }) {
  const tone =
    item.circuitState === "closed"
      ? { color: tokens.color.state.success, dot: tokens.color.state.success, label: "正常" }
      : item.circuitState === "half_open"
        ? { color: tokens.color.state.warning, dot: tokens.color.state.warning, label: "恢复中" }
        : { color: tokens.color.state.error, dot: tokens.color.state.error, label: "熔断" };
  return (
    <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
      <Box sx={{ minWidth: 0 }}>
        <Typography sx={{ fontSize: 13, fontWeight: 600 }}>{dependencyLabel(item.id)}</Typography>
        <Typography sx={{ fontSize: 11, fontWeight: 500, color: tokens.color.text.tertiary }}>
          失败 {item.consecutiveFailures} 次 · 窗口请求 {item.requestsInWindow}
        </Typography>
      </Box>
      <Typography
        component="span"
        sx={{ fontSize: 10, fontWeight: 600, color: tone.color, display: "flex", alignItems: "center", gap: "5px" }}
      >
        <Box component="span" sx={{ width: 7, height: 7, borderRadius: "50%", bgcolor: tone.dot }} />
        {tone.label}
      </Typography>
    </Box>
  );
}

function QueueRow({ item, last }: { item: InboundQueueRecord; last: boolean }) {
  const pill = queueStatePill(item.state);
  const errorColor =
    item.state === "retry_waiting" ? tokens.color.state.warning
    : item.state === "failed" || item.state === "dead_letter" ? tokens.color.state.error
    : tokens.color.text.tertiary;
  return (
    <Box
      sx={{
        display: "flex",
        alignItems: "center",
        p: "12px 2px",
        borderBottom: last ? "none" : `1px solid ${tokens.color.border.hairline}`,
      }}
    >
      <Typography sx={{ width: 64, fontFamily: tokens.font.display, fontSize: 11, fontWeight: 500, color: tokens.color.text.tertiary }}>
        {new Date(item.enqueuedAt).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}
      </Typography>
      <Typography noWrap sx={{ width: 96, fontSize: 12, fontWeight: 600, pr: 1 }}>
        {item.buyerId}
      </Typography>
      <Typography noWrap sx={{ flex: 1, fontSize: 12, fontWeight: 500, color: errorColor, pr: 1 }}>
        {queueBusinessMessage(item)}
      </Typography>
      <Box sx={{ width: 78 }}>
        <Pill label={pill.label} tone={pill.tone} />
      </Box>
      <Typography
        sx={{ width: 44, textAlign: "right", fontFamily: tokens.font.display, fontSize: 12, fontWeight: 500, color: tokens.color.text.secondary }}
      >
        {item.attempts}
      </Typography>
    </Box>
  );
}

function queueBusinessMessage(item: InboundQueueRecord): string {
  if (!item.lastError) return "—";
  if (item.state === "retry_waiting") return "处理中遇到临时问题，稍后自动重试";
  if (item.state === "failed" || item.state === "dead_letter") return "处理失败，请人工查看或重试";
  return "处理过程中出现提示";
}

function queueStatePill(state: InboundQueueRecord["state"]): { label: string; tone: "outline" | "success" | "warning" | "error" | "muted" } {
  switch (state) {
    case "pending":
      return { label: "待处理", tone: "outline" };
    case "processing":
      return { label: "处理中", tone: "success" };
    case "retry_waiting":
      return { label: "等待重试", tone: "warning" };
    case "completed":
      return { label: "已完成", tone: "muted" };
    case "failed":
      return { label: "处理失败", tone: "error" };
    case "dead_letter":
      return { label: "处理失败", tone: "error" };
    default:
      return { label: state, tone: "outline" };
  }
}

function dependencyLabel(id: DependencySnapshot["id"]): string {
  switch (id) {
    case "pdd":
      return "PDD";
    case "llm":
      return "LLM";
    case "product_sync":
      return "商品同步";
    default:
      return id;
  }
}

function formatDuration(ms: number): string {
  if (ms <= 0) return "0ms";
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.round(ms / 60_000)}m`;
}
