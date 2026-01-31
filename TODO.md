## GHCGTW Roadmap / TODO (Jan 2026)

This file is the project backlog and roadmap for the VS Code extension + local HTTP gateway.

**Scope statement:** GHCGTW is a *local protocol bridge* that translates OpenAI- and Anthropic-compatible requests into VS Code `vscode.lm` requests using the models available through your GitHub Copilot subscription.

**Operating principles:**
- Keep the gateway small and honest: bridge protocols, don't become an agent runtime.
- Prioritize local safety: default localhost-only, harden against browser/CSRF-style abuse, avoid "hosted service" patterns.
- Compatibility over novelty: match common client expectations (error shapes, SSE behavior) where feasible.

### Non-goals (unless VS Code APIs change)
- Running as a hosted/shared service for other users
- Public network exposure (beyond explicit private-IP VM use)
- Embeddings, fine-tuning, audio, video, desktop sharing
- A standalone gateway process outside VS Code (cannot use `vscode.lm`)
- Browser clients (requests with `Origin`/`Referer` are intentionally blocked)

---

## Current State (v0.1.x)

- OpenAI-compatible: `POST /v1/chat/completions` (streaming SSE + non-streaming)
- Anthropic-compatible: `POST /v1/messages` (streaming SSE + non-streaming)
- Models: `GET /v1/models`
- Token counting: `POST /v1/tokens` and Claude-style `POST /v1/messages/count_tokens`
- Health: `GET /health`
- Auth: per-user API key stored in VS Code Secrets; accepts `Authorization: Bearer` or `X-Api-Key`
- Security: blocks browser-originated requests, binds to localhost by default, optional secondary private bind address for VM use
- Multi-window: detects existing gateway and shows "hosted elsewhere" state

Known limitations (by design / upstream constraints): token usage accounting, embeddings, multimodal, and tool execution are not provided by the current implementation.

---

## v0.2.0 — Reliability + Observability

- [ ] Add VS Code Output Channel (`AI Gateway`) with structured request logs (method, path, request id, model, duration, status)
- [ ] Normalize error responses:
  - [ ] OpenAI-style error object for `/v1/chat/completions` failures
  - [ ] Anthropic-style error envelope for `/v1/messages` failures
  - [ ] Consistent HTTP status mapping (401/403/404/400/500)
- [ ] Harden request parsing:
  - [ ] Graceful handling of invalid/malformed JSON
  - [ ] Size limits on request bodies (avoid unbounded memory usage)
- [ ] Improve `/health` (include uptime + version)

## v0.3.0 — Compatibility + DX

- [ ] `/v1/models` improvements:
  - [ ] Add `capabilities` (at least: `streaming: true`, `vision: false`, `tools: false` unless proven otherwise)
  - [ ] Add stable identifiers (`id`, `family`, `vendor`) and avoid surprising fields
- [ ] OpenAI request parameter audit (document pass-through vs ignored): `temperature`, `max_tokens`, `top_p`, `stop`, `response_format`
- [ ] Optional "debug mode" setting to increase logging verbosity
- [ ] Add `CHANGELOG.md` and tighten release notes

## v0.4.0 — Packaging + Release Readiness

- [ ] Add `CONTRIBUTING.md` (build, debug, release steps)
- [ ] Add `SECURITY.md` (local-only assumptions, key handling, threat model)
- [ ] Add a small "smoke test" script (curl-based) to validate endpoints quickly
- [ ] Add Marketplace assets (icon + short description) consistent with local experimentation positioning

## v1.0.0 — Stable

- [ ] Cross-platform verification notes (macOS/Windows/Linux)
- [ ] Minimal integration tests for HTTP endpoints (best-effort; keep lightweight)

---

## Completed

- [x] Initial VS Code extension implementation
- [x] Local HTTP server with authentication and browser-request blocking
- [x] OpenAI-compatible endpoint (`/v1/chat/completions`)
- [x] Anthropic-compatible endpoint (`/v1/messages`) and Foundry-compatible `/anthropic/v1/*` paths
- [x] Streaming support (SSE) for both API formats
- [x] Token counting endpoints (`/v1/tokens`, `/v1/messages/count_tokens`)
- [x] Model list endpoint (`/v1/models`)
- [x] Deterministic model selection behavior
- [x] API key generation + storage in VS Code Secrets (shared across windows)
- [x] Optional secondary bind address with private-IP validation (VM use)
- [x] Multi-window detection (shows "hosted elsewhere" state)
- [x] Python CLI client (`qchat.py`)
- [x] Cross-platform build scripts (`build.sh`, `build.bat`)
- [x] README with usage instructions + configuration docs
- [x] Local experimentation disclaimers + compliance guidance
- [x] Authors + package metadata
- [x] README/LICENSE included in VSIX package
