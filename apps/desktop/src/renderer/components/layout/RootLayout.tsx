import React from "react";
import { Box } from "@mui/material";
import { NavigationRail, NavItem, SIDEBAR_WIDTH } from "./NavigationRail";
import { TopAppBar, TOOLBAR_HEIGHT } from "./TopAppBar";

interface RootLayoutProps {
  children: React.ReactNode;
  navItems: readonly NavItem[];
  activeNavId: string;
  onNavSelect: (id: string) => void;
  title: string;
  inferenceStatus: {
    label: string;
    tone: "success" | "error" | "neutral";
  };
}

export const RootLayout: React.FC<RootLayoutProps> = ({
  children,
  navItems,
  activeNavId,
  onNavSelect,
  title,
  inferenceStatus,
}) => {
  return (
    <Box sx={{ display: "flex", minHeight: "100vh" }}>
      <NavigationRail items={navItems} activeId={activeNavId} onSelect={onNavSelect} />
      <TopAppBar title={title} inferenceStatus={inferenceStatus} />
      <Box
        component="main"
        sx={{
          flexGrow: 1,
          px: { xs: 2.5, md: 4 },
          py: 3,
          ml: `${SIDEBAR_WIDTH}px`,
          mt: `${TOOLBAR_HEIGHT}px`,
          minWidth: 0,
        }}
      >
        <Box sx={{ minHeight: `calc(100vh - ${TOOLBAR_HEIGHT}px)` }}>{children}</Box>
      </Box>
    </Box>
  );
};
