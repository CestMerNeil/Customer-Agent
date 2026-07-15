import { randomUUID } from "node:crypto";
import path from "node:path";

/** Default lifetime for an unconsumed document selection. */
const DOCUMENT_HANDLE_TTL_MS = 10 * 60_000;

/** Keeps selected document paths inside the main process behind one-time opaque identifiers. */
export class DocumentHandles {
  private readonly handles = new Map<string, { filePath: string; basename: string; expiresAt: number }>();

  /**
   * Creates a document handle registry.
   *
   * @param ttlMs Maximum time a handle remains valid.
   * @param now Clock used to determine expiration.
   * @param createId Opaque identifier generator.
   */
  constructor(
    private readonly ttlMs = DOCUMENT_HANDLE_TTL_MS,
    private readonly now: () => number = Date.now,
    private readonly createId: () => string = randomUUID,
  ) {}

  /**
   * Stores a selected path and returns only renderer-safe metadata.
   *
   * @param filePath Main-process-only path selected by Electron.
   * @returns An opaque document identifier and display-safe basename.
   */
  issue(filePath: string): { documentId: string; basename: string } {
    const now = this.now();
    for (const [documentId, handle] of this.handles) {
      if (handle.expiresAt <= now) this.handles.delete(documentId);
    }
    const documentId = this.createId();
    const basename = path.basename(filePath);
    this.handles.set(documentId, { filePath, basename, expiresAt: now + this.ttlMs });
    return { documentId, basename };
  }

  /**
   * Resolves and permanently consumes a valid document handle.
   *
   * @param documentId Opaque identifier previously issued by this registry.
   * @returns The main-only path and safe basename, or undefined for unknown, expired, or reused identifiers.
   */
  consume(documentId: string): { filePath: string; basename: string } | undefined {
    if (typeof documentId !== "string") return undefined;
    const handle = this.handles.get(documentId);
    this.handles.delete(documentId);
    return handle && handle.expiresAt > this.now()
      ? { filePath: handle.filePath, basename: handle.basename }
      : undefined;
  }

  /** Clears all unconsumed document handles during application shutdown. */
  clear(): void {
    this.handles.clear();
  }
}
