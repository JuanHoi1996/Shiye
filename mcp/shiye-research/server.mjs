#!/usr/bin/env node
/**
 * Shiye Research MCP (stdio) — thin client for POST /api/agent/research.
 * Run inside WSL next to vane-api so http://127.0.0.1:3000 works.
 * Log only to stderr (stdout is MCP JSON-RPC).
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

const API_URL =
  process.env.SHIYE_API_URL?.replace(/\/$/, '') ||
  'http://127.0.0.1:3000/api/agent/research';
const TIMEOUT_MS = Number(process.env.SHIYE_RESEARCH_TIMEOUT_MS || 120_000);

const server = new McpServer({
  name: 'shiye-research',
  version: '1.0.0',
});

server.registerTool(
  'shiye_research',
  {
    title: 'Shiye research',
    description:
      'Run speed-mode web research via local Shiye (MyVane) vane-api. ' +
      'Use for architecture / ecosystem questions that need external evidence. ' +
      'Pass a self-contained query plus optional background (project context). ' +
      'Do not assume this server knows your codebase. Returns a short summary and up to 15 compact sources (title/url/snippet). ' +
      'Requires vane-api listening on SHIYE_API_URL (default http://127.0.0.1:3000). ' +
      'Prefer reasoningPreset=high (default) or low; avoid max/auto — DeepSeek V4 auto+tools escalates to max and may take 60s+ of silent thinking. Typical latency 20–60s at high.',
    inputSchema: {
      query: z
        .string()
        .min(1)
        .describe('Self-contained research question (what to look up).'),
      background: z
        .string()
        .optional()
        .describe(
          'Optional project/context for the researcher. Write it so another process with no codebase access can understand.',
        ),
      sources: z
        .array(z.enum(['web', 'discussions', 'academic']))
        .optional()
        .describe(
          'Search source kinds. Default on the API is web+discussions when omitted.',
        ),
      reasoningPreset: z
        .enum(['auto', 'off', 'low', 'high', 'max'])
        .optional()
        .describe(
          'Thinking budget. Default high when omitted. Prefer high or low for MCP latency; avoid max and auto (auto+tools → max on DeepSeek V4).',
        ),
    },
  },
  async ({ query, background, sources, reasoningPreset }) => {
    const body = { query, reasoningPreset: reasoningPreset ?? 'high' };
    if (background?.trim()) body.background = background.trim();
    if (sources?.length) body.sources = sources;

    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), TIMEOUT_MS);

    try {
      const res = await fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: ac.signal,
      });
      const text = await res.text();
      if (!res.ok) {
        return {
          isError: true,
          content: [
            {
              type: 'text',
              text: `Shiye API error ${res.status} at ${API_URL}:\n${text.slice(0, 2000)}`,
            },
          ],
        };
      }
      // Return JSON as text so the host agent can parse / quote it.
      let pretty = text;
      try {
        pretty = JSON.stringify(JSON.parse(text), null, 2);
      } catch {
        /* keep raw */
      }
      return { content: [{ type: 'text', text: pretty }] };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const hint =
        msg.includes('abort') || msg.includes('Abort')
          ? ` (timeout ${TIMEOUT_MS}ms)`
          : '';
      return {
        isError: true,
        content: [
          {
            type: 'text',
            text:
              `Failed to reach Shiye at ${API_URL}${hint}: ${msg}\n` +
              'Is vane-api running (./start-dev.sh)? MCP and API must share 127.0.0.1:3000.',
          },
        ],
      };
    } finally {
      clearTimeout(timer);
    }
  },
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(
    `[shiye-research MCP] ready → ${API_URL} (timeout ${TIMEOUT_MS}ms)`,
  );
}

main().catch((err) => {
  console.error('[shiye-research MCP] fatal:', err);
  process.exit(1);
});
