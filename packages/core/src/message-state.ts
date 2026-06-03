export type MessageState =
  | "received"
  | "generating"
  | "draft_ready"
  | "sent"
  | "failed"
  | "ignored"
  | "escalated";

const allowedTransitions: Record<MessageState, readonly MessageState[]> = {
  received: ["generating", "ignored", "escalated", "sent"],
  generating: ["draft_ready", "sent", "failed"],
  draft_ready: ["sent", "ignored", "escalated", "failed"],
  sent: [],
  failed: ["generating", "sent", "ignored", "escalated"],
  ignored: [],
  escalated: []
};

export function canTransitionMessageState(from: MessageState, to: MessageState): boolean {
  return allowedTransitions[from].includes(to);
}
