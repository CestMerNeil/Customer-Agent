import { StrictMode, useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { ThemeProvider } from "@mui/material/styles";
import CssBaseline from "@mui/material/CssBaseline";
import GlobalStyles from "@mui/material/GlobalStyles";
import { makeTheme, themeCssVariables } from "./theme";
import { App } from "./App";

import "material-symbols/outlined.css";

function useSystemMode(): "light" | "dark" {
  const [mode, setMode] = useState<"light" | "dark">(() =>
    typeof window !== "undefined" && window.matchMedia?.("(prefers-color-scheme: dark)").matches
      ? "dark"
      : "light",
  );

  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = (event: MediaQueryListEvent) => setMode(event.matches ? "dark" : "light");
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, []);

  return mode;
}

function Root() {
  const mode = useSystemMode();
  const theme = useMemo(() => makeTheme(mode), [mode]);

  return (
    <ThemeProvider theme={theme}>
      <GlobalStyles styles={themeCssVariables} />
      <CssBaseline />
      <App />
    </ThemeProvider>
  );
}

const root = document.getElementById("root");

if (!root) {
  throw new Error("Renderer root element was not found");
}

createRoot(root).render(
  <StrictMode>
    <Root />
  </StrictMode>,
);
