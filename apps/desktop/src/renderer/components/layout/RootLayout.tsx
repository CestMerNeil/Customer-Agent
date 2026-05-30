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
    <Box sx={{ display: "flex" }}>
      <NavigationRail items={navItems} activeId={activeNavId} onSelect={onNavSelect} />
      <Box component="main" sx={{ flexGrow: 1, p: 3, ml: "80px", mt: "64px" }}>
        {/* Toolbar is used to push content below TopAppBar */}
        <Box sx={{ minHeight: "100vh" }}>{children}</Box>
      </Box>
      <TopAppBar title={title} />
    </Box>
  );
};
