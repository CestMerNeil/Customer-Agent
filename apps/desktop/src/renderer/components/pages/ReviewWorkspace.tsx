import React, { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Divider,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import Grid from "@mui/material/Grid";
import type { MessageRecord, ReplyDraftRecord } from "@customer-agent/core";
import { useAsync } from "../useAsync";
import { StateSurface } from "../StateSurface";
import { tokens } from "../../theme";

const PENDING_STATES: ReadonlyArray<ReplyDraftRecord["state"]> = ["draft_ready", "failed"];

type ActionKind = "send" | "ignore" | "escalate";

export const ReviewWorkspace: React.FC = () => {
  const drafts = useAsync(() => window.customerAgent.invoke("reply.draft.list", undefined), []);
  const messages = useAsync(() => window.customerAgent.invoke("message.list", { limit: 200 }), []);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const [busy, setBusy] = useState<ActionKind | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const pending = useMemo(
    () => (drafts.data?.drafts ?? []).filter((draft) => PENDING_STATES.includes(draft.state)),
    [drafts.data],
  );

  const messageById = useMemo(() => {
    const map = new Map<string, MessageRecord>();
    for (const message of messages.data?.messages ?? []) {
      map.set(message.id, message);
    }
    return map;
  }, [messages.data]);

  // Keep a valid selection as the pending list changes (e.g. after an action).
  useEffect(() => {
    if (pending.length === 0) {
      setSelectedId(null);
      return;
    }
    if (!selectedId || !pending.some((draft) => draft.id === selectedId)) {
      setSelectedId(pending[0]?.id ?? null);
    }
  }, [pending, selectedId]);

  const selected = pending.find((draft) => draft.id === selectedId) ?? null;

  // Load the selected draft's text into the editor when selection changes,
  // but never clobber an in-progress edit after a failed action.
  useEffect(() => {
    if (selected) {
      setEditText(selected.reply.text);
      setActionError(null);
    }
    // Intentionally keyed on selectedId only: load text on selection change,
    // without clobbering an in-progress edit when other reads refresh `selected`.
  }, [selectedId]);

  const runAction = async (kind: ActionKind) => {
    if (!selected) return;
    setBusy(kind);
    setActionError(null);
    try {
      const response =
        kind === "send"
          ? await window.customerAgent.invoke("reply.draft.send", { draftId: selected.id, text: editText })
          : kind === "ignore"
            ? await window.customerAgent.invoke("reply.draft.ignore", { draftId: selected.id })
            : await window.customerAgent.invoke("reply.draft.escalate", { draftId: selected.id });
      if (!response.ok) {
        setActionError(sanitize(response.error) ?? "操作失败，请重试。");
        return;
      }
      await drafts.refresh();
    } catch (caught) {
      setActionError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setBusy(null);
    }
  };

  return (
    <Grid container spacing={2.5} sx={{ alignItems: "stretch" }}>
      <Grid size={{ xs: 12, md: 4 }}>
        <Card sx={{ height: "100%" }}>
          <CardContent>
            <Stack direction="row" sx={{ justifyContent: "space-between", alignItems: "center", mb: 1.5 }}>
              <Typography variant="h6">待审核</Typography>
              <Chip
                size="small"
                label={pending.length}
                color={pending.length ? "primary" : "default"}
                variant={pending.length ? "filled" : "outlined"}
              />
            </Stack>
            <Divider sx={{ mb: 1 }} />
            <StateSurface
              state={drafts}
              isEmpty={() => pending.length === 0}
              loadingLabel="正在读取草稿…"
              emptyTitle="没有待审核草稿"
              emptyHint="AI 生成的回复草稿会出现在这里，等待你确认、编辑或升级。"
            >
              {() => (
                <Stack spacing={0.75} role="listbox" aria-label="待审核草稿">
                  {pending.map((draft) => {
                    const message = messageById.get(draft.messageId);
                    const isActive = draft.id === selectedId;
                    return (
                      <Box
                        key={draft.id}
                        component="button"
                        type="button"
                        role="option"
                        aria-selected={isActive}
                        onClick={() => setSelectedId(draft.id)}
                        sx={{
                          textAlign: "left",
                          width: "100%",
                          border: `1px solid ${isActive ? tokens.color.accent.main : tokens.color.border.hairline}`,
                          bgcolor: isActive ? tokens.color.accent.soft : tokens.color.surface.base,
                          borderRadius: `${tokens.radius.md}px`,
                          p: 1.5,
                          cursor: "pointer",
                          transition: `border-color ${tokens.motion.duration.fast}, background-color ${tokens.motion.duration.fast}`,
                          "&:hover": { bgcolor: isActive ? tokens.color.accent.soft : tokens.color.surface.hover },
                          "&:focus-visible": {
                            outline: `2px solid ${tokens.color.border.focus}`,
                            outlineOffset: 2,
                          },
                        }}
                      >
                        <Stack direction="row" sx={{ justifyContent: "space-between", alignItems: "center", mb: 0.5 }}>
                          <Typography variant="subtitle2" noWrap>
                            {message?.buyerNickname ?? message?.buyerId ?? draft.id.slice(-8)}
                          </Typography>
                          {draft.state === "failed" && <Chip size="small" color="error" label="失败" variant="outlined" />}
                        </Stack>
                        <Typography variant="body2" color="text.secondary" sx={clamp(2)}>
                          {message?.content ?? draft.reply.text}
                        </Typography>
                      </Box>
                    );
                  })}
                </Stack>
              )}
            </StateSurface>
          </CardContent>
        </Card>
      </Grid>

      <Grid size={{ xs: 12, md: 8 }}>
        <Card sx={{ height: "100%" }}>
          <CardContent sx={{ p: 3 }}>
            {!selected ? (
              <StateSurface
                state={drafts}
                isEmpty={() => true}
                emptyTitle="选择一条待审核草稿"
                emptyHint="从左侧列表选择草稿，查看买家消息、命中知识并编辑回复。"
                minHeight={320}
              >
                {() => null}
              </StateSurface>
            ) : (
              <DetailPane
                draft={selected}
                message={messageById.get(selected.messageId) ?? null}
                editText={editText}
                onEditText={setEditText}
                busy={busy}
                actionError={actionError}
                onAction={runAction}
              />
            )}
          </CardContent>
        </Card>
      </Grid>
    </Grid>
  );
};

interface DetailPaneProps {
  draft: ReplyDraftRecord;
  message: MessageRecord | null;
  editText: string;
  onEditText: (value: string) => void;
  busy: ActionKind | null;
  actionError: string | null;
  onAction: (kind: ActionKind) => void;
}

const DetailPane: React.FC<DetailPaneProps> = ({
  draft,
  message,
  editText,
  onEditText,
  busy,
  actionError,
  onAction,
}) => {
  const sources = draft.reply.sources ?? [];
  return (
    <Stack spacing={2.5}>
      <Box>
        <Typography variant="overline" color="text.secondary">
          买家消息
        </Typography>
        <Stack direction="row" spacing={1} sx={{ alignItems: "center", mt: 0.5, mb: 1 }}>
          <Typography variant="h6">{message?.buyerNickname ?? message?.buyerId ?? "未知买家"}</Typography>
          {message && <Chip size="small" variant="outlined" label={message.type} />}
        </Stack>
        <Card variant="outlined" sx={{ bgcolor: tokens.color.surface.sunken, boxShadow: "none" }}>
          <CardContent sx={{ py: 1.5 }}>
            <Typography variant="body2">{message?.content ?? "（找不到对应的原始消息）"}</Typography>
          </CardContent>
        </Card>
      </Box>

      <Box>
        <Typography variant="overline" color="text.secondary">
          命中知识
        </Typography>
        {sources.length === 0 ? (
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
            本次回复未命中知识库片段。
          </Typography>
        ) : (
          <Stack direction="row" spacing={1} sx={{ mt: 1, flexWrap: "wrap", gap: 1 }}>
            {sources.map((source) => (
              <Chip
                key={source.chunkId}
                size="small"
                variant="outlined"
                icon={<span className="material-symbols-outlined" style={{ fontSize: 16 }}>{source.scope === "shop" ? "store" : "public"}</span>}
                label={`${source.scope === "shop" ? "店铺" : "全局"} · ${(source.score * 100).toFixed(0)}%`}
              />
            ))}
          </Stack>
        )}
      </Box>

      <Box>
        <Typography variant="overline" color="text.secondary">
          回复草稿（可编辑）
        </Typography>
        <TextField
          fullWidth
          multiline
          minRows={4}
          value={editText}
          onChange={(event) => onEditText(event.target.value)}
          sx={{ mt: 1 }}
          slotProps={{ htmlInput: { "aria-label": "回复草稿" } }}
        />
      </Box>

      {actionError && <Alert severity="error">{actionError}</Alert>}

      <Stack direction="row" spacing={1.5} sx={{ flexWrap: "wrap", gap: 1 }}>
        <Button
          variant="contained"
          disabled={busy !== null || editText.trim().length === 0}
          onClick={() => onAction("send")}
          startIcon={<span className="material-symbols-outlined">send</span>}
        >
          {busy === "send" ? "发送中…" : "发送回复"}
        </Button>
        <Button
          variant="outlined"
          color="secondary"
          disabled={busy !== null}
          onClick={() => onAction("escalate")}
          startIcon={<span className="material-symbols-outlined">flag</span>}
        >
          升级人工
        </Button>
        <Button
          variant="text"
          color="inherit"
          disabled={busy !== null}
          onClick={() => onAction("ignore")}
          startIcon={<span className="material-symbols-outlined">block</span>}
        >
          忽略
        </Button>
      </Stack>
    </Stack>
  );
};

function clamp(lines: number) {
  return {
    display: "-webkit-box",
    WebkitLineClamp: lines,
    WebkitBoxOrient: "vertical" as const,
    overflow: "hidden",
  };
}

function sanitize(value?: string): string | undefined {
  if (!value) return value;
  return value
    .replace(/^诊断\[[^\]]+\]\s*/u, "")
    .replace(/\b(error|message)=/g, "")
    .replace(/\s+/g, " ")
    .trim();
}
