import crypto from 'node:crypto';
import Researcher from './researcher';
import SessionManager from '@/lib/session';
import { getAgentWriterPrompt } from '@/lib/prompts/search/agentWriter';
import type { ChatTurnMessage, Chunk } from '@/lib/types';
import type {
  ClassifierOutput,
  SearchAgentConfig,
  SearchSources,
} from './types';
import BaseLLM from '@/lib/models/base/llm';
import BaseEmbedding from '@/lib/models/base/embedding';
import type { ReasoningPreset } from '@/lib/models/types';
import {
  appendTokenUsage,
  normalizeOpenAIUsage,
  tokenUsageModeFields,
} from '@/lib/observability/tokenUsage';

export type AgentCompactSource = {
  index: number;
  title: string;
  url: string;
  snippet: string;
};

/** Default for MCP/HTTP agent path — avoid `auto` (DeepSeek V4 + tools → max). */
export const AGENT_RESEARCH_DEFAULT_REASONING: ReasoningPreset = 'high';

export type AgentResearchResult = {
  summary: string;
  sources: AgentCompactSource[];
  meta: {
    mode: 'speed';
    sourceCount: number;
    elapsedMs: number;
    classifier: 'skipped';
    reasoningPreset: ReasoningPreset;
  };
};

export type AgentResearchInput = {
  query: string;
  background?: string;
  sources: SearchSources[];
  llm: BaseLLM<any>;
  embedding: BaseEmbedding<any>;
  /** Correlation for token-usage JSONL. */
  observability: {
    chatId: string;
    messageId: string;
    providerId: string;
    modelKey: string;
  };
  /** Defaults to `high`. Prefer high over auto/max for tool latency. */
  reasoningPreset?: ReasoningPreset;
  abortSignal?: AbortSignal;
};

const MAX_COMPACT_SOURCES = 15;
const SNIPPET_MAX_CHARS = 200;

function buildSyntheticClassification(
  query: string,
  sources: SearchSources[],
): ClassifierOutput {
  return {
    classification: {
      skipSearch: false,
      personalSearch: false,
      academicSearch: sources.includes('academic'),
      discussionSearch: sources.includes('discussions'),
      showWeatherWidget: false,
      showStockWidget: false,
      showCalculationWidget: false,
    },
    standaloneFollowUp: query,
  };
}

function compactSources(findings: Chunk[]): AgentCompactSource[] {
  return findings.slice(0, MAX_COMPACT_SOURCES).map((f, i) => {
    const meta = f.metadata ?? {};
    const title = String(meta.title ?? '').slice(0, 200);
    const url = String(meta.url ?? '').slice(0, 500);
    const snippet = String(f.content ?? '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, SNIPPET_MAX_CHARS);
    return { index: i + 1, title, url, snippet };
  });
}

function buildWriterContext(findings: Chunk[]): string {
  const blocks = findings
    .slice(0, MAX_COMPACT_SOURCES)
    .map((f, i) => {
      const title = f.metadata?.title ?? '';
      const url = f.metadata?.url ?? '';
      // Cap per-source body so writer input stays bounded (agent path only).
      const body = String(f.content ?? '').slice(0, 2500);
      return `<result index=${i + 1} title=${JSON.stringify(String(title))} url=${JSON.stringify(String(url))}>${body}</result>`;
    })
    .join('\n');
  return `<search_results note="Cite these with [n]">\n${blocks}\n</search_results>`;
}

/**
 * Speed-only research for external agents (HTTP/MCP).
 * Skips classifier and widgets; always searches.
 * Localhost / self-hosted only — do not expose publicly without auth.
 */
export async function runAgentResearch(
  input: AgentResearchInput,
): Promise<AgentResearchResult> {
  const t0 = Date.now();
  const sources: SearchSources[] =
    input.sources.length > 0 ? input.sources : ['web'];
  const reasoningPreset =
    input.reasoningPreset ?? AGENT_RESEARCH_DEFAULT_REASONING;

  const classification = buildSyntheticClassification(input.query, sources);

  const chatHistory: ChatTurnMessage[] = [];
  if (input.background?.trim()) {
    chatHistory.push({
      role: 'user',
      content: `Background (from calling agent):\n${input.background.trim()}`,
    });
  }

  const config: SearchAgentConfig = {
    sources,
    fileIds: [],
    llm: input.llm,
    embedding: input.embedding,
    mode: 'speed',
    systemInstructions: '',
    reasoningPreset,
    observability: input.observability,
  };

  input.llm.setGenerateContext?.({ reasoningPreset });

  const researchSession = SessionManager.createSession();
  const researcher = new Researcher();
  const researchOut = await researcher.research(researchSession, {
    chatHistory,
    followUp: input.query,
    classification,
    config,
    abortSignal: input.abortSignal,
  });

  if (input.abortSignal?.aborted) {
    throw new Error('Aborted');
  }

  const findings = researchOut.searchFindings ?? [];
  const writerContext = buildWriterContext(findings);
  const writerUserText = `<context>\n${writerContext}\n</context>\n\n${input.query}`;

  const writerPrompt = getAgentWriterPrompt();
  const answerStream = input.llm.streamText({
    messages: [
      { role: 'system', content: writerPrompt },
      { role: 'user', content: writerUserText },
    ],
    options: {
      reasoningPreset,
      ...(input.abortSignal ? { signal: input.abortSignal } : {}),
    },
  });

  let summary = '';
  let usageLogged = false;
  for await (const chunk of answerStream) {
    if (input.abortSignal?.aborted) break;
    summary += chunk.contentChunk ?? '';
    if (chunk.additionalInfo?.usage && !usageLogged) {
      usageLogged = true;
      appendTokenUsage({
        chatId: input.observability.chatId,
        messageId: input.observability.messageId,
        providerId: input.observability.providerId,
        modelKey: input.observability.modelKey,
        phase: 'writer',
        researcherRan: true,
        skipSearch: false,
        personalSearch: false,
        ...normalizeOpenAIUsage(chunk.additionalInfo.usage),
        ...tokenUsageModeFields('speed'),
        reasoningPreset,
      });
    }
  }

  const compact = compactSources(findings);
  return {
    summary: summary.trim(),
    sources: compact,
    meta: {
      mode: 'speed',
      sourceCount: compact.length,
      elapsedMs: Date.now() - t0,
      classifier: 'skipped',
      reasoningPreset,
    },
  };
}

/** Stable ids for observability when the caller has no chat session. */
export function newAgentResearchIds() {
  return {
    chatId: `agent-${crypto.randomUUID()}`,
    messageId: crypto.randomUUID(),
  };
}
