import React from "react";
import { AppBar, Toolbar, Typography, IconButton, Box } from "@mui/material";

interface TopAppBarProps {
  title: string;
}

export const TopAppBar: React.FC<TopAppBarProps> = ({ title }) => {
  return (
    <AppBar
      position="fixed"
      elevation={0}
      sx={{
        width: "calc(100% - 96px)",
        ml: "96px",
        bgcolor: "rgba(247, 248, 244, 0.86)",
        color: "text.primary",
        borderBottom: "1px solid",
        borderColor: "divider",
        backdropFilter: "blur(18px)",
      }}
    >
      <Toolbar sx={{ minHeight: "72px !important", gap: 2 }}>
        <Box sx={{ flexGrow: 1 }}>
          <Typography variant="overline" color="text.secondary">
            Live desk
          </Typography>
          <Typography variant="h6" component="h1" sx={{ lineHeight: 1.15 }}>
            {title}
          </Typography>
        </Box>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
          <Box
            sx={{
              display: { xs: "none", md: "flex" },
              alignItems: "center",
              gap: 1,
              px: 1.5,
              py: 0.75,
              border: "1px solid",
              borderColor: "divider",
              borderRadius: 1,
              bgcolor: "background.paper",
              color: "success.main",
              fontSize: 13,
              fontWeight: 700,
            }}
          >
            <Box sx={{ width: 8, height: 8, borderRadius: "50%", bgcolor: "success.main" }} />
            本地运行
          </Box>
          <IconButton color="inherit" aria-label="通知">
            <span className="material-symbols-outlined">notifications</span>
          </IconButton>
          <IconButton color="inherit" aria-label="账户">
            <span className="material-symbols-outlined">account_circle</span>
          </IconButton>
        </Box>
      </Toolbar>
    </AppBar>
  );
};
