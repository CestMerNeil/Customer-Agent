import { createTheme, type Theme } from "@mui/material/styles";

/**
 * Design tokens for a macOS-native look (System Settings / Finder / Mail):
 * translucent grouped sidebar, inset grouped lists, segmented controls,
 * SF typography, hairline separators, system accent blue.
 *
 * Light and dark are driven by CSS variables that follow `prefers-color-scheme`,
 * so `tokens` are stable string references and custom chrome adapts with no JS.
 * MUI components adapt via `makeTheme(mode)` built from the same palette values.
 */
type Mode = "light" | "dark";

const palettes = {
  light: {
    surfaceApp: "#f5f5f7",
    surfaceSidebar: "rgba(246, 246, 248, 0.72)",
    surfaceBase: "#ffffff",
    surfaceSunken: "#f0f0f3",
    surfaceHover: "rgba(0, 0, 0, 0.04)",
    surfaceSelected: "rgba(0, 0, 0, 0.06)",
    surfaceInverse: "#1d1d1f",
    surfaceOnInverse: "#f5f5f7",
    accent: "#007aff",
    accentHover: "#0a6cf0",
    accentSoft: "rgba(0, 122, 255, 0.12)",
    accentSoftHover: "rgba(0, 122, 255, 0.18)",
    onAccent: "#ffffff",
    textPrimary: "#1d1d1f",
    textSecondary: "rgba(60, 60, 67, 0.6)",
    textTertiary: "rgba(60, 60, 67, 0.3)",
    hairline: "rgba(0, 0, 0, 0.1)",
    strong: "rgba(0, 0, 0, 0.18)",
    controlFill: "rgba(120, 120, 128, 0.12)",
    success: "#34c759",
    successSoft: "rgba(52, 199, 89, 0.16)",
    warning: "#ff9500",
    warningSoft: "rgba(255, 149, 0, 0.16)",
    error: "#ff3b30",
    errorSoft: "rgba(255, 59, 48, 0.16)",
  },
  dark: {
    surfaceApp: "#1c1c1e",
    surfaceSidebar: "rgba(40, 40, 42, 0.72)",
    surfaceBase: "#2c2c2e",
    surfaceSunken: "#3a3a3c",
    surfaceHover: "rgba(255, 255, 255, 0.06)",
    surfaceSelected: "rgba(255, 255, 255, 0.1)",
    surfaceInverse: "#f5f5f7",
    surfaceOnInverse: "#1d1d1f",
    accent: "#0a84ff",
    accentHover: "#3a9bff",
    accentSoft: "rgba(10, 132, 255, 0.22)",
    accentSoftHover: "rgba(10, 132, 255, 0.3)",
    onAccent: "#ffffff",
    textPrimary: "#f5f5f7",
    textSecondary: "rgba(235, 235, 245, 0.6)",
    textTertiary: "rgba(235, 235, 245, 0.3)",
    hairline: "rgba(255, 255, 255, 0.12)",
    strong: "rgba(255, 255, 255, 0.2)",
    controlFill: "rgba(120, 120, 128, 0.28)",
    success: "#30d158",
    successSoft: "rgba(48, 209, 88, 0.2)",
    warning: "#ff9f0a",
    warningSoft: "rgba(255, 159, 10, 0.2)",
    error: "#ff453a",
    errorSoft: "rgba(255, 69, 58, 0.2)",
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
};

const SF_FONT =
  '-apple-system, BlinkMacSystemFont, "SF Pro Text", "SF Pro Display", "Helvetica Neue", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", system-ui, sans-serif';

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
      info: v("accent"),
    },
  },
  radius: { sm: 6, md: 8, lg: 10, xl: 14, pill: 999 },
  // macOS leans on borders and material, not heavy shadows.
  elevation: {
    1: "0 0.5px 1px rgba(0, 0, 0, 0.04)",
    2: "0 4px 16px rgba(0, 0, 0, 0.12)",
    3: "0 12px 32px rgba(0, 0, 0, 0.18)",
  },
  motion: {
    duration: { fast: "120ms", base: "200ms", slow: "300ms" },
    easing: {
      standard: "cubic-bezier(0.2, 0, 0, 1)",
      emphasized: "cubic-bezier(0.2, 0, 0, 1)",
      exit: "cubic-bezier(0.4, 0, 1, 1)",
    },
  },
  font: { family: SF_FONT },
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
      info: { main: p.accent },
      background: { default: p.surfaceApp, paper: p.surfaceBase },
      text: { primary: p.textPrimary, secondary: p.textSecondary },
      divider: p.hairline,
      action: { hover: p.surfaceHover, selected: p.surfaceSelected },
    },
    typography: {
      fontFamily: SF_FONT,
      fontSize: 13,
      h1: { fontSize: "1.75rem", fontWeight: 600, letterSpacing: "-0.02em" },
      h2: { fontSize: "1.5rem", fontWeight: 600, letterSpacing: "-0.02em" },
      h3: { fontSize: "1.3rem", fontWeight: 600, letterSpacing: "-0.015em" },
      h4: { fontSize: "1.5rem", fontWeight: 600, letterSpacing: "-0.018em" },
      h5: { fontSize: "1.1rem", fontWeight: 600, letterSpacing: "-0.01em" },
      h6: { fontSize: "0.95rem", fontWeight: 600, letterSpacing: 0 },
      subtitle2: { fontWeight: 600, fontSize: "0.85rem" },
      body1: { fontSize: "0.9rem" },
      body2: { fontSize: "0.82rem" },
      button: { fontWeight: 500, letterSpacing: 0, fontSize: "0.85rem" },
      caption: { fontSize: "0.75rem" },
      overline: {
        letterSpacing: "0.04em",
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
            borderRadius: tokens.radius.sm,
            textTransform: "none",
            boxShadow: "none",
            paddingInline: 14,
            minHeight: 30,
            transition: `background-color ${tokens.motion.duration.fast} ${tokens.motion.easing.standard}`,
            "&:hover": { boxShadow: "none" },
          },
        },
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
      MuiOutlinedInput: { styleOverrides: { root: { borderRadius: tokens.radius.sm } } },
      MuiChip: {
        styleOverrides: {
          root: { borderRadius: tokens.radius.sm, fontWeight: 500, height: 22 },
          sizeSmall: { height: 20 },
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
