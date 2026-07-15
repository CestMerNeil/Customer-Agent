## ADDED Requirements

### Requirement: Tool-free loop-limit finalization
The Agent workflow SHALL request a direct final reply with no callable tools after it reaches its configured tool-loop limit.

#### Scenario: Last permitted turn requests a tool
- **WHEN** the last permitted Agent iteration returns one or more tool calls
- **THEN** the workflow executes those calls and sends their outputs to one final model request with an empty tool list
- **AND** the workflow returns the final reply without executing any tool calls from that final request

### Requirement: Loop-limit evidence is preserved
The Agent workflow SHALL preserve gathered citations and prior tool outputs when it creates a tool-free loop-limit final reply.

#### Scenario: A successful tool returned citations before the limit
- **WHEN** the workflow reaches its loop limit after a successful cited tool result
- **THEN** the final workflow event contains the gathered citation set
- **AND** the final reply follows the existing automatic or review action mode
