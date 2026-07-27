# Shiye Research MCP

stdio MCP wrapper around `POST /api/agent/research`.  
Tool name: **`shiye_research`**. Works with Cursor, Claude Code, Codex, and any MCP stdio host.

**Rule of thumb:** the MCP process and `vane-api` must see the **same** `127.0.0.1:3000`.  
Pick the launch recipe that matches where the API actually runs.

| Where `vane-api` runs | Where the IDE / agent host runs | How to start MCP |
| --- | --- | --- |
| WSL (`./start-dev.sh`) | Windows Cursor / Windows-hosted agent | `wsl.exe` → Node **inside WSL** |
| Native Windows (`start-dev.ps1` / `.bat`) | Windows | Windows `node` → `server.mjs` on NTFS path |
| macOS / Linux (`./start-dev.sh`) | Same machine | Local `node` → `server.mjs` |

Replace placeholders (do **not** copy another machine’s paths):

- `<REPO>` — absolute path to this repo **as seen by the Node that runs MCP**  
  (WSL: `pwd` in the Linux filesystem; native Windows: e.g. `C:\projects\MyVane`)
- `<NODE>` — absolute Node binary (`command -v node` / `where.exe node`). Non-interactive shells often lack nvm/fnm on `PATH`.

## One-time setup

Wherever you will run Node for MCP:

```bash
cd <REPO>/mcp/shiye-research
npm install
```

Keep Shiye API up (at least vane-api on port 3000).

Optional env (process env or Cursor/Claude MCP `env` block):

- `SHIYE_API_URL` — default `http://127.0.0.1:3000/api/agent/research`
- `SHIYE_RESEARCH_TIMEOUT_MS` — default `120000`

Green MCP light = process started; research still needs the API listening.

---

## A. Same OS as vane-api (macOS / Linux / native Windows)

API and MCP on one side of localhost — **no `wsl.exe`**.

**Unix-style** (macOS, Linux, or WSL-only workflows):

```json
{
  "mcpServers": {
    "shiye-research": {
      "command": "<NODE>",
      "args": ["<REPO>/mcp/shiye-research/server.mjs"]
    }
  }
}
```

**Native Windows** (API via `start-dev.ps1` / `start-dev.bat`; paths use backslashes or forward slashes Node accepts):

```json
{
  "mcpServers": {
    "shiye-research": {
      "command": "C:\\\\Path\\\\to\\\\node.exe",
      "args": ["C:\\\\Path\\\\to\\\\MyVane\\\\mcp\\\\shiye-research\\\\server.mjs"]
    }
  }
}
```

Use your real Node path from `where.exe node`. Prefer absolute paths so GUI-launched hosts find Node without your interactive `PATH`.

---

## B. Windows IDE + vane-api in WSL

Windows Cursor (or another Windows-hosted MCP client) cannot reliably use `127.0.0.1:3000` for a service that only listens inside WSL unless you jump through networking hoops. Simplest fix: **run MCP inside WSL** via `wsl.exe`.

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

`<REPO>` and `<NODE>` are **WSL** paths (e.g. `$HOME/projects/MyVane`, `$HOME/.nvm/versions/node/v24.x.x/bin/node`).

If logs say `node: command not found`, the non-interactive bash has no nvm — use the absolute `<NODE>` from an interactive WSL shell (`command -v node`).

---

## Claude Code / Codex

Same stdio server; paste the matching block into that product’s MCP config (file name varies by tool).  
Still: API up locally, `npm install` done, recipe matches where the API runs.

You can also skip MCP and call `POST /api/agent/research` directly — see [`AGENT_RESEARCH_API.md`](../../AGENT_RESEARCH_API.md).

---

## Tool

| Arg | Required | Meaning |
| --- | --- | --- |
| `query` | yes | Self-contained question |
| `background` | no | Calling agent's project context |
| `sources` | no | `web` / `discussions` / `academic` |

Returns the API JSON (`summary` + compact `sources` + `meta`).

Localhost / self-hosted only — this path has no auth; do not expose publicly.

## Smoke test

```bash
curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:3000/health

cd <REPO>/mcp/shiye-research
npx --yes @modelcontextprotocol/inspector <NODE> server.mjs
```

(On native Windows, run the equivalent in PowerShell against the same host where vane-api listens.)
