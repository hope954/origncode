## ADDED Requirements

### Requirement: Analysis MUST be orchestrated by session and task lifecycle
The system SHALL manage resume-highlight processing with session and task abstractions, including explicit state transitions for importing, parsing, extracting, merging, generating, and terminal states.

#### Scenario: New analysis session is created
- **WHEN** the user initializes a session with target_job and style preferences
- **THEN** the system SHALL create a session record and allow asynchronous task execution against that session

### Requirement: Partial success MUST be supported at session level
The system MUST return `partial_success` when some documents fail but remaining successful documents provide sufficient evidence to produce usable highlights.

#### Scenario: One of multiple documents fails
- **WHEN** at least one document fails and at least one document remains usable for highlight generation
- **THEN** the session status SHALL be `partial_success` and response SHALL include both generated highlights and failed-document diagnostics

### Requirement: Full failure MUST be deterministic when no usable evidence remains
The system SHALL return `failed` if all documents fail or if no extractable evidence exists to produce valid highlights.

#### Scenario: All documents fail parsing
- **WHEN** no document yields usable chunk/fact outputs
- **THEN** the session SHALL terminate as `failed` with actionable error details
