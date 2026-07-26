# Agent Research API（MVP）

Localhost / self-hosted HTTP endpoint for **other AI agents** (e.g. Cursor).  
Speed-only. No Shiye persona. No classifier (caller already decided to search).

> Do not expose this endpoint on the public internet without auth.

## Endpoint

`POST http://127.0.0.1:3000/api/agent/research`

## Request

```json
{
  "query": "What you want researched (self-contained)",
  "background": "Optional project/context from the calling agent",
  "sources": ["web", "discussions"],
  "chatModel": { "providerId": "...", "key": "deepseek-v4-flash" },
  "embeddingModel": { "providerId": "...", "key": "Xenova/all-MiniLM-L6-v2" }
}
```

| Field | Required | Notes |
| --- | --- | --- |
| `query` | yes | Becomes researcher follow-up + `standaloneFollowUp` |
| `background` | no | Injected as chat history for the researcher |
| `sources` | no | Default `["web","discussions"]`. Also supports `academic` |
| `chatModel` | no | Falls back to `config.uiState.chatModelProviderId` + `chatModelKey` |
| `embeddingModel` | no | Falls back to Transformers `Xenova/all-MiniLM-L6-v2` |

Mode is **always** `speed` (not client-overridable).

## Response

```json
{
  "summary": "Short dry brief for another agent",
  "sources": [
    { "index": 1, "title": "...", "url": "...", "snippet": "≤200 chars" }
  ],
  "meta": {
    "mode": "speed",
    "sourceCount": 15,
    "elapsedMs": 12345,
    "classifier": "skipped"
  }
}
```

- At most **15** sources; **no** full `content` bodies.
- Unlike `POST /api/search`, this does not return a long UI-style `message` + full finding dump.

## curl example

```bash
curl -s http://127.0.0.1:3000/api/agent/research \
  -H 'Content-Type: application/json' \
  -d '{
    "query": "Cursor MCP tool timeout defaults",
    "background": "Self-hosted MyVane research stack; sizing MCP tool budgets.",
    "sources": ["web", "discussions"]
  }' | jq '{meta, summary: .summary[0:400], n: (.sources|length)}'
```

## Diff vs Web App / `/api/search`

| | Web App `SearchAgent` | `/api/search` | `/api/agent/research` |
| --- | --- | --- | --- |
| Classifier | yes | yes | **skipped** |
| Persona / UI writer | Shiye path | UI writer, no persona | **agent writer** (dry) |
| Modes | speed/balanced/quality | same | **speed only** |
| Sources in response | UI blocks | full chunks | **top 15 snippets** |

## Not in the HTTP MVP (done separately)

- ~~MCP server wrapper~~ → see [`mcp/shiye-research/`](mcp/shiye-research/)
- `fetch_source` for full article text
- balanced / quality

---

## MCP (Windows Cursor → WSL)

Thin stdio server: tool **`shiye_research`** → same HTTP API above.

Replace `<REPO>` with your WSL clone path; replace `<NODE>` with `command -v node` (absolute path — Cursor’s non-interactive bash often lacks nvm).

**WSL once:**

```bash
cd <REPO>/mcp/shiye-research && npm install
```

**Keep** `./start-dev.sh` (or vane-api) running.

**Windows Cursor** → Settings → MCP → user config:

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

Details and troubleshooting: [`mcp/shiye-research/README.md`](mcp/shiye-research/README.md).
