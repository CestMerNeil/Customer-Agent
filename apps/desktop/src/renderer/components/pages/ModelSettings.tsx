import React, { useEffect, useRef, useState } from "react";
import { Alert, Box, Button, Collapse, InputBase, LinearProgress, Stack, Typography } from "@mui/material";
import type { LocalModelProfile, ModelProvider } from "@customer-agent/core";
import { tokens } from "../../theme";

/** Design banner: colored icon circle + title + description + trailing chip. */
const StatusBanner: React.FC<{
  tone: "success" | "warning" | "neutral";
  title: string;
  description: React.ReactNode;
  badge: string;
  icon: string;
}> = ({ tone, title, description, badge, icon }) => {
  const palette = tone === "success"
    ? { border: tokens.color.state.success, bg: tokens.color.state.successSoft, iconBg: tokens.color.state.success, sub: tokens.color.state.success, chipCol: tokens.color.state.success, chipBg: tokens.color.state.successSoft }
    : tone === "neutral"
      ? { border: tokens.color.border.hairline, bg: tokens.color.control.fill, iconBg: tokens.color.text.secondary, sub: tokens.color.text.secondary, chipCol: tokens.color.text.secondary, chipBg: tokens.color.control.fill }
      : { border: tokens.color.state.warning, bg: tokens.color.state.warningSoft, iconBg: tokens.color.state.warning, sub: tokens.color.state.warning, chipCol: tokens.color.state.warning, chipBg: tokens.color.state.warningSoft };
  return (
    <Box
      sx={{
        border: `1px solid ${palette.border}`,
        bgcolor: palette.bg,
        borderRadius: "14px",
        p: "15px 18px",
        mb: "12px",
        display: "flex",
        alignItems: "center",
        gap: "14px",
      }}
    >
      <Box sx={{ width: 38, height: 38, flex: "none", borderRadius: "50%", bgcolor: palette.iconBg, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <span className="material-symbols-rounded" aria-hidden="true" style={{ fontSize: 23, color: tokens.color.surface.onInverse }}>{icon}</span>
      </Box>
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography sx={{ fontWeight: 700, fontSize: 15 }}>{title}</Typography>
        <Typography sx={{ fontSize: 12, fontWeight: 500, color: palette.sub, mt: "3px" }}>{description}</Typography>
      </Box>
      <Typography
        component="span"
        sx={{ fontSize: 11, fontWeight: 600, color: palette.chipCol, bgcolor: palette.chipBg, p: "6px 13px", borderRadius: "999px", flex: "none" }}
      >
        {badge}
      </Typography>
    </Box>
  );
};

/** Small check chip row item, design: green soft pill with leading icon. */
const CheckChip: React.FC<{ ok: boolean; label: string }> = ({ ok, label }) => (
  <Typography
    component="span"
    sx={{
      fontSize: 11,
      fontWeight: 600,
      color: ok ? tokens.color.state.success : tokens.color.text.secondary,
      bgcolor: ok ? tokens.color.state.successSoft : tokens.color.control.fill,
      p: "5px 11px",
      borderRadius: "999px",
      display: "flex",
      alignItems: "center",
      gap: "5px",
    }}
  >
    <span className="material-symbols-rounded" aria-hidden="true" style={{ fontSize: 15 }}>{ok ? "check" : "remove"}</span>
    {label}
  </Typography>
);

const actionButton = { height: 34, minHeight: 34, px: "15px", fontSize: 12, fontWeight: 600, borderRadius: "9px", flex: "none" } as const;

/** Renders local ModelScope provisioning and remote-provider settings. */
export const ModelSettings: React.FC = () => {
  const [modelProvider, setModelProvider] = useState<ModelProvider>("local");
  // 持久化的 provider 是异步读取的；就绪前不渲染，避免默认值"本地 AI"闪现后跳到"云端 AI"
  const [providerLoaded, setProviderLoaded] = useState(false);
  const [baseUrl, setBaseUrl] = useState("http://localhost:8000/v1");
  const [apiKey, setApiKey] = useState("");
  const [hasSavedApiKey, setHasSavedApiKey] = useState(false);
  const [showApiKey, setShowApiKey] = useState(false);
  const [chatModel, setChatModel] = useState("ggml-org/gemma-3n-E2B-it-GGUF:Q8_0");
  const [health, setHealth] = useState<{ ok: boolean; error?: string } | null>(null);
  const [checking, setChecking] = useState(false);
  const [saved, setSaved] = useState(false);
  const [queuePaused, setQueuePaused] = useState(false);
  const [runtimeStatus, setRuntimeStatus] = useState<{
    running: boolean;
    pid?: number;
    baseUrl?: string;
    runtimeKind?: "managed_llama_server";
    runtimeName?: string;
    host?: string;
    port?: number;
    modelId?: string;
    modelReady?: boolean;
    runtimeReady?: boolean;
    runtimeError?: string;
  } | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [advOpen, setAdvOpen] = useState(false);
  const [profiles, setProfiles] = useState<LocalModelProfile[]>([]);
  const [selectedProfileId, setSelectedProfileId] = useState("");
  const [downloadRequestId, setDownloadRequestId] = useState<string | null>(null);
  const downloadProgressByModel = useRef<Record<string, { receivedBytes: number; totalBytes?: number }>>({});
  const downloadTotalBytes = useRef<number | undefined>(undefined);
  const [downloadProgress, setDownloadProgress] = useState<{
    receivedBytes: number;
    totalBytes?: number;
    percent?: number;
  } | null>(null);

  /** Broadcasts provider health so the application header stays in sync. */
  const broadcastHealth = (provider: ModelProvider, result: { ok: boolean; error?: string } | null) => {
    window.dispatchEvent(new CustomEvent("customer-agent:inference-health-changed", {
      detail: {
        modelProvider: provider,
        ok: result ? result.ok : null,
        ...(result?.error ? { error: result.error } : {}),
      },
    }));
  };

  useEffect(() => {
    void (async () => {
      // 页面渲染只等本地设置（毫秒级）；网络探活单独进行，期间卡片显示"正在检查连接"
      const [configResponse, settingsResponse] = await Promise.all([
        window.customerAgent.invoke("inference.config.get", undefined),
        window.customerAgent.invoke("settings.get", undefined),
      ]);
      if (configResponse.config) {
        setBaseUrl(configResponse.config.baseUrl);
        setHasSavedApiKey(configResponse.config.hasApiKey);
        setChatModel(configResponse.config.chatModel);
      }
      const nextProvider = settingsResponse.settings.modelProvider
        ?? (configResponse.config && !isLocalInferenceEndpoint(configResponse.config.baseUrl) ? "remote" : "local");
      setModelProvider(nextProvider);
      setProviderLoaded(true);
      setQueuePaused(Boolean(settingsResponse.settings.queue?.paused));
      const persistedRuntime = settingsResponse.settings.inferenceRuntime;
      void window.customerAgent
        .invoke("inference.health", undefined)
        .catch((error) => ({
          ok: false,
          error: error instanceof Error ? error.message : "AI 状态读取失败。",
        }))
        .then((healthResponse) => {
          setHealth(healthResponse);
          broadcastHealth(nextProvider, healthResponse);
        });
      if (nextProvider === "local") {
        await loadLocalModelState(persistedRuntime);
      }
    })();
  }, []);

  useEffect(() => {
    return window.customerAgent.on("inference.modelscope.download.progress", (event) => {
      if (downloadRequestId && event.requestId !== downloadRequestId) {
        return;
      }
      downloadProgressByModel.current[event.modelId] = {
        receivedBytes: event.receivedBytes,
        ...(event.totalBytes === undefined ? {} : { totalBytes: event.totalBytes }),
      };
      setDownloadProgress(aggregateDownloadProgress(downloadProgressByModel.current, downloadTotalBytes.current));
    });
  }, [downloadRequestId]);

  useEffect(() => {
    const id = window.setInterval(() => {
      if (document.visibilityState !== "visible") {
        return;
      }
      if (modelProvider === "local") {
        void refreshRuntimeStatus();
        return;
      }
      void window.customerAgent
        .invoke("inference.health", undefined)
        .then((result) => {
          setHealth(result);
          broadcastHealth(modelProvider, result);
        })
        .catch(() => {
          const failure = { ok: false, error: "AI 状态读取失败。" };
          setHealth(failure);
          broadcastHealth(modelProvider, failure);
        });
    }, 5_000);
    return () => window.clearInterval(id);
  }, [modelProvider]);

  /** Saves and enables the visible remote-provider configuration. */
  const save = async () => {
    await window.customerAgent.invoke("inference.config.save", {
      baseUrl,
      chatModel,
      temperature: 0.3,
      maxTokens: 1000,
      ...(apiKey ? { apiKey } : {}),
    });
    if (apiKey) {
      setHasSavedApiKey(true);
      setApiKey("");
    }
    await window.customerAgent.invoke("settings.save", { modelProvider });
    setSaved(true);
    setActionMessage("配置已保存。");
  };

  /** Runs a thorough health check for the selected provider. */
  const test = async () => {
    const label = modelProvider === "local" ? "本地推理" : "远端连接";
    setChecking(true);
    setActionMessage(`正在测试${label}...`);
    try {
      const result = await window.customerAgent.invoke("inference.health", { thorough: true });
      setHealth(result);
      broadcastHealth(modelProvider, result);
      setActionMessage(result.ok ? `${label}测试通过。` : result.error ?? `${label}测试失败。`);
    } finally {
      setChecking(false);
    }
  };

  /** Clears the persisted remote API key and its health state. */
  const clearApiKey = async () => {
    await window.customerAgent.invoke("inference.config.clearApiKey", undefined);
    setApiKey("");
    setHasSavedApiKey(false);
    setSaved(false);
    setActionMessage("API Key 已清除。");
    setHealth(null);
  };

  /** Pauses or resumes automatic reply queue processing. */
  const toggleAutoReply = async () => {
    if (queuePaused) {
      const result = await window.customerAgent.invoke("queue.resume", undefined);
      setQueuePaused(Boolean(result.settings?.queue?.paused ?? false));
      setActionMessage("已恢复自动回复。");
    } else {
      const result = await window.customerAgent.invoke("queue.pause", undefined);
      setQueuePaused(Boolean(result.settings?.queue?.paused ?? true));
      setActionMessage("已暂停自动回复。");
    }
  };

  /** Refreshes renderer-safe managed runtime status. */
  async function refreshRuntimeStatus() {
    const status = await window.customerAgent.invoke("inference.runtime.status", undefined);
    setRuntimeStatus(status);
  }

  /** Loads approved local profiles and restores the persisted selection. */
  async function loadLocalModelState(preferredRuntime?: { modelId?: string }) {
    const response = await window.customerAgent.invoke("inference.local.profiles", undefined);
    setProfiles(response.profiles);
    const defaultProfile = response.profiles.find((profile) => profile.defaultFor === "chat");
    if (defaultProfile) {
      const profile = response.profiles.find((item) => (
        item.model.url === preferredRuntime?.modelId || item.model.id === preferredRuntime?.modelId
      )) ?? defaultProfile;
      setSelectedProfileId((selected) => selected || profile.id);
    }
    await refreshRuntimeStatus();
  }

  /** Switches between local and remote provider settings. */
  const selectModelProvider = async (nextProvider: ModelProvider) => {
    if (nextProvider === modelProvider) {
      return;
    }
    setModelProvider(nextProvider);
    setHealth(null);
    broadcastHealth(nextProvider, null);
    setSaved(false);
    setActionMessage(nextProvider === "local" ? "已切换到本地模型，请选择并启用模型。" : "已切换到云端 AI，请保存配置。");
    if (nextProvider === "local") {
      await loadLocalModelState();
    }
  };

  /** Repairs or installs the app-managed llama runtime. */
  const prepareRuntime = async () => {
    setActionMessage("正在准备本地运行时，请稍候...");
    const response = await window.customerAgent.invoke("inference.runtime.prepare", undefined);
    if (response.ok) {
      setActionMessage("运行时已就绪。");
      await refreshRuntimeStatus();
    } else {
      setActionMessage(response.error ?? "运行时准备失败。");
    }
  };

  /** Downloads missing artifacts and starts the selected reviewed profile. */
  const startRuntime = async () => {
    setActionMessage("正在准备本地 AI，请稍候...");
    const selectedProfile = profiles.find((profile) => profile.id === selectedProfileId);
    if (!selectedProfile) {
      setActionMessage("请先选择本地模型档案。");
      return;
    }
    const requestId = crypto.randomUUID();
    const totalBytes = profileDownloadSize(selectedProfile).totalBytes;
    downloadProgressByModel.current = {};
    downloadTotalBytes.current = totalBytes;
    setDownloadRequestId(requestId);
    setDownloadProgress({ receivedBytes: 0, ...(totalBytes === undefined ? {} : { totalBytes }) });
    const response = await window.customerAgent.invoke("inference.runtime.start", {
      modelId: selectedProfile.model.url,
      requestId,
    });
    if (response.ok) {
      await window.customerAgent.invoke("settings.save", { modelProvider: "local" });
      setRuntimeStatus((current) => ({
        ...(current ?? {}),
        running: response.running,
        ...(response.baseUrl ? { baseUrl: response.baseUrl } : {}),
        ...(response.pid === undefined ? {} : { pid: response.pid }),
      }));
      setDownloadProgress(null);
      setDownloadRequestId(null);
      downloadProgressByModel.current = {};
      downloadTotalBytes.current = undefined;
      setActionMessage("本地 AI 已就绪。");
      await refreshRuntimeStatus();
    } else {
      setDownloadProgress(null);
      setDownloadRequestId(null);
      downloadProgressByModel.current = {};
      downloadTotalBytes.current = undefined;
      setActionMessage(response.error ?? "启动失败。");
      await refreshRuntimeStatus();
    }
  };

  /** Stops the running profile, when needed, and activates the selected profile. */
  const restartRuntime = async () => {
    setActionMessage("正在重新启动本地 AI，请稍候...");
    if (runtimeStatus?.running) {
      await window.customerAgent.invoke("inference.runtime.stop", undefined);
    }
    await startRuntime();
  };

  /** Deletes cached weights for the selected profile after confirmation. */
  const deleteWeights = async () => {
    const selectedProfile = profiles.find((profile) => profile.id === selectedProfileId);
    if (!selectedProfile) {
      setActionMessage("请先选择本地模型档案。");
      return;
    }
    if (!window.confirm(`删除 ${selectedProfile.label} 已下载的模型权重？`)) {
      return;
    }

    setActionMessage("正在删除模型权重...");
    const response = await window.customerAgent.invoke("inference.model.delete", {
      modelId: selectedProfile.model.url,
      auxiliaryModelIds: selectedProfile.auxiliaryModels?.map((model) => model.url) ?? [],
    });
    if (response.ok) {
      setActionMessage(response.deleted > 0 ? `已删除 ${response.deleted} 个缓存权重。` : "没有找到可删除的缓存权重。");
      await refreshRuntimeStatus();
    } else {
      setActionMessage(response.error ?? "删除模型权重失败。");
    }
  };

  /** Selects one reviewed profile and clears paths from the previous profile. */
  const selectProfile = (profileId: string) => {
    setSelectedProfileId(profileId);
    const profile = profiles.find((item) => item.id === profileId);
    if (!profile) {
      return;
    }
    setChatModel(profile.model.id);
    setActionMessage(null);
  };

  const localEndpoint = modelProvider === "local";
  const running = runtimeStatus?.running ?? false;
  const selectedProfileDetails = profiles.find((profile) => profile.id === selectedProfileId);
  const activeProfile = profiles.find((profile) => (
    profile.model.url === runtimeStatus?.modelId || profile.model.id === runtimeStatus?.modelId
  ));
  const selectedIsRunning = Boolean(running && selectedProfileDetails && activeProfile?.id === selectedProfileDetails.id);
  const selectedIsReady = Boolean(runtimeStatus?.modelReady && selectedProfileDetails && activeProfile?.id === selectedProfileDetails.id);
  const primaryActionLabel = downloadRequestId
    ? "正在准备…"
    : selectedIsRunning
      ? "重新启动当前模型"
      : selectedIsReady
        ? "启用此模型"
        : `下载并启用${selectedProfileDetails ? ` · ${formatBytes(profileDownloadSize(selectedProfileDetails).totalBytes ?? 0)}` : ""}`;

  const cloudConnected = Boolean(health?.ok) && !localEndpoint;

  const fieldLabelRow = { display: "flex", alignItems: "baseline", gap: 1, mb: "6px" } as const;
  const fieldInput = {
    height: 40,
    px: "13px",
    border: `1px solid ${tokens.color.border.strong}`,
    borderRadius: "9px",
    fontFamily: tokens.font.display,
    fontSize: 13,
    fontWeight: 500,
    width: "100%",
    "& input": { p: 0 },
  } as const;

  if (!providerLoaded) {
    return <Box sx={{ maxWidth: 780 }} />;
  }

  return (
    <Box sx={{ maxWidth: 780 }}>
      {/* mode toggle */}
      <Box sx={{ display: "inline-flex", bgcolor: tokens.color.control.fill, borderRadius: "10px", p: "4px", gap: "4px", mb: 1 }}>
        {([
          ["local", "computer", "本地 AI"],
          ["remote", "cloud", "云端 AI"],
        ] as const).map(([value, icon, label]) => {
          const selected = modelProvider === value;
          return (
            <Box
              key={value}
              component="button"
              type="button"
              aria-label={label}
              aria-pressed={selected}
              onClick={() => void selectModelProvider(value)}
              sx={{
                all: "unset",
                p: "8px 20px",
                borderRadius: "7px",
                bgcolor: selected ? tokens.color.surface.base : "transparent",
                color: selected ? tokens.color.text.primary : tokens.color.text.secondary,
                boxShadow: selected ? "0 1px 2px rgba(0,0,0,.08)" : "none",
                fontSize: 12,
                fontWeight: 600,
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: "7px",
              }}
            >
              <span className="material-symbols-rounded" aria-hidden="true" style={{ fontSize: 17 }}>{icon}</span>
              {label}
            </Box>
          );
        })}
      </Box>

      {localEndpoint ? (
        <Box>
          <Typography sx={{ fontSize: 12, fontWeight: 500, color: tokens.color.text.tertiary, mb: "18px" }}>
            模型由 ModelScope 提供并在本机运行，聊天内容不外传；对电脑配置有一定要求。
          </Typography>

          {/* Two-column split (design "Real Frontend"): 选择模型 | 运行状态. */}
          <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "1.35fr 1fr" }, gap: "20px", alignItems: "stretch" }}>
            {/* left: model select */}
            <Box sx={{ border: `1px solid ${tokens.color.border.hairline}`, borderRadius: "14px", p: "18px 20px", display: "flex", flexDirection: "column" }}>
              <Box sx={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", pb: "11px", borderBottom: `1px solid ${tokens.color.text.primary}`, mb: "12px" }}>
                <Typography sx={{ fontSize: 12, fontWeight: 700 }}>选择模型</Typography>
                <Typography sx={{ fontSize: 11, fontWeight: 500, color: tokens.color.text.tertiary }}>均支持图片 + 文本</Typography>
              </Box>
              {profiles.map((profile) => {
                const selected = profile.id === selectedProfileId;
                const highEnd = profile.parameters.totalBillions === 35;
                const rowRunning = Boolean(running && activeProfile?.id === profile.id);
                return (
                  <Box
                    key={profile.id}
                    component="button"
                    type="button"
                    aria-label={`选择 ${profile.label}`}
                    aria-pressed={selected}
                    onClick={() => selectProfile(profile.id)}
                    sx={{
                      all: "unset",
                      boxSizing: "border-box",
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      gap: "12px",
                      p: "14px 16px",
                      mb: "9px",
                      border: `1px solid ${selected ? tokens.color.state.success : tokens.color.border.hairline}`,
                      borderRadius: "12px",
                      bgcolor: selected ? tokens.color.surface.selected : tokens.color.surface.base,
                      transition: `border-color ${tokens.motion.duration.fast}, background-color ${tokens.motion.duration.fast}`,
                      "&:hover": { borderColor: selected ? tokens.color.state.success : tokens.color.border.strong },
                      "&:focus-visible": { outline: `2px solid ${tokens.color.border.focus}`, outlineOffset: "2px" },
                    }}
                  >
                    <Box
                      aria-hidden
                      sx={{
                        width: 15,
                        height: 15,
                        flex: "none",
                        boxSizing: "border-box",
                        borderRadius: "50%",
                        border: `${selected ? "5px" : "1.5px"} solid ${selected ? tokens.color.state.success : tokens.color.border.strong}`,
                      }}
                    />
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Box sx={{ display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap" }}>
                        <Typography component="span" sx={{ fontSize: 13, fontWeight: 700 }}>{profile.label}</Typography>
                        {profile.defaultFor === "chat" && (
                          <Typography component="span" sx={{ fontSize: 9, fontWeight: 700, color: tokens.color.state.success, bgcolor: tokens.color.state.successSoft, px: "7px", py: "2px", borderRadius: "999px" }}>
                            推荐
                          </Typography>
                        )}
                        {rowRunning && (
                          <Typography component="span" sx={{ fontSize: 9, fontWeight: 700, color: tokens.color.state.success, bgcolor: tokens.color.state.successSoft, px: "7px", py: "2px", borderRadius: "999px" }}>
                            运行中
                          </Typography>
                        )}
                      </Box>
                      <Typography sx={{ fontSize: 11, fontWeight: 500, color: tokens.color.text.secondary, mt: "2px", lineHeight: 1.5 }}>
                        {profile.defaultFor === "chat"
                          ? "质量与资源占用均衡，适合多数客服场景"
                          : highEnd
                            ? "理解能力更强，需要高配电脑，占用大内存"
                            : "占用更低，适合内存较小的电脑"}
                      </Typography>
                      {highEnd && (
                        <Typography sx={{ fontSize: 10, fontWeight: 600, color: tokens.color.state.warning, mt: "3px", lineHeight: 1.45 }}>
                          35B 权重；A3B 不等于只占 3B 内存。
                        </Typography>
                      )}
                    </Box>
                    <Typography component="span" sx={{ flex: "none", fontSize: 10, fontWeight: 600, color: tokens.color.text.secondary, bgcolor: tokens.color.control.fill, px: "8px", py: "4px", borderRadius: "999px" }}>
                      {formatBytes(profileDownloadSize(profile).totalBytes ?? 0)}
                    </Typography>
                  </Box>
                );
              })}
              <Box sx={{ mt: "auto" }}>
                <Button
                  fullWidth
                  variant="contained"
                  disabled={!selectedProfileDetails || Boolean(downloadRequestId)}
                  onClick={() => void restartRuntime()}
                  startIcon={
                    <span
                      className={downloadRequestId ? "material-symbols-rounded ca-spin" : "material-symbols-rounded"}
                      aria-hidden="true"
                      style={{ fontSize: 18 }}
                    >
                      {downloadRequestId ? "progress_activity" : selectedIsRunning ? "restart_alt" : "download"}
                    </span>
                  }
                  sx={{ height: 38, borderRadius: "10px", fontSize: 13, "&.Mui-disabled": { color: tokens.color.text.onAccent, bgcolor: tokens.color.accent.main, opacity: 0.7 } }}
                >
                  {primaryActionLabel}
                </Button>
                {downloadProgress ? (
                  <Box sx={{ mt: "8px" }}>
                    <LinearProgress
                      variant={downloadProgress.percent === undefined ? "indeterminate" : "determinate"}
                      value={downloadProgress.percent ?? 0}
                      sx={{ height: 4, borderRadius: "2px" }}
                    />
                    <Stack direction="row" sx={{ justifyContent: "center", gap: "6px", mt: "6px" }}>
                      <Typography component="span" sx={{ fontSize: 10, fontWeight: 500, color: tokens.color.text.tertiary }}>
                        {downloadProgress.totalBytes
                          ? `${formatBytes(downloadProgress.receivedBytes)} / ${formatBytes(downloadProgress.totalBytes)}`
                          : `${formatBytes(downloadProgress.receivedBytes)} 已下载`}
                      </Typography>
                      <Typography component="span" sx={{ fontSize: 10, fontWeight: 500, color: tokens.color.text.tertiary }}>
                        {downloadProgress.percent === undefined ? "下载中" : `${downloadProgress.percent}%`}
                      </Typography>
                    </Stack>
                  </Box>
                ) : (
                  <Typography sx={{ fontSize: 10, fontWeight: 500, color: tokens.color.text.tertiary, mt: "8px", textAlign: "center" }}>
                    切换模型时自动下载缺失文件并重启
                  </Typography>
                )}
              </Box>
            </Box>

            {/* right: run status */}
            <Box sx={{ border: `1px solid ${tokens.color.border.hairline}`, borderRadius: "14px", p: "18px 20px", display: "flex", flexDirection: "column" }}>
              <Box sx={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", pb: "11px", borderBottom: `1px solid ${tokens.color.text.primary}`, mb: "14px" }}>
                <Typography sx={{ fontSize: 12, fontWeight: 700 }}>运行状态</Typography>
                <Typography component="span" sx={{ display: "flex", alignItems: "center", gap: "5px", fontSize: 10, fontWeight: 600, color: selectedIsRunning ? tokens.color.state.success : tokens.color.state.warning }}>
                  <Box aria-hidden sx={{ width: 7, height: 7, borderRadius: "50%", bgcolor: selectedIsRunning ? tokens.color.state.success : tokens.color.state.warning }} />
                  {selectedIsRunning ? "运行中" : running ? "待切换" : "未启用"}
                </Typography>
              </Box>
              <Typography sx={{ fontSize: 15, fontWeight: 700, mb: "2px" }}>{selectedProfileDetails?.label ?? "正在读取模型…"}</Typography>
              <Typography sx={{ fontSize: 11, fontWeight: 500, color: tokens.color.text.tertiary, mb: "14px" }}>
                {selectedIsRunning
                  ? runtimeStatus?.runtimeName ?? "应用托管 llama-server 正在运行"
                  : selectedIsReady
                    ? "模型文件已就绪，点击左侧按钮启用"
                    : "首次启用会从 ModelScope 下载并校验模型文件"}
              </Typography>
              <Stack spacing="9px" sx={{ mb: "18px" }}>
                <CheckChip ok={Boolean(runtimeStatus?.runtimeReady)} label={runtimeStatus?.runtimeReady ? "程序已安装" : "程序未安装"} />
                <CheckChip ok={selectedIsReady} label={selectedIsReady ? "所选图文模型已就绪" : "所选图文模型未就绪"} />
                <CheckChip ok={Boolean(health?.ok)} label={health?.ok ? "回复功能正常" : "回复未测试"} />
              </Stack>
              <Box sx={{ pb: "10px", borderBottom: `1px solid ${tokens.color.text.primary}`, mb: "2px" }}>
                <Typography sx={{ fontSize: 12, fontWeight: 700 }}>常用操作</Typography>
              </Box>
              <Stack direction="row" sx={{ alignItems: "center", gap: "10px", p: "10px 2px", borderBottom: `1px solid ${tokens.color.border.hairline}` }}>
                <Typography sx={{ flex: 1, fontSize: 12, fontWeight: 600 }}>检查 AI 是否正常</Typography>
                <Button
                  variant="contained"
                  onClick={test}
                  disabled={checking}
                  startIcon={checking ? (
                    <span className="material-symbols-rounded ca-spin" aria-hidden="true" style={{ fontSize: 14 }}>progress_activity</span>
                  ) : undefined}
                  sx={{ ...actionButton, height: 28, minHeight: 28, px: "13px", fontSize: 11, borderRadius: "7px", "&.Mui-disabled": { color: tokens.color.text.onAccent, bgcolor: tokens.color.accent.main, opacity: 0.7 } }}
                >
                  {checking ? "检查中" : "检查"}
                </Button>
              </Stack>
              <Stack direction="row" sx={{ alignItems: "center", gap: "10px", p: "10px 2px" }}>
                <Typography sx={{ flex: 1, fontSize: 12, fontWeight: 600 }}>{queuePaused ? "恢复自动回复" : "暂停自动回复"}</Typography>
                <Button variant="outlined" onClick={() => void toggleAutoReply()} sx={{ ...actionButton, height: 28, minHeight: 28, px: "13px", fontSize: 11, borderRadius: "7px" }}>{queuePaused ? "恢复" : "暂停"}</Button>
              </Stack>
            </Box>
          </Box>

          {actionMessage && (
            <Alert sx={{ mt: "14px" }} severity={actionMessage.includes("失败") ? "error" : "info"}>
              {actionMessage}
            </Alert>
          )}

          {/* advanced settings: full width below both panels (design). */}
          <Box sx={{ border: `1px solid ${tokens.color.border.hairline}`, borderRadius: "14px", mt: "14px", overflow: "hidden" }}>
            <Button
              variant="text"
              aria-label="高级设置"
              aria-expanded={advOpen}
              aria-controls="local-model-advanced-settings"
              onClick={() => setAdvOpen((open) => !open)}
              fullWidth
              sx={{ justifyContent: "flex-start", gap: 1, p: "13px 16px", borderRadius: 0, color: tokens.color.text.primary }}
            >
              <Typography sx={{ fontWeight: 700, fontSize: 12 }}>高级设置</Typography>
              <Typography sx={{ fontSize: 11, fontWeight: 500, color: tokens.color.text.tertiary }}>通常无需改动</Typography>
              <span
                className="material-symbols-rounded" aria-hidden="true"
                style={{ fontSize: 20, color: tokens.color.text.tertiary, marginLeft: "auto", transform: advOpen ? "rotate(180deg)" : "none", transition: "transform 150ms" }}
              >
                expand_more
              </span>
            </Button>
            <Collapse id="local-model-advanced-settings" in={advOpen}>
              <Box sx={{ px: "16px" }}>
                <Stack direction="row" sx={{ alignItems: "center", gap: "14px", p: "11px 0", borderTop: `1px solid ${tokens.color.border.hairline}` }}>
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography sx={{ fontWeight: 600, fontSize: 13 }}>所选模型来源</Typography>
                    <Typography sx={{ fontSize: 11, fontWeight: 500, color: tokens.color.text.tertiary, mt: "1px" }}>
                      {selectedProfileDetails
                        ? `ModelScope · ${selectedProfileDetails.model.baseModelId} · Apache-2.0`
                        : "—"}
                    </Typography>
                  </Box>
                </Stack>
                <Stack direction="row" sx={{ alignItems: "center", gap: "14px", p: "11px 0", borderTop: `1px solid ${tokens.color.border.hairline}` }}>
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography sx={{ fontWeight: 600, fontSize: 13 }}>修复 AI</Typography>
                    <Typography sx={{ fontSize: 11, fontWeight: 500, color: tokens.color.text.tertiary, mt: "1px" }}>重新安装本地运行时，仅在自检出现异常时使用</Typography>
                  </Box>
                  <Button variant="outlined" onClick={() => void prepareRuntime()} sx={actionButton}>修复</Button>
                </Stack>
                <Stack direction="row" sx={{ alignItems: "center", gap: "14px", p: "11px 0 16px", borderTop: `1px solid ${tokens.color.border.hairline}` }}>
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography sx={{ fontWeight: 600, fontSize: 13, color: tokens.color.state.error }}>清理 AI 数据</Typography>
                    <Typography sx={{ fontSize: 11, fontWeight: 500, color: tokens.color.text.tertiary, mt: "1px" }}>释放磁盘空间，清理后需重新下载才能使用</Typography>
                  </Box>
                  <Button
                    variant="outlined"
                    onClick={() => void deleteWeights()}
                    sx={{
                      ...actionButton,
                      borderColor: tokens.color.state.error,
                      bgcolor: tokens.color.state.errorSoft,
                      color: tokens.color.state.error,
                      "&:hover": { borderColor: tokens.color.state.error, bgcolor: tokens.color.state.errorSoft },
                    }}
                  >
                    清理
                  </Button>
                </Stack>
              </Box>
            </Collapse>
          </Box>
        </Box>
      ) : (
        <Box>
          <Typography sx={{ fontSize: 12, fontWeight: 500, color: tokens.color.text.tertiary, mb: "22px" }}>
            借助在线 AI 服务，回复更快更聪明；需要联网、填写服务商密钥，聊天内容会发送给该服务商。
          </Typography>

          <StatusBanner
            tone={cloudConnected ? "success" : health === null ? "neutral" : "warning"}
            icon={cloudConnected ? "check" : health === null ? "sync" : "cloud_off"}
            title={cloudConnected ? "已连接" : health === null ? "正在检查连接…" : "尚未连接"}
            description={
              cloudConnected
                ? "云端 AI 已启用，正在生成客服回复。"
                : health === null
                  ? "正在确认云端 AI 服务是否可用，请稍候。"
                  : "填写下方密钥并测试连接后，即可启用云端 AI 回复。"
            }
            badge={cloudConnected ? "已连接" : health === null ? "检查中" : "待配置"}
          />

          <Box sx={{ pb: 1.5, borderBottom: `1px solid ${tokens.color.text.primary}`, mb: 2, mt: "14px" }}>
            <Typography sx={{ fontSize: 12, fontWeight: 700 }}>连接信息</Typography>
          </Box>

          <Stack spacing={2} sx={{ mb: 3 }}>
            <Box>
              <Box sx={fieldLabelRow}>
                <Typography sx={{ fontSize: 12, fontWeight: 600 }}>服务商密钥</Typography>
                <Typography sx={{ fontSize: 10, fontWeight: 500, color: tokens.color.text.tertiary }}>
                  服务商提供给你的一串账号密钥
                </Typography>
              </Box>
              <InputBase
                type={showApiKey ? "text" : "password"}
                value={apiKey}
                placeholder={hasSavedApiKey ? "已保存；留空将保持不变" : "请输入服务商密钥"}
                onChange={(event) => setApiKey(event.target.value)}
                sx={fieldInput}
                endAdornment={
                  <Box
                    component="button"
                    type="button"
                    aria-label={showApiKey ? "隐藏密钥" : "显示密钥"}
                    onClick={() => setShowApiKey((current) => !current)}
                    sx={{ all: "unset", cursor: "pointer", display: "flex" }}
                  >
                    <span className="material-symbols-rounded" aria-hidden="true" style={{ fontSize: 18, color: tokens.color.text.tertiary }}>
                      {showApiKey ? "visibility" : "visibility_off"}
                    </span>
                  </Box>
                }
              />
            </Box>
            <Box>
              <Box sx={fieldLabelRow}>
                <Typography sx={{ fontSize: 12, fontWeight: 600 }}>服务地址</Typography>
                <Typography sx={{ fontSize: 10, fontWeight: 500, color: tokens.color.text.tertiary }}>默认无需修改</Typography>
              </Box>
              <InputBase value={baseUrl} onChange={(event) => setBaseUrl(event.target.value)} sx={{ ...fieldInput, color: tokens.color.text.secondary }} />
            </Box>
            <Box>
              <Box sx={fieldLabelRow}>
                <Typography sx={{ fontSize: 12, fontWeight: 600 }}>使用的模型</Typography>
                <Typography sx={{ fontSize: 10, fontWeight: 500, color: tokens.color.text.tertiary }}>回复所用的 AI 型号</Typography>
              </Box>
              <InputBase
                value={chatModel}
                onChange={(event) => setChatModel(event.target.value)}
                sx={{ ...fieldInput, fontFamily: tokens.font.family }}
              />
            </Box>
          </Stack>

          <Stack direction="row" spacing={1.5} sx={{ alignItems: "center", flexWrap: "wrap", gap: 1.5 }}>
            <Button
              variant="contained"
              onClick={test}
              startIcon={<span className="material-symbols-rounded" aria-hidden="true" style={{ fontSize: 18 }}>wifi_tethering</span>}
            >
              测试连接
            </Button>
            <Button variant="outlined" onClick={save}>
              保存并启用
            </Button>
            <Typography sx={{ fontSize: 11, fontWeight: 500, color: tokens.color.text.tertiary }}>
              测试连接会验证密钥是否可用
            </Typography>
            <Button variant="text" color="error" onClick={clearApiKey} sx={{ fontSize: 11 }}>
              清除 Key
            </Button>
          </Stack>
          {saved && <Typography variant="body2" color="success.main" sx={{ mt: 1.5 }}>已保存</Typography>}
          {health?.error && <Typography variant="body2" color="error.main" sx={{ mt: 1.5 }}>{health.error}</Typography>}
          {actionMessage && !localEndpoint && (
            <Alert sx={{ mt: 2 }} severity={actionMessage.includes("失败") ? "error" : "info"}>
              {actionMessage}
            </Alert>
          )}
        </Box>
      )}
    </Box>
  );
};

/**
 * Checks whether an inference endpoint resolves to the local machine.
 *
 * @param baseUrl Endpoint URL.
 * @returns Whether the endpoint is local or malformed.
 */
function isLocalInferenceEndpoint(baseUrl: string): boolean {
  try {
    const url = new URL(baseUrl);
    return ["127.0.0.1", "localhost", "::1"].includes(url.hostname);
  } catch {
    return true;
  }
}

/**
 * Formats model artifact sizes for the settings UI.
 *
 * @param value Byte count.
 * @returns Human-readable KB, MB, or GB text.
 */
function formatBytes(value: number): string {
  if (value >= 1024 * 1024 * 1024) {
    return `${(value / 1024 / 1024 / 1024).toFixed(1)} GB`;
  }
  if (value < 1024 * 1024) {
    return `${(value / 1024).toFixed(1)} KB`;
  }
  return `${(value / 1024 / 1024).toFixed(1)} MB`;
}

/**
 * Totals the main GGUF and required auxiliary artifact sizes.
 *
 * @param profile Profile to total.
 * @returns Known aggregate size when manifest metadata is complete.
 */
function profileDownloadSize(profile: LocalModelProfile | undefined): { totalBytes?: number } {
  const totalBytes =
    (profile?.model.sizeBytes ?? 0)
    + (profile?.auxiliaryModels ?? []).reduce((sum, model) => sum + (model.sizeBytes ?? 0), 0);
  return totalBytes > 0 ? { totalBytes } : {};
}

/**
 * Aggregates progress for a main GGUF and its auxiliary downloads.
 *
 * @param byModel Latest progress keyed by model URL.
 * @param expectedTotalBytes Manifest total when known.
 * @returns Combined byte and percentage progress.
 */
function aggregateDownloadProgress(
  byModel: Record<string, { receivedBytes: number; totalBytes?: number }>,
  expectedTotalBytes?: number,
): { receivedBytes: number; totalBytes?: number; percent?: number } {
  const receivedBytes = Object.values(byModel).reduce((sum, progress) => sum + progress.receivedBytes, 0);
  const observedTotalBytes = Object.values(byModel).reduce((sum, progress) => sum + (progress.totalBytes ?? 0), 0);
  const totalBytes = expectedTotalBytes ?? (observedTotalBytes > 0 ? observedTotalBytes : undefined);
  return {
    receivedBytes,
    ...(totalBytes === undefined ? {} : { totalBytes }),
    ...(totalBytes ? { percent: Math.min(100, Math.round((receivedBytes / totalBytes) * 100)) } : {}),
  };
}
