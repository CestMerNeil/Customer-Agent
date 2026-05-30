## ADDED Requirements

### Requirement: LangChain reply workflow
The Electron app SHALL generate customer-service replies through a LangChain.js workflow.

#### Scenario: Reply uses retrieved knowledge
- **WHEN** a customer message and retrieved knowledge chunks are provided
- **THEN** the LangChain workflow sends a grounded prompt to the configured model and returns text, action, answerability, and source references
