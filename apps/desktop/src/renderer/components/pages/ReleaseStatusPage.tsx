import React from "react";
import { Alert, Box, Stack, Typography } from "@mui/material";
import type { AcceptanceCapabilityMatrixRow } from "@customer-agent/core";
import { useAsync } from "../useAsync";
import { tokens } from "../../theme";
import { Panel, Pill } from "../mistral";

export const ReleaseStatusPage: React.FC = () => {
  const status = useAsync(() => window.customerAgent.invoke("acceptance.status", undefined), []);
  const data = status.data;
  const errors = data?.errors ?? [];

  return (
    <Box sx={{ maxWidth: 820 }}>
      {status.error && <Alert severity="error" sx={{ mb: 2 }}>{status.error}</Alert>}

      {/* 候选版本卡 */}
      <Box
        sx={{
          border: `1px solid ${tokens.color.border.hairline}`,
          borderRadius: "14px",
          p: "20px 22px",
          mb: "18px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <Box>
          <Typography sx={{ fontSize: 9, fontWeight: 700, letterSpacing: ".14em", color: tokens.color.text.tertiary, mb: 1 }}>
            当前候选版本
          </Typography>
          <Typography sx={{ fontFamily: tokens.font.display, fontSize: 26, fontWeight: 500, lineHeight: 1 }}>
            {data?.tag ?? "未指定"}
          </Typography>
          <Typography sx={{ fontSize: 11, fontWeight: 500, color: tokens.color.text.tertiary, mt: 1 }}>
            commit {(data?.commitSha ?? "—").slice(0, 7)} · {data?.platform ?? "—"} · 记录 {data?.records ?? 0} 条
          </Typography>
        </Box>
        <Typography
          component="span"
          sx={{
            fontSize: 11,
            fontWeight: 600,
            color: data?.ok ? tokens.color.state.success : tokens.color.state.warning,
            bgcolor: data?.ok ? tokens.color.state.successSoft : tokens.color.state.warningSoft,
            p: "6px 14px",
            borderRadius: "999px",
          }}
        >
          {data?.ok ? "门禁通过" : "门禁未通过"}
        </Typography>
      </Box>

      {/* 发布门禁 */}
      <Box sx={{ pb: 1.5, borderBottom: `1px solid ${tokens.color.text.primary}`, mb: "6px" }}>
        <Typography sx={{ fontSize: 12, fontWeight: 700 }}>发布门禁</Typography>
      </Box>
      {status.loading && (
        <Typography sx={{ p: "13px 2px", fontSize: 12, fontWeight: 500, color: tokens.color.text.tertiary }}>
          正在读取发布状态…
        </Typography>
      )}
      {!status.loading && errors.length === 0 && (
        <GateRow ok label="acceptance:validate" detail={data?.ok ? "已通过" : "暂无校验结果"} last />
      )}
      {errors.slice(0, 8).map((error, index) => (
        <GateRow key={error} ok={false} label="acceptance:validate" detail={error} last={index === Math.min(errors.length, 8) - 1} />
      ))}

      {/* 能力矩阵 */}
      <Box sx={{ mt: "22px" }}>
        <Panel title="Release-blocking 能力矩阵" flushBody>
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
            <Box sx={{ flex: 1 }}>Capability</Box>
            <Box sx={{ width: 130 }}>Scope</Box>
            <Box sx={{ width: 130 }}>Gate</Box>
          </Box>
          {(data?.matrix ?? []).map((row, index) => (
            <CapabilityRow key={row.capability} row={row} last={index === (data?.matrix.length ?? 0) - 1} />
          ))}
          {!status.loading && (data?.matrix.length ?? 0) === 0 && (
            <Typography sx={{ p: "22px 2px", fontSize: 12, fontWeight: 500, color: tokens.color.text.tertiary }}>
              暂无能力矩阵
            </Typography>
          )}
        </Panel>
      </Box>
    </Box>
  );
};

function GateRow({ ok, label, detail, last }: { ok: boolean; label: string; detail: string; last?: boolean }) {
  return (
    <Stack
      direction="row"
      sx={{ alignItems: "center", gap: 1.5, p: "13px 2px", borderBottom: last ? "none" : "1px solid #f0f0f0" }}
    >
      <span
        className="material-symbols-rounded" aria-hidden="true"
        style={{ fontSize: 19, color: ok ? "#059669" : "#b45309" }}
      >
        {ok ? "check_circle" : "pending"}
      </span>
      <Typography sx={{ fontSize: 13, fontWeight: 600, flex: 1 }}>{label}</Typography>
      <Typography
        sx={{
          fontSize: 11,
          fontWeight: 500,
          fontFamily: ok ? tokens.font.display : tokens.font.family,
          color: ok ? tokens.color.text.tertiary : tokens.color.state.warning,
          maxWidth: 420,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {detail}
      </Typography>
    </Stack>
  );
}

function CapabilityRow({ row, last }: { row: AcceptanceCapabilityMatrixRow; last: boolean }) {
  return (
    <Box sx={{ display: "flex", alignItems: "center", p: "12px 2px", borderBottom: last ? "none" : "1px solid #f0f0f0" }}>
      <Typography sx={{ flex: 1, fontSize: 12, fontWeight: 600 }}>{row.capability}</Typography>
      <Typography sx={{ width: 130, fontSize: 12, fontWeight: 500, color: "#525252" }}>
        {row.requiredScopes === "two-shop" ? "双账号/双店铺" : "平台"}
      </Typography>
      <Box sx={{ width: 130 }}>
        <Pill label={row.releaseBlocking ? "release-blocking" : "optional"} tone={row.releaseBlocking ? "warning" : "muted"} />
      </Box>
    </Box>
  );
}
