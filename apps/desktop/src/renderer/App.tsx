import { useEffect, useMemo, useState } from "react";
import { Box, Typography } from "@mui/material";
import { RootLayout } from "./components/layout/RootLayout";
import { NavItem } from "./components/layout/NavigationRail";
import type { ModelProvider } from "@customer-agent/core";

// Page Components
import { AutoReplyDashboard } from "./components/pages/AutoReplyDashboard";
import { AccountManager } from "./components/pages/AccountManager";
import { KnowledgeBaseManager } from "./components/pages/KnowledgeBaseManager";
import { ModelSettings } from "./components/pages/ModelSettings";
import { SettingsPage } from "./components/pages/SettingsPage";
import { AgentAuditViewer } from "./components/pages/AgentAuditViewer";
import { QueueOperationsPage } from "./components/pages/QueueOperationsPage";
import { ReleaseStatusPage } from "./components/pages/ReleaseStatusPage";
import { HumanHandoffPage } from "./components/pages/HumanHandoffPage";

type ViewState = {
  id: string;
  label: string;
  /** Big page-content title. Differs from the nav `label` on a few pages,
   * matching the design's page-header text exactly. */
  title: string;
  icon: string;
  section: string;
  caption: string;
  /** True when the page renders its own title+caption+action-button header
   * row (matching the design's per-page header actions), so App skips its
   * generic caption-only header for this page. */
  ownHeader?: boolean;
  render: (navigate: (id: string) => void) => React.ReactNode;
};

const views: readonly ViewState[] = [
  {
    id: "overview",
    label: "概览",
    title: "实时工作台",
    icon: "insights",
    section: "工作",
    caption: "运行状态与今日队列一览",
    ownHeader: true,
    render: (navigate) => <AutoReplyDashboard onNavigate={navigate} />,
  },
  {
    id: "queue",
    label: "队列",
    title: "消息工作流",
    icon: "inbox",
    section: "工作",
    caption: "本地持久化队列的真实处理状态、重试与依赖健康",
    ownHeader: true,
    render: () => <QueueOperationsPage />,
  },
  {
    id: "agent-audit",
    label: "AI 处理记录",
    title: "AI 处理记录",
    icon: "account_tree",
    section: "工作",
    caption: "最近 100 条工具调用、结果、引用与最终回复事件",
    ownHeader: true,
    render: () => <AgentAuditViewer />,
  },
  {
    id: "handoff",
    label: "人工",
    title: "人工处理工作台",
    icon: "support_agent",
    section: "工作",
    caption: "关键词、意图、营业时间或转接失败进入人工的会话",
    ownHeader: true,
    render: () => <HumanHandoffPage />,
  },
  {
    id: "accounts",
    label: "账号",
    title: "账号",
    icon: "group",
    section: "配置",
    caption: "拼多多客服账号登录与会话",
    ownHeader: true,
    render: () => <AccountManager />,
  },
  {
    id: "knowledge",
    label: "知识库",
    title: "知识库",
    icon: "menu_book",
    section: "配置",
    caption: "全局与店铺知识的导入、同步与检索治理",
    render: () => <KnowledgeBaseManager />,
  },
  {
    id: "models",
    label: "模型",
    title: "模型",
    icon: "smart_toy",
    section: "配置",
    caption: "选择由「本地 AI」还是「云端 AI」来生成客服回复",
    render: () => <ModelSettings />,
  },
  {
    id: "release",
    label: "发布",
    title: "发布",
    icon: "verified",
    section: "系统",
    caption: "验收证据与 GitHub Release 门禁",
    render: () => <ReleaseStatusPage />,
  },
  {
    id: "settings",
    label: "设置",
    title: "设置",
    icon: "settings",
    section: "系统",
    caption: "回复策略与本地数据",
    render: () => <SettingsPage />,
  },
];


type InferenceTopStatus = {
  provider: ModelProvider;
  ok: boolean | null;
  error?: string;
};

type InferenceHealthEvent = CustomEvent<{
  modelProvider?: ModelProvider;
  ok: boolean;
  error?: string;
}>;

const providerLabel = (provider: ModelProvider) => provider === "remote" ? "Responses API" : "本地模型";

export function App() {
  const [activeId, setActiveId] = useState("overview");
  const [queueBadge, setQueueBadge] = useState(0);

  useEffect(() => {
    let cancelled = false;
    void window.customerAgent
      .invoke("reply.draft.list", undefined)
      .then((response) => {
        if (!cancelled) {
          setQueueBadge(
            response.drafts.filter((draft) => draft.state === "draft_ready" || draft.state === "failed").length,
          );
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [activeId]);

  const navItems: readonly NavItem[] = useMemo(
    () =>
      views.map((v) => ({
        id: v.id,
        label: v.label,
        icon: v.icon,
        section: v.section,
        ...(v.id === "queue" && queueBadge > 0 ? { badge: queueBadge } : {}),
      })),
    [queueBadge],
  );
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
      title={activeView.label}
      inferenceStatus={topInferenceStatus}
    >
      {!activeView.ownHeader && (
        <Box sx={{ mb: 2.75 }}>
          <Typography variant="h4">{activeView.title}</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.75 }}>
            {activeView.caption}
          </Typography>
        </Box>
      )}

      {activeView.render(setActiveId)}
    </RootLayout>
  );
}
