## GHCGTW TODO

### High Priority

#### API Design & Versioning
- [ ] Clarify endpoint structure for OpenAI vs Anthropic APIs:
  - [ ] Consider `/openai/v1/...` and `/anthropic/v1/...` prefixes instead of shared `/v1/...`
  - [ ] Document which endpoints belong to which API style
  - [ ] Ensure streaming vs non-streaming behavior is clear for each API format
- [ ] Update README with clear API usage examples for both OpenAI and Anthropic clients

#### Documentation & Promotion
- [ ] Add screenshots to the README
- [ ] Add a "Share on X" button
- [ ] Add Marketplace assets (icon + short description) consistent with local experimentation positioning

---

### Reliability & Observability
- [ ] Add VS Code Output Channel (`AI Gateway`) with structured request logs (method, path, request id, model, duration, status)
- [ ] Normalize error responses:
  - [ ] OpenAI-style error object for `/v1/chat/completions` failures
  - [ ] Anthropic-style error envelope for `/v1/messages` failures
  - [ ] Consistent HTTP status mapping (401/403/404/400/500)
- [ ] Harden request parsing:
  - [ ] Graceful handling of invalid/malformed JSON
  - [ ] Size limits on request bodies (avoid unbounded memory usage)
- [ ] Improve `/health` (include uptime + version)

### Compatibility & Developer Experience
- [ ] `/v1/models` improvements:
  - [ ] Add `capabilities` (at least: `streaming: true`, `vision: false`, `tools: false` unless proven otherwise)
  - [ ] Add stable identifiers (`id`, `family`, `vendor`) and avoid surprising fields
- [ ] OpenAI request parameter audit (document pass-through vs ignored): `temperature`, `max_tokens`, `top_p`, `stop`, `response_format`
- [ ] Optional "debug mode" setting to increase logging verbosity
- [ ] Add `CHANGELOG.md` and tighten release notes

### Packaging & Release
- [ ] Add `CONTRIBUTING.md` (build, debug, release steps)
- [ ] Add `SECURITY.md` (local-only assumptions, key handling, threat model)
- [ ] Add a small "smoke test" script (curl-based) to validate endpoints quickly

### Stability & Testing
- [ ] Cross-platform verification notes (macOS/Windows/Linux)
- [ ] Minimal integration tests for HTTP endpoints (best-effort; keep lightweight)

### Future Exploration
- [ ] TBD: Expose local models (Ollama, llama.cpp, etc.) through the same interface for a unified API?
