# OpenClaw/Clawdbot + Gateway Setup (VM → Host)

Run [OpenClaw](https://github.com/openclaw/openclaw) (or Clawdbot/Moltbot) inside a VM (UTM, VMware, etc.) and connect it to the AI Gateway running on your host machine.

## Intended Use

This VM setup is intended for **personal, local experimentation/learning** where the VM is your own VM on the same host; it is not intended for public exposure, shared use, or operating a hosted service. You are solely responsible for ensuring your use complies with all applicable terms and policies (including GitHub Copilot terms, Visual Studio Code license and Marketplace terms, and your organization’s policies). This guide is not legal advice.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  Host (macOS/Windows/Linux)                                 │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐    │
│  │  VS Code + AI Gateway Extension                     │    │
│  │  Listening on: localhost:3000 + 192.168.64.1:3000   │    │
│  │  Endpoints: /v1/chat/completions, /v1/messages      │    │
│  └─────────────────────────────────────────────────────┘    │
│                          ▲                                  │
│                          │ bridge100 (virtual interface)    │
└──────────────────────────│──────────────────────────────────┘
                           │
┌──────────────────────────│──────────────────────────────────┐
│  VM (Ubuntu)             │                                  │
│  ┌───────────────────────┴─────────────────────────────┐    │
│  │  OpenClaw/Clawdbot → http://192.168.64.1:3000/v1    │    │
│  └─────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────┘
```

## Step 1: Configure Gateway to Listen on VM Interface

On your **host machine**, in VS Code Settings (Cmd+, or Ctrl+,), search for `ghcgtw` and set:

| Setting | Value |
|---------|-------|
| **Secondary Bind Address** | `192.168.64.1` |

Or add to `settings.json`:
```json
{
  "ghcgtw.secondaryBindAddress": "192.168.64.1"
}
```

The gateway auto-restarts when you change settings. Verify by clicking the status bar — both addresses should appear.

> **Finding your VM interface IP:** On the host, run `ifconfig` (macOS/Linux) or `ipconfig` (Windows) and look for a `bridge` or `vmnet` interface. For UTM on macOS, it's typically `192.168.64.1`.

## Step 2: Get Your API Key

On the host machine in VS Code:
1. Click the **AI Gateway** status bar item (bottom right)
2. Click **"Copy API Key"**
3. Save this key — you'll need it for the config below

## Step 3: Test Connectivity from VM

Inside the VM, verify the gateway is reachable:

```bash
# Replace YOUR_API_KEY with the key you copied
curl -H "X-Api-Key: YOUR_API_KEY" http://192.168.64.1:3000/health
```

Expected response:
```json
{"status":"ok","port":3000,"app":"github-copilot-gateway"}
```

## Step 4: Configure OpenClaw/Clawdbot

Create or edit the config file (`~/.openclaw/openclaw.json` or `~/.clawdbot/clawdbot.json`):

```json
{
  "models": {
    "mode": "replace",
    "providers": {
      "ghcgtw": {
        "baseUrl": "http://192.168.64.1:3000/v1",
        "apiKey": "YOUR_API_KEY_HERE",
        "api": "openai-completions",
        "authHeader": true,
        "headers": {
          "X-Api-Key": "YOUR_API_KEY_HERE"
        },
        "models": [
          {
            "id": "gpt-5-mini",
            "name": "GPT-5 Mini (via Gateway)",
            "reasoning": false,
            "input": ["text"],
            "cost": { "input": 0, "output": 0, "cacheRead": 0, "cacheWrite": 0 },
            "contextWindow": 128000,
            "maxTokens": 16384
          },
          {
            "id": "gpt-5",
            "name": "GPT-5 (via Gateway)",
            "reasoning": false,
            "input": ["text"],
            "cost": { "input": 0, "output": 0, "cacheRead": 0, "cacheWrite": 0 },
            "contextWindow": 128000,
            "maxTokens": 16384
          },
          {
            "id": "claude-sonnet-4-5",
            "name": "Claude Sonnet 4.5 (via Gateway)",
            "reasoning": false,
            "input": ["text"],
            "cost": { "input": 0, "output": 0, "cacheRead": 0, "cacheWrite": 0 },
            "contextWindow": 200000,
            "maxTokens": 16384
          }
        ]
      }
    }
  },
  "agents": {
    "defaults": {
      "workspace": "~/workspace",
      "model": {
        "primary": "ghcgtw/gpt-5-mini"
      },
      "models": {
        "ghcgtw/gpt-5-mini": { "alias": "gpt5" },
        "ghcgtw/gpt-5": { "alias": "gpt5full" },
        "ghcgtw/claude-sonnet-4-5": { "alias": "sonnet" }
      }
    }
  },
  "gateway": {
    "mode": "local"
  }
}
```

**⚠️ Important:** Replace `YOUR_API_KEY_HERE` in **both places** (the `apiKey` field AND inside `headers`).

### Key Configuration Points

| Field | Value | Why |
|-------|-------|-----|
| `baseUrl` | `http://192.168.64.1:3000/v1` | Must include `/v1` — the gateway endpoints are at `/v1/chat/completions` |
| `api` | `openai-completions` (or `anthropic-messages`) | Gateway exposes OpenAI- and Anthropic-compatible chat endpoints |
| `authHeader` | `true` | Tells OpenClaw to send auth headers |
| `headers.X-Api-Key` | Your API key | Gateway accepts `X-Api-Key` header for authentication |
| `model.primary` | `ghcgtw/<model-id>` | Format: `<provider>/<model-id>` — must match a model in `providers.ghcgtw.models` |

## Step 5: Validate and Start

```bash
# Validate config (fix any schema errors)
openclaw doctor          # or: clawdbot doctor

# Start the OpenClaw gateway
openclaw gateway --port 18789 --verbose
```

## Step 6: Test It

```bash
# Test with agent command (--agent main is required)
openclaw agent --agent main --message "What model are you?"

# Or use the dashboard (opens web UI)
openclaw dashboard
```

> **⚠️ Note:** You must specify `--agent main` (or `-a main`). Running just `openclaw agent --message "..."` will fail with a session selection error.

## Alternative: Anthropic Messages API

If you prefer to use the Anthropic Messages format (some tools work better with it), change:

```json
{
  "models": {
    "providers": {
      "ghcgtw": {
        "baseUrl": "http://192.168.64.1:3000/v1",
        "api": "anthropic-messages",
        ...
      }
    }
  }
}
```

Both formats work — the gateway translates either format into VS Code `vscode.lm` requests, using the models available to your Copilot subscription.

## Security Notes

- The gateway only binds to private IPs (RFC 1918) — public IPs are blocked
- Non-localhost bindings show a warning about potential local network exposure
- The `192.168.64.x` range is a virtual network inside your machine — not accessible from outside
- API key is required for all requests (except `/health`)

## Troubleshooting

| Issue | Fix |
|-------|-----|
| `Connection refused` | Check VS Code is running and gateway shows the secondary IP in status bar dialog |
| `401 Unauthorized` | Verify API key matches (click status bar → Copy API Key) and is in both `apiKey` and `headers.X-Api-Key` |
| `404 Not Found` | Ensure `baseUrl` ends with `/v1` (not just `http://192.168.64.1:3000/`) |
| `Model not found` | Check model ID in config matches what's available (run `curl http://192.168.64.1:3000/v1/models`) |
| Secondary IP not showing | Rebuild extension (`./build.sh`) and reload VS Code |
| Can't reach host from VM | Check VM network mode is "Shared Network" (not Bridged) |
| OpenClaw won't start | Run `openclaw doctor --fix` to repair config issues |
