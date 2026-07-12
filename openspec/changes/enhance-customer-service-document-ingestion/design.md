## Context

The desktop main process currently reads UTF-8 text files, sends only the first 6,000 characters to the selected Model Provider, and immediately imports the returned rows. The governed knowledge model already supports pending review, source metadata, and shop scoping, so the change should extend ingestion without creating a second knowledge store.

## Goals / Non-Goals

**Goals:**

- Extract local text from DOCX, XLSX, and PPTX on macOS and Windows.
- Process the full extracted document through bounded sequential Model Provider calls.
- Show all extracted entries and let the operator select what to import.
- Save confirmed entries as draft knowledge with source file metadata.

**Non-Goals:**

- Rendering an Office document with layout fidelity.
- OCR of images embedded in Office files.
- Supporting legacy binary DOC, XLS, or PPT files.
- Introducing embeddings or a separate document storage service.

## Decisions

- Use `officeparser` in the Electron main process for DOCX/XLSX/PPTX text conversion. One dependency covers all requested modern Office formats and keeps file content local.
- Split normalized text on paragraph boundaries with a 6,000-character upper bound. Oversized paragraphs fall back to hard slices. Calls run sequentially so local Model Providers are not overloaded.
- Include segment position in the extraction prompt and merge exact normalized title/content duplicates after all calls.
- Separate extraction from persistence: `knowledge.document.import` returns a preview, while the existing governed import IPC persists only rows the operator confirms.
- Keep confirmed AI rows in `draft` review state and disabled until explicit approval. Store file name, extension, segment count, and ingestion method as source metadata.

## Risks / Trade-offs

- [Large documents can require many model calls] → show segment progress and keep calls sequential.
- [An Office parser may omit embedded images or complex charts] → surface extracted text for operator review; OCR is explicitly out of scope.
- [Different segments may produce overlapping entries] → remove exact normalized duplicates and leave semantic conflicts visible for human review.
- [Model output may be malformed for one segment] → fail that segment visibly instead of silently claiming complete ingestion.
