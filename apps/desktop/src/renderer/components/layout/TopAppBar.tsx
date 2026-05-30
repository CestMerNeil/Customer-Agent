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
        width: "calc(100% - 80px)",
        ml: "80px",
        bgcolor: "background.default",
        color: "text.primary",
        borderBottom: "1px solid",
        borderColor: "divider",
      }}
    >
      <Toolbar>
        <Typography variant="h6" component="h1" sx={{ flexGrow: 1, fontWeight: 400 }}>
          {title}
        </Typography>
        <Box>
          <IconButton color="inherit">
            <span className="material-symbols-outlined">notifications</span>
          </IconButton>
          <IconButton color="inherit">
            <span className="material-symbols-outlined">account_circle</span>
          </IconButton>
        </Box>
      </Toolbar>
    </AppBar>
  );
};
