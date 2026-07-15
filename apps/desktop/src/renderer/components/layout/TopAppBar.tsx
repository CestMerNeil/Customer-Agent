import React from "react";
import { Box, IconButton, Stack, Typography } from "@mui/material";
import { tokens } from "../../theme";

export const TOOLBAR_HEIGHT = 56;

interface TopAppBarProps {
  title: string;
  inferenceStatus: {
    label: string;
    tone: "success" | "error" | "neutral";
  };
}

export const TopAppBar: React.FC<TopAppBarProps> = ({ title, inferenceStatus }) => {
  const statusColor = inferenceStatus.tone === "success"
    ? tokens.color.state.success
    : inferenceStatus.tone === "error"
      ? tokens.color.state.error
      : tokens.color.text.secondary;
  return (
    <Box
      component="header"
      sx={{
        position: "relative",
        flex: "0 0 auto",
        height: TOOLBAR_HEIGHT,
        display: "flex",
        alignItems: "center",
        gap: 2,
        px: 3.5,
        bgcolor: tokens.color.surface.base,
        borderBottom: `1px solid ${tokens.color.border.hairline}`,
      }}
    >
      <Typography component="div" sx={{ flexGrow: 1, fontWeight: 700, fontSize: 15, letterSpacing: "-0.02em" }}>
        {title}
      </Typography>
      <Stack
        direction="row"
        spacing={2}
        sx={{
          alignItems: "center",
          WebkitAppRegion: "no-drag",
        }}
      >
        <Box
          sx={{
            display: { xs: "none", md: "flex" },
            alignItems: "center",
            gap: 1,
            bgcolor: "transparent",
            color: tokens.color.text.secondary,
            fontSize: 11,
            fontWeight: 600,
          }}
        >
          <Box sx={{ width: 6, height: 6, borderRadius: "50%", bgcolor: statusColor }} />
          {inferenceStatus.label}
        </Box>
        <Box sx={{ width: "1px", height: 16, bgcolor: tokens.color.border.hairline }} />
        <IconButton size="small" color="inherit" aria-label="搜索">
          <span className="material-symbols-rounded" aria-hidden="true" style={{ fontSize: 19, color: tokens.color.text.tertiary }}>search</span>
        </IconButton>
        <IconButton size="small" color="inherit" aria-label="通知">
          <span className="material-symbols-rounded" aria-hidden="true" style={{ fontSize: 19, color: tokens.color.text.tertiary }}>notifications</span>
        </IconButton>
      </Stack>
    </Box>
  );
};
