## ADDED Requirements

### Requirement: Every highlight MUST be evidence-grounded and traceable
Each generated highlight MUST be bound to explicit evidence objects, including at least one experience reference and traceable fact/chunk/document lineage.

#### Scenario: Highlight is generated
- **WHEN** the system creates a highlight
- **THEN** it SHALL attach evidence references that allow reverse lookup to source facts and source chunks

### Requirement: The system MUST provide evidence query capability
The system SHALL provide an evidence query interface for a highlight, returning source chunks, supporting facts, and source document references needed for user verification.

#### Scenario: User queries evidence for one highlight
- **WHEN** the user requests evidence by highlight identifier
- **THEN** the system SHALL return structured evidence payload with fact list and chunk/document source details

### Requirement: Unverifiable highlights MUST be blocked
The system SHALL reject or withhold highlight items whose evidence chain is incomplete or broken.

#### Scenario: Evidence chain is missing fact linkage
- **WHEN** a highlight candidate lacks valid fact references
- **THEN** the system SHALL not publish that highlight in final results and SHALL emit an integrity error reason
