# Claude Code OpenRouter Proxy

Local proxy that forwards Claude Code CLI requests to OpenRouter API with model routing, streaming support, and a web UI for configuration. Pure Node — no native modules — so it runs the same on macOS, Windows, and Linux.

## Quick Start

```bash
npm install
npm run dev
```

`npm run dev` starts two processes: Vite on `http://localhost:5173` (the UI, proxying `/api` and `/v1` to the server) and Fastify on `127.0.0.1:4000`. Open the Vite URL, paste your OpenRouter API key, and pick models for the Opus / Sonnet / Haiku roles. The Web UI writes the config file for you; no manual JSON editing needed.

Production — build once, then run:

```bash
npm run build
npm start
```

`npm start` runs a single process: Fastify also serves the built UI, so the app is at `http://127.0.0.1:4000` and no Vite / port 5173 is involved. Re-run `npm run build` after changing UI code.

## Pointing Claude Code at the proxy

macOS / Linux:

```bash
export ANTHROPIC_BASE_URL='http://127.0.0.1:4000'
export ANTHROPIC_AUTH_TOKEN='placeholder'
claude --disallowedTools LSP
```

Windows — PowerShell:

```powershell
$env:ANTHROPIC_BASE_URL = 'http://127.0.0.1:4000'
$env:ANTHROPIC_AUTH_TOKEN = 'placeholder'
claude --disallowedTools LSP
```

Windows — cmd:

```cmd
set ANTHROPIC_BASE_URL=http://127.0.0.1:4000
set ANTHROPIC_AUTH_TOKEN=placeholder
claude --disallowedTools LSP
```

The token only has to be non-empty: the proxy always uses the OpenRouter key from its own config and strips the client's `Authorization` header. Use whatever the CLI is called on your machine — `claudeflow` in older notes is a local alias for `claude`.

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
- **Provider routing** — per-model provider picker (price, latency, throughput, uptime) mapped to OpenRouter provider options
- **Claude Desktop toggle** — route the Desktop app through the proxy and restore the previous settings on disable
- **Web UI** — configure API key, models, proxy settings without editing files
- **Request history** — recent requests with status, duration, and context size

## Configuration

Config is stored in a JSON file, managed via the Web UI at `http://127.0.0.1:4000`.

| OS | Config file |
|----|-------------|
| macOS / Linux | `~/.config/claude-code-openrouter/config.json` |
| Windows | `%USERPROFILE%\.config\claude-code-openrouter\config.json` |

### Environment Variables

| Variable | Description |
|----------|-------------|
| `CC_PROXY_CONFIG_PATH` | Override the proxy config path |
| `CLAUDE_SETTINGS_PATH` | Claude Code `settings.json` that receives `modelOverrides` (default `~/.claude/settings.json`) |
| `CLAUDE_DESKTOP_DIR` | Base folder holding the Claude Desktop installs (see [Claude Desktop](#claude-desktop)) |

On Windows set them in PowerShell (`$env:CC_PROXY_CONFIG_PATH = 'D:\proxy\config.json'`) or through System Properties → Environment Variables.

### Config Schema

```json
{
  "server": { "host": "127.0.0.1", "port": 4000, "timeoutMs": 3000000 },
  "openrouter": { "baseUrl": "https://openrouter.ai/api/v1", "apiKey": "" },
  "models": {
    "opus": { "id": "anthropic/claude-3.5-sonnet", "providerOptions": { "sort": "throughput" } },
    "sonnet": "anthropic/claude-3.5-sonnet",
    "haiku": "anthropic/claude-3-haiku"
  }
}
```

A role is either a plain model ID or an object with `providerOptions` (`sort`, `only`, `ignore`, `allowFallbacks`).

## Claude Desktop

Launch tab → **Claude Desktop** checkbox.

- **On** writes a gateway profile into `<Desktop 3P dir>/configLibrary` pointing at `http://127.0.0.1:<port>` and sets `deploymentMode: "3p"` in both `Claude-3p/claude_desktop_config.json` and `Claude/claude_desktop_config.json`.
- **Off** restores the previous `appliedId` and `deploymentMode` exactly as they were (backup kept in `claude-desktop-backup.json` next to the proxy config), removes the proxy profile, and deletes any config file the toggle created.

The 3P folder lives here:

| OS | Base folder |
|----|-------------|
| macOS | `~/Library/Application Support` |
| Windows | `%APPDATA%` (`C:\Users\<you>\AppData\Roaming`) |

Set `CLAUDE_DESKTOP_DIR` if your copy keeps it elsewhere.

Caveats:

- If `Claude-3p/configLibrary` is missing (common on Windows, where the folder only appears after the 3P build runs), the UI shows **Create 3P config folder** — click it, then tick the checkbox.
- Quit Claude Desktop **completely** before toggling (Windows: also from the notification area; macOS: Cmd+Q). Desktop rewrites its config on exit, and on Windows the open file is locked, so toggling while it runs gets overwritten or fails.
- Desktop only accepts Claude-looking model IDs in `/v1/models`, so the proxy exposes your roles as `claude-opus`, `claude-sonnet`, `claude-haiku`. Restart Desktop after toggling.
- The proxy must be running for Desktop to work.

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/v1/messages` | Main proxy endpoint (Claude Code API) |
| POST | `/v1/messages/count_tokens` | Token count estimation |
| GET | `/health` | Health check |
| GET | `/api/status` | Proxy health + upstream reachability |
| GET | `/api/config` | Get config (API key masked) |
| PUT | `/api/config` | Update config |
| POST | `/api/test-connection` | Test OpenRouter connectivity |
| GET | `/api/models` | List OpenRouter models (`?q=` filter) |
| GET | `/api/models/endpoints` | Providers serving a model, with pricing (`?model=`) |
| GET | `/api/claude-desktop` | Claude Desktop integration status |
| POST | `/api/claude-desktop` | Enable/disable Desktop routing (`{ "enabled": true }`) |
| GET | `/api/requests` | Request history |
| POST | `/api/requests/clear` | Clear request history |

## Operations

Stop the dev servers on macOS / Linux:

```bash
./scripts/stop.sh          # both 4000 and 5173
./scripts/stop.sh 4000     # single port
```

Windows (PowerShell) equivalent:

```powershell
Get-NetTCPConnection -LocalPort 4000,5173 -State Listen -ErrorAction SilentlyContinue |
  ForEach-Object { Stop-Process -Id $_.OwningProcess -Force }
```

## Security

- Binds to `127.0.0.1` by default — no remote access
- Management API (`/api/*`) only accessible on localhost, unless `security.allowRemote` is set in the config
- Optional `security.localAuthToken` in the config requires a matching `Authorization: Bearer <token>` header
- Client Authorization headers are stripped — proxy uses its own configured key
- API key is masked in all responses and logs
- Request bodies are not logged by default

## Testing

```bash
# Run all tests
npm test

# Run one file
npx vitest run --root apps/server src/config/claude-desktop.test.ts
```

## License

Internal project.
