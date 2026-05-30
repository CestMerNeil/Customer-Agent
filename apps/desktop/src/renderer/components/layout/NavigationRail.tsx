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
        width: 80,
        height: "100vh",
        bgcolor: "background.paper",
        borderRight: "1px solid",
        borderColor: "divider",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        py: 2,
        flexShrink: 0,
        position: "fixed",
        left: 0,
        top: 0,
      }}
    >
      <Box sx={{ mb: 4 }}>
        <IconButton sx={{ bgcolor: "primary.main", color: "primary.contrastText", "&:hover": { bgcolor: "primary.dark" } }}>
          <span className="material-symbols-outlined">smart_toy</span>
        </IconButton>
      </Box>

      <Stack spacing={2} sx={{ width: "100%", alignItems: "center" }}>
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
                  width: "100%",
                  py: 1,
                  position: "relative",
                  border: "none",
                  bgcolor: "transparent",
                  outline: "none",
                  "&:focus-visible": {
                    "& .rail-icon-container": {
                      outline: "2px solid",
                      outlineColor: "primary.main",
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
                    borderRadius: 16,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    bgcolor: isActive ? "primary.light" : "transparent",
                    color: isActive ? "primary.main" : "text.secondary",
                    transition: "background-color 0.2s",
                    "&:hover": {
                      bgcolor: isActive ? "primary.light" : "action.hover",
                    },
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
                    color: isActive ? "text.primary" : "text.secondary",
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
