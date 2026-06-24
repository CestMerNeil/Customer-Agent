import { useState } from "react";
import { Box, Typography } from "@mui/material";
import { RootLayout } from "./components/layout/RootLayout";
import { NavItem } from "./components/layout/NavigationRail";

// Page Components
import { ReviewWorkspace } from "./components/pages/ReviewWorkspace";
import { AutoReplyDashboard } from "./components/pages/AutoReplyDashboard";
import { AccountManager } from "./components/pages/AccountManager";
import { KnowledgeBaseManager } from "./components/pages/KnowledgeBaseManager";
import { ModelSettings } from "./components/pages/ModelSettings";
import { LogViewer } from "./components/pages/LogViewer";
import { SettingsPage } from "./components/pages/SettingsPage";

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
    id: "review",
    label: "审核工作台",
    icon: "rate_review",
    section: "工作",
    caption: "人工审核 · 编辑后发送、忽略或升级",
    render: () => <ReviewWorkspace />,
  },
  {
    id: "overview",
    label: "概览",
    icon: "insights",
    section: "工作",
    caption: "运行状态与今日队列一览",
    render: (navigate) => <AutoReplyDashboard onNavigate={navigate} />,
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

export function App() {
  const [activeId, setActiveId] = useState("review");
  const activeView = views.find((v) => v.id === activeId) ?? views[0];
  if (!activeView) {
    throw new Error("No renderer views configured");
  }

  return (
    <RootLayout
      navItems={navItems}
      activeNavId={activeId}
      onNavSelect={setActiveId}
      title="拼多多 AI 客服助手"
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
