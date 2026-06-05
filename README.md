# 师爷 Shiye

> A self-hosted thinking workbench. Search is just the foundation — on top sit a long-form **Writing Studio**, a periodic **Strategic Advisor**, and a private **Lord Briefing** the advisor keeps on you.

[简体中文](./README.zh-CN.md) · English

师爷 (Shiye) is the chief-of-staff scholar who used to stand behind a county magistrate — discreet, well-read, always with the relevant file at hand. This project started as a fork of [Vane](https://github.com/ItzCrazyKns/Vane)'s search engine and has since grown into something different: a **decoupled Express + Vite stack** wrapped around three coordinated workflows — search, writing, and advisory — bound together by a single evolving impression document the assistant keeps about its user.

Built for one user (its author) first, shared in case any of the engineering bits are useful to you.

---

## The three workflows

### Search (the foundation)
Per-turn switchable model / sources / depth / reasoning effort. Three depth presets: **Speed** (6 researcher iterations), **Balanced** (12), and **DeepResearch** (25 — the old "Quality" mode, renamed in the UI). Long-context disciplined Researcher. SearXNG fault-isolated. CJK uploads that don't mojibake. Branch any completed turn into a new thread. This is the daily driver and the substrate the other two read from.

**DeepResearch** is the heavyweight search path: classifier → widgets ∥ researcher (forced search, up to 25 tool rounds) → **Writer draft** (hidden) → **Verifier** (structured claim-by-claim fidelity check against retrieved sources) → **Writer final** (streamed answer, softened or annotated where claims lack support). UI shows Draft / Verify substeps so the long silent phase doesn't feel stuck. Token JSONL tracks `writer_draft` and `verifier` phases separately for cost attribution.

### Writing Studio (`/studio`)
Long-form drafting pipeline distinct from chat — same **R → W → V → W** shape as DeepResearch, but tuned for prose instead of Q&A. **Researcher → Writer draft → Verifier → Writer final**, optionally seeded from a specific source conversation so the draft is grounded in actual thinking instead of hallucinated topic. Pick length (short / medium / long), iterate via revision turns, export as Markdown. Lives under `kind='studio'` chats.

### Strategic Advisor (`/advisor`) — 师爷进言
Periodic long-form briefing the strategist writes **to you**, based on your recent normal conversations. Four-part structure (~2000–3000 字):

1. **闪光点** (~15%) — recognition with evidence.
2. **逆耳忠言** (~15%) — blind spots, direct but not personal.
3. **增量认知** (~35%, depth) — push the topics you're already on into deeper mechanism / longer consequence / sharper tradeoff.
4. **认知萌发** (~35%, breadth) — **the brain-sprouting course**: weld together scattered points from different conversations / domains to show you the landscape outside your current cognitive boundary.

Eligibility is `first-run OR ≥28 days OR ≥30 new user messages since last run`. Reports live as read-only-ish `kind='advisor'` chats; you **can** reply to them — see below.

### Lord Briefing (Memory)
A single private document the advisor maintains about you — **written for the strategist, not for you**. Not a preference list, not a marketing-style user profile: an internal staff memo answering *who is the lord, where are the blind spots, how should I adjust strategy to serve better*. Visible and editable in Settings → Memory. Updated automatically after each advisor run, and incrementally when you correct the advisor mid-conversation.

The advisor reads it on every run; you read it (and rewrite it) any time.

---

## Highlights beyond the workflows

**Silky-smooth UX** — the kind you notice only when it's missing elsewhere

- **Drop anything, anywhere** — files *or* selected web text into the message input; the overlay only triggers on file drops, never blocking a text drop.
- **Mid-conversation reconfigure** — model, sources, depth, reasoning effort, all switchable per turn.
- **Reasoning preset selector** — explicit `off / auto / low / medium / high` in the model popover.
- **Quick Prompts** — reusable prompt palette with a GUI editor in settings. Type `/` to filter by command prefix; press **`Ctrl+/`** (`Cmd+/` on macOS) to open the full palette at any time — an uncommon shortcut, worth remembering.
- **Library with folders** — Spaces, case-insensitive title search, sorted by **`lastMessageAt`**.
- **Per-turn metadata footer** — every assistant reply shows the model / reasoning / search mode actually used.
- **Smart fold + copy** — long prompts fold past ~200 chars, one-click copy.
- **CJK uploads** — multer's latin1 filename bug patched, GBK/Big5 auto-decoded.
- **Chat branching** — fork from any completed assistant turn; entire prefix cloned in one transaction.
- **PDF / Markdown export** — one click, CJK-safe.
- **Advisor follow-up dialogue** — reply inside an advisor report; corrections like "其实我不是这样的" trigger an incremental update to the Lord Briefing.

**Engine discipline**

- **Verifier** — post-writer fidelity pass in DeepResearch (and Studio): structured JSON claim review, mandatory second writer pass to soften or flag unsupported assertions. Graceful fallback if verification fails.
- Sliding-window history budget for the Researcher; JSON-safe truncation of tool outputs.
- Per-query SearXNG try/catch — one flaky source doesn't take down a whole iteration.
- Non-vision models get `image_url` parts stripped with a system note so they still know attachments existed.
- Per-turn token usage to `data/token-usage/*.jsonl` — phase / provider / model / cache / reasoning preset. Includes advisor / studio / `memory_update` phases for cost attribution.
- Cascading delete: removing an advisor chat now also drops its `advisor_runs` row, so the cursor properly rolls back and you can run again.

---

## What it is not

- Not a Perplexity competitor. The author is the entire user base.
- Not multi-tenant. Single-user assumptions are baked in (auth, rate limits, quotas — absent or trivial).
- Not a stable API surface. Routes and DB schema evolve; migrations are best-effort.
- Not a turnkey deploy. SearXNG, model API keys, and willingness to read logs are required.

---

## Architecture at a glance

```
┌──────────────┐    HTTP / SSE / NDJSON    ┌──────────────────────────────────────────┐
│   vane-ui    │ ────────────────────────▶ │                vane-api                  │
│  (Vite R19)  │                           │  Express 5 + better-sqlite3 + Drizzle    │
└──────────────┘                           │                                          │
                                           │  ┌────────────┐ ┌────────┐ ┌──────────┐  │
                                           │  │   Search   │ │ Studio │ │ Advisor  │  │
                                           │  │ classifier │ │  R→W   │ │ corpus → │  │
                                           │  │ →research  │ │  →V→W  │ │ 4-part   │  │
                                           │  │  →writer   │ │        │ │  long    │  │
                                           │  └─────┬──────┘ └───┬────┘ └────┬─────┘  │
                                           │        │            │           │        │
                                           │        │      ┌─────▼──────┐    │        │
                                           │        │      │   Memory   │◀───┘        │
                                           │        │      │ (Lord doc) │             │
                                           │        │      └────────────┘             │
                                           │   ┌────▼────┐                ┌────────┐  │
                                           │   │ SearXNG │                │  LLM   │  │
                                           │   │ web/aca │                │ multi- │  │
                                           │   │ /disc.  │                │provider│  │
                                           │   └─────────┘                └────────┘  │
                                           └──────────────────────────────────────────┘
```

- **`vane-api/`** — Node 20+ / Express 5 / better-sqlite3 / Drizzle. ESM source, `tsx` in dev, `tsup` to CJS for prod. Entry `src/index.ts`.
  - Search: `src/lib/agents/search/`
  - Studio: `src/lib/agents/studio/` · routes `src/routes/studio.ts`
  - Advisor: `src/lib/agents/advisor/` · routes `src/routes/advisor.ts`
  - Memory: `src/lib/memory/` · routes `src/routes/memory.ts`
- **`vane-ui/`** — Vite + React 19 + Tailwind. Chat state in `src/lib/hooks/useChat.tsx` (multi-kind aware: `normal | advisor | studio`).
- **`searxng-config/`** + `docker-compose.yml` — local SearXNG, mounted read-only.
- **`vane-api/data/`** — `db.sqlite`, uploads, `persona/`, `token-usage/`. Gitignored.

---

## Quick start

Requirements: Node ≥ 20, pnpm ≥ 10, Docker (for SearXNG).

```bash
docker compose up -d                # 1. SearXNG
pnpm -C vane-api install            # 2. deps (better-sqlite3 needs build scripts)
pnpm -C vane-ui install
./start-dev.sh                      # 3. both servers
```

First boot drops you into a setup wizard for model providers and search sources. Config persists to `vane-api/data/config.json`. Migrations run on API startup.

> If `better-sqlite3` ever errors with `Could not locate the bindings file` or `NODE_MODULE_VERSION` mismatch: `cd vane-api && pnpm rebuild better-sqlite3` (or full reinstall). The `pnpm.onlyBuiltDependencies` allowlist handles fresh clones.

---

## Model providers

LLM access goes through `vane-api/src/lib/models/providers/policy/openaiCompatPolicy.ts`, which centralizes per-vendor quirks (base URL normalization, reasoning gating, structured-output fallbacks).

**Daily-driven** — DeepSeek V3.2 / V4 (V4 thinking incl. `reasoning_content`-only edge case).

**Implemented, lightly tested** — OpenAI, Gemini, Ollama, generic OpenAI-compatible endpoints. Code paths exist; the author currently runs DeepSeek end-to-end. PRs / issues welcome.

To add a vendor, extend the policy file rather than scatter `if (vendor === ...)` checks.

---

## Differences from upstream Vane

If you're coming from [ItzCrazyKns/Vane](https://github.com/ItzCrazyKns/Vane):

| Area                  | Upstream Vane                | Shiye                                                                                          |
| --------------------- | ---------------------------- | ---------------------------------------------------------------------------------------------- |
| **Scope**             | AI search                    | Search + long-form Writing Studio + periodic Strategic Advisor + private Lord Briefing memory  |
| **Stack**             | Next.js full-stack           | Express API + Vite SPA, decoupled                                                              |
| **Mid-conv. config**  | Locked at start              | Model / sources / depth / reasoning all switchable per turn                                    |
| **Reasoning effort**  | —                            | Explicit preset selector in the model popover                                                  |
| **Library**           | Flat, by-creation order      | Spaces (folders), case-insensitive title search, `lastMessageAt` sort                          |
| **Drag & drop**       | —                            | Files *and* text; overlay only for files                                                       |
| **Quick Prompts**     | —                            | Reusable prompt palette with GUI editor                                                        |
| **Per-turn metadata** | —                            | Footer on each assistant reply: model / reasoning / search mode                                |
| **CJK uploads**       | Filename mojibake, GBK fails | UTF-8 filename rescue + encoding auto-detect                                                   |
| **Branching**         | —                            | `POST /api/chats/:chatId/messages/:messageId/fork` clones the prefix in a transaction          |
| **Export**            | Markdown + PDF               | Markdown + CJK-safe PDF; Studio drafts also exportable as `.md`                                |
| **Search depth**      | Speed / Balanced / Quality   | Speed / Balanced / **DeepResearch** (UI rename; internal `quality`); DR forces search + up to 25 researcher rounds |
| **Verifier**          | —                            | DeepResearch + Studio: draft → structured claim check → final writer pass with fidelity annotations |
| **Researcher**        | Tool loop                    | Tool loop + sliding-window budget + JSON-escape-safe truncation + per-query SearXNG isolation  |
| **Writing Studio**    | —                            | R→W→V→W pipeline, source-chat grounded, length presets, revision loop, `kind='studio'` chats   |
| **Strategic Advisor** | —                            | Periodic 4-part long-form report (闪光点 / 逆耳忠言 / 增量认知 / 认知萌发), `kind='advisor'`, follow-up enabled |
| **Memory**            | —                            | Single Lord Briefing doc, auto-updated post-advisor, editable in Settings                      |
| **Provider adapters** | —                            | `openaiCompatPolicy` (base URL, reasoning gating, structured-output fallback)                  |
| **DB**                | Drizzle on SQLite            | + `chats.kind`, `chats.lastMessageAt`, `chat_branches`, `advisor_runs`, `user_memory`          |
| **Observability**     | —                            | Per-turn token JSONL with phase=`search|studio_*|advisor|memory_update`                        |

The UI shell is still descended from upstream and being gradually re-skinned.

---

## Roadmap (loose, in priority order)

- Re-skin the UI for visual independence from Vane (logo, palette, type).
- Better corpus selection for Advisor — currently overflow drops oldest whole chats by `lastMessageAt`; a breadth-first "head + tail of each chat" budget would let old threads still influence the 认知萌发 section.
- Surface classifier's `skipSearch` decision in the footer with a "redo with search" affordance, replacing the global Force Search toggle.
- Studio v2 — multi-agent writing room (planner / researcher / drafter / editor); compare-drafts UI; DOCX export.
- Tune DeepResearch researcher iteration ceiling and early-stop behavior; decide if Multi-Agent ships.
- Clean public contract for `/api/search` so the engine can be embedded as a tool in a larger Agent host.

---

## Acknowledgements

- **[Vane](https://github.com/ItzCrazyKns/Vane)** by [@ItzCrazyKns](https://github.com/ItzCrazyKns) — the original Next.js project this fork started from. Product idea, initial UI vocabulary, and a lot of solid orchestration ideas are theirs. MIT-licensed; Shiye preserves the original copyright in [LICENSE](./LICENSE).
- **[SearXNG](https://github.com/searxng/searxng)** — the metasearch engine all of this is built on top of.

---

## License

[MIT](./LICENSE). Original copyright © 2026 ItzCrazyKns (upstream Vane). Modifications © 2026 JuanHoi1996 (Shiye).
