# GitHub Copilot Gateway - TODO

## 🔥 Immediate Priority (High Value, Low Effort)

### Real-World Validation Testing
- [ ] Test gateway with Claude 3.5 Sonnet model (if available in Copilot subscription)
- [ ] Test gateway with Gemini models (if available)
- [ ] Test tool calling with different model families (OpenAI vs Anthropic vs Google)
- [ ] Verify vision/image input works across model providers
- [ ] Document which models are actually available in GitHub Copilot subscription
- [ ] Test edge cases in model selection logic (typos, family matching, vendor fallback)
- [ ] Create test script to validate all endpoints with different models

### Configuration & Port Flexibility
- [ ] Add VS Code configuration settings in package.json:
  - [ ] `ghcgtw.port` - configurable port (default: 3000)
  - [ ] `ghcgtw.defaultModel` - default model to use (default: gpt-4o-mini)
  - [ ] `ghcgtw.autoStart` - auto-start server on activation (default: true)
  - [ ] `ghcgtw.enableLogging` - enable output channel logging (default: true)
- [ ] Read configuration in extension.ts activation
- [ ] Add VS Code commands:
  - [ ] `ghcgtw.startServer` - Start the HTTP server
  - [ ] `ghcgtw.stopServer` - Stop the HTTP server
  - [ ] `ghcgtw.restartServer` - Restart the HTTP server
  - [ ] `ghcgtw.showStatus` - Show current server status
- [ ] Add status bar item showing:
  - [ ] Server running state (🟢/🔴)
  - [ ] Current port number
  - [ ] Click to show commands
- [ ] Handle port-in-use errors gracefully (try next port or show error)

### Marketplace Publication
- [ ] Create publisher account on VS Code Marketplace (if not exists)
- [ ] Add marketplace metadata to package.json:
  - [ ] Categories (e.g., "AI", "Other")
  - [ ] Keywords (e.g., "github-copilot", "openai", "api", "proxy", "gateway")
  - [ ] Icon (128x128 PNG)
  - [ ] Gallery banner color
  - [ ] Detailed description
- [ ] Create screenshots/animated GIFs:
  - [ ] Server running in status bar
  - [ ] Example curl/HTTP request
  - [ ] Python client example
- [ ] Add CHANGELOG.md for version tracking
- [ ] Review and update README with:
  - [ ] Installation from marketplace
  - [ ] Configuration instructions
  - [ ] Known limitations
- [ ] Test installation from VSIX one more time
- [ ] Publish v0.1.0 as preview/beta version
- [ ] Monitor initial user feedback

---

## 📋 Short-Term Enhancements (Medium Effort, High Impact)

### Error Handling & Observability
- [ ] Create VS Code Output Channel for logging
- [ ] Log all incoming requests with timestamps
- [ ] Log all responses with status codes
- [ ] Log model selection decisions (which model was chosen and why)
- [ ] Improve error messages to match OpenAI error format:
  - [ ] Model not found errors
  - [ ] Rate limit errors
  - [ ] Token limit exceeded errors
  - [ ] Invalid request format errors
- [ ] Add request/response size logging
- [ ] Add timing metrics (request duration)
- [ ] Handle malformed JSON gracefully
- [ ] Add debug mode configuration for verbose logging

### OpenAI API Compatibility Audit
- [ ] Document all supported OpenAI parameters in README
- [ ] Document unsupported/ignored parameters
- [ ] Add support for chat completion parameters:
  - [ ] `temperature` - map to vscode.lm if supported
  - [ ] `max_tokens` - map to vscode.lm if supported
  - [ ] `top_p` - map or document as ignored
  - [ ] `frequency_penalty` - document as ignored
  - [ ] `presence_penalty` - document as ignored
  - [ ] `stop` sequences - investigate vscode.lm support
  - [ ] `n` (multiple completions) - document as unsupported
  - [ ] `user` field - pass through if applicable
- [ ] Test with popular OpenAI client libraries:
  - [ ] Official OpenAI Python SDK
  - [ ] LangChain with OpenAI provider
  - [ ] Node.js openai package
- [ ] Add parameter validation and helpful errors
- [ ] Document behavior differences from OpenAI API

### Security Hardening
- [ ] Add optional API key authentication:
  - [ ] Configuration setting `ghcgtw.apiKey`
  - [ ] Validate `Authorization: Bearer <key>` header
  - [ ] Return 401 for invalid/missing keys
- [ ] Add CORS headers for browser-based clients
- [ ] Add configuration `ghcgtw.allowedOrigins` for CORS
- [ ] Add configuration `ghcgtw.localhostOnly` (default: true)
- [ ] Reject non-localhost connections when `localhostOnly` is true
- [ ] Add rate limiting per client/IP (optional)
- [ ] Document security considerations in README:
  - [ ] Why localhost-only is recommended
  - [ ] How to secure in multi-user environments
  - [ ] API key best practices

---

## 🚀 Medium-Term Features (Higher Effort)

### Response Format Support
- [ ] Detect `response_format` parameter in request
- [ ] Handle `response_format: { "type": "json_object" }`:
  - [ ] Add system message instructing JSON output
  - [ ] Test with different models
- [ ] Validate response is valid JSON when JSON mode requested
- [ ] Add error handling for invalid JSON responses
- [ ] Document JSON mode support per model family
- [ ] Test with structured output use cases

### Enhanced Tool Calling
- [ ] Test parallel function calling (multiple tools in one request)
- [ ] Verify tool choice modes work correctly:
  - [ ] `auto` - model decides
  - [ ] `required` - force tool call
  - [ ] `none` - disable tools
  - [ ] `{"type": "function", "function": {"name": "..."}}` - specific tool
- [ ] Handle tool execution errors gracefully
- [ ] Add timeout configuration for tool calls
- [ ] Test nested/recursive tool calling scenarios
- [ ] Add examples to README:
  - [ ] Simple tool calling example
  - [ ] Multi-tool workflow
  - [ ] Error handling patterns
- [ ] Document which models support tools

### Model Capabilities Discovery
- [ ] Implement `/v1/models/{model_id}` endpoint
- [ ] Return detailed model information:
  - [ ] `id`, `vendor`, `family`
  - [ ] `capabilities`: `{"vision": bool, "tools": bool, "json_mode": bool}`
  - [ ] `max_input_tokens`, `max_output_tokens`
  - [ ] `context_window` size
- [ ] Introspect vscode.lm API for capability detection
- [ ] Filter/warn when using unsupported features:
  - [ ] Tools with models that don't support them
  - [ ] Images with text-only models
- [ ] Cache model capabilities for performance
- [ ] Add `/v1/models` filtering by capability

---

## 🔮 Long-Term Vision

### Embeddings Support
- [ ] Research if VS Code LM API supports embeddings
- [ ] Implement `/v1/embeddings` endpoint if supported
- [ ] Test with embedding models available in Copilot
- [ ] Document embedding use cases (RAG, semantic search)
- [ ] Add examples for vector database integration

### Multi-Instance Management
- [ ] Support multiple gateway instances on different ports
- [ ] Add per-workspace server configuration
- [ ] Show all running instances in status bar/commands
- [ ] Allow starting/stopping specific instances
- [ ] Persist instance configuration across VS Code restarts

### CLI Tool
- [ ] Create standalone CLI for starting gateway without VS Code
- [ ] Package as npx-runnable tool
- [ ] Support same configuration options as extension
- [ ] Useful for CI/CD pipelines
- [ ] Document CLI usage patterns

### Advanced Features
- [ ] Streaming SSE improvements (better buffering, reconnection)
- [ ] Conversation history/context management
- [ ] Token usage tracking and reporting
- [ ] Cost estimation per request
- [ ] Request/response caching layer
- [ ] Metrics dashboard (requests, tokens, errors)
- [ ] WebSocket support for bidirectional communication

---

## 📝 Documentation & Quality

### Documentation Improvements
- [ ] Add architecture diagram to README (Mermaid already exists, enhance it)
- [ ] Create CONTRIBUTING.md for contributors
- [ ] Add troubleshooting section to README
- [ ] Document all configuration options with examples
- [ ] Add FAQ section
- [ ] Create example integration guides:
  - [ ] Using with LangChain
  - [ ] Using with Python OpenAI SDK
  - [ ] Using with curl/Postman
  - [ ] Using with web applications

### Testing & CI
- [ ] Add unit tests for extension logic
- [ ] Add integration tests for HTTP endpoints
- [ ] Add tests for model selection logic
- [ ] Set up GitHub Actions CI:
  - [ ] Run tests on push
  - [ ] Lint TypeScript code
  - [ ] Build VSIX on PRs
- [ ] Add code coverage reporting
- [ ] Test on Windows/Linux (currently macOS focused)

### Code Quality
- [ ] Add TypeScript strict mode
- [ ] Fix any linting warnings
- [ ] Add JSDoc comments to public functions
- [ ] Refactor large functions into smaller units
- [ ] Add error handling to all async operations
- [ ] Use proper TypeScript types (avoid `any`)

---

## ✅ Completed
- [x] Initial extension implementation
- [x] HTTP server on localhost:3000
- [x] OpenAI-compatible endpoints (/v1/chat/completions, /v1/models, /v1/tokens)
- [x] Streaming support (SSE)
- [x] Tool/function calling support
- [x] Vision/image input support (multimodal messages)
- [x] Token counting endpoint
- [x] Python CLI client (qchat.py)
- [x] Cross-platform build scripts (build.sh, build.bat)
- [x] README with usage instructions
- [x] ToS compliance documentation
- [x] First commit and GitHub push
- [x] Package metadata (publisher, repository)

---

**Next Recommended Actions (This Week):**
1. ✅ Configuration & Status Bar (items 2.1-2.4 above) - 3 hours
2. ✅ Real-World Model Testing (items 1.1-1.7 above) - 2 hours
3. ✅ Marketplace Publication prep (items 3.1-3.7 above) - 2 hours
