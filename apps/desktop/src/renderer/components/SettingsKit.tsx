import React from "react";
import { Box, Stack, Typography } from "@mui/material";
import { tokens } from "../theme";

/** Small uppercase eyebrow label sitting above a grouped card (Mistral editorial). */
export const SectionLabel: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <Typography
    variant="overline"
    sx={{ display: "block", px: 0.5, mb: 0.75, color: tokens.color.text.tertiary }}
  >
    {children}
  </Typography>
);

/** Labeled form row: label on the left, control on the right, hairline below. */
export const FieldRow: React.FC<{ label: string; children: React.ReactNode; last?: boolean }> = ({
  label,
  children,
  last,
}) => (
  <Stack
    direction={{ xs: "column", sm: "row" }}
    sx={{
      alignItems: { sm: "center" },
      gap: 1.5,
      py: 1.25,
      borderBottom: last ? "none" : `1px solid ${tokens.color.border.hairline}`,
    }}
  >
    <Typography variant="body2" sx={{ color: tokens.color.text.secondary, width: { sm: 132 }, flexShrink: 0 }}>
      {label}
    </Typography>
    <Box sx={{ flexGrow: 1, width: "100%" }}>{children}</Box>
  </Stack>
);

/** Read-only key/value row for status panes. */
export const InfoRow: React.FC<{ label: string; value: React.ReactNode; last?: boolean }> = ({
  label,
  value,
  last,
}) => (
  <Stack
    direction="row"
    sx={{
      justifyContent: "space-between",
      alignItems: "center",
      gap: 2,
      py: 1,
      borderBottom: last ? "none" : `1px solid ${tokens.color.border.hairline}`,
    }}
  >
    <Typography variant="body2" sx={{ color: tokens.color.text.secondary, flexShrink: 0 }}>
      {label}
    </Typography>
    <Box sx={{ textAlign: "right", wordBreak: "break-all" }}>
      {typeof value === "string" ? <Typography variant="body2">{value}</Typography> : value}
    </Box>
  </Stack>
);
