import React, { useEffect, useState } from "react";
import { Box, Button, InputBase, Stack, Typography } from "@mui/material";
import type { AppUpdateStatus } from "@customer-agent/core";
import { tokens } from "../../theme";
import { useAsync } from "../useAsync";

const DATA_DIR = "~/Library/Application Support/Customer-Agent";

const sectionHeader = {
  pb: 1.5,
  borderBottom: `1px solid ${tokens.color.text.primary}`,
  mb: 2,
} as const;

const sectionTitle = { fontSize: 12, fontWeight: 700 } as const;

export const SettingsPage: React.FC = () => {
  const [businessStart, setBusinessStart] = useState("09:00");
  const [businessEnd, setBusinessEnd] = useState("21:00");
  const [message, setMessage] = useState<string | null>(null);
  const [updateStatus, setUpdateStatus] = useState<AppUpdateStatus>({
    state: "disabled",
    version: (import.meta as { env?: Record<string, string> }).env?.VITE_APP_VERSION ?? "0.0.0",
    enabled: false,
  });
  const logs = useAsync(() => window.customerAgent.invoke("log.list", { limit: 100 }), []);

  useEffect(() => {
    void window.customerAgent.invoke("settings.get", undefined).then((response) => {
      if (response.settings.businessHours) {
        setBusinessStart(response.settings.businessHours.start);
        setBusinessEnd(response.settings.businessHours.end);
      }
    });
  }, []);

  useEffect(() => {
    void window.customerAgent.invoke("app.update.status", undefined).then(setUpdateStatus);
    return window.customerAgent.on("app.update.status", setUpdateStatus);
  }, []);

  const save = async () => {
    await window.customerAgent.invoke("settings.save", {
      businessHours: { start: businessStart, end: businessEnd },
    });
    setMessage("设置已保存");
  };

  const checkForUpdates = async () => {
    setMessage(null);
    const status = await window.customerAgent.invoke("app.update.check", undefined);
    setUpdateStatus(status);
    if (status.state === "disabled") {
      setMessage("自动更新仅在安装包中启用");
    }
  };

  const installUpdate = async () => {
    const result = await window.customerAgent.invoke("app.update.install", undefined);
    if (!result.ok) {
      setMessage(result.error ?? "还没有下载完成的新版本");
    }
  };

  const exportLogs = () => {
    const lines = (logs.data?.logs ?? []).map(
      (log) => `${new Date(log.createdAt).toISOString()} [${log.level.toUpperCase()}] ${log.message}`,
    );
    const blob = new Blob([lines.join("\n")], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `customer-agent-logs-${new Date().toISOString().slice(0, 10)}.log`;
    anchor.click();
    URL.revokeObjectURL(url);
    setMessage("日志已导出到本地文件");
  };

  const recentLogs = (logs.data?.logs ?? []).slice(0, 8);

  return (
    <Box sx={{ maxWidth: 720 }}>
      {/* 营业时间 */}
      <Box sx={sectionHeader}>
        <Typography sx={sectionTitle}>营业时间</Typography>
      </Box>
      <Stack direction="row" spacing={3} sx={{ mb: "26px" }}>
        {([
          ["开始时间", businessStart, setBusinessStart],
          ["结束时间", businessEnd, setBusinessEnd],
        ] as const).map(([label, value, setValue]) => (
          <Box key={label}>
            <Typography sx={{ fontSize: 11, fontWeight: 600, color: tokens.color.text.secondary, mb: "6px" }}>
              {label}
            </Typography>
            <InputBase
              type="time"
              value={value}
              onChange={(event) => setValue(event.target.value)}
              sx={{
                width: 130,
                height: 38,
                px: "12px",
                border: "1px solid #e0e0e0",
                borderRadius: "9px",
                fontFamily: tokens.font.display,
                fontSize: 14,
                fontWeight: 500,
                "& input": { p: 0 },
              }}
            />
          </Box>
        ))}
      </Stack>

      {/* 运行日志 */}
      <Box sx={{ ...sectionHeader, display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
        <Typography sx={sectionTitle}>运行日志</Typography>
        <Button
          variant="outlined"
          onClick={exportLogs}
          sx={{ height: 28, minHeight: 28, px: "12px", fontSize: 11, fontWeight: 600, borderRadius: "8px" }}
        >
          导出
        </Button>
      </Box>
      <Box sx={{ border: `1px solid ${tokens.color.border.hairline}`, borderRadius: "12px", overflow: "hidden", mb: "26px" }}>
        {recentLogs.length === 0 && (
          <Typography sx={{ p: "12px 14px", fontSize: 12, fontWeight: 500, color: tokens.color.text.tertiary }}>
            {logs.loading ? "正在读取日志…" : "暂无运行日志"}
          </Typography>
        )}
        {recentLogs.map((log, index) => (
          <Box
            key={log.id}
            sx={{
              display: "flex",
              alignItems: "center",
              gap: "14px",
              p: "10px 14px",
              borderBottom: index === recentLogs.length - 1 ? "none" : "1px solid #f4f4f4",
            }}
          >
            <Typography sx={{ fontFamily: tokens.font.display, fontSize: 11, fontWeight: 500, color: "#c2c2c2", width: 110, flex: "none" }}>
              {formatLogTime(log.createdAt)}
            </Typography>
            <Typography
              sx={{
                fontSize: 9,
                fontWeight: 700,
                letterSpacing: ".1em",
                width: 44,
                flex: "none",
                color:
                  log.level === "error"
                    ? tokens.color.state.error
                    : log.level === "warning"
                      ? tokens.color.state.warning
                      : tokens.color.state.success,
              }}
            >
              {log.level === "warning" ? "WARN" : log.level.toUpperCase()}
            </Typography>
            <Typography noWrap sx={{ fontSize: 12, fontWeight: 500, color: "#525252" }}>
              {sanitizeDiagnosticText(log.message)}
            </Typography>
          </Box>
        ))}
      </Box>

      {/* 本地数据 */}
      <Box sx={sectionHeader}>
        <Typography sx={sectionTitle}>本地数据</Typography>
      </Box>
      <Box
        sx={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          border: `1px solid ${tokens.color.border.hairline}`,
          borderRadius: "12px",
          p: "14px 16px",
          mb: "26px",
        }}
      >
        <Typography sx={{ fontSize: 12, fontWeight: 500, color: tokens.color.text.secondary }}>数据目录</Typography>
        <Typography sx={{ fontFamily: tokens.font.display, fontSize: 12, fontWeight: 500 }}>{DATA_DIR}</Typography>
      </Box>

      {/* 系统版本 */}
      <Box sx={sectionHeader}>
        <Typography sx={sectionTitle}>系统版本</Typography>
      </Box>
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          gap: "14px",
          border: `1px solid ${tokens.color.border.hairline}`,
          borderRadius: "12px",
          p: "16px 18px",
          mb: "26px",
        }}
      >
        <Box sx={{ width: 38, height: 38, flex: "none", borderRadius: "10px", bgcolor: "#f4f4f4", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <span className="material-symbols-rounded" aria-hidden="true" style={{ fontSize: 21, color: "#525252" }}>verified</span>
        </Box>
        <Box sx={{ flex: 1 }}>
          <Typography sx={{ fontSize: 13, fontWeight: 700 }}>
            当前版本{" "}
            <Box component="span" sx={{ fontFamily: tokens.font.display, fontWeight: 600 }}>
              v{(import.meta as { env?: Record<string, string> }).env?.VITE_APP_VERSION ?? "0.0.0"}
            </Box>
          </Typography>
          <Typography sx={{ fontSize: 11, fontWeight: 500, color: tokens.color.text.tertiary, mt: "2px" }}>
            {formatUpdateStatus(updateStatus)}
          </Typography>
        </Box>
        <Stack direction="row" spacing={1} sx={{ flex: "none" }}>
          <Button
            variant="outlined"
            onClick={checkForUpdates}
            disabled={updateStatus.state === "checking" || updateStatus.state === "downloading"}
            startIcon={<span className="material-symbols-rounded" aria-hidden="true" style={{ fontSize: 18 }}>sync</span>}
            sx={{ height: 34, minHeight: 34, px: "12px", fontSize: 11, fontWeight: 600, borderRadius: "8px" }}
          >
            检查更新
          </Button>
          {updateStatus.state === "downloaded" && (
            <Button
              variant="contained"
              onClick={installUpdate}
              startIcon={<span className="material-symbols-rounded" aria-hidden="true" style={{ fontSize: 18 }}>restart_alt</span>}
              sx={{ height: 34, minHeight: 34, px: "12px", fontSize: 11, fontWeight: 600, borderRadius: "8px" }}
            >
              重启安装
            </Button>
          )}
        </Stack>
      </Box>

      <Stack direction="row" spacing={1.5} sx={{ alignItems: "center" }}>
        <Button
          variant="contained"
          onClick={save}
          startIcon={<span className="material-symbols-rounded" aria-hidden="true" style={{ fontSize: 18 }}>save</span>}
        >
          保存设置
        </Button>
        {message && (
          <Typography variant="body2" sx={{ color: tokens.color.state.success }}>
            {message}
          </Typography>
        )}
      </Stack>
    </Box>
  );
};

function formatLogTime(value: string): string {
  const date = new Date(value);
  const time = date.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  return `${time}.${String(date.getMilliseconds()).padStart(3, "0")}`;
}

function sanitizeDiagnosticText(value: string): string {
  return value.replace(/^诊断\[[^\]]+\]\s*/u, "").replace(/\b(error|message)=/g, "").replace(/\s+/g, " ").trim();
}

function formatUpdateStatus(status: AppUpdateStatus): string {
  switch (status.state) {
    case "disabled":
      return "自动更新仅在安装包中启用";
    case "checking":
      return "正在检查新版本";
    case "available":
      return `发现新版本 v${status.latestVersion ?? ""}，正在下载`;
    case "downloading":
      return `正在下载更新${typeof status.percent === "number" ? ` · ${Math.round(status.percent)}%` : ""}`;
    case "downloaded":
      return `新版本 v${status.latestVersion ?? ""} 已下载，重启后安装`;
    case "not-available":
      return "当前已是最新版本";
    case "error":
      return "自动更新检查失败";
    case "idle":
    default:
      return "自动更新已接入 GitHub Releases";
  }
}
