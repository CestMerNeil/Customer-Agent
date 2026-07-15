import React from "react";
import { Box, Stack, Typography } from "@mui/material";
import { tokens } from "../../theme";

export type NavItem = {
  id: string;
  label: string;
  icon: string;
  section: string;
  /** Right-aligned numeric badge (design: pending-review count on 队列). */
  badge?: number;
};

export const SIDEBAR_WIDTH = 212;

interface NavigationRailProps {
  items: readonly NavItem[];
  activeId: string;
  onSelect: (id: string) => void;
}

export const NavigationRail: React.FC<NavigationRailProps> = ({ items, activeId, onSelect }) => {
  const pinnedItem = items.find((item) => item.id === "settings");
  const sections = groupBySection(items.filter((item) => item.id !== "settings"));

  return (
    <Box
      component="nav"
      aria-label="主导航"
      sx={{
        width: SIDEBAR_WIDTH,
        flex: "0 0 auto",
        display: "flex",
        flexDirection: "column",
        bgcolor: tokens.color.surface.base,
        borderRight: `1px solid ${tokens.color.border.hairline}`,
      }}
    >
      {/* Draggable title region; leaves room for inset traffic lights. */}
      <Box
        sx={{
          px: "14px",
          pt: "18px",
          pb: "10px",
        }}
      >
        <Stack direction="row" spacing={1.25} sx={{ alignItems: "center", px: "6px", pb: "8px" }}>
          <Box
            aria-hidden
            sx={{
              width: 28,
              height: 28,
              borderRadius: `${tokens.radius.md}px`,
              bgcolor: tokens.color.surface.inverse,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Box sx={{ width: 9, height: 9, borderRadius: "2px", bgcolor: tokens.color.state.success }} />
          </Box>
          <Typography sx={{ fontWeight: 700, fontSize: 14, letterSpacing: "-0.02em" }}>
            客服助手
          </Typography>
        </Stack>
      </Box>

      <Box sx={{ flexGrow: 1, overflowY: "auto", px: "14px", pb: 2 }}>
        {sections.map((section) => (
          <Box key={section.name} sx={{ mb: 1.5 }}>
            <Typography
              sx={{
                display: "block",
                fontSize: "9px",
                fontWeight: 700,
                letterSpacing: ".16em",
                color: tokens.color.text.tertiary,
                p: "8px 8px 6px",
              }}
            >
              {section.name}
            </Typography>
            <Stack spacing={0} role="listbox" aria-label={section.name}>
              {section.items.map((item) => (
                <NavRow key={item.id} item={item} isActive={item.id === activeId} onSelect={onSelect} />
              ))}
            </Stack>
          </Box>
        ))}
      </Box>

      {pinnedItem && (
        <Box sx={{ px: "14px", pb: 1.25, pt: 1.25, borderTop: `1px solid ${tokens.color.border.hairline}` }}>
          <Stack spacing={0.25} role="listbox" aria-label={pinnedItem.section}>
            <NavRow item={pinnedItem} isActive={pinnedItem.id === activeId} onSelect={onSelect} />
          </Stack>
        </Box>
      )}
    </Box>
  );
};

const NavRow: React.FC<{ item: NavItem; isActive: boolean; onSelect: (id: string) => void }> = ({ item, isActive, onSelect }) => (
  <Box
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
      gap: "11px",
      width: "100%",
      textAlign: "left",
      p: "8px 9px",
      border: "none",
      borderLeft: `2px solid ${isActive ? tokens.color.state.success : "transparent"}`,
      borderRadius: 0,
      cursor: "pointer",
      color: isActive ? tokens.color.text.primary : tokens.color.text.secondary,
      bgcolor: "transparent",
      transition: `background-color ${tokens.motion.duration.fast} ${tokens.motion.easing.standard}`,
      WebkitAppRegion: "no-drag",
      "&:hover": {
        bgcolor: tokens.color.surface.hover,
      },
      fontSize: 13,
      "&:focus-visible": {
        outline: `2px solid ${tokens.color.border.focus}`,
        outlineOffset: 2,
      },
    }}
  >
    <span className="material-symbols-rounded" aria-hidden="true" style={{ fontSize: 18, color: "inherit" }}>
      {item.icon}
    </span>
    <Typography sx={{ fontSize: 13, fontWeight: isActive ? 600 : 500, color: "inherit" }}>
      {item.label}
    </Typography>
    {item.badge != null && item.badge > 0 && (
      <Typography
        component="span"
        sx={{
          ml: "auto",
          fontFamily: tokens.font.display,
          fontWeight: 700,
          fontSize: 11,
          color: tokens.color.text.primary,
        }}
      >
        {item.badge}
      </Typography>
    )}
  </Box>
);

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
