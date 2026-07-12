## 1. Document extraction

- [x] 1.1 Add the Office document parser dependency and support DOCX, XLSX, and PPTX file selection and text extraction
- [x] 1.2 Replace head-only truncation with deterministic paragraph-aware segmentation and sequential Model Provider extraction
- [x] 1.3 Add focused tests for segmentation, prompt safety, and cross-segment deduplication

## 2. Preview and governance

- [x] 2.1 Extend typed IPC so document extraction returns preview entries and progress without immediate persistence
- [x] 2.2 Build the extraction preview UI with content, tags, selection, confirmation, cancellation, and progress
- [x] 2.3 Persist confirmed entries as disabled drafts with source metadata and show honest review/enabled state

## 3. Verification

- [x] 3.1 Run targeted unit, renderer, typecheck, and build verification
- [x] 3.2 Start the local desktop development app for operator testing

## 4. Operator-reported fixes

- [x] 4.1 Reproduce DOCX extraction and route Word files through a dedicated parser with stage-specific errors
- [x] 4.2 Add an explicit knowledge delete action with confirmation and list refresh
- [x] 4.3 Replace inline small content with an explicit view-details button and readable detail dialog
- [x] 4.4 Add regression tests, run targeted verification, and restart the local desktop app

## 5. Model Provider extraction compatibility

- [x] 5.1 Route document knowledge extraction through the unified Responses interface
- [x] 5.2 Accept common JSON wrappers and Chinese fields, retry malformed output once, and expose segment failures
- [x] 5.3 Run regression verification and restart the local desktop app
- [x] 5.4 Use the existing document-local structured JSON chat path, disable thinking output, and reduce segment size
- [x] 5.5 Restart the local desktop app for exact-document retesting
