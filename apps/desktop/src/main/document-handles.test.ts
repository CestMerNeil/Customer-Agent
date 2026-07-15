import { describe, expect, it } from "vitest";
import { DocumentHandles } from "./document-handles.js";

/** Creates a deterministic registry for document-handle security tests. */
function createRegistry(now: () => number): DocumentHandles {
  return new DocumentHandles(100, now, () => "document-handle-1");
}

describe("DocumentHandles", () => {
  it("exposes only an opaque id and basename, and never resolves a forged id", () => {
    const handles = createRegistry(() => 0);

    expect(handles.issue("/private/customer/policy.docx")).toEqual({
      documentId: "document-handle-1",
      basename: "policy.docx",
    });
    expect(handles.consume("forged-document-id")).toBeUndefined();
  });

  it("consumes a valid handle exactly once", () => {
    const handles = createRegistry(() => 0);
    const { documentId } = handles.issue("/private/customer/policy.docx");

    expect(handles.consume(documentId)).toEqual({
      filePath: "/private/customer/policy.docx",
      basename: "policy.docx",
    });
    expect(handles.consume(documentId)).toBeUndefined();
  });

  it("never resolves an expired handle", () => {
    let now = 0;
    const handles = createRegistry(() => now);
    const { documentId } = handles.issue("/private/customer/policy.docx");

    now = 100;
    expect(handles.consume(documentId)).toBeUndefined();
  });
});
