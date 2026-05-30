import { useState } from "react";
import { Box, Typography } from "@mui/material";
import { RootLayout } from "./components/layout/RootLayout";
import { NavItem } from "./components/layout/NavigationRail";

// Page Components
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
  component: React.ReactNode;
};

const views: readonly ViewState[] = [
  {
    id: "auto-reply",
    label: "自动回复",
    icon: "chat",
    component: <AutoReplyDashboard />,
  },
  {
    id: "accounts",
    label: "账号管理",
    icon: "group",
    component: <AccountManager />,
  },
  {
    id: "knowledge",
    label: "知识库",
    icon: "library_books",
    component: <KnowledgeBaseManager />,
  },
  {
    id: "models",
    label: "模型设置",
    icon: "settings_suggest",
    component: <ModelSettings />,
  },
  {
    id: "logs",
    label: "日志",
    icon: "history",
    component: <LogViewer />,
  },
  {
    id: "settings",
    label: "设置",
    icon: "settings",
    component: <SettingsPage />,
  },
];

const navItems: readonly NavItem[] = views.map((v) => ({
  id: v.id,
  label: v.label,
  icon: v.icon,
}));

export function App() {
  const [activeId, setActiveId] = useState("auto-reply");
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
      <Box sx={{ mb: 4 }}>
        <Typography variant="body2" color="text.secondary">
          Electron + TypeScript rewrite
        </Typography>
        <Typography variant="h4" sx={{ mt: 1, fontWeight: 500 }}>
          {activeView.label}
        </Typography>
      </Box>

      {activeView.component}
    </RootLayout>
  );
}
