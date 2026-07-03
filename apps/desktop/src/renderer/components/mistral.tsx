import React from "react";
import { Box, Card, CardContent, Stack, Typography } from "@mui/material";
import { tokens } from "../theme";

/**
 * Flat editorial composition primitives (see Customer Agent App.dc.html).
 * White surfaces, hairline borders, black ink CTAs, green reserved for
 * status/active-state signalling. Every page composes from these so the app
 * reads as one consistent system rather than recoloured forms.
 */

/** Micro-uppercase eyebrow label that opens a section, the editorial signature. */
export const Eyebrow: React.FC<{ children: React.ReactNode; color?: string }> = ({ children, color }) => (
  <Typography
    sx={{
      display: "block",
      color: color ?? tokens.color.text.tertiary,
      mb: 0.75,
      fontSize: 9,
      fontWeight: 700,
      letterSpacing: ".14em",
      textTransform: "uppercase",
    }}
  >
    {children}
  </Typography>
);

/** Page-header band: eyebrow + heavy title + subtitle + actions, no card chrome. */
export const Hero: React.FC<{
  eyebrow?: string;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  actions?: React.ReactNode;
  badges?: React.ReactNode;
}> = ({ eyebrow, title, subtitle, actions, badges }) => (
  <Stack
    direction={{ xs: "column", md: "row" }}
    sx={{ alignItems: { md: "flex-start" }, justifyContent: "space-between", gap: 2, mb: 0 }}
  >
    <Box sx={{ minWidth: 0 }}>
      {eyebrow && <Eyebrow>{eyebrow}</Eyebrow>}
      <Typography component="h1" sx={{ maxWidth: 640, color: tokens.color.text.primary, fontWeight: 800, fontSize: 22, lineHeight: 1.1, letterSpacing: "-0.02em", m: 0 }}>
        {title}
      </Typography>
      {subtitle && (
        <Typography sx={{ mt: 0.75, maxWidth: 560, color: tokens.color.text.secondary, fontWeight: 500, fontSize: 13 }}>
          {subtitle}
        </Typography>
      )}
      {badges && (
        <Stack direction="row" spacing={1} sx={{ mt: 1.5, flexWrap: "wrap", gap: 1 }}>
          {badges}
        </Stack>
      )}
    </Box>
    {actions && (
      <Stack direction="row" spacing={1.5} sx={{ flexWrap: "wrap", gap: 1.5, flexShrink: 0 }}>
        {actions}
      </Stack>
    )}
  </Stack>
);

/** Stat cell: serif display numeral over a micro-uppercase label, flat. */
export const Stat: React.FC<{
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
  tone?: "default" | "success" | "warning" | "error" | "accent";
  /** Inline node rendered on the value baseline (design: "/5", "+18%", green dot). */
  suffix?: React.ReactNode;
  /** Design: overview stats are 34px in 18/20 padding, other pages 28px in 16/18. */
  compact?: boolean;
}> = ({ label, value, hint, tone = "default", suffix, compact }) => {
  const color =
    tone === "success" ? tokens.color.state.success
    : tone === "warning" ? tokens.color.state.warning
    : tone === "error" ? tokens.color.state.error
    : tone === "accent" ? tokens.color.state.success
    : tokens.color.text.primary;
  // Tabular numeral face only reads well for numbers; Chinese/word values fall
  // back to a clean sans heading so tabular-figure glyphs don't look clunky.
  const numeric = typeof value === "number" || (typeof value === "string" && /^[\d.,%+\-\s]+$/.test(value.trim()));
  return (
    <Box sx={{ p: compact ? "16px 18px" : { xs: 2, md: "18px 20px" } }}>
      <Typography
        sx={{
          display: "block",
          color: tokens.color.text.tertiary,
          mb: compact ? "10px" : "12px",
          fontSize: 9,
          fontWeight: 700,
          letterSpacing: ".14em",
          textTransform: "uppercase",
        }}
      >
        {label}
      </Typography>
      <Box sx={{ display: "flex", alignItems: "baseline", gap: "6px" }}>
        <Typography
          sx={
            numeric
              ? { fontFamily: tokens.font.display, fontWeight: 500, fontSize: compact ? 28 : { xs: 28, md: 34 }, lineHeight: 1, letterSpacing: "-0.02em", color }
              : { fontSize: { xs: 19, md: 21 }, fontWeight: 600, lineHeight: 1.25, color, mt: 0.25 }
          }
        >
          {value}
        </Typography>
        {suffix}
      </Box>
      {hint && (
        <Typography variant="body2" sx={{ mt: 0.75, color: tokens.color.text.secondary, display: { xs: "block", md: "none" } }}>
          {hint}
        </Typography>
      )}
    </Box>
  );
};

/** A flat, equal-width row of stat cells separated by hairlines. */
export const StatRow: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const cells = React.Children.toArray(children);
  return (
    <Card sx={{ borderRadius: `${tokens.radius.lg}px`, overflow: "hidden" }}>
      <CardContent
        sx={{
          p: 0,
          "&:last-child": { pb: 0 },
          display: "grid",
          gridTemplateColumns: { xs: "1fr 1fr", md: `repeat(${cells.length}, 1fr)` },
          gap: { xs: 3, md: 0 },
        }}
      >
        {cells.map((cell, index) => (
          <Box
            key={index}
            sx={{
              p: 0,
              borderLeft: { md: index === 0 ? "none" : `1px solid ${tokens.color.border.hairline}` },
            }}
          >
            {cell}
          </Box>
        ))}
      </CardContent>
    </Card>
  );
};

/** Status pill exactly per design: 600 10px text, 999 radius. */
export const Pill: React.FC<{
  label: React.ReactNode;
  tone?: "outline" | "success" | "warning" | "error" | "dark" | "neutral" | "muted";
}> = ({ label, tone = "outline" }) => {
  const styles: Record<string, object> = {
    outline: { color: tokens.color.text.primary, border: `1px solid #e0e0e0`, p: "2px 8px" },
    success: { color: tokens.color.state.success, bgcolor: tokens.color.state.successSoft, p: "3px 8px" },
    warning: { color: tokens.color.state.warning, bgcolor: tokens.color.state.warningSoft, p: "3px 8px" },
    error: { color: tokens.color.state.error, bgcolor: tokens.color.state.errorSoft, p: "3px 8px" },
    dark: { color: tokens.color.text.primary, bgcolor: "#0a0a0a12", p: "3px 8px" },
    neutral: { color: tokens.color.text.secondary, bgcolor: "#7373731a", p: "3px 8px" },
    muted: { color: tokens.color.text.secondary, border: `1px solid ${tokens.color.border.hairline}`, p: "2px 8px" },
  };
  return (
    <Typography
      component="span"
      sx={{
        display: "inline-block",
        fontSize: 10,
        fontWeight: 600,
        lineHeight: "normal",
        borderRadius: "999px",
        whiteSpace: "nowrap",
        ...styles[tone],
      }}
    >
      {label}
    </Typography>
  );
};

/** Hairline divider for use as a Stack `divider`. */
export const Hairline: React.FC = () => (
  <Box sx={{ height: "1px", bgcolor: tokens.color.border.hairline }} />
);

/** A space-between list row with generous vertical padding. */
export const Row: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <Stack direction="row" sx={{ justifyContent: "space-between", alignItems: "center", gap: 2, py: 1.625 }}>
    {children}
  </Stack>
);

/** Quiet empty-state block for panels with no data yet. */
export const EmptyState: React.FC<{ primary: string; secondary?: string }> = ({ primary, secondary }) => (
  <Box sx={{ py: 2 }}>
    <Typography variant="body2" sx={{ color: tokens.color.text.primary, mb: secondary ? 0.5 : 0 }}>{primary}</Typography>
    {secondary && <Typography variant="caption" sx={{ color: tokens.color.text.tertiary }}>{secondary}</Typography>}
  </Box>
);

/** Content panel: by default matches the design's section header + unframed body. */
export const Panel: React.FC<{
  title?: React.ReactNode;
  eyebrow?: string;
  action?: React.ReactNode;
  cream?: boolean;
  /** Table panels sit 2px under the header rule (design), lists use 14px. */
  flushBody?: boolean;
  children: React.ReactNode;
}> = ({ title, eyebrow, action, cream, flushBody, children }) => (
  <Box
    sx={cream ? { border: `1px solid ${tokens.color.border.hairline}`, borderRadius: `${tokens.radius.lg}px`, p: { xs: 2, md: 2.5 } } : undefined}
  >
    <Box sx={{ p: 0 }}>
      {(title || action) && (
        <Stack
          direction="row"
          sx={{
            justifyContent: "space-between",
            alignItems: "baseline",
            gap: 2,
            pb: 1.5,
            mb: flushBody ? "2px" : 1.75,
            borderBottom: `1px solid ${tokens.color.text.primary}`,
          }}
        >
          <Box sx={{ minWidth: 0 }}>
            {title && (
              <Typography sx={{ fontSize: 12, fontWeight: 700, color: tokens.color.text.primary }}>
                {title}
              </Typography>
            )}
            {eyebrow && !title && <Eyebrow>{eyebrow}</Eyebrow>}
          </Box>
          {action && <Box sx={{ flexShrink: 0 }}>{action}</Box>}
        </Stack>
      )}
      {children}
    </Box>
  </Box>
);
