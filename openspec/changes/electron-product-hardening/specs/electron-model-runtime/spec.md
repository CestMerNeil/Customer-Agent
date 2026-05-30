## ADDED Requirements

### Requirement: Managed vLLM lifecycle
The Electron app SHALL provide a manager for starting, stopping, and checking a local vLLM OpenAI-compatible server.

#### Scenario: vLLM starts with configured model path
- **WHEN** a model config contains a local model path and vLLM command
- **THEN** the manager starts a process and reports running health state

### Requirement: ModelScope cache management
The Electron app SHALL provide a manager that downloads or locates ModelScope models in a local cache path.

#### Scenario: ModelScope model is requested
- **WHEN** the user configures a ModelScope model id
- **THEN** the manager resolves a local cache path or runs a ModelScope download command
