## ADDED Requirements

### Requirement: Modern Office document support
The desktop application SHALL extract customer-service source text locally from DOCX, XLSX, and PPTX files as well as the existing TXT, Markdown, and JSON formats.

#### Scenario: Operator selects a supported Office document
- **WHEN** an operator selects a DOCX, XLSX, or PPTX file
- **THEN** the main process extracts its textual content without uploading the original file to another service

#### Scenario: Word extraction fails
- **WHEN** a selected DOCX cannot be read or contains no extractable text
- **THEN** the UI identifies the file-reading stage separately from Model Provider extraction and shows a useful error

### Requirement: Complete segmented model extraction
The system SHALL divide long extracted text into bounded segments and invoke the selected Model Provider for every non-empty segment.

#### Scenario: Document exceeds one segment
- **WHEN** extracted document text exceeds the configured segment size
- **THEN** all segments are processed and the preview reports segment progress and combined deduplicated entries

#### Scenario: A segment cannot be processed
- **WHEN** the Model Provider returns no valid entries or fails for a segment
- **THEN** the operation reports the failed segment and does not claim complete extraction

### Requirement: Extraction preview and confirmation
The application SHALL show extracted knowledge titles, contents, tags, selection state, and source summary before persistence.

#### Scenario: Extraction succeeds
- **WHEN** all document segments have been processed
- **THEN** the operator can inspect, select, and confirm individual entries or cancel without saving them

#### Scenario: Operator confirms selected entries
- **WHEN** the operator confirms one or more preview entries
- **THEN** only selected entries are saved as disabled draft customer-service knowledge with source file metadata

### Requirement: Honest governance state
The customer-service knowledge UI SHALL display review state separately from enabled state.

#### Scenario: Imported entry awaits review
- **WHEN** a confirmed document entry is stored as draft
- **THEN** the UI shows it as pending review and not available to the Agent

### Requirement: Usable knowledge record actions
The customer-service knowledge list SHALL present compact readable rows with explicit detail and delete actions.

#### Scenario: Operator views knowledge details
- **WHEN** the operator selects the explicit view-details action
- **THEN** a dedicated dialog shows the full title, content, tags, source, review state, and Agent availability

#### Scenario: Operator deletes knowledge
- **WHEN** the operator confirms deletion of a customer-service knowledge record
- **THEN** all versions for its citation ID are deleted and the list refreshes
