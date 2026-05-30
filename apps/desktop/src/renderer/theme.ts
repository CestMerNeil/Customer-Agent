import { createTheme } from "@mui/material/styles";

// Material Design 3 (M3) palette tokens (approximate)
// In a real app, these could be generated from a seed color using @material/material-color-utilities
const theme = createTheme({
  palette: {
    primary: {
      main: "#005ac1", // M3 Primary
      contrastText: "#ffffff",
    },
    secondary: {
      main: "#575e71", // M3 Secondary
      contrastText: "#ffffff",
    },
    error: {
      main: "#ba1a1a", // M3 Error
    },
    background: {
      default: "#fdfbff", // M3 Surface
      paper: "#fdfbff",
    },
  },
  typography: {
    fontFamily: '"Roboto", "Segoe UI", "Arial", sans-serif',
    h1: { fontSize: "2.5rem", fontWeight: 400 },
    h2: { fontSize: "2rem", fontWeight: 400 },
    h3: { fontSize: "1.5rem", fontWeight: 400 },
  },
  shape: {
    borderRadius: 16, // M3 uses large border radius
  },
  components: {
    MuiButton: {
      styleOverrides: {
        root: {
          borderRadius: 20, // Fully rounded buttons
          textTransform: "none",
        },
      },
    },
    MuiCard: {
      styleOverrides: {
        root: {
          borderRadius: 12,
          elevation: 0,
          border: "1px solid #d8dee9",
        },
      },
    },
  },
});

export default theme;
