import React from "react";
import { Box, IconButton, Stack, Typography } from "@mui/material";
import { tokens } from "../../theme";
import { SIDEBAR_WIDTH } from "./NavigationRail";

export const TOOLBAR_HEIGHT = 52;

interface TopAppBarProps {
  title: string;
}

export const TopAppBar: React.FC<TopAppBarProps> = ({ title }) => {
  return (
    <Box
      component="header"
      sx={{
        position: "fixed",
        top: 0,
        left: SIDEBAR_WIDTH,
        width: `calc(100% - ${SIDEBAR_WIDTH}px)`,
        height: TOOLBAR_HEIGHT,
        zIndex: (theme) => theme.zIndex.appBar,
        display: "flex",
        alignItems: "center",
        gap: 1.5,
        px: 2.5,
        bgcolor: tokens.color.surface.sidebar,
        backdropFilter: "saturate(180%) blur(24px)",
        WebkitBackdropFilter: "saturate(180%) blur(24px)",
        borderBottom: `1px solid ${tokens.color.border.hairline}`,
        WebkitAppRegion: "drag",
      }}
    >
      <Typography variant="h6" component="h1" sx={{ flexGrow: 1, fontWeight: 600 }}>
        {title}
      </Typography>
      <Stack
        direction="row"
        spacing={1}
        sx={{
          alignItems: "center",
          WebkitAppRegion: "no-drag",
        }}
      >
        <Box
          sx={{
            display: { xs: "none", md: "flex" },
            alignItems: "center",
            gap: 0.75,
            px: 1.25,
            py: 0.5,
            borderRadius: `${tokens.radius.pill}px`,
            bgcolor: tokens.color.state.successSoft,
            color: tokens.color.state.success,
            fontSize: 12,
            fontWeight: 600,
          }}
        >
          <Box sx={{ width: 7, height: 7, borderRadius: "50%", bgcolor: tokens.color.state.success }} />
          本地运行
        </Box>
        <IconButton size="small" color="inherit" aria-label="通知">
          <span className="material-symbols-outlined" style={{ fontSize: 20 }}>notifications</span>
        </IconButton>
        <IconButton size="small" color="inherit" aria-label="账户">
          <span className="material-symbols-outlined" style={{ fontSize: 20 }}>account_circle</span>
        </IconButton>
      </Stack>
    </Box>
  );
};
