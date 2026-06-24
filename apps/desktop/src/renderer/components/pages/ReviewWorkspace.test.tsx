import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ReviewWorkspace } from "./ReviewWorkspace";
import type { CustomerAgentBridge } from "../../../preload/index.cts";

const draft = {
  id: "d1",
  messageId: "m1",
  accountId: "a1",
  shopId: "s1",
  mode: "human_review" as const,
  state: "draft_ready" as const,
  createdAt: "2026-06-01T00:00:00.000Z",
  updatedAt: "2026-06-01T00:00:00.000Z",
  reply: { text: "原始草稿", action: "review" as const, answerable: true, sources: [], createdAt: "2026-06-01T00:00:00.000Z" },
};

const message = {
  id: "m1",
  channel: "pinduoduo" as const,
  type: "text" as const,
  content: "请问有货吗",
  shopId: "s1",
  accountId: "a1",
  buyerId: "b1",
  buyerNickname: "小明",
  receivedAt: "2026-06-01T00:00:00.000Z",
  state: "received" as const,
  updatedAt: "2026-06-01T00:00:00.000Z",
};

function mockBridge(overrides: Record<string, unknown> = {}, drafts = [draft]) {
  const invoke = vi.fn(async (channel: string) => {
    if (channel === "reply.draft.list") return { drafts };
    if (channel === "message.list") return { messages: [message] };
    if (channel in overrides) return overrides[channel];
    return { ok: true };
  });
  window.customerAgent = { invoke } as unknown as CustomerAgentBridge;
  return invoke;
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("ReviewWorkspace", () => {
  it("shows an empty state when there are no pending drafts", async () => {
    mockBridge({}, []);
    render(<ReviewWorkspace />);
    expect(await screen.findByText("没有待审核草稿")).toBeInTheDocument();
  });

  it("renders the selected draft context: buyer, message, and editable text", async () => {
    mockBridge();
    render(<ReviewWorkspace />);
    expect(await screen.findByText("请问有货吗")).toBeInTheDocument();
    expect(screen.getAllByText("小明").length).toBeGreaterThan(0);
    expect(await screen.findByDisplayValue("原始草稿")).toBeInTheDocument();
  });

  it("sends the edited draft text", async () => {
    const invoke = mockBridge();
    render(<ReviewWorkspace />);
    const editor = await screen.findByRole("textbox");
    fireEvent.change(editor, { target: { value: "已确认有货，可拍" } });
    fireEvent.click(screen.getByRole("button", { name: /发送回复/ }));
    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith("reply.draft.send", { draftId: "d1", text: "已确认有货，可拍" }),
    );
  });

  it("ignores a draft", async () => {
    const invoke = mockBridge();
    render(<ReviewWorkspace />);
    await screen.findByRole("textbox");
    fireEvent.click(screen.getByRole("button", { name: /忽略/ }));
    await waitFor(() => expect(invoke).toHaveBeenCalledWith("reply.draft.ignore", { draftId: "d1" }));
  });

  it("escalates a draft", async () => {
    const invoke = mockBridge();
    render(<ReviewWorkspace />);
    await screen.findByRole("textbox");
    fireEvent.click(screen.getByRole("button", { name: /升级人工/ }));
    await waitFor(() => expect(invoke).toHaveBeenCalledWith("reply.draft.escalate", { draftId: "d1" }));
  });

  it("surfaces an action error and preserves edited text on failure", async () => {
    mockBridge({ "reply.draft.send": { ok: false, error: "发送失败" } });
    render(<ReviewWorkspace />);
    const editor = await screen.findByRole("textbox");
    fireEvent.change(editor, { target: { value: "编辑中的文本" } });
    fireEvent.click(screen.getByRole("button", { name: /发送回复/ }));
    expect(await screen.findByText("发送失败")).toBeInTheDocument();
    expect(screen.getByRole("textbox")).toHaveValue("编辑中的文本");
  });
});
