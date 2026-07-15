import React, { useEffect, useState } from "react";
import { Box, Button, Stack, Typography } from "@mui/material";
import type { MessageState } from "@customer-agent/core";
import { tokens } from "../../theme";
import { EmptyState, Hero, Panel, Pill, Stat, StatRow } from "../mistral";
import { useAsync } from "../useAsync";

interface AutoReplyDashboardProps {
  onNavigate?: (id: string) => void;
}

/** Design row pill: message state → label + tone. */
const statePill: Partial<Record<MessageState, { label: string; tone: "outline" | "success" | "dark" | "neutral" | "error" }>> = {
  received: { label: "待审核", tone: "outline" },
  generating: { label: "待审核", tone: "outline" },
  draft_ready: { label: "待审核", tone: "outline" },
  sent: { label: "AI 已回复", tone: "success" },
  escalated: { label: "转人工", tone: "dark" },
  ignored: { label: "已忽略", tone: "neutral" },
  failed: { label: "失败", tone: "error" },
};

export const AutoReplyDashboard: React.FC<AutoReplyDashboardProps> = ({ onNavigate }) => {
  const [now, setNow] = useState(() => new Date());
  const accounts = useAsync(() => window.customerAgent.invoke("account.list", undefined), []);
  const messages = useAsync(() => window.customerAgent.invoke("message.list", { limit: 10 }), []);
  const drafts = useAsync(() => window.customerAgent.invoke("reply.draft.list", undefined), []);
  const logs = useAsync(() => window.customerAgent.invoke("log.list", { limit: 20 }), []);
  const inference = useAsync(() => window.customerAgent.invoke("inference.health", undefined), []);

  const refreshAll = () => {
    void accounts.refresh();
    void messages.refresh();
    void drafts.refresh();
    void logs.refresh();
    void inference.refresh();
  };

  const modelReady = inference.data?.ok ?? false;

  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(interval);
  }, []);

  const onlineCount = accounts.data?.accounts.filter((account) => account.status === "online").length ?? 0;
  const accountCount = accounts.data?.accounts.length ?? 0;
  const draftItems = drafts.data?.drafts ?? [];
  const pendingDraftCount = draftItems.filter((draft) => draft.state === "draft_ready" || draft.state === "failed").length;
  const sentDraftCount = draftItems.filter((draft) => draft.state === "sent").length;
  const ignoredDraftCount = draftItems.filter((draft) => draft.state === "ignored").length;
  const escalatedDraftCount = draftItems.filter((draft) => draft.state === "escalated").length;
  const autoReplyRate = draftItems.length ? Math.round((sentDraftCount / draftItems.length) * 100) : 0;
  const recentMessages = messages.data?.messages ?? [];
  const diagnostics = (logs.data?.logs ?? []).filter((log) => log.message.startsWith("诊断[")).slice(0, 3);

  return (
    <Box>
      <Box sx={{ mb: "22px" }}>
        <Hero
          title="实时工作台"
          subtitle={`今日 ${now.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}`}
          actions={
            <>
              <Button variant="outlined" onClick={refreshAll}>
                刷新
              </Button>
              <Button
                variant="contained"
                color="primary"
                onClick={() => onNavigate?.("queue")}
                startIcon={<span className="material-symbols-rounded" aria-hidden="true" style={{ fontSize: 18 }}>arrow_forward</span>}
              >
                查看待处理 · {pendingDraftCount}
              </Button>
            </>
          }
        />
      </Box>

      <Box sx={{ mb: 3 }}>
        <StatRow>
          <Stat
            label="在线账号"
            value={onlineCount}
            suffix={
              <Typography component="span" sx={{ fontFamily: tokens.font.display, fontSize: 16, color: tokens.color.text.tertiary, ml: "-2px" }}>
                /{accountCount}
              </Typography>
            }
          />
          <Stat
            label="待审核草稿"
            value={pendingDraftCount}
            suffix={
              pendingDraftCount > 0 ? (
                <Box component="span" sx={{ width: 7, height: 7, borderRadius: "50%", bgcolor: tokens.color.state.success, alignSelf: "center", ml: "2px" }} />
              ) : undefined
            }
          />
          <Stat label="今日已回复" value={sentDraftCount} />
          <Stat
            label="AI 自动率"
            value={autoReplyRate}
            suffix={
              <Typography component="span" sx={{ fontFamily: tokens.font.display, fontSize: 18, color: tokens.color.text.tertiary, ml: "-4px" }}>
                %
              </Typography>
            }
          />
        </StatRow>
      </Box>

      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: { xs: "1fr", md: "minmax(0, 1.8fr) minmax(0, 1fr)" },
          gap: 4,
          alignItems: "start",
        }}
      >
        <Panel
          title="最近消息流水"
          action={
            <Typography sx={{ fontSize: 9, fontWeight: 700, letterSpacing: ".14em", color: tokens.color.text.tertiary }}>
              近 10 条 · 实时
            </Typography>
          }
          flushBody
        >
          {recentMessages.length === 0 ? (
            <EmptyState
              primary={messages.loading ? "正在读取消息…" : "暂无真实消息"}
              secondary={messages.loading ? "正在同步本地消息库。" : "启动拼多多账号后会在这里显示。"}
            />
          ) : (
            recentMessages.map((message, index) => {
              const pill = statePill[message.state] ?? { label: message.state, tone: "outline" as const };
              return (
                <Box
                  key={message.id}
                  sx={{
                    display: "flex",
                    alignItems: "center",
                    gap: "14px",
                    p: "13px 2px",
                    borderBottom: index === recentMessages.length - 1 ? "none" : `1px solid ${tokens.color.border.hairline}`,
                  }}
                >
                  <Typography sx={{ fontFamily: tokens.font.display, fontSize: 12, fontWeight: 500, color: tokens.color.text.tertiary, width: 38, flex: "none" }}>
                    {new Date(message.receivedAt).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}
                  </Typography>
                  <Typography noWrap sx={{ fontSize: 13, fontWeight: 600, width: 100, flex: "none" }}>
                    {message.buyerNickname ?? message.buyerId}
                  </Typography>
                  <Typography noWrap sx={{ fontSize: 12, fontWeight: 500, color: tokens.color.text.secondary, flex: 1, minWidth: 0 }}>
                    {message.content}
                  </Typography>
                  <Box sx={{ flex: "none" }}>
                    <Pill label={pill.label} tone={pill.tone} />
                  </Box>
                </Box>
              );
            })
          )}
        </Panel>

        <Box>
          <Panel title="队列概览">
            <Stack spacing="13px" sx={{ mb: "26px" }}>
              {([
                ["新消息", recentMessages.length, tokens.color.text.primary],
                ["待审核", pendingDraftCount, tokens.color.text.primary],
                ["已升级", escalatedDraftCount, tokens.color.text.primary],
                ["已忽略", ignoredDraftCount, tokens.color.text.tertiary],
              ] as const).map(([label, value, color]) => (
                <Box key={label} sx={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                  <Typography sx={{ fontSize: 12, fontWeight: 500, color: tokens.color.text.secondary }}>{label}</Typography>
                  <Typography sx={{ fontFamily: tokens.font.display, fontWeight: 500, fontSize: 17, color }}>{value}</Typography>
                </Box>
              ))}
            </Stack>
          </Panel>

          <Panel
            title="模型准备度"
            action={
              <Typography sx={{ fontSize: 10, fontWeight: 600, color: modelReady ? tokens.color.state.success : tokens.color.state.warning }}>
                {inference.loading && !inference.data ? "检测中" : modelReady ? "已就绪" : "未就绪"}
              </Typography>
            }
          >
            <Box sx={{ height: 4, borderRadius: "2px", bgcolor: tokens.color.control.fill, overflow: "hidden", mb: 1 }}>
              <Box
                sx={{
                  width: modelReady ? "100%" : "0%",
                  height: "100%",
                  bgcolor: tokens.color.state.success,
                  transition: "width .4s",
                }}
              />
            </Box>
            <Typography sx={{ fontSize: 11, fontWeight: 500, color: tokens.color.text.tertiary, mb: 3 }}>
              {modelReady
                ? "本地模型 · 检查通过"
                : inference.data?.error
                  ? "AI 暂时不可用，请到模型页检查配置。"
                  : "配置 OpenAI 兼容 endpoint 后可进行健康检查。"}
            </Typography>
          </Panel>

          <Panel title="最近诊断">
            {diagnostics.length === 0 ? (
              <EmptyState primary="暂无诊断记录" secondary="运行时的健康检查与告警会在这里出现。" />
            ) : (
              diagnostics.map((log) => (
                <Typography
                  key={log.id}
                  sx={{ fontSize: 12, fontWeight: 500, lineHeight: 1.5, color: tokens.color.text.secondary, mb: 1 }}
                >
                  — {businessDiagnosticText(log.message)}
                </Typography>
              ))
            )}
          </Panel>
        </Box>
      </Box>
    </Box>
  );
};

function businessDiagnosticText(value: string): string {
  if (value.includes("pdd")) return "拼多多连接需要处理，请到账号页查看状态。";
  if (value.includes("inference") || value.includes("model")) return "AI 服务需要处理，请到模型页查看状态。";
  if (value.includes("product")) return "商品同步需要处理，请到知识库查看状态。";
  return "有一项后台任务需要处理，请查看对应页面。";
}
