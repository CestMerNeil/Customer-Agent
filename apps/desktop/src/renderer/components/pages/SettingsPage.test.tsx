import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SettingsPage } from "./SettingsPage";
import type { CustomerAgentBridge } from "../../../preload/index.cts";

function mockBridge() {
  const invoke = vi.fn(async (channel: string, request?: unknown) => {
    if (channel === "settings.get") {
      return {
        settings: {
          businessHours: { start: "08:00", end: "23:00" },
        },
      };
    }
    if (channel === "settings.save") {
      return { ok: true, request };
    }
    return { ok: true };
  });
  window.customerAgent = { invoke } as unknown as CustomerAgentBridge;
  return invoke;
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("SettingsPage", () => {
  it("saves business hours and handoff rules without a reply-mode field", async () => {
    const invoke = mockBridge();
    render(<SettingsPage />);

    // Wait for settings.get to populate business hours before saving.
    await screen.findByDisplayValue("08:00");
    fireEvent.click(screen.getByRole("button", { name: /保存设置/ }));

    await waitFor(() => {
      expect(invoke).toHaveBeenCalledWith("settings.save", {
        businessHours: { start: "08:00", end: "23:00" },
        handoff: { keywords: [], intentRules: [] },
      });
    });
  });
});
