## Why

Customer-service document ingestion currently accepts only plain text formats, truncates after 6,000 characters, and saves extracted entries without showing operators what the model produced. Merchants need Office document support, complete long-document coverage, and an explicit review step before knowledge enters governance.

## What Changes

- Read customer-service source content from Word, Excel, and PowerPoint files in addition to existing text formats.
- Split long documents into bounded segments, call the selected Model Provider for every segment, and merge exact duplicate entries.
- Return extracted entries to the renderer as a preview instead of importing them immediately.
- Let operators inspect, select, and confirm extracted entries before saving them as pending governed knowledge.
- Preserve source file metadata on imported knowledge records.

## Capabilities

### New Capabilities

- `customer-service-document-ingestion`: Office document extraction, segmented Model Provider processing, preview, and confirmation into governed customer-service knowledge.

### Modified Capabilities

None.

## Impact

- Desktop main-process document readers and IPC contracts.
- Customer-service knowledge governance UI and tests.
- Governed knowledge import source metadata.
- Desktop package dependencies for Office document parsing.
