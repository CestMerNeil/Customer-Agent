import React from "react";
import { Box, Stack, Typography } from "@mui/material";
import { tokens } from "../../theme";

export type NavItem = {
  id: string;
  label: string;
  icon: string;
  section: string;
};

export const SIDEBAR_WIDTH = 232;

interface NavigationRailProps {
  items: readonly NavItem[];
  activeId: string;
  onSelect: (id: string) => void;
}

export const NavigationRail: React.FC<NavigationRailProps> = ({ items, activeId, onSelect }) => {
  const sections = groupBySection(items);

  return (
    <Box
      component="nav"
      aria-label="主导航"
      sx={{
        width: SIDEBAR_WIDTH,
        height: "100vh",
        position: "fixed",
        left: 0,
        top: 0,
        zIndex: (theme) => theme.zIndex.appBar + 1,
        display: "flex",
        flexDirection: "column",
        bgcolor: tokens.color.surface.sidebar,
        backdropFilter: "saturate(180%) blur(24px)",
        WebkitBackdropFilter: "saturate(180%) blur(24px)",
        borderRight: `1px solid ${tokens.color.border.hairline}`,
      }}
    >
      {/* Draggable title region; leaves room for inset traffic lights. */}
      <Box
        sx={{
          pt: "30px",
          px: 2,
          pb: 1.5,
          WebkitAppRegion: "drag",
        }}
      >
        <Stack direction="row" spacing={1.25} sx={{ alignItems: "center" }}>
          <Box
            aria-hidden
            sx={{
              width: 26,
              height: 26,
              borderRadius: `${tokens.radius.sm}px`,
              bgcolor: tokens.color.accent.main,
              color: tokens.color.accent.contrast,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 18,
            }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 18 }}>smart_toy</span>
          </Box>
          <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
            AI 客服助手
          </Typography>
        </Stack>
      </Box>

      <Box sx={{ flexGrow: 1, overflowY: "auto", px: 1.25, pb: 2 }}>
        {sections.map((section) => (
          <Box key={section.name} sx={{ mb: 1.5 }}>
            <Typography
              variant="overline"
              sx={{ display: "block", px: 1.25, py: 0.5, color: tokens.color.text.tertiary }}
            >
              {section.name}
            </Typography>
            <Stack spacing={0.25} role="listbox" aria-label={section.name}>
              {section.items.map((item) => {
                const isActive = item.id === activeId;
                return (
                  <Box
                    key={item.id}
                    component="button"
                    type="button"
                    role="option"
                    onClick={() => onSelect(item.id)}
                    aria-label={item.label}
                    aria-current={isActive ? "page" : undefined}
                    aria-selected={isActive}
                    sx={{
                      display: "flex",
                      alignItems: "center",
                      gap: 1.25,
                      width: "100%",
                      textAlign: "left",
                      px: 1.25,
                      py: 0.75,
                      border: "none",
                      borderRadius: `${tokens.radius.sm}px`,
                      cursor: "pointer",
                      color: isActive ? tokens.color.accent.contrast : tokens.color.text.primary,
                      bgcolor: isActive ? tokens.color.accent.main : "transparent",
                      transition: `background-color ${tokens.motion.duration.fast} ${tokens.motion.easing.standard}`,
                      WebkitAppRegion: "no-drag",
                      "&:hover": {
                        bgcolor: isActive ? tokens.color.accent.main : tokens.color.surface.hover,
                      },
                      "&:focus-visible": {
                        outline: `2px solid ${tokens.color.border.focus}`,
                        outlineOffset: 2,
                      },
                    }}
                  >
                    <span
                      className="material-symbols-outlined"
                      style={{
                        fontSize: 19,
                        color: isActive ? tokens.color.accent.contrast : tokens.color.text.secondary,
                      }}
                    >
                      {item.icon}
                    </span>
                    <Typography variant="body2" sx={{ fontWeight: isActive ? 600 : 500, color: "inherit" }}>
                      {item.label}
                    </Typography>
                  </Box>
                );
              })}
            </Stack>
          </Box>
        ))}
      </Box>
    </Box>
  );
};

function groupBySection(items: readonly NavItem[]): Array<{ name: string; items: NavItem[] }> {
  const order: string[] = [];
  const map = new Map<string, NavItem[]>();
  for (const item of items) {
    if (!map.has(item.section)) {
      map.set(item.section, []);
      order.push(item.section);
    }
    map.get(item.section)!.push(item);
  }
  return order.map((name) => ({ name, items: map.get(name)! }));
}
