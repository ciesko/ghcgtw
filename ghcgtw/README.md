# GitHub Copilot AI Gateway

Expose GitHub Copilot's AI models as a local HTTP server with OpenAI- and Anthropic-compatible endpoints.

## Intended Use

This extension is for **local experimentation and learning** on your own machine. It is not intended for hosting a service for other users. You are solely responsible for ensuring your use complies with applicable terms (GitHub Copilot terms, VS Code license, your organization's policies). This software is provided "AS IS" without warranties; this is not legal advice.

## How It Works

The gateway runs inside VS Code and translates OpenAI/Anthropic-compatible HTTP requests to VS Code's Language Model API (`vscode.lm`).

**VS Code must be running** with the extension enabled for the gateway to work.

## Quick Start

1. Install the extension
2. Check the status bar (bottom-right): `AI Gateway :3000 [model]`
3. Click status bar → "Copy API Key"
4. Configure your client to use `http://localhost:3000/v1`

## API Endpoints

| Endpoint | Method | Format |
|----------|--------|--------|
| `/v1/messages` | POST | Anthropic Messages |
| `/v1/chat/completions` | POST | OpenAI Chat Completions |
| `/v1/models` | GET | Model list |
| `/health` | GET | Server status |

## Settings

| Setting | Default | Description |
|---------|---------|-------------|
| `ghcgtw.port` | `3000` | Gateway server port |
| `ghcgtw.defaultModel` | `gpt-5-mini` | Default model |
| `ghcgtw.secondaryBindAddress` | (empty) | Additional private IP for VM use |

## Security

- Binds to localhost only (by default)
- API key required for all requests (except `/health`)
- Browser requests blocked (no `Origin`/`Referer` headers allowed)
- Key stored encrypted in OS keychain

## Limitations

- No function/tool calling
- No vision/image input
- No embeddings
- No token usage in responses

## More Information

See the [full documentation on GitHub](https://github.com/ciesko/ghcgtw) for detailed setup instructions, client configuration examples, and troubleshooting.

## License

MIT © Matej Ciesko
