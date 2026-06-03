import React from "react";
import { Box, IconButton, Stack, Tooltip, Typography } from "@mui/material";

export type NavItem = {
  id: string;
  label: string;
  icon: string;
};

interface NavigationRailProps {
  items: readonly NavItem[];
  activeId: string;
  onSelect: (id: string) => void;
}

export const NavigationRail: React.FC<NavigationRailProps> = ({ items, activeId, onSelect }) => {
  return (
    <Box
      sx={{
        width: 96,
        height: "100vh",
        bgcolor: "#17211f",
        color: "#f5f7f2",
        borderRight: "1px solid rgba(255, 255, 255, 0.08)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        py: 2.5,
        flexShrink: 0,
        position: "fixed",
        left: 0,
        top: 0,
        zIndex: (theme) => theme.zIndex.appBar + 1,
      }}
    >
      <Box sx={{ mb: 3 }}>
        <IconButton
          aria-label="客服助手"
          sx={{
            width: 48,
            height: 48,
            bgcolor: "#e8c468",
            color: "#17211f",
            borderRadius: 1.5,
            boxShadow: "inset 0 -3px 0 rgba(0, 0, 0, 0.16)",
            "&:hover": { bgcolor: "#f1d47d" },
          }}
        >
          <span className="material-symbols-outlined">smart_toy</span>
        </IconButton>
      </Box>

      <Stack spacing={0.75} sx={{ width: "100%", alignItems: "center" }}>
        {items.map((item) => {
          const isActive = item.id === activeId;
          return (
            <Tooltip key={item.id} title={item.label} placement="right">
              <Box
                component="button"
                onClick={() => onSelect(item.id)}
                aria-label={item.label}
                aria-current={isActive ? "page" : undefined}
                sx={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  cursor: "pointer",
                  width: 76,
                  minHeight: 70,
                  py: 1,
                  position: "relative",
                  border: "none",
                  borderRadius: 2,
                  bgcolor: isActive ? "rgba(255, 255, 255, 0.10)" : "transparent",
                  outline: "none",
                  transition: "background-color 0.2s ease, transform 0.2s ease",
                  "&:hover": {
                    bgcolor: isActive ? "rgba(255, 255, 255, 0.13)" : "rgba(255, 255, 255, 0.06)",
                    transform: "translateX(2px)",
                  },
                  "&::before": {
                    content: '""',
                    position: "absolute",
                    left: -10,
                    top: 16,
                    bottom: 16,
                    width: 3,
                    borderRadius: 2,
                    bgcolor: isActive ? "#e8c468" : "transparent",
                  },
                  "&:focus-visible": {
                    "& .rail-icon-container": {
                      outline: "2px solid #e8c468",
                      outlineOffset: 2,
                    },
                  },
                }}
              >
                <Box
                  className="rail-icon-container"
                  sx={{
                    width: 56,
                    height: 32,
                    borderRadius: 1.25,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    bgcolor: isActive ? "rgba(232, 196, 104, 0.18)" : "transparent",
                    color: isActive ? "#e8c468" : "rgba(245, 247, 242, 0.68)",
                    transition: "background-color 0.2s ease, color 0.2s ease",
                  }}
                >
                  <span className="material-symbols-outlined">{item.icon}</span>
                </Box>
                <Typography
                  variant="caption"
                  sx={{
                    mt: 0.5,
                    fontSize: "0.75rem",
                    fontWeight: isActive ? 700 : 400,
                    color: isActive ? "#ffffff" : "rgba(245, 247, 242, 0.72)",
                  }}
                >
                  {item.label}
                </Typography>
              </Box>
            </Tooltip>
          );
        })}
      </Stack>
    </Box>
  );
};
