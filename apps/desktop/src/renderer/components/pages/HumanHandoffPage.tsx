import React, { useEffect, useMemo, useState } from "react";
import { Alert, Box, Button, InputBase, Typography } from "@mui/material";
import type { MessageRecord, ReplyDraftRecord } from "@customer-agent/core";
import { useAsync } from "../useAsync";
import { tokens } from "../../theme";
import { Hero, Panel, Pill, Stat, StatRow } from "../mistral";
import { splitLines, parseIntentRule } from "../handoffRules";

export const HumanHandoffPage: React.FC = () => {
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [status, setStatus] = useState<string | undefined>();
  const [handoffKeywords, setHandoffKeywords] = useState("");
  const [intentRules, setIntentRules] = useState("");
  const drafts = useAsync(() => window.customerAgent.invoke("reply.draft.list", undefined), []);
  const messages = useAsync(() => window.customerAgent.invoke("message.list", { limit: 300 }), []);
  const messageById = useMemo(() => new Map((messages.data?.messages ?? []).map((message) => [message.id, message])), [messages.data]);
  const escalatedDrafts = (drafts.data?.drafts ?? []).filter((draft) => draft.state === "escalated");

  useEffect(() => {
    void window.customerAgent.invoke("settings.get", undefined).then((response) => {
      setHandoffKeywords(response.settings.handoff?.keywords.join("\n") ?? "");
      setIntentRules((response.settings.handoff?.intentRules ?? []).map((rule) => `${rule.label}:${rule.patterns.join("|")}`).join("\n"));
    });
  }, []);

  const refresh = () => {
    void drafts.refresh();
    void messages.refresh();
  };

  const resumeAi = async (draft: ReplyDraftRecord) => {
    const response = await window.customerAgent.invoke("reply.draft.ignore", { draftId: draft.id });
    setStatus(response.ok ? "已恢复 AI 队列处理入口" : "恢复失败，请稍后重试。");
    refresh();
  };

  const saveNote = async (draft: ReplyDraftRecord) => {
    const note = notes[draft.id];
    if (note === undefined || note === (draft.operatorNote ?? "")) {
      return;
    }
    const response = await window.customerAgent.invoke("reply.draft.note", { draftId: draft.id, note });
    setStatus(response.ok ? "备注已保存" : "保存备注失败，请稍后重试。");
    refresh();
  };

  const saveRules = async () => {
    await window.customerAgent.invoke("settings.save", {
      handoff: {
        keywords: splitLines(handoffKeywords),
        intentRules: splitLines(intentRules).map(parseIntentRule),
      },
    });
    setStatus("规则已保存");
  };

  const fieldLabel = { fontSize: 11, fontWeight: 600, color: tokens.color.text.secondary, mb: "6px" } as const;
  const fieldHelp = { fontSize: 10, fontWeight: 500, color: tokens.color.text.tertiary, mt: "6px" } as const;
  const fieldBox = {
    width: "100%",
    border: "1px solid #e0e0e0",
    borderRadius: "10px",
    p: "11px 13px",
    fontFamily: tokens.font.display,
    fontSize: 12,
    fontWeight: 500,
    lineHeight: 1.7,
    color: "#525252",
    minHeight: 66,
    alignItems: "flex-start",
  } as const;

  return (
    <Box>
      <Box sx={{ mb: "22px" }}>
        <Hero
          title="人工处理工作台"
          subtitle="关键词、意图、营业时间或转接失败进入人工的会话"
          actions={
            <Button
              variant="outlined"
              onClick={refresh}
              startIcon={<span className="material-symbols-rounded" aria-hidden="true" style={{ fontSize: 18 }}>refresh</span>}
            >
              刷新
            </Button>
          }
        />
      </Box>

      {status && <Alert severity={status.includes("失败") ? "error" : "info"} sx={{ mb: 2 }}>{status}</Alert>}

      <Box sx={{ mb: 3, maxWidth: 520 }}>
        <StatRow>
          <Stat
            compact
            label="待人工会话"
            value={escalatedDrafts.length}
            tone={escalatedDrafts.length ? "warning" : "default"}
          />
          <Stat compact label="消息样本" value={messages.data?.messages.length ?? 0} />
        </StatRow>
      </Box>

      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "minmax(0, 1.7fr) minmax(0, 1fr)" }, gap: 4, alignItems: "start" }}>
        <Panel title="待人工会话" flushBody>
          <Box
            sx={{
              display: "flex",
              p: "9px 2px",
              fontSize: 9,
              fontWeight: 700,
              letterSpacing: ".1em",
              color: tokens.color.text.tertiary,
              borderBottom: "1px solid #f0f0f0",
            }}
          >
            <Box sx={{ width: 56 }}>时间</Box>
            <Box sx={{ width: 96 }}>买家</Box>
            <Box sx={{ width: 110 }}>原因</Box>
            <Box sx={{ flex: 1 }}>备注</Box>
            <Box sx={{ width: 70, textAlign: "right" }}>操作</Box>
          </Box>
          {escalatedDrafts.map((draft, index) => {
            const message = messageById.get(draft.messageId);
            return (
              <Box
                key={draft.id}
                sx={{
                  display: "flex",
                  alignItems: "center",
                  p: "14px 2px",
                  borderBottom: index === escalatedDrafts.length - 1 ? "none" : "1px solid #f0f0f0",
                }}
              >
                <Typography sx={{ width: 56, fontFamily: tokens.font.display, fontSize: 11, fontWeight: 500, color: "#c2c2c2" }}>
                  {new Date(draft.updatedAt).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}
                </Typography>
                <Typography noWrap sx={{ width: 96, fontSize: 12, fontWeight: 600, pr: 1 }}>
                  {message?.buyerNickname ?? message?.buyerId ?? draft.messageId}
                </Typography>
                <Box sx={{ width: 110 }}>
                  <Pill label={handoffReason(message)} tone="warning" />
                </Box>
                <InputBase
                  value={notes[draft.id] ?? draft.operatorNote ?? ""}
                  onChange={(event) => setNotes((current) => ({ ...current, [draft.id]: event.target.value }))}
                  onBlur={() => void saveNote(draft)}
                  placeholder="人工处理备注"
                  sx={{
                    flex: 1,
                    fontSize: 12,
                    fontWeight: 500,
                    color: tokens.color.text.tertiary,
                    pr: 1,
                    "& input": { p: 0 },
                  }}
                />
                <Typography
                  component="button"
                  onClick={() => void resumeAi(draft)}
                  sx={{
                    all: "unset",
                    width: 70,
                    textAlign: "right",
                    fontSize: 11,
                    fontWeight: 600,
                    color: tokens.color.text.primary,
                    cursor: "pointer",
                  }}
                >
                  恢复 AI
                </Typography>
              </Box>
            );
          })}
          {!drafts.loading && escalatedDrafts.length === 0 && (
            <Typography sx={{ p: "22px 2px", fontSize: 12, fontWeight: 500, color: tokens.color.text.tertiary }}>
              暂无待人工会话
            </Typography>
          )}
          {drafts.loading && (
            <Typography sx={{ p: "22px 2px", fontSize: 12, fontWeight: 500, color: tokens.color.text.tertiary }}>
              正在读取人工处理会话…
            </Typography>
          )}
        </Panel>

        <Panel
          title="人工转接规则"
          action={
            <Typography sx={{ fontSize: 9, fontWeight: 700, letterSpacing: ".14em", color: tokens.color.text.tertiary }}>
              触发条件
            </Typography>
          }
        >
          <Box sx={{ mb: 2 }}>
            <Typography sx={fieldLabel}>关键词</Typography>
            <InputBase
              fullWidth
              multiline
              minRows={3}
              value={handoffKeywords}
              onChange={(event) => setHandoffKeywords(event.target.value)}
              placeholder={"转人工\n投诉\nshop:232823523:人工客服"}
              sx={fieldBox}
            />
            <Typography sx={fieldHelp}>每行一条；店铺规则格式：shop:店铺ID:关键词</Typography>
          </Box>
          <Box sx={{ mb: 2 }}>
            <Typography sx={fieldLabel}>意图规则</Typography>
            <InputBase
              fullWidth
              multiline
              minRows={3}
              value={intentRules}
              onChange={(event) => setIntentRules(event.target.value)}
              placeholder={"退款纠纷:退款|退货|售后\nshop:232823523:人工诉求:人工|客服|没人"}
              sx={fieldBox}
            />
            <Typography sx={fieldHelp}>格式：意图名:触发词|触发词</Typography>
          </Box>
          <Button
            variant="contained"
            onClick={() => void saveRules()}
            sx={{ height: 34, minHeight: 34, px: "15px", fontSize: 12, fontWeight: 600, borderRadius: "9px" }}
          >
            保存规则
          </Button>
        </Panel>
      </Box>

    </Box>
  );
};

function handoffReason(message: MessageRecord | undefined): string {
  if (!message) return "人工处理";
  if (message.error) return "需要人工确认";
  if (message.state === "escalated") return "AI 已停止";
  return "等待人工";
}
