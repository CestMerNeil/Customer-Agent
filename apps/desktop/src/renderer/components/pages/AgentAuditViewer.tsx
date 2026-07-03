import React from "react";
import { Box, InputBase, Stack, Typography } from "@mui/material";
import { useAsync } from "../useAsync";
import { tokens } from "../../theme";
import { Hero, Pill } from "../mistral";

export const AgentAuditViewer: React.FC = () => {
  const [shopId, setShopId] = React.useState("");
  const [messageId, setMessageId] = React.useState("");
  const audit = useAsync(() => window.customerAgent.invoke("agent.audit.list", {
    limit: 100,
    ...(shopId.trim() ? { shopId: shopId.trim() } : {}),
    ...(messageId.trim() ? { messageId: messageId.trim() } : {}),
  }), [shopId, messageId]);
  const records = audit.data?.records ?? [];

  const filterInput = {
    height: 34,
    px: "12px",
    border: "1px solid #e0e0e0",
    borderRadius: "9px",
    fontSize: 12,
    fontWeight: 500,
    width: 120,
    "& input": { p: 0 },
    "& input::placeholder": { color: tokens.color.text.tertiary, opacity: 1 },
  } as const;

  return (
    <Box>
      <Box sx={{ mb: "22px" }}>
        <Hero
          title="AI 处理记录"
          subtitle="最近 100 条工具调用、结果、引用与最终回复事件"
          actions={
            <Stack direction="row" spacing={1}>
              <InputBase placeholder="店铺" value={shopId} onChange={(event) => setShopId(event.target.value)} sx={filterInput} />
              <InputBase placeholder="消息 ID" value={messageId} onChange={(event) => setMessageId(event.target.value)} sx={filterInput} />
            </Stack>
          }
        />
      </Box>

      {audit.error ? (
        <Typography color="error">{audit.error}</Typography>
      ) : (
        <Box>
          <Box
            sx={{
              display: "flex",
              p: "9px 2px",
              fontSize: 9,
              fontWeight: 700,
              letterSpacing: ".1em",
              color: tokens.color.text.tertiary,
              borderBottom: `1px solid ${tokens.color.text.primary}`,
            }}
          >
            <Box sx={{ width: 64 }}>时间</Box>
            <Box sx={{ width: 110 }}>消息</Box>
            <Box sx={{ width: 90 }}>事件</Box>
            <Box sx={{ width: 150 }}>工具</Box>
            <Box sx={{ width: 64 }}>状态</Box>
            <Box sx={{ flex: 1 }}>摘要</Box>
          </Box>
          {records.map((record, index) => (
            <Box
              key={record.id}
              sx={{
                display: "flex",
                alignItems: "center",
                p: "12px 2px",
                borderBottom: index === records.length - 1 ? "none" : "1px solid #f0f0f0",
              }}
            >
              <Typography sx={{ width: 64, fontFamily: tokens.font.display, fontSize: 11, fontWeight: 500, color: "#c2c2c2" }}>
                {new Date(record.createdAt).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
              </Typography>
              <Typography noWrap sx={{ width: 110, fontFamily: tokens.font.display, fontSize: 12, fontWeight: 500, color: "#525252", pr: 1 }}>
                {record.messageId}
              </Typography>
              <Typography sx={{ width: 90, fontSize: 11, fontWeight: 600 }}>{eventLabel(record.eventType)}</Typography>
              <Typography
                noWrap
                sx={{ width: 150, fontSize: 12, fontWeight: 500, color: record.toolName ? "#525252" : tokens.color.text.tertiary, pr: 1 }}
              >
                {record.toolName ?? "—"}
              </Typography>
              <Box sx={{ width: 64 }}>
                {record.ok === undefined ? (
                  <Typography sx={{ fontSize: 12, fontWeight: 500, color: tokens.color.text.tertiary }}>—</Typography>
                ) : (
                  <Pill label={record.ok ? "成功" : "失败"} tone={record.ok ? "success" : "error"} />
                )}
              </Box>
              <Typography noWrap sx={{ flex: 1, fontSize: 12, fontWeight: 500, color: tokens.color.text.secondary }}>
                {record.summary}
                {record.citations.length > 0 ? ` · 引用 ${record.citations.length} 条` : ""}
              </Typography>
            </Box>
          ))}
          {!audit.loading && records.length === 0 && (
            <Typography sx={{ p: "22px 2px", fontSize: 12, fontWeight: 500, color: tokens.color.text.tertiary }}>
              暂无 AI 处理记录
            </Typography>
          )}
          {audit.loading && (
            <Typography sx={{ p: "22px 2px", fontSize: 12, fontWeight: 500, color: tokens.color.text.tertiary }}>
              正在读取 AI 处理记录…
            </Typography>
          )}
        </Box>
      )}
    </Box>
  );
};

function eventLabel(value: string): string {
  switch (value) {
    case "tool_call":
      return "工具调用";
    case "tool_result":
      return "工具结果";
    case "final":
      return "最终回复";
    case "loop_limit":
      return "循环上限";
    case "model":
      return "模型输出";
    default:
      return value;
  }
}
