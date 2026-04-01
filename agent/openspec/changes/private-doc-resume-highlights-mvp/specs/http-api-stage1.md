# HTTP API — Stage 1 / 1.5 (implementation baseline)

This document aligns runtime routes with `docs/master-spec-private-doc-resume-highlights.md` where applicable.

## Document import

- **POST** `/api/docs/import`  
  Body: `{ "session_id": string, "docs": [{ "platform": "feishu"|"yuque", "url": string }] }`

(Legacy `/api/doc/import` is **not** used.)

## Auth refresh semantics

- **POST** `/api/auth/refresh`  
  Body **must** include `"platform": "feishu"` for refresh to run.  
  If `"platform": "yuque"` (or any non-Feishu refresh use case), respond with `400` and `code: unsupported_platform` — Yuque MVP uses manual token endpoints under `/api/auth/yuque/token/*`.

## Auth vs adapters

- Auth and token lifecycle: `auth_service` + HTTP routes under `/api/auth/*`.
- Document fetch after auth: `FeishuAdapter` / `YuqueAdapter` **only** implement `fetchDocument(doc, token)` → `NormalizedDocument`.
