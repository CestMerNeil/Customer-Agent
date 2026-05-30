## ADDED Requirements

### Requirement: Pinduoduo account login
The Electron app SHALL allow a user to start a Pinduoduo login flow through Node Playwright and persist the resulting account session after the merchant backend is reached.

#### Scenario: Manual-assisted login succeeds
- **WHEN** the user submits a Pinduoduo username and optional password and completes any manual captcha, QR, or risk check in the Playwright window
- **THEN** the system persists an account record with channel `pinduoduo`, shop id, shop name, user id, username, online-capable cookies, and status `online`

#### Scenario: Login does not reach merchant backend
- **WHEN** the login browser does not reach a recognized Pinduoduo merchant backend page before timeout
- **THEN** the system returns a failed login result, records an error log, and does not create an online account

### Requirement: Pinduoduo account WebSocket lifecycle
The Electron app SHALL start and stop a live Pinduoduo WebSocket connection for a persisted account using a chat token derived from that account session.

#### Scenario: Account starts successfully
- **WHEN** the user starts an account with valid cookies and token retrieval succeeds
- **THEN** the system opens the Pinduoduo WebSocket, marks the account `online`, and records a connection log

#### Scenario: Account stop closes connection
- **WHEN** the user stops a started account
- **THEN** the system closes the WebSocket, removes the active runtime connection, marks the account `offline`, and does not reconnect automatically

#### Scenario: Token retrieval fails
- **WHEN** token retrieval fails because the account session is invalid or expired
- **THEN** the system marks the account `error`, records the failure reason, and does not open a WebSocket

### Requirement: Incoming Pinduoduo messages
The Electron app SHALL normalize incoming Pinduoduo WebSocket payloads into shared customer-service message records.

#### Scenario: Incoming text message is persisted
- **WHEN** the WebSocket receives a user text message
- **THEN** the system creates or updates a message record with state `received`, buyer id, buyer nickname when available, shop id, account id, content, raw payload, and received timestamp

#### Scenario: Unknown incoming message is retained
- **WHEN** the WebSocket receives a payload with an unknown message type
- **THEN** the system persists a message record with a safe fallback type and retains the raw payload for diagnostics

### Requirement: Pinduoduo text reply sending
The Electron app SHALL send approved text replies to Pinduoduo through the merchant chat send-message endpoint.

#### Scenario: Message reply send succeeds
- **WHEN** the user sends a text reply for a received message
- **THEN** the system calls the Pinduoduo send-message endpoint with the buyer uid and marks the message state `sent`

#### Scenario: Draft send succeeds
- **WHEN** the user sends a human-review draft
- **THEN** the system sends the draft text through Pinduoduo, marks the draft `sent`, and marks the source message `sent`

#### Scenario: Send fails
- **WHEN** the Pinduoduo send-message endpoint returns an error or cannot be reached
- **THEN** the system leaves the source message or draft unsent, records the error, and surfaces the failure through IPC
