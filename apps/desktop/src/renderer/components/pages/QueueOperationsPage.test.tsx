import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { CustomerAgentBridge } from "../../../preload/index.cts";
import { QueueOperationsPage } from "./QueueOperationsPage";

function mockBridge() {
  const invoke = vi.fn(async (channel: string) => {
    if (channel === "queue.metrics") {
      return {
        metrics: {
          depth: 0,
          pending: 0,
          retryWaiting: 0,
          processing: 0,
          completed: 0,
          failed: 0,
          deadLetter: 2,
          retryCount: 0,
          failureCount: 2,
          averageProcessingLatencyMs: 0,
        },
      };
    }
    if (channel === "queue.list") return { items: [] };
    if (channel === "dependency.health") return { dependencies: [] };
    if (channel === "queue.retryDeadLetters") return { ok: true, retried: 2 };
    return { ok: true };
  });
  window.customerAgent = { invoke } as unknown as CustomerAgentBridge;
  return invoke;
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("QueueOperationsPage", () => {
  it("lets an operator retry dead-letter queue items", async () => {
    const invoke = mockBridge();
    render(<QueueOperationsPage />);

    fireEvent.click(await screen.findByRole("button", { name: "重试处理失败" }));

    await waitFor(() => expect(invoke).toHaveBeenCalledWith("queue.retryDeadLetters", undefined));
    expect(invoke.mock.calls.filter(([channel]) => channel === "queue.metrics").length).toBeGreaterThan(1);
    expect(invoke.mock.calls.filter(([channel]) => channel === "queue.list").length).toBeGreaterThan(1);
    expect(invoke.mock.calls.filter(([channel]) => channel === "dependency.health").length).toBeGreaterThan(1);
  });
});
