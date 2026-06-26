import { useEffect, useMemo, useState } from "react";
import { Box, Typography } from "@mui/material";
import { RootLayout } from "./components/layout/RootLayout";
import { NavItem } from "./components/layout/NavigationRail";
import type { ModelProviderMode } from "@customer-agent/core";

// Page Components
import { AutoReplyDashboard } from "./components/pages/AutoReplyDashboard";
import { AccountManager } from "./components/pages/AccountManager";
import { KnowledgeBaseManager } from "./components/pages/KnowledgeBaseManager";
import { ModelSettings } from "./components/pages/ModelSettings";
import { LogViewer } from "./components/pages/LogViewer";
import { SettingsPage } from "./components/pages/SettingsPage";
import { AgentAuditViewer } from "./components/pages/AgentAuditViewer";
import { QueueOperationsPage } from "./components/pages/QueueOperationsPage";
import { ReleaseStatusPage } from "./components/pages/ReleaseStatusPage";
import { HumanHandoffPage } from "./components/pages/HumanHandoffPage";

type ViewState = {
  id: string;
  label: string;
  icon: string;
  section: string;
  caption: string;
  render: (navigate: (id: string) => void) => React.ReactNode;
};

const views: readonly ViewState[] = [
  {
    id: "overview",
    label: "概览",
    icon: "insights",
    section: "工作",
    caption: "运行状态与今日队列一览",
    render: (navigate) => <AutoReplyDashboard onNavigate={navigate} />,
  },
  {
    id: "queue",
    label: "队列",
    icon: "queue",
    section: "工作",
    caption: "消息工作流、队列状态与依赖健康",
    render: () => <QueueOperationsPage />,
  },
  {
    id: "agent-audit",
    label: "Agent 审计",
    icon: "account_tree",
    section: "工作",
    caption: "工具调用、结果、引用与回复依据",
    render: () => <AgentAuditViewer />,
  },
  {
    id: "handoff",
    label: "人工",
    icon: "support_agent",
    section: "工作",
    caption: "转人工、人工处理状态与恢复 AI",
    render: () => <HumanHandoffPage />,
  },
  {
    id: "accounts",
    label: "账号",
    icon: "group",
    section: "配置",
    caption: "拼多多客服账号登录与会话",
    render: () => <AccountManager />,
  },
  {
    id: "knowledge",
    label: "知识库",
    icon: "library_books",
    section: "配置",
    caption: "全局与店铺知识的导入与检索",
    render: () => <KnowledgeBaseManager />,
  },
  {
    id: "models",
    label: "模型",
    icon: "settings_suggest",
    section: "配置",
    caption: "推理 endpoint 与本地运行时",
    render: () => <ModelSettings />,
  },
  {
    id: "logs",
    label: "日志",
    icon: "history",
    section: "系统",
    caption: "本地运行与诊断记录",
    render: () => <LogViewer />,
  },
  {
    id: "release",
    label: "发布",
    icon: "verified",
    section: "系统",
    caption: "验收证据与 GitHub Release 门禁",
    render: () => <ReleaseStatusPage />,
  },
  {
    id: "settings",
    label: "设置",
    icon: "settings",
    section: "系统",
    caption: "回复策略与本地数据",
    render: () => <SettingsPage />,
  },
];

const navItems: readonly NavItem[] = views.map((v) => ({
  id: v.id,
  label: v.label,
  icon: v.icon,
  section: v.section,
}));

type InferenceTopStatus = {
  provider: ModelProviderMode;
  ok: boolean | null;
  error?: string;
};

type InferenceHealthEvent = CustomEvent<{
  modelProvider?: ModelProviderMode;
  ok: boolean;
  error?: string;
}>;

const providerLabel = (provider: ModelProviderMode) => provider === "remote" ? "Responses API" : "本地模型";

export function App() {
  const [activeId, setActiveId] = useState("overview");
  const [inferenceTopStatus, setInferenceTopStatus] = useState<InferenceTopStatus>({
    provider: "local",
    ok: null,
  });
  const activeView = views.find((v) => v.id === activeId) ?? views[0];
  if (!activeView) {
    throw new Error("No renderer views configured");
  }

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        const [settingsResponse, healthResponse] = await Promise.all([
          window.customerAgent.invoke("settings.get", undefined),
          window.customerAgent.invoke("inference.health", undefined),
        ]);
        if (cancelled) {
          return;
        }
        const provider = settingsResponse.settings?.modelProvider === "remote" ? "remote" : "local";
        setInferenceTopStatus({
          provider,
          ok: Boolean(healthResponse.ok),
          ...(healthResponse.error ? { error: healthResponse.error } : {}),
        });
      } catch (error) {
        if (!cancelled) {
          setInferenceTopStatus((current) => ({
            ...current,
            ok: false,
            error: error instanceof Error ? error.message : "推理状态读取失败",
          }));
        }
      }
    })();

    const onInferenceHealthChanged = (event: Event) => {
      const detail = (event as InferenceHealthEvent).detail;
      setInferenceTopStatus((current) => ({
        provider: detail.modelProvider ?? current.provider,
        ok: detail.ok,
        ...(detail.error ? { error: detail.error } : {}),
      }));
    };
    window.addEventListener("customer-agent:inference-health-changed", onInferenceHealthChanged);

    return () => {
      cancelled = true;
      window.removeEventListener("customer-agent:inference-health-changed", onInferenceHealthChanged);
    };
  }, []);

  const topInferenceStatus = useMemo(() => {
    const labelPrefix = providerLabel(inferenceTopStatus.provider);
    if (inferenceTopStatus.ok === null) {
      return { label: `${labelPrefix} 检查中`, tone: "neutral" as const };
    }
    if (inferenceTopStatus.ok) {
      return { label: `${labelPrefix} 可用`, tone: "success" as const };
    }
    return { label: `${labelPrefix} 不可用`, tone: "error" as const };
  }, [inferenceTopStatus]);

  return (
    <RootLayout
      navItems={navItems}
      activeNavId={activeId}
      onNavSelect={setActiveId}
      title="拼多多 AI 客服助手"
      inferenceStatus={topInferenceStatus}
    >
      <Box sx={{ mb: 3 }}>
        <Typography variant="h4">{activeView.label}</Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
          {activeView.caption}
        </Typography>
      </Box>

      {activeView.render(setActiveId)}
    </RootLayout>
  );
}
