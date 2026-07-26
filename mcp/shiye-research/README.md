# Shiye Research MCP

stdio MCP wrapper around `POST /api/agent/research`.  
Runs **inside WSL** next to `vane-api` so `http://127.0.0.1:3000` works. Windows Cursor launches it via `wsl.exe`.

Replace `<REPO>` below with your WSL path to this repository  
(e.g. `$HOME/projects/MyVane` — run `pwd` at the repo root).

## One-time setup (WSL)

```bash
cd <REPO>/mcp/shiye-research
npm install
```

Keep Shiye API up (`./start-dev.sh` from repo root, or at least vane-api on port 3000).

## Windows Cursor MCP config

Cursor Settings → MCP → add server (user-level so every project sees it).

**Important:** Cursor’s `bash -lc` often has no nvm on `PATH`, so plain `node` may fail with `node: command not found`. Prefer an absolute Node path from WSL (`command -v node` in an interactive shell).

```json
{
  "mcpServers": {
    "shiye-research": {
      "command": "wsl.exe",
      "args": [
        "-e",
        "bash",
        "-lc",
        "cd <REPO>/mcp/shiye-research && <NODE> server.mjs"
      ]
    }
  }
}
```

Example after substitution (illustrative only — do not copy paths from someone else’s machine):

```text
cd $HOME/projects/MyVane/mcp/shiye-research && $HOME/.nvm/versions/node/v24.14.0/bin/node server.mjs
```

Optional env (inside the `bash -lc` string, or Cursor `env` if supported):

- `SHIYE_API_URL` — default `http://127.0.0.1:3000/api/agent/research`
- `SHIYE_RESEARCH_TIMEOUT_MS` — default `120000`

After saving, reload MCP / new Agent chat. Tool name: **`shiye_research`**. Green light = process started; research still needs vane-api on port 3000.

## Tool

| Arg | Required | Meaning |
| --- | --- | --- |
| `query` | yes | Self-contained question |
| `background` | no | Calling agent's project context |
| `sources` | no | `web` / `discussions` / `academic` |

Returns the API JSON (`summary` + compact `sources` + `meta`).

## Smoke test (WSL)

```bash
# API must be up
curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:3000/health

cd <REPO>/mcp/shiye-research
npx --yes @modelcontextprotocol/inspector <NODE> server.mjs
```
