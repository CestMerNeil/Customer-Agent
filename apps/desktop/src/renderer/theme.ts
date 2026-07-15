import { createTheme, type Theme } from "@mui/material/styles";

/**
 * Design tokens for the flat editorial look (see Customer Agent App.dc.html):
 * white/near-black chrome, ink primary CTAs, a single green accent reserved
 * for status/active-state signalling, hairline borders, flat surfaces, and
 * pill badges. No warm cream tint and no gradient accent band.
 *
 * Light and dark are driven by CSS variables that follow `prefers-color-scheme`,
 * so `tokens` are stable string references and custom chrome adapts with no JS.
 * MUI components adapt via `makeTheme(mode)` built from the same palette values.
 */
type Mode = "light" | "dark";

const palettes = {
  light: {
    surfaceApp: "#fafafa",
    surfaceSidebar: "rgba(255, 255, 255, 0.9)",
    surfaceBase: "#ffffff",
    surfaceSunken: "#f7f7f7",
    surfaceHover: "rgba(10, 10, 10, 0.04)",
    surfaceSelected: "rgba(5, 150, 105, 0.10)",
    surfaceInverse: "#0a0a0a",
    surfaceOnInverse: "#ffffff",
    accent: "#0a0a0a",
    accentHover: "#262626",
    accentSoft: "rgba(10, 10, 10, 0.06)",
    accentSoftHover: "rgba(10, 10, 10, 0.10)",
    onAccent: "#ffffff",
    textPrimary: "#0a0a0a",
    textSecondary: "#737373",
    textTertiary: "#a3a3a3",
    hairline: "#ededed",
    strong: "#c7c7c7",
    controlFill: "rgba(10, 10, 10, 0.06)",
    success: "#059669",
    successSoft: "rgba(5, 150, 105, 0.10)",
    warning: "#b45309",
    warningSoft: "rgba(245, 158, 11, 0.10)",
    error: "#dc2626",
    errorSoft: "rgba(220, 38, 38, 0.10)",
  },
  dark: {
    surfaceApp: "#1a1a1c",
    surfaceSidebar: "rgba(28, 28, 30, 0.9)",
    surfaceBase: "#242426",
    surfaceSunken: "#2c2c2e",
    surfaceHover: "rgba(255, 255, 255, 0.05)",
    surfaceSelected: "rgba(52, 211, 153, 0.20)",
    surfaceInverse: "#f5f3ee",
    surfaceOnInverse: "#1f1f1f",
    accent: "#f5f3ee",
    accentHover: "#d8d5cf",
    accentSoft: "rgba(245, 243, 238, 0.10)",
    accentSoftHover: "rgba(245, 243, 238, 0.16)",
    onAccent: "#0a0a0a",
    textPrimary: "#f5f3ee",
    textSecondary: "rgba(245, 243, 238, 0.62)",
    textTertiary: "rgba(245, 243, 238, 0.36)",
    hairline: "rgba(255, 255, 255, 0.10)",
    strong: "rgba(255, 255, 255, 0.18)",
    controlFill: "rgba(255, 255, 255, 0.10)",
    success: "#34d399",
    successSoft: "rgba(52, 211, 153, 0.20)",
    warning: "#ffa110",
    warningSoft: "rgba(255, 161, 16, 0.20)",
    error: "#f2554b",
    errorSoft: "rgba(242, 85, 75, 0.20)",
  },
} satisfies Record<Mode, Record<string, string>>;

const VAR: Record<string, string> = {
  surfaceApp: "--ca-surface-app",
  surfaceSidebar: "--ca-surface-sidebar",
  surfaceBase: "--ca-surface-base",
  surfaceSunken: "--ca-surface-sunken",
  surfaceHover: "--ca-surface-hover",
  surfaceSelected: "--ca-surface-selected",
  surfaceInverse: "--ca-surface-inverse",
  surfaceOnInverse: "--ca-surface-on-inverse",
  accent: "--ca-accent",
  accentHover: "--ca-accent-hover",
  accentSoft: "--ca-accent-soft",
  accentSoftHover: "--ca-accent-soft-hover",
  onAccent: "--ca-on-accent",
  textPrimary: "--ca-text-primary",
  textSecondary: "--ca-text-secondary",
  textTertiary: "--ca-text-tertiary",
  hairline: "--ca-hairline",
  strong: "--ca-strong",
  controlFill: "--ca-control-fill",
  success: "--ca-success",
  successSoft: "--ca-success-soft",
  warning: "--ca-warning",
  warningSoft: "--ca-warning-soft",
  error: "--ca-error",
  errorSoft: "--ca-error-soft",
};

const v = (key: keyof typeof VAR) => `var(${VAR[key]})`;

/** CSS variable declarations for light + dark, applied via GlobalStyles. */
export const themeCssVariables = {
  ":root": Object.fromEntries(Object.entries(palettes.light).map(([k, val]) => [VAR[k] ?? k, val])),
  "@media (prefers-color-scheme: dark)": {
    ":root": Object.fromEntries(Object.entries(palettes.dark).map(([k, val]) => [VAR[k] ?? k, val])),
  },
  // Shared motion primitives, mirroring the design's .spin / .fade-in keyframes.
  "@keyframes ca-spin": { to: { transform: "rotate(360deg)" } },
  "@keyframes ca-fade-in": {
    from: { opacity: 0, transform: "translateY(-4px)" },
    to: { opacity: 1, transform: "translateY(0)" },
  },
  ".ca-spin": { display: "inline-flex", animation: "ca-spin 1s linear infinite" },
  ".ca-fade-in": { animation: "ca-fade-in .22s ease" },
};

// Manrope (self-hosted, see fonts/fonts.css) for UI/body, matching the design
// spec exactly. CJK fallbacks keep the Chinese UI clean.
const UI_FONT =
  '"Manrope", ui-sans-serif, system-ui, -apple-system, "Segoe UI", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif';
// Space Grotesk (self-hosted) for tabular numeral displays per the design spec.
const DISPLAY_FONT = '"Space Grotesk", ui-monospace, "SF Mono", Menlo, Consolas, monospace';
const MONO_FONT = '"JetBrains Mono", ui-monospace, "SF Mono", Menlo, Consolas, monospace';

export const tokens = {
  color: {
    surface: {
      app: v("surfaceApp"),
      sidebar: v("surfaceSidebar"),
      base: v("surfaceBase"),
      sunken: v("surfaceSunken"),
      hover: v("surfaceHover"),
      selected: v("surfaceSelected"),
      inverse: v("surfaceInverse"),
      onInverse: v("surfaceOnInverse"),
    },
    accent: {
      main: v("accent"),
      hover: v("accentHover"),
      soft: v("accentSoft"),
      softHover: v("accentSoftHover"),
      contrast: v("onAccent"),
    },
    text: {
      primary: v("textPrimary"),
      secondary: v("textSecondary"),
      tertiary: v("textTertiary"),
      onAccent: v("onAccent"),
    },
    border: {
      hairline: v("hairline"),
      strong: v("strong"),
      focus: v("accent"),
    },
    control: { fill: v("controlFill") },
    state: {
      success: v("success"),
      successSoft: v("successSoft"),
      warning: v("warning"),
      warningSoft: v("warningSoft"),
      error: v("error"),
      errorSoft: v("errorSoft"),
      info: v("success"),
    },
  },
  radius: { xs: 4, sm: 6, md: 8, lg: 14, xl: 16, xxl: 20, pill: 999 },
  // Flat editorial system: hairline borders carry definition, shadows stay faint.
  elevation: {
    1: "0 1px 2px rgba(0, 0, 0, 0.04)",
    2: "0 4px 12px rgba(0, 0, 0, 0.04)",
    3: "0 12px 24px rgba(0, 0, 0, 0.08)",
  },
  motion: {
    duration: { fast: "120ms", base: "200ms", slow: "300ms" },
    easing: {
      standard: "cubic-bezier(0.2, 0, 0, 1)",
      emphasized: "cubic-bezier(0.2, 0, 0, 1)",
      exit: "cubic-bezier(0.4, 0, 1, 1)",
    },
  },
  font: { family: UI_FONT, display: DISPLAY_FONT, mono: MONO_FONT },
} as const;

/** Build the MUI theme for a concrete mode (MUI needs real hex for alpha math). */
export function makeTheme(mode: Mode): Theme {
  const p = palettes[mode];
  return createTheme({
    palette: {
      mode,
      primary: { main: p.accent, dark: p.accentHover, contrastText: p.onAccent },
      secondary: { main: p.textPrimary, contrastText: p.surfaceOnInverse },
      error: { main: p.error },
      warning: { main: p.warning },
      success: { main: p.success },
      info: { main: p.success },
      background: { default: p.surfaceApp, paper: p.surfaceBase },
      text: { primary: p.textPrimary, secondary: p.textSecondary },
      divider: p.hairline,
      action: { hover: p.surfaceHover, selected: p.surfaceSelected },
    },
    typography: {
      fontFamily: UI_FONT,
      fontSize: 13,
      // h1/h2 carry the flat editorial voice: heavy weight Inter, no serif face.
      h1: { fontFamily: UI_FONT, fontSize: "2rem", fontWeight: 800, letterSpacing: "-0.02em", lineHeight: 1.1 },
      h2: { fontFamily: UI_FONT, fontSize: "1.6rem", fontWeight: 800, letterSpacing: "-0.02em", lineHeight: 1.15 },
      h3: { fontSize: "1.3rem", fontWeight: 500, letterSpacing: "-0.01em" },
      h4: { fontSize: "1.4rem", fontWeight: 800, letterSpacing: "-0.015em" },
      h5: { fontSize: "1.05rem", fontWeight: 500, letterSpacing: 0 },
      h6: { fontSize: "0.95rem", fontWeight: 600, letterSpacing: 0 },
      subtitle2: { fontWeight: 600, fontSize: "0.85rem" },
      body1: { fontSize: "0.9rem", lineHeight: 1.55 },
      body2: { fontSize: "0.82rem", lineHeight: 1.5 },
      button: { fontWeight: 500, letterSpacing: 0, fontSize: "0.85rem" },
      caption: { fontSize: "0.75rem" },
      overline: {
        letterSpacing: "0.08em",
        fontWeight: 600,
        textTransform: "uppercase",
        fontSize: "0.68rem",
      },
    },
    shape: { borderRadius: tokens.radius.md },
    components: {
      MuiCssBaseline: {
        styleOverrides: {
          body: {
            backgroundColor: p.surfaceApp,
            WebkitFontSmoothing: "antialiased",
            MozOsxFontSmoothing: "grayscale",
          },
          "*::selection": { background: p.accentSoftHover },
        },
      },
      MuiButton: {
        defaultProps: { disableElevation: true, disableRipple: true },
        styleOverrides: {
          root: {
            borderRadius: tokens.radius.md,
            textTransform: "none",
            boxShadow: "none",
            paddingInline: 18,
            minHeight: 34,
            transition: `background-color ${tokens.motion.duration.fast} ${tokens.motion.easing.standard}`,
            "&:hover": { boxShadow: "none" },
          },
          outlined: { borderColor: p.strong },
        },
        variants: [
          {
            props: { variant: "contained", color: "primary" },
            style: { "&:active": { backgroundColor: p.accentHover } },
          },
        ],
      },
      MuiCard: {
        defaultProps: { variant: "outlined" },
        styleOverrides: {
          root: {
            borderRadius: tokens.radius.lg,
            border: `1px solid ${p.hairline}`,
            boxShadow: "none",
            backgroundImage: "none",
            backgroundColor: p.surfaceBase,
          },
        },
      },
      MuiPaper: { styleOverrides: { root: { backgroundImage: "none" } } },
      MuiTextField: { defaultProps: { variant: "outlined", size: "small" } },
      MuiOutlinedInput: { styleOverrides: { root: { borderRadius: tokens.radius.md } } },
      MuiChip: {
        // DESIGN.md badges are pills (rounded.full); buttons are not.
        styleOverrides: {
          root: { borderRadius: tokens.radius.pill, fontWeight: 600, height: 22 },
          sizeSmall: { height: 20 },
        },
      },
      MuiToggleButton: {
        styleOverrides: {
          root: {
            borderRadius: tokens.radius.md,
            textTransform: "none",
            fontWeight: 500,
          },
        },
      },
      MuiSwitch: {
        styleOverrides: {
          root: { padding: 8 },
          track: { borderRadius: 11, opacity: 1, backgroundColor: p.controlFill },
          thumb: { boxShadow: "0 1px 2px rgba(0,0,0,0.2)" },
        },
      },
      MuiTooltip: {
        styleOverrides: {
          tooltip: {
            borderRadius: tokens.radius.sm,
            backgroundColor: p.surfaceInverse,
            color: p.surfaceOnInverse,
            fontSize: "0.72rem",
          },
        },
      },
    },
  });
}
