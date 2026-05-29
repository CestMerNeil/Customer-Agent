import { describe, expect, it } from "vitest";
import { canTransitionMessageState } from "./message-state";

describe("canTransitionMessageState", () => {
  it("allows automatic reply progression", () => {
    expect(canTransitionMessageState("received", "generating")).toBe(true);
    expect(canTransitionMessageState("generating", "sent")).toBe(true);
  });

  it("allows human review progression", () => {
    expect(canTransitionMessageState("generating", "draft_ready")).toBe(true);
    expect(canTransitionMessageState("draft_ready", "sent")).toBe(true);
    expect(canTransitionMessageState("draft_ready", "ignored")).toBe(true);
    expect(canTransitionMessageState("draft_ready", "escalated")).toBe(true);
  });

  it("rejects impossible transitions", () => {
    expect(canTransitionMessageState("received", "sent")).toBe(false);
    expect(canTransitionMessageState("sent", "generating")).toBe(false);
    expect(canTransitionMessageState("ignored", "sent")).toBe(false);
  });
});
