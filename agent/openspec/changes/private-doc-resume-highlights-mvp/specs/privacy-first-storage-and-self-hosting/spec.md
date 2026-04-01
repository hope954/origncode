## ADDED Requirements

### Requirement: Deployment MUST be self-hosting friendly
The system MUST support private deployment environments where operators retain control over runtime, storage, and access boundaries.

#### Scenario: System is deployed in a private environment
- **WHEN** the product is installed on user-controlled infrastructure
- **THEN** all core MVP capabilities SHALL remain available without requiring mandatory public cloud managed services

### Requirement: Storage MUST follow privacy-first minimization
The system SHALL minimize stored sensitive content by persisting only required structured artifacts and evidence snippets necessary for traceability and editing workflows.

#### Scenario: Analysis completes
- **WHEN** highlights and evidence have been generated
- **THEN** the system SHALL retain only required data for result retrieval, rewrite, evidence query, and auditability

### Requirement: Tokens and session data MUST be securely managed
The system SHALL secure platform tokens at rest and in transit, isolate data by session scope, and provide session-clear operations that cascade deletion of associated artifacts.

#### Scenario: User clears a session
- **WHEN** session clear is requested
- **THEN** the system SHALL delete or invalidate related session artifacts and return a successful cleanup status

### Requirement: Credential handling MUST avoid insecure user-supplied secret patterns
The system MUST NOT require users to submit raw long-lived platform tokens in plain text fields for normal operation, and SHALL prevent credential exposure through logs, traces, and error payloads.

#### Scenario: User attempts to paste raw token manually
- **WHEN** a user tries to provide a raw credential outside the official auth flow
- **THEN** the system SHALL reject the input and guide the user to complete official authorization
