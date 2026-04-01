# Stage 1 Backend (MVP subset)

Implemented scope:
- module skeleton + contract baseline
- session/task orchestration
- dual-platform intake (`feishu` OAuth-like callback, `yuque` manual token flow)
- document pipeline (`NormalizedDocument`, `document_normalizer`, `content_cleaner`, `chunker`)
- privacy/storage basics (`PlatformAuth` persistence with encrypted token fields and minimized storage)

Not implemented in this stage:
- fact extraction / experience / highlight generation
- evidence detail frontend / result edit UI
- full release gates
