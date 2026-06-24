## ADDED Requirements

### Requirement: Real Pinduoduo account lifecycle
The system SHALL support real Pinduoduo merchant login, session extraction, account start, online/offline status, and account stop.

#### Scenario: Merchant login succeeds
- **WHEN** a merchant completes real Pinduoduo login in the desktop app
- **THEN** the system stores only encrypted session material and sanitized account/shop metadata

#### Scenario: Account starts
- **WHEN** an operator starts a real Pinduoduo account
- **THEN** the system retrieves a real chat token, opens the real WebSocket, records connection state, and does not use a mock endpoint

### Requirement: Real Pinduoduo messaging APIs
The system SHALL send real text messages, image messages where supported, goods-card messages, and conversation-transfer commands through real Pinduoduo endpoints.

#### Scenario: Text send succeeds
- **WHEN** the operator or Agent sends text to a real buyer conversation
- **THEN** Pinduoduo accepts the real `send_message` request and the local message record stores the sanitized result

#### Scenario: Goods card send succeeds
- **WHEN** the Agent selects a real goods ID returned by the product list API
- **THEN** the system sends a real mall goods card to the buyer and records the tool call and Pinduoduo result

#### Scenario: Conversation transfer succeeds
- **WHEN** a handoff chooses an available customer-service account
- **THEN** the system fetches the real assigned customer-service list and issues the real transfer command

### Requirement: Real Pinduoduo product APIs
The system SHALL fetch product lists and product details from real Pinduoduo APIs using calibrated request headers and parsed field maps.

#### Scenario: Product list is fetched
- **WHEN** the operator syncs products for a real shop
- **THEN** the system fetches real products, including goods ID, name, price, inventory where available, sales fields where available, tags where available, image URL, and source response metadata

#### Scenario: Product detail is fetched
- **WHEN** product sync processes a real goods ID
- **THEN** the system fetches real product detail and records parse success or a sanitized parse error

### Requirement: Request resilience and session recovery
The system SHALL detect session expiry, retry retryable HTTP failures with backoff and jitter, refresh cookies where possible, and request manual relogin when required.

#### Scenario: Session expiry is detected
- **WHEN** a real Pinduoduo response indicates session expiry such as error code `43001`
- **THEN** the system records a session-expiry diagnostic and attempts safe refresh before requiring manual relogin

#### Scenario: Retryable request fails
- **WHEN** a real Pinduoduo HTTP request fails with a retryable network or server condition
- **THEN** the system retries with bounded exponential backoff and jitter and records final success or failure

### Requirement: Production WebSocket governance
The system SHALL classify and audit WebSocket lifecycle events, heartbeat failures, reconnect attempts, token/cookie failures, manual stops, and account-side disconnects.

#### Scenario: Network disconnect recovers
- **WHEN** a real Pinduoduo WebSocket disconnects due to a recoverable network condition
- **THEN** the system enters reconnecting state, applies bounded backoff, reconnects when possible, and records the reconnect count

#### Scenario: Manual relogin is required
- **WHEN** reconnect fails because the session, token, cookie, or account state requires operator action
- **THEN** the system stops automatic recovery, marks the account as requiring relogin, and surfaces the reason in the UI

### Requirement: Real Pinduoduo acceptance evidence
The system SHALL require sanitized real acceptance records for all Pinduoduo-dependent behaviors before declaring the capability complete.

#### Scenario: PDD capability lacks real evidence
- **WHEN** a Pinduoduo behavior has not been verified with a real account and real buyer/test conversation
- **THEN** the related task remains incomplete or blocked and cannot be marked complete using mock, fixture, or generated payload evidence
