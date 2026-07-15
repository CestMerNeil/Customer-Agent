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
    if (channel === "app.update.status") {
      return { state: "idle", version: "1.0.3", enabled: true };
    }
    if (channel === "app.update.check") {
      return { state: "downloaded", version: "1.0.3", latestVersion: "1.0.4", enabled: true };
    }
    return { ok: true };
  });
  window.customerAgent = { invoke, on: vi.fn(() => vi.fn()) } as unknown as CustomerAgentBridge;
  return invoke;
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("SettingsPage", () => {
  it("saves business hours without a handoff or reply-mode field", async () => {
    const invoke = mockBridge();
    render(<SettingsPage />);

    // Wait for settings.get to populate business hours before saving.
    await screen.findByDisplayValue("08:00");
    expect(await screen.findByText("v1.0.3")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /保存设置/ }));

    await waitFor(() => {
      expect(invoke).toHaveBeenCalledWith("settings.save", {
        businessHours: { start: "08:00", end: "23:00" },
      });
    });
  });

  it("allows Windows users to manually check for updates", async () => {
    const invoke = mockBridge();
    render(<SettingsPage />);

    fireEvent.click(await screen.findByRole("button", { name: /检查更新/ }));

    await waitFor(() => {
      expect(invoke).toHaveBeenCalledWith("app.update.check", undefined);
    });

    fireEvent.click(await screen.findByRole("button", { name: /重启安装/ }));
    expect(invoke).toHaveBeenCalledWith("app.update.install", undefined);
  });
});
