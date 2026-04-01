## ADDED Requirements

### Requirement: Highlight generation MUST use a structured five-layer pipeline
The system MUST process data through explicit intermediate layers: normalized document, chunk, fact, experience, and highlight. The system SHALL NOT generate final highlights directly from full raw text in one step.

#### Scenario: Analysis task starts
- **WHEN** a resume-highlight analysis is initiated
- **THEN** the system SHALL execute chunking, fact extraction, experience merging, and highlight generation in sequence with persisted intermediate artifacts

### Requirement: Output target MUST be resume highlights, not generic summaries
The system SHALL generate 3-5 resume-ready highlight statements focused on responsibilities, actions, technical depth, and outcomes, rather than high-level document summaries.

#### Scenario: User requests result
- **WHEN** analysis completes successfully
- **THEN** the system SHALL return highlight-oriented outputs that can be directly used in resume contexts

### Requirement: target_job and style MUST be explicit generation inputs
The system MUST require `target_job` and `style` inputs for highlight generation and highlight rewrite operations, and SHALL produce expression differences aligned to the selected parameters.

#### Scenario: Generation is requested with parameters
- **WHEN** `target_job=engineering` and `style=technical` are provided
- **THEN** the generated highlights SHALL reflect engineering-oriented and technical wording preferences

#### Scenario: Single-highlight rewrite is requested
- **WHEN** the user rewrites one highlight with a new style or target_job
- **THEN** the system SHALL regenerate only that highlight from its bound experience/evidence without using unrelated raw documents

### Requirement: Fact-to-experience mapping MUST be preserved
The system SHALL preserve full reference mapping from each experience to its supporting facts and source chunks.

#### Scenario: Experience is merged from multiple facts
- **WHEN** facts from one or more documents are merged into a single experience
- **THEN** the resulting experience SHALL store all contributing fact identifiers and source chunk identifiers
