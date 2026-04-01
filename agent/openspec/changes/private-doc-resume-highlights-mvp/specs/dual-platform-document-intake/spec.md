## ADDED Requirements

### Requirement: MVP MUST support both Feishu and Yuque equally
The system MUST provide Feishu and Yuque document intake within MVP scope, and SHALL treat both platforms as first-class sources with equivalent functional coverage for authorization, import, and fetch/parse initiation.

#### Scenario: User imports Feishu documents
- **WHEN** a user authorizes Feishu and submits Feishu document URLs
- **THEN** the system SHALL accept and register the documents as valid intake sources for analysis

#### Scenario: User imports Yuque documents
- **WHEN** a user authorizes Yuque and submits Yuque document URLs
- **THEN** the system SHALL accept and register the documents as valid intake sources for analysis

### Requirement: Access MUST rely on official authorization and MUST NOT bypass platform permissions
The system MUST use only official Feishu and Yuque authorization mechanisms for document access, and SHALL NOT implement or expose any capability that bypasses platform permission checks.

#### Scenario: Unauthorized document is requested
- **WHEN** a user or task attempts to fetch a document without valid granted permission
- **THEN** the system SHALL return a permission error and SHALL NOT fetch the document content

### Requirement: Platform adapters MUST normalize outputs to a unified schema
The system SHALL normalize Feishu and Yuque fetch results into a unified document schema so downstream pipelines do not branch on platform-specific structures.

#### Scenario: Different source formats are ingested
- **WHEN** one session contains both Feishu and Yuque documents
- **THEN** downstream document processing SHALL receive homogeneous normalized document objects with consistent required fields

### Requirement: Intake MUST preserve document-level status and error reason
The system SHALL track per-document intake and parse status with error classification, enabling fault isolation and partial-success decisions.

#### Scenario: One document fails authorization
- **WHEN** a document fetch fails due to authorization or permission error
- **THEN** the system SHALL mark only that document as failed with a machine-readable reason code, without forcing all documents to fail immediately
