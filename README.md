# GitHub Copilot AI Gateway

Expose GitHub Copilot's AI models as a local HTTP server with OpenAI-compatible endpoints.

## Why

Access powerful AI models (Claude 3.5 Sonnet, GPT-4o, o1) from any application—Python scripts, CLI tools, web apps—without additional API keys or billing.

## How It Works

```mermaid
graph LR
    A[Your App] -->|HTTP Request| B[Gateway Extension<br/>localhost:3000]
    B -->|vscode.lm API| C[GitHub Copilot]
    C -->|Stream Response| B
    B -->|HTTP Response| A
    
    style B fill:#0078d4,stroke:#fff,stroke-width:2px,color:#fff
    style C fill:#28a745,stroke:#fff,stroke-width:2px,color:#fff
```

**The gateway runs inside VS Code** and translates OpenAI-compatible requests to VS Code's Language Model API.

> **⚠️ VS Code must be running** with the extension enabled for the gateway to work.

## Quick Start

**1. Build & Install**
```bash
./build.sh        # macOS/Linux
build.bat         # Windows
```

**2. Open VS Code**  
Extension auto-starts. Check status bar (bottom-right): `✓ AI Gateway :3000`

**3. Use It**
```bash
pip install -r requirements.txt
python qchat.py "Explain async/await in Python"
```

Done! Any app can now call `http://localhost:3000/v1/chat/completions`

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/v1/models` | GET | List available models |
| `/v1/chat/completions` | POST | Chat with streaming, function/tool calling, vision (images) |
| `/v1/tokens` | POST | Count tokens for messages |
| `/health` | GET | Server status |

**Supported Features:**
- ✅ Streaming responses (SSE)
- ✅ Function/tool calling
- ✅ Vision (image input via base64 data URIs)
- ✅ Multiple models (GPT-4o, Claude 3.5 Sonnet, o1, etc.)

OpenAI SDK compatible—just point `base_url` to `http://localhost:3000/v1`

## Example Usage

**Python:**
```python
import openai

client = openai.OpenAI(base_url="http://localhost:3000/v1", api_key="any")
response = client.chat.completions.create(
    model="gpt-4o",
    messages=[{"role": "user", "content": "Hello!"}],
    stream=True
)
for chunk in response:
    print(chunk.choices[0].delta.content, end="")
```

**cURL:**
```bash
curl http://localhost:3000/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{"model": "gpt-4o-mini", "messages": [{"role": "user", "content": "Hi!"}]}'
```

## Requirements

- GitHub Copilot subscription
- VS Code with Copilot extension (installed & authenticated)
- VS Code must be running for gateway to work

## Compliance

Uses official VS Code Language Model API (`vscode.lm`) as documented in [Microsoft's Copilot Extensibility docs](https://code.visualstudio.com/docs/copilot/copilot-extensibility-overview). No terms violations. For personal/local development use.

## Troubleshooting

| Issue | Fix |
|-------|-----|
| Connection refused | VS Code must be running. Check status bar: `✓ AI Gateway :3000` |
| Port in use | Only one VS Code instance can run the gateway |
| No models | Sign in to GitHub Copilot extension |
