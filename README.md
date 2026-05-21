# 师爷 Shiye

> A self-hosted AI search workflow — the engine of [Vane](https://github.com/ItzCrazyKns/Vane), restructured for daily-driver use. Decoupled stack, sharper UX, fewer surprises.

[简体中文](./README.zh-CN.md) · English

师爷 (Shiye) is the chief-of-staff scholar who used to stand behind a county magistrate — discreet, well-read, always with the relevant file at hand. This project is a fork of [Vane](https://github.com/ItzCrazyKns/Vane), restructured into a decoupled **Express backend + Vite frontend**, with a rebuilt search orchestration core and a long list of UX polish. The name change reflects how much has been rewritten; the original UI lineage is preserved with gratitude.

This is built for one user (its author) first, and shared in case any of the engineering bits are useful to you.

---

## Highlights

**Sharper UX than upstream**
- **Drop anything, anywhere** — drag-and-drop files _or_ selected text into the message input; the overlay only appears for files so it never blocks a text drop.
- **Reconfigure mid-conversation** — model, sources, depth, and reasoning effort can be changed at any turn (upstream locks them at conversation start).
- **Reasoning preset selector** — explicit `off / auto / low / medium / high` control, surfaced inside the model popover.
- **Quick Prompts** — a slash-style palette of reusable prompts, editable from the settings page with a proper GUI (not a raw JSON textbox).
- **Library with folders** — group conversations into Spaces; titles searchable case-insensitively; list sorted by **`lastMessageAt`**, a column upstream never tracked.
- **Per-turn metadata footer** — every assistant reply shows which model / reasoning preset / search mode actually produced it. No more guessing what was used three turns ago.
- **Prompt copy + smart fold** — long user prompts fold past ~200 chars with a one-click copy.
- **CJK upload fixes** — multer's latin1 filename quirk patched; non-UTF-8 text files (GBK, etc.) decoded via `jschardet` + `iconv-lite` instead of rendering mojibake.
- **Chat branching** — fork any completed assistant turn into a new conversation. The entire prefix is cloned in a single transaction. Useful for "what if I'd asked it differently" without losing the original thread.
- **PDF / Markdown export** — one click, CJK-safe.

**Stricter engine**
- **Long-context discipline** — sliding-window history budget for the Researcher; JSON-safe truncation of tool outputs (so a half-cut `\uXXXX` escape can't blow up the next request).
- **SearXNG fault isolation** — per-query try/catch; one flaky source doesn't take down a whole iteration.
- **Vision-aware history** — non-vision models get `image_url` parts auto-stripped, with an explicit system note so the model knows attachments existed.
- **Observability that pays its rent** — per-turn token usage written to `data/token-usage/*.jsonl`, with phase / provider / model / cache hits / reasoning preset.

---

## What it is not

- Not a Perplexity competitor. The author is the entire user base.
- Not multi-tenant. Single-user assumptions are baked in (auth, rate limits, quotas — all absent or trivial).
- Not a stable API surface. Routes and DB schema evolve; migrations are best-effort.
- Not a turnkey deploy. SearXNG, model API keys, and a willingness to read logs are required.

---

## Architecture at a glance

```
┌──────────────┐    HTTP / SSE    ┌──────────────────────────────────┐
│   vane-ui    │ ───────────────▶ │             vane-api             │
│  (Vite, R19) │                  │  Express + better-sqlite3 + ESM  │
└──────────────┘                  │                                  │
                                  │  ┌────────────────────────────┐  │
                                  │  │  Search orchestration      │  │
                                  │  │  classifier → researcher   │  │
                                  │  │            → writer        │  │
                                  │  └────────┬───────────────────┘  │
                                  │           │                      │
                                  │   ┌───────▼───────┐  ┌────────┐  │
                                  │   │   SearXNG     │  │  LLM   │  │
                                  │   │ (web/academic │  │ (multi │  │
                                  │   │  /discussions)│  │ provider│ │
                                  │   └───────────────┘  └────────┘  │
                                  └──────────────────────────────────┘
```

- **`vane-api/`** — Node 20+ / Express 5 / better-sqlite3 / Drizzle ORM. ESM source, `tsx` in dev, `tsup` to CJS for prod. Entry: `src/index.ts`. Search engine in `src/lib/agents/search/`.
- **`vane-ui/`** — Vite + React 19 + Tailwind. Entry: `src/App.tsx`. Chat state lives in `src/lib/hooks/useChat.tsx`.
- **`searxng-config/`** + `docker-compose.yml` — local SearXNG instance, mounted read-only.
- **`vane-api/data/`** — `db.sqlite`, uploaded files, token JSONL. Gitignored.

---

## Quick start

Requirements: Node ≥ 20, pnpm ≥ 10, Docker (for SearXNG).

```bash
# 1. SearXNG
docker compose up -d

# 2. Install deps (run once after clone; better-sqlite3 needs build scripts)
pnpm -C vane-api install
pnpm -C vane-ui install

# 3. Dev — runs both servers
./start-dev.sh
```

First boot drops you into a setup wizard where you configure model providers and search sources. Configuration is persisted to `vane-api/data/config.json`.

> If you ever see `Could not locate the bindings file` from `better-sqlite3`, that's pnpm 10 skipping build scripts. Cure: `cd vane-api && rm -rf node_modules && pnpm install`. The `pnpm.onlyBuiltDependencies` allowlist in `vane-api/package.json` already handles this for fresh clones.

---

## Model providers

Shiye talks to LLMs through an internal "OpenAI-compatible policy" layer (`vane-api/src/lib/models/providers/policy/openaiCompatPolicy.ts`), which reconciles per-vendor quirks (base URL normalization, reasoning preset gating, structured-output fallbacks) so the rest of the codebase doesn't have to.

**Daily-driven & known-good**
- **DeepSeek V3.2 / V4** — the author's daily setup. V4 thinking is fully supported (including the `reasoning_content`-only edge case).

**Implemented but lightly tested**
- **OpenAI, Gemini, Ollama, generic OpenAI-compatible endpoints** — the code paths exist and have been wired up at various points, but the author currently uses only DeepSeek end-to-end. Expect small adapter-layer surprises; please open issues if you hit any.

If you're adding a new OpenAI-compatible vendor, extend the policy file rather than scattering `if (vendor === ...)` checks elsewhere. That's a load-bearing convention.

---

## Differences from upstream Vane

If you're coming from [ItzCrazyKns/Vane](https://github.com/ItzCrazyKns/Vane):

| Area | Upstream Vane | Shiye |
| --- | --- | --- |
| **Stack** | Next.js full-stack | Express API + Vite SPA, decoupled |
| **Mid-conversation config** | Locked at start | Model / sources / depth / reasoning effort all switchable per turn |
| **Reasoning effort** | — | Explicit preset selector, surfaced in the model popover |
| **Library** | Flat list, by-creation-time order | Folders ("Spaces"), case-insensitive title search, sorted by `lastMessageAt` |
| **Drag & drop** | Files only, overlay blocks text drops | Files _and_ text; overlay only triggers for files |
| **Quick Prompts** | — | Reusable prompt palette with a GUI editor in settings |
| **Per-turn metadata** | — | Footer line on each assistant reply: model / reasoning / search mode used |
| **CJK uploads** | Filename mojibake; GBK files unreadable | UTF-8 filename rescue + encoding auto-detect for text uploads |
| **Branching** | — | `POST /api/chats/:chatId/messages/:messageId/fork` clones a thread up to any completed assistant turn |
| **Export** | — | Markdown export + CJK-safe PDF |
| **Researcher** | Tool loop | Tool loop + sliding-window history budget, JSON-escape-safe tool truncation, per-query SearXNG fault isolation |
| **Provider adapters** | — | `openaiCompatPolicy` (base URL normalization, reasoning gating, structured-output fallbacks) |
| **DB** | Drizzle on SQLite | + `chats.lastMessageAt`, `chat_branches`, message-level provider / model / reasoning columns |
| **Observability** | — | Per-turn token JSONL |

The UI is largely descended from upstream and is in the process of being re-skinned.

---

## Roadmap (loose, in priority order)

- [ ] Re-skin the UI for visual independence from Vane (logo, palette, type — not a full rewrite).
- [ ] Search-preference memory v0.1 — small, compressed, user-visible. "Remembers too much" is worse than "remembers too little".
- [ ] Surface the classifier's `skipSearch` decision in the assistant footer with a "redo with search" affordance, in lieu of a global Force Search toggle.
- [ ] Tighten the search depth presets (Speed / Balanced / Quality) and decide whether Multi-Agent is worth shipping.
- [ ] Clean public contract for `/api/search` so the engine could plausibly be embedded as a tool inside a larger Agent host.

---

## Acknowledgements

- **[Vane](https://github.com/ItzCrazyKns/Vane)** by [@ItzCrazyKns](https://github.com/ItzCrazyKns) — the original Next.js project this fork started from. The product idea, the initial UI vocabulary, and a lot of solid orchestration ideas are theirs. MIT-licensed; Shiye preserves the original copyright in [`LICENSE`](./LICENSE).
- **[SearXNG](https://github.com/searxng/searxng)** — the metasearch engine all of this is built on top of.

---

## License

[MIT](./LICENSE). Original copyright © 2026 ItzCrazyKns (upstream Vane). Modifications © 2026 JuanHoi1996 (Shiye).
