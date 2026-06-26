export type ReplyMode = "automatic";

export type ReplyAction = "send" | "review" | "escalate" | "fallback";

export interface KnowledgeSourceReference {
  scope: "global" | "shop";
  documentId: string;
  chunkId: string;
  score: number;
}

export interface GeneratedReply {
  text: string;
  action: ReplyAction;
  sources: KnowledgeSourceReference[];
  answerable: boolean;
  createdAt: string;
}
