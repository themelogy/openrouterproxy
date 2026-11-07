# Claude Code OpenRouter Proxy

Local proxy that forwards Claude Code CLI requests to OpenRouter API with model routing, streaming support, and a web UI for configuration.

## Quick Start

```bash
# Install dependencies
npm install --ignore-scripts

# Set your OpenRouter API key (or configure via Web UI)
echo 'OPENROUTER_API_KEY=sk-or-v1-...' > .env

# Start dev server (backend + web UI)
npm run dev

# Or build and run production
npm run build
npm start
```

Then configure at `http://127.0.0.1:4000` or run Claude Code with the proxy:

```bash
ANTHROPIC_BASE_URL='http://127.0.0.1:4000' \
ANTHROPIC_AUTH_TOKEN='placeholder' \
claudeflow --disallowedTools LSP
```

## Architecture

```
Claude Code CLI  →  http://127.0.0.1:4000 (Fastify proxy)  →  OpenRouter API
                                                ↕
                                          Web UI at same port
```

## Features

- **Streaming passthrough** — SSE events forwarded byte-by-byte without buffering
- **Tool-use support** — tool definitions, calls, and results forwarded intact
- **Model routing** — configure separate models for Opus, Sonnet, Haiku roles
- **Provider routing** — per-model routing strategies (price/throughput) via OpenRouter provider options
- **Web UI** — configure API key, models, proxy settings without editing files
- **Request history** — track recent requests with status and duration

## macOS

```bash
# Install dependencies (uses system Node/CMake)
npm install --ignore-scripts

# Start dev server (backend + web UI concurrently)
npm run dev

# Build for production
npm run build

# Run production server
PORT=4000 npm start
```

Claude Code connects via environment variables:

```bash
export ANTHROPIC_BASE_URL='http://127.0.0.1:4000'
export ANTHROPIC_AUTH_TOKEN='placeholder'
claudeflow --disallowedTools LSP
```

## Configuration

Config is stored in a JSON file and managed via the Web UI at `http://127.0.0.1:4000`.

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `OPENROUTER_API_KEY` | — | Your OpenRouter API key |
| `LOCAL_AUTH_TOKEN` | — | Optional token for management API access |
| `ALLOW_REMOTE` | false | Allow non-localhost access (not recommended) |

### Config Schema

```json
{
  "server": { "host": "127.0.0.1", "port": 4000, "timeoutMs": 3000000 },
  "openrouter": { "baseUrl": "https://openrouter.ai/api/v1", "apiKey": "" },
  "models": {
    "opus": "anthropic/claude-3.5-sonnet",
    "sonnet": "anthropic/claude-3.5-sonnet",
    "haiku": "anthropic/claude-3-haiku"
  }
}
```

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/v1/messages` | Main proxy endpoint (Claude Code API) |
| POST | `/v1/messages/count_tokens` | Token count estimation |
| GET | `/health` | Health check |
| GET | `/api/config` | Get config (API key masked) |
| PUT | `/api/config` | Update config |
| POST | `/api/test-connection` | Test OpenRouter connectivity |
| GET | `/api/models` | List OpenRouter models |
| GET | `/api/requests` | Request history |
| POST | `/api/requests/clear` | Clear request history |

## Security

- Binds to `127.0.0.1` by default — no remote access
- Management API (`/api/*`) only accessible on localhost
- Client Authorization headers are stripped — proxy uses its own configured key
- API key is masked in all responses and logs
- Request bodies are not logged by default

## Testing

```bash
# Run all tests
npm test

# Run specific test file
npx vitest run apps/server/src/routes/messages.route.test.ts
```

## License

Internal project.
