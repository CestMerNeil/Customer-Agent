import React from "react";
import { Box } from "@mui/material";
import { NavigationRail, NavItem } from "./NavigationRail";
import { TopAppBar } from "./TopAppBar";

interface RootLayoutProps {
  children: React.ReactNode;
  navItems: readonly NavItem[];
  activeNavId: string;
  onNavSelect: (id: string) => void;
  title: string;
}

export const RootLayout: React.FC<RootLayoutProps> = ({
  children,
  navItems,
  activeNavId,
  onNavSelect,
  title,
}) => {
  return (
    <Box sx={{ display: "flex", minHeight: "100vh" }}>
      <NavigationRail items={navItems} activeId={activeNavId} onSelect={onNavSelect} />
      <Box
        component="main"
        sx={{
          flexGrow: 1,
          px: { xs: 2.5, md: 3.5 },
          py: 3,
          ml: "96px",
          mt: "72px",
          minWidth: 0,
        }}
      >
        <Box sx={{ minHeight: "calc(100vh - 96px)" }}>{children}</Box>
      </Box>
      <TopAppBar title={title} />
    </Box>
  );
};
