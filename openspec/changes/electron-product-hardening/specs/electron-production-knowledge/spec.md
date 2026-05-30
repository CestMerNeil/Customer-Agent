## ADDED Requirements

### Requirement: LanceDB vector index
The Electron app SHALL store knowledge chunks and embeddings in a local LanceDB table.

#### Scenario: Document retrieval uses LanceDB
- **WHEN** a document is imported and a related query is searched
- **THEN** the search returns ranked chunks from the LanceDB table

### Requirement: Knowledge metadata remains queryable
The Electron app SHALL persist document metadata separately from vector chunks.

#### Scenario: Imported documents are listed
- **WHEN** a document is imported into LanceDB
- **THEN** the document appears in the knowledge document list with scope, path, chunk count, and indexed timestamp
