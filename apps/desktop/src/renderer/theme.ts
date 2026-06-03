import { createTheme } from "@mui/material/styles";

const theme = createTheme({
  palette: {
    mode: "light",
    primary: {
      main: "#0d5f5a",
      contrastText: "#ffffff",
    },
    secondary: {
      main: "#263238",
      contrastText: "#ffffff",
    },
    error: {
      main: "#b3261e",
    },
    warning: {
      main: "#b36b00",
    },
    success: {
      main: "#147d4f",
    },
    background: {
      default: "#f3f5f1",
      paper: "#ffffff",
    },
    text: {
      primary: "#18201f",
      secondary: "#66736f",
    },
    divider: "rgba(24, 32, 31, 0.12)",
    action: {
      hover: "rgba(13, 95, 90, 0.08)",
      selected: "rgba(13, 95, 90, 0.14)",
    },
  },
  typography: {
    fontFamily: '"Avenir Next", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif',
    h1: { fontSize: "2.6rem", fontWeight: 700, letterSpacing: 0 },
    h2: { fontSize: "2rem", fontWeight: 700, letterSpacing: 0 },
    h3: { fontSize: "1.55rem", fontWeight: 700, letterSpacing: 0 },
    h4: { fontSize: "1.6rem", fontWeight: 700, letterSpacing: 0 },
    h5: { fontSize: "1.25rem", fontWeight: 700, letterSpacing: 0 },
    h6: { fontSize: "1rem", fontWeight: 700, letterSpacing: 0 },
    button: { fontWeight: 700, letterSpacing: 0 },
    overline: { letterSpacing: 0, fontWeight: 800, textTransform: "uppercase" },
  },
  shape: {
    borderRadius: 6,
  },
  components: {
    MuiCssBaseline: {
      styleOverrides: {
        body: {
          background:
            "radial-gradient(circle at 18% 8%, rgba(13, 95, 90, 0.10), transparent 26%), radial-gradient(circle at 82% 2%, rgba(179, 107, 0, 0.12), transparent 22%), #f3f5f1",
        },
        "*::selection": {
          background: "rgba(13, 95, 90, 0.22)",
        },
      },
    },
    MuiButton: {
      styleOverrides: {
        root: {
          borderRadius: 6,
          textTransform: "none",
          boxShadow: "none",
          "&:hover": {
            boxShadow: "none",
          },
        },
      },
    },
    MuiCard: {
      styleOverrides: {
        root: {
          borderRadius: 8,
          elevation: 0,
          border: "1px solid rgba(24, 32, 31, 0.12)",
          boxShadow: "0 18px 45px rgba(24, 32, 31, 0.06)",
        },
      },
    },
    MuiPaper: {
      styleOverrides: {
        root: {
          backgroundImage: "none",
        },
      },
    },
    MuiTextField: {
      defaultProps: {
        variant: "outlined",
      },
    },
  },
});

export default theme;
