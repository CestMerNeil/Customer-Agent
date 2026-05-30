## ADDED Requirements

### Requirement: SQLite app state
The Electron app SHALL persist accounts, messages, drafts, knowledge metadata, settings, and logs in a local SQLite database.

#### Scenario: App state survives restart
- **WHEN** an account and message are written and the store is reopened
- **THEN** the same account and message are available from SQLite-backed repositories

### Requirement: Drizzle schema contract
The Electron app SHALL define Drizzle table schemas for production persisted entities.

#### Scenario: Schema is available to implementation
- **WHEN** the database package is imported
- **THEN** account, message, draft, settings, knowledge document, and log table definitions are exported

### Requirement: Encrypted session secrets
The Electron app SHALL encrypt cookies and tokens before writing them to persistent storage.

#### Scenario: Account cookies are stored encrypted
- **WHEN** an account is saved with cookies
- **THEN** the database file does not contain the plaintext cookie JSON and repository reads decrypt the cookies for runtime use
