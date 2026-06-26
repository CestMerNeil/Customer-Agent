import React from "react";
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Divider,
  IconButton,
  MenuItem,
  Select,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from "@mui/material";
import Grid from "@mui/material/Grid";
import type { DependencySnapshot, InboundQueueRecord } from "@customer-agent/core";
import { useAsync } from "../useAsync";

export const QueueOperationsPage: React.FC = () => {
  const [actionError, setActionError] = React.useState<string | undefined>();
  const [shopId, setShopId] = React.useState("");
  const accounts = useAsync(() => window.customerAgent.invoke("account.list", undefined), []);
  const metrics = useAsync(() => window.customerAgent.invoke("queue.metrics", undefined), []);
  const queue = useAsync(() => window.customerAgent.invoke("queue.list", shopId ? { shopId } : undefined), [shopId]);
  const dependencies = useAsync(() => window.customerAgent.invoke("dependency.health", undefined), []);

  const refreshAll = () => {
    void metrics.refresh();
    void queue.refresh();
    void dependencies.refresh();
  };

  const pauseQueue = async () => {
    await window.customerAgent.invoke("queue.pause", undefined);
    refreshAll();
  };

  const resumeQueue = async () => {
    await window.customerAgent.invoke("queue.resume", undefined);
    refreshAll();
  };

  const retryDeadLetters = async () => {
    setActionError(undefined);
    const result = await window.customerAgent.invoke("queue.retryDeadLetters", undefined);
    if (!result.ok) {
      setActionError(result.error ?? "重试死信失败");
    }
    refreshAll();
  };

  const metric = metrics.data?.metrics;
  const items = queue.data?.items ?? [];
  const dependencyItems = dependencies.data?.dependencies ?? [];

  return (
    <Box>
      <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5} sx={{ mb: 2, justifyContent: "space-between" }}>
        <Stack direction="row" spacing={1} sx={{ flexWrap: "wrap" }}>
          <Chip size="small" color={(metric?.depth ?? 0) > 0 ? "warning" : "success"} label={`积压 ${metric?.depth ?? 0}`} />
          <Chip size="small" variant="outlined" label={`重试 ${metric?.retryCount ?? 0}`} />
          <Chip size="small" variant="outlined" color={(metric?.failureCount ?? 0) > 0 ? "error" : "default"} label={`失败 ${metric?.failureCount ?? 0}`} />
        </Stack>
        <Stack direction="row" spacing={1}>
          <Select size="small" displayEmpty value={shopId} onChange={(event) => setShopId(event.target.value)} sx={{ minWidth: 220 }}>
            <MenuItem value="">全部店铺</MenuItem>
            {(accounts.data?.accounts ?? []).map((account) => (
              <MenuItem key={account.id} value={account.shopId}>{account.shopName || account.username} · {account.shopId}</MenuItem>
            ))}
          </Select>
          <Button variant="outlined" size="small" onClick={pauseQueue} startIcon={<span className="material-symbols-outlined">pause</span>}>
            暂停队列
          </Button>
          <Button variant="outlined" size="small" onClick={resumeQueue} startIcon={<span className="material-symbols-outlined">play_arrow</span>}>
            恢复队列
          </Button>
          <Button
            variant="outlined"
            color="warning"
            size="small"
            aria-label="重试死信"
            disabled={(metric?.deadLetter ?? 0) === 0}
            onClick={retryDeadLetters}
            startIcon={<span className="material-symbols-outlined">replay</span>}
          >
            重试死信
          </Button>
          <IconButton size="small" onClick={refreshAll} aria-label="刷新队列">
            <span className="material-symbols-outlined">refresh</span>
          </IconButton>
        </Stack>
      </Stack>

      {(actionError || metrics.error || queue.error || dependencies.error) && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {actionError ?? metrics.error ?? queue.error ?? dependencies.error}
        </Alert>
      )}

      <Grid container spacing={2.5}>
        <Grid size={{ xs: 12, md: 8 }}>
          <Card variant="outlined">
            <CardContent>
              <Typography variant="h6">队列指标</Typography>
              <Divider sx={{ my: 2 }} />
              <Grid container spacing={2}>
                {[
                  ["积压深度", metric?.depth ?? 0],
                  ["待处理", metric?.pending ?? 0],
                  ["处理中", metric?.processing ?? 0],
                  ["等待重试", metric?.retryWaiting ?? 0],
                  ["已完成", metric?.completed ?? 0],
                  ["死信", metric?.deadLetter ?? 0],
                ].map(([label, value]) => (
                  <Grid key={label} size={{ xs: 6, sm: 4 }}>
                    <Typography variant="overline" color="text.secondary">{label}</Typography>
                    <Typography variant="h4">{value}</Typography>
                  </Grid>
                ))}
              </Grid>
              <Stack direction="row" spacing={1.5} sx={{ mt: 2, flexWrap: "wrap" }}>
                <Chip size="small" variant="outlined" label={`平均处理 ${formatDuration(metric?.averageProcessingLatencyMs ?? 0)}`} />
                <Chip size="small" variant="outlined" label={`最老待处理 ${formatDuration(metric?.oldestPendingAgeMs ?? 0)}`} />
                <Chip size="small" variant="outlined" label={`下次重试 ${metric?.nextRetryAt ? new Date(metric.nextRetryAt).toLocaleString() : "无"}`} />
              </Stack>
            </CardContent>
          </Card>
        </Grid>

        <Grid size={{ xs: 12, md: 4 }}>
          <Card variant="outlined" sx={{ height: "100%" }}>
            <CardContent>
              <Typography variant="h6">依赖健康</Typography>
              <Divider sx={{ my: 2 }} />
              <Stack spacing={1.5}>
                {dependencyItems.map((item) => (
                  <DependencyRow key={item.id} item={item} />
                ))}
                {!dependencies.loading && dependencyItems.length === 0 && (
                  <Typography variant="body2" color="text.secondary">暂无依赖健康快照。</Typography>
                )}
                {dependencies.loading && (
                  <Typography variant="body2" color="text.secondary">正在读取依赖健康...</Typography>
                )}
              </Stack>
            </CardContent>
          </Card>
        </Grid>

        <Grid size={{ xs: 12 }}>
          <Card variant="outlined">
            <CardContent>
              <Typography variant="h6">消息工作流</Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5, mb: 2 }}>
                按本地持久化队列显示真实入站消息的处理状态、重试、失败原因和 Agent 动作入口。
              </Typography>
              <TableContainer sx={{ maxHeight: 560, border: "1px solid", borderColor: "divider", borderRadius: 1 }}>
                <Table stickyHeader size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>入队时间</TableCell>
                      <TableCell>店铺</TableCell>
                      <TableCell>买家</TableCell>
                      <TableCell>状态</TableCell>
                      <TableCell>尝试</TableCell>
                      <TableCell>可处理时间</TableCell>
                      <TableCell>最后错误</TableCell>
                      <TableCell>Agent 动作</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {items.map((item) => (
                      <QueueRow key={item.id} item={item} />
                    ))}
                    {!queue.loading && items.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={8} align="center" sx={{ py: 5 }}>暂无队列记录。</TableCell>
                      </TableRow>
                    )}
                    {queue.loading && (
                      <TableRow>
                        <TableCell colSpan={8} align="center" sx={{ py: 5 }}>正在读取队列...</TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </TableContainer>
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </Box>
  );
};

function DependencyRow({ item }: { item: DependencySnapshot }) {
  const color = item.circuitState === "closed" ? "success" : item.circuitState === "half_open" ? "warning" : "error";
  return (
    <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 1 }}>
      <Box sx={{ minWidth: 0 }}>
        <Typography variant="subtitle2">{dependencyLabel(item.id)}</Typography>
        <Typography variant="caption" color="text.secondary">
          失败 {item.consecutiveFailures} 次 · 窗口请求 {item.requestsInWindow}
        </Typography>
      </Box>
      <Chip size="small" color={color} variant="outlined" label={circuitLabel(item.circuitState)} />
    </Box>
  );
}

function QueueRow({ item }: { item: InboundQueueRecord }) {
  return (
    <TableRow hover>
      <TableCell>{new Date(item.enqueuedAt).toLocaleString()}</TableCell>
      <TableCell>{item.shopId}</TableCell>
      <TableCell>{item.buyerId}</TableCell>
      <TableCell><Chip size="small" variant="outlined" label={queueStateLabel(item.state)} color={queueStateColor(item.state)} /></TableCell>
      <TableCell>{item.attempts}</TableCell>
      <TableCell>{new Date(item.availableAt).toLocaleString()}</TableCell>
      <TableCell sx={{ maxWidth: 260, whiteSpace: "normal", wordBreak: "break-word" }}>{item.lastError ?? "-"}</TableCell>
      <TableCell>{agentActionLabel(item.state)}</TableCell>
    </TableRow>
  );
}

function queueStateLabel(state: InboundQueueRecord["state"]): string {
  switch (state) {
    case "pending":
      return "待处理";
    case "processing":
      return "处理中";
    case "retry_waiting":
      return "等待重试";
    case "completed":
      return "已完成";
    case "failed":
      return "失败";
    case "dead_letter":
      return "死信";
    default:
      return state;
  }
}

function queueStateColor(state: InboundQueueRecord["state"]): "default" | "primary" | "success" | "warning" | "error" {
  if (state === "completed") return "success";
  if (state === "processing") return "primary";
  if (state === "retry_waiting") return "warning";
  if (state === "failed" || state === "dead_letter") return "error";
  return "default";
}

function agentActionLabel(state: InboundQueueRecord["state"]): string {
  if (state === "pending") return "等待处理链";
  if (state === "processing") return "处理链运行中";
  if (state === "retry_waiting") return "等待重试";
  if (state === "completed") return "已完成";
  return "需要人工检查";
}

function circuitLabel(state: DependencySnapshot["circuitState"]): string {
  if (state === "closed") return "正常";
  if (state === "half_open") return "恢复探测";
  return "熔断";
}

function dependencyLabel(id: DependencySnapshot["id"]): string {
  switch (id) {
    case "pdd":
      return "PDD";
    case "llm":
      return "LLM";
    case "embedding_vector":
      return "Embedding/向量";
    case "product_sync":
      return "商品同步";
    default:
      return id;
  }
}

function formatDuration(ms: number): string {
  if (ms <= 0) return "0ms";
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${Math.round(ms / 1000)}s`;
  return `${Math.round(ms / 60_000)}m`;
}
