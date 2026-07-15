import React from "react";
import { Box } from "@mui/material";
import { NavigationRail, NavItem } from "./NavigationRail";
import { TopAppBar } from "./TopAppBar";
import { tokens } from "../../theme";

const IS_MACOS = navigator.userAgent.includes("Macintosh");

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
    <Box
      sx={{
        height: "100vh",
        display: "flex",
        flexDirection: "column",
        bgcolor: "background.paper",
        color: "text.primary",
        overflow: "hidden",
      }}
    >
      {/* Draggable strip for the macOS hiddenInset traffic lights. */}
      <Box
        sx={{
          display: IS_MACOS ? "block" : "none",
          height: 40,
          flex: "0 0 auto",
          borderBottom: "1px solid",
          borderColor: "divider",
          WebkitAppRegion: "drag",
        }}
      />
      <Box sx={{ flex: 1, minHeight: 0, display: "flex" }}>
        <NavigationRail items={navItems} activeId={activeNavId} onSelect={onNavSelect} />
        <Box sx={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
          <TopAppBar title={title} inferenceStatus={inferenceStatus} />
          <Box
            component="main"
            sx={{
              flex: 1,
              minHeight: 0,
              overflowY: "auto",
              px: { xs: 2.5, md: 3.5 },
              py: 3.25,
              "&::-webkit-scrollbar": { width: 10 },
              "&::-webkit-scrollbar-thumb": {
                bgcolor: tokens.color.border.strong,
                borderRadius: 6,
                border: `3px solid ${tokens.color.surface.base}`,
              },
            }}
          >
            {children}
          </Box>
        </Box>
      </Box>
    </Box>
  );
};
