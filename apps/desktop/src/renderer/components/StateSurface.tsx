import React from "react";
import { Alert, Box, Button, CircularProgress, Stack, Typography } from "@mui/material";
import { tokens } from "../theme";

interface AsyncLike<T> {
  data: T | null;
  error: string | null;
  loading: boolean;
  refresh: () => void | Promise<void>;
}

interface StateSurfaceProps<T> {
  state: AsyncLike<T>;
  /** Returns true when the resolved data should render the empty guidance. */
  isEmpty?: (data: T) => boolean;
  loadingLabel?: string;
  emptyTitle?: string;
  emptyHint?: string;
  /** Minimum height so loading/empty states don't collapse the layout. */
  minHeight?: number;
  children: (data: T) => React.ReactNode;
}

/**
 * Shared loading / error / empty / populated contract for every page read.
 * Replaces scattered per-page ternaries so no error path is silently dropped.
 */
export function StateSurface<T>({
  state,
  isEmpty,
  loadingLabel = "正在加载…",
  emptyTitle = "暂无数据",
  emptyHint,
  minHeight = 160,
  children,
}: StateSurfaceProps<T>): React.ReactElement {
  const center = {
    minHeight,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    textAlign: "center" as const,
    px: 3,
  };

  if (state.loading && state.data === null) {
    return (
      <Box sx={center} role="status" aria-live="polite">
        <Stack spacing={1.5} sx={{ alignItems: "center" }}>
          <CircularProgress size={22} thickness={5} />
          <Typography variant="body2" color="text.secondary">
            {loadingLabel}
          </Typography>
        </Stack>
      </Box>
    );
  }

  if (state.error) {
    return (
      <Box sx={center}>
        <Alert
          severity="error"
          variant="outlined"
          sx={{ borderRadius: `${tokens.radius.md}px`, alignItems: "center" }}
          action={
            <Button color="inherit" size="small" onClick={() => void state.refresh()}>
              重试
            </Button>
          }
        >
          {state.error}
        </Alert>
      </Box>
    );
  }

  if (state.data === null || (isEmpty?.(state.data) ?? false)) {
    return (
      <Box sx={center}>
        <Stack spacing={1} sx={{ alignItems: "center", maxWidth: 360 }}>
          <Box
            aria-hidden
            sx={{
              width: 44,
              height: 44,
              borderRadius: `${tokens.radius.md}px`,
              bgcolor: tokens.color.surface.sunken,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: tokens.color.text.tertiary,
            }}
          >
            <span className="material-symbols-outlined">inbox</span>
          </Box>
          <Typography variant="subtitle2">{emptyTitle}</Typography>
          {emptyHint && (
            <Typography variant="body2" color="text.secondary">
              {emptyHint}
            </Typography>
          )}
        </Stack>
      </Box>
    );
  }

  return <>{children(state.data)}</>;
}
