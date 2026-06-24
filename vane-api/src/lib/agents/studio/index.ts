import crypto from 'node:crypto';
import z from 'zod';
import db from '@/lib/db';
import { messages } from '@/lib/db/schema';
import { and, eq, gt } from 'drizzle-orm';
import SessionManager from '@/lib/session';
import { Message, ResearchBlock, TextBlock } from '@/lib/types';
import Researcher from '@/lib/agents/search/researcher';
import type { ClassifierOutput } from '@/lib/agents/search/types';
import type { SearchAgentConfig } from '@/lib/agents/search/types';
import { applyChatHistoryBudget, buildWriterSearchContextXml } from '@/lib/utils/chatBudget';
import { touchChatLastMessageAt } from '@/lib/db/touchChatLastMessageAt';
import {
  appendTokenUsage,
  normalizeOpenAIUsage,
  type TokenUsagePhase,
} from '@/lib/observability/tokenUsage';
import {
  appendStudioVerifierRevisionInstructions,
  getStudioReviserPrompt,
  getStudioVerifierPrompt,
  getStudioWriterPrompt,
} from './prompts';
import type { StudioAgentInput, StudioSpec } from './types';

const verifierClaimSchema = z.object({
  claim: z.string().optional().default(''),
  support: z.enum(['yes', 'partial', 'no']).optional(),
  note: z.string().optional().default(''),
});

const verifierSchema = z.object({
  claims: z
    .preprocess(
      (val) => (Array.isArray(val) ? val : []),
      z.array(verifierClaimSchema),
    )
    .default([]),
  overallNote: z.string().optional().default(''),
});

type VerifierOutput = {
  claims: Array<{
    claim: string;
    support: 'yes' | 'partial' | 'no';
    note: string;
  }>;
  overallNote: string;
};

const VALID_SUPPORTS = new Set<VerifierOutput['claims'][number]['support']>([
  'yes',
  'partial',
  'no',
]);

const VERIFIER_CONTEXT_CHAR_BUDGET = 48_000;

function headTailTruncate(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  const head = Math.floor(maxChars * 0.6);
  const tail = Math.floor(maxChars * 0.35);
  return `${text.slice(0, head)}\n\n[…]\n\n${text.slice(-tail)}`;
}

function trimStudioVerifierInputs(
  draft: string,
  sourcesXml: string,
  sourceContext: string | undefined,
  maxTotal: number,
): { draft: string; sourcesXml: string; sourceContext?: string } {
  const ctx = sourceContext ?? '';
  const total = draft.length + sourcesXml.length + ctx.length;
  if (total <= maxTotal) return { draft, sourcesXml, sourceContext };
  const draftBudget = Math.max(1500, Math.floor(maxTotal * (draft.length / total)));
  const sourcesBudget = Math.max(1500, Math.floor(maxTotal * (sourcesXml.length / total)));
  const ctxBudget = Math.max(500, maxTotal - draftBudget - sourcesBudget);
  return {
    draft: headTailTruncate(draft, draftBudget),
    sourcesXml: headTailTruncate(sourcesXml, sourcesBudget),
    sourceContext: ctx ? headTailTruncate(ctx, ctxBudget) : undefined,
  };
}

function normalizeVerifierOutput(raw: unknown): VerifierOutput {
  if (typeof raw === 'string') {
    try {
      return normalizeVerifierOutput(JSON.parse(raw));
    } catch {
      /* fall through */
    }
  }

  let parsed = verifierSchema.safeParse(raw);
  if (
    !parsed.success &&
    raw !== null &&
    typeof raw === 'object' &&
    !Array.isArray(raw)
  ) {
    const obj = raw as Record<string, unknown>;
    parsed = verifierSchema.safeParse({
      claims: Array.isArray(obj.claims) ? obj.claims : [],
      overallNote: typeof obj.overallNote === 'string' ? obj.overallNote : '',
    });
  }

  if (!parsed.success) {
    throw parsed.error;
  }

  const claims = parsed.data.claims
    .filter(
      (c) =>
        c.claim.trim().length > 0 &&
        c.support != null &&
        VALID_SUPPORTS.has(c.support),
    )
    .map((c) => ({
      claim: c.claim.trim(),
      support: c.support as VerifierOutput['claims'][number]['support'],
      note: (c.note ?? '').trim(),
    }));

  return {
    claims,
    overallNote: (parsed.data.overallNote ?? '').trim(),
  };
}

function formatVerifierReport(result: VerifierOutput): string {
  const lines = result.claims.map((c, i) => {
    const noteLine = c.note ? `\n   Note: ${c.note}` : '';
    return `${i + 1}. [${c.support}] ${c.claim}${noteLine}`;
  });
  const header = result.overallNote || '(no overall note)';
  if (lines.length === 0) {
    return `${header}\n\n(no claims extracted)`;
  }
  return `${header}\n\n${lines.join('\n')}`;
}

function studioTokenFields(): {
  optimizationMode: string;
} {
  return { optimizationMode: 'studio' };
}

export async function persistStudioFailure(
  input: Pick<StudioAgentInput, 'chatId' | 'messageId'>,
  session: SessionManager,
): Promise<void> {
  await db
    .update(messages)
    .set({
      status: 'error',
      responseBlocks: session.getAllBlocks(),
    })
    .where(
      and(
        eq(messages.chatId, input.chatId),
        eq(messages.messageId, input.messageId),
      ),
    )
    .execute();
  await touchChatLastMessageAt(input.chatId);
}

function emitStudioStatus(session: SessionManager, statusBlockId: string, text: string) {
  let block = session.getBlock(statusBlockId) as ResearchBlock | undefined;
  if (!block || block.type !== 'research') {
    session.emitBlock({
      id: statusBlockId,
      type: 'research',
      data: {
        subSteps: [
          {
            id: crypto.randomUUID(),
            type: 'reasoning',
            reasoning: text,
          },
        ],
      },
    });
    return;
  }

  const subSteps = [...block.data.subSteps];
  const last = subSteps[subSteps.length - 1];
  if (last?.type === 'reasoning') {
    subSteps[subSteps.length - 1] = {
      ...last,
      reasoning: text,
    };
  } else {
    subSteps.push({
      id: crypto.randomUUID(),
      type: 'reasoning',
      reasoning: text,
    });
  }

  session.updateBlock(statusBlockId, [
    { op: 'replace', path: '/data/subSteps', value: subSteps },
  ]);
}

async function streamStudioWriter(params: {
  session: SessionManager;
  llm: StudioAgentInput['config']['llm'];
  writerPrompt: string;
  userContent: string;
  abortSignal?: AbortSignal;
  emitFinal: boolean;
  tokenPhase: Extract<TokenUsagePhase, 'studio_writer'>;
  obs?: StudioAgentInput['config']['observability'];
  reasoningPreset: string;
}): Promise<string> {
  const budgetedHistory: Message[] = [];
  const answerStream = params.llm.streamText({
    messages: [
      { role: 'system', content: params.writerPrompt },
      ...budgetedHistory,
      { role: 'user', content: params.userContent },
    ],
    options: params.abortSignal ? { signal: params.abortSignal } : undefined,
  });

  let accumulated = '';
  let responseBlockId = '';
  let usageLogged = false;

  for await (const chunk of answerStream) {
    if (params.abortSignal?.aborted) break;

    if (chunk.additionalInfo?.usage && !usageLogged && params.obs) {
      usageLogged = true;
      appendTokenUsage({
        chatId: params.obs.chatId,
        messageId: params.obs.messageId,
        providerId: params.obs.providerId,
        modelKey: params.obs.modelKey,
        phase: params.tokenPhase,
        ...normalizeOpenAIUsage(chunk.additionalInfo.usage),
        ...studioTokenFields(),
        reasoningPreset: params.reasoningPreset,
      });
    }

    accumulated += chunk.contentChunk;

    if (params.emitFinal) {
      if (!responseBlockId) {
        const block: TextBlock = {
          id: crypto.randomUUID(),
          type: 'text',
          data: chunk.contentChunk,
        };
        params.session.emitBlock(block);
        responseBlockId = block.id;
      } else {
        const block = params.session.getBlock(responseBlockId) as TextBlock | null;
        if (block) {
          block.data += chunk.contentChunk;
          params.session.updateBlock(block.id, [
            { op: 'replace', path: '/data', value: block.data },
          ]);
        }
      }
    }
  }

  return accumulated;
}

async function runStudioVerifier(params: {
  llm: StudioAgentInput['config']['llm'];
  draft: string;
  spec: StudioSpec;
  sourcesXml: string;
  sourceContext?: string;
  abortSignal?: AbortSignal;
  obs?: StudioAgentInput['config']['observability'];
  reasoningPreset: string;
}): Promise<{ result: VerifierOutput; usage?: unknown }> {
  const runGenerate = (retry: boolean) => {
    const total =
      params.draft.length +
      params.sourcesXml.length +
      (params.sourceContext?.length ?? 0);
    const { draft, sourcesXml, sourceContext } =
      retry && total > VERIFIER_CONTEXT_CHAR_BUDGET
        ? trimStudioVerifierInputs(
            params.draft,
            params.sourcesXml,
            params.sourceContext,
            VERIFIER_CONTEXT_CHAR_BUDGET,
          )
        : {
            draft: params.draft,
            sourcesXml: params.sourcesXml,
            sourceContext: params.sourceContext,
          };

    return params.llm.generateObject<typeof verifierSchema>({
      messages: [
        {
          role: 'system',
          content: getStudioVerifierPrompt(
            draft,
            params.spec,
            sourcesXml,
            sourceContext,
          ),
        },
        {
          role: 'user',
          content: retry
            ? 'Return only one valid json object matching the schema. No markdown fences.'
            : 'Audit the draft. Return JSON only per the schema.',
        },
      ],
      schema: verifierSchema,
      options: {
        reasoningPreset: 'off',
        maxTokens: 4096,
        ...(params.abortSignal ? { signal: params.abortSignal } : {}),
      },
    });
  };

  let lastErr: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const raw = await runGenerate(attempt === 1);
      const usage = (raw as { _usage?: unknown })._usage;
      const result = normalizeVerifierOutput(raw);

      if (params.obs && usage != null) {
        appendTokenUsage({
          chatId: params.obs.chatId,
          messageId: params.obs.messageId,
          providerId: params.obs.providerId,
          modelKey: params.obs.modelKey,
          phase: 'studio_verifier',
          ...normalizeOpenAIUsage(usage),
          ...studioTokenFields(),
          reasoningPreset: params.reasoningPreset,
        });
      }

      return { result, usage };
    } catch (err) {
      lastErr = err;
      if (attempt === 0) {
        console.warn('[studio verifier] generateObject failed, retrying:', err);
      }
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}

function researchConfig(
  input: StudioAgentInput,
): SearchAgentConfig {
  return {
    llm: input.config.llm,
    embedding: input.config.embedding,
    sources: input.config.sources,
    fileIds: input.config.fileIds,
    mode: 'balanced',
    systemInstructions: 'None',
    reasoningPreset: input.config.reasoningPreset ?? 'auto',
    observability: input.config.observability,
    tokenUsagePhase: 'studio_researcher',
  };
}

function forcedResearchClassification(topic: string): ClassifierOutput {
  return {
    classification: {
      skipSearch: false,
      personalSearch: false,
      academicSearch: true,
      discussionSearch: false,
      showWeatherWidget: false,
      showStockWidget: false,
      showCalculationWidget: false,
    },
    standaloneFollowUp: topic,
  };
}

async function runResearchPhase(
  session: SessionManager,
  input: StudioAgentInput,
  statusBlockId: string,
): Promise<string> {
  emitStudioStatus(session, statusBlockId, '研究中…');

  const researcher = new Researcher();
  const researchFollowUp = [
    input.spec.instruction,
    input.sourceContext?.trim() ?
      `\n\nPrior conversation to ground research:\n${input.sourceContext.slice(0, 12_000)}`
    : '',
  ]
    .join('')
    .trim();

  const classification = forcedResearchClassification(researchFollowUp);
  const searchResults = await researcher.research(session, {
    chatHistory: applyChatHistoryBudget([
      ...input.chatHistory,
      ...(input.sourceContext?.trim() ?
        [
          {
            role: 'user' as const,
            content: `Source chat transcript:\n${input.sourceContext}`,
          },
        ]
      : []),
    ]),
    followUp: researchFollowUp,
    classification,
    config: researchConfig(input),
    abortSignal: input.abortSignal,
  });

  const { xml } = buildWriterSearchContextXml(
    (searchResults?.searchFindings ?? []) as {
      content: string;
      metadata: { title?: string; url?: string };
    }[],
  );

  return xml;
}

async function ensureMessageRow(
  session: SessionManager,
  input: StudioAgentInput,
  query: string,
): Promise<void> {
  const exists = await db.query.messages.findFirst({
    where: and(
      eq(messages.chatId, input.chatId),
      eq(messages.messageId, input.messageId),
    ),
  });

  if (!exists) {
    await db.insert(messages).values({
      chatId: input.chatId,
      messageId: input.messageId,
      backendId: session.id,
      query,
      createdAt: new Date().toISOString(),
      status: 'answering',
      responseBlocks: [],
      providerId: input.config.llm.config?.providerId,
      modelKey: input.config.llm.config?.model,
      reasoningPreset: input.config.reasoningPreset ?? 'auto',
    });
  } else {
    await db
      .delete(messages)
      .where(
        and(eq(messages.chatId, input.chatId), gt(messages.id, exists.id)),
      )
      .execute();
    await db
      .update(messages)
      .set({
        status: 'answering',
        backendId: session.id,
        responseBlocks: [],
        providerId: input.config.llm.config?.providerId,
        modelKey: input.config.llm.config?.model,
        reasoningPreset: input.config.reasoningPreset ?? 'auto',
      })
      .where(
        and(
          eq(messages.chatId, input.chatId),
          eq(messages.messageId, input.messageId),
        ),
      )
      .execute();
  }

  await touchChatLastMessageAt(input.chatId);
}

async function finalizeMessage(
  session: SessionManager,
  input: StudioAgentInput,
): Promise<void> {
  await db
    .update(messages)
    .set({
      status: 'completed',
      responseBlocks: session.getAllBlocks(),
    })
    .where(
      and(
        eq(messages.chatId, input.chatId),
        eq(messages.messageId, input.messageId),
      ),
    )
    .execute();
  await touchChatLastMessageAt(input.chatId);
}

class StudioAgent {
  async runInitial(session: SessionManager, input: StudioAgentInput): Promise<void> {
    const signal = input.abortSignal;
    input.config.llm.setGenerateContext?.({
      reasoningPreset: input.config.reasoningPreset ?? 'auto',
    });

    const statusBlockId = crypto.randomUUID();
    const obs = input.config.observability;
    const reasoningPreset = input.config.reasoningPreset ?? 'auto';

    const setError = async () => {
      await persistStudioFailure(
        { chatId: input.chatId, messageId: input.messageId },
        session,
      );
    };

    try {
      await ensureMessageRow(session, input, input.userInstruction ?? '');

      if (signal?.aborted) {
        await setError();
        return;
      }

      emitStudioStatus(session, statusBlockId, '准备中…');

      let sourcesXml = '';
      if (input.spec.useResearch) {
        sourcesXml = await runResearchPhase(session, input, statusBlockId);
        if (signal?.aborted) {
          await setError();
          return;
        }
      }

      emitStudioStatus(session, statusBlockId, '撰稿中…');

      const writerPrompt = getStudioWriterPrompt(
        input.spec,
        sourcesXml || undefined,
        undefined,
        input.sourceContext,
        input.sourceChatTitle,
      );

      const draftText = await streamStudioWriter({
        session,
        llm: input.config.llm,
        writerPrompt,
        userContent: `Write the article per the brief and source conversation. Instruction: ${input.spec.instruction}`,
        abortSignal: signal,
        emitFinal: false,
        tokenPhase: 'studio_writer',
        obs,
        reasoningPreset,
      });

      if (signal?.aborted) {
        await setError();
        return;
      }

      emitStudioStatus(session, statusBlockId, '核查中…');

      let finalPrompt = writerPrompt;
      try {
        const { result: verifierResult } = await runStudioVerifier({
          llm: input.config.llm,
          draft: draftText,
          spec: input.spec,
          sourcesXml,
          sourceContext: input.sourceContext,
          abortSignal: signal,
          obs,
          reasoningPreset,
        });

        finalPrompt = appendStudioVerifierRevisionInstructions(
          writerPrompt,
          formatVerifierReport(verifierResult),
          draftText,
        );
      } catch (verifierErr) {
        if (signal?.aborted) {
          await setError();
          return;
        }
        console.warn('[StudioAgent] verifier failed; using unverified draft:', verifierErr);
      }

      emitStudioStatus(session, statusBlockId, '定稿中…');

      await streamStudioWriter({
        session,
        llm: input.config.llm,
        writerPrompt: finalPrompt,
        userContent: `Publish the final article. Instruction: ${input.spec.instruction}`,
        abortSignal: signal,
        emitFinal: true,
        tokenPhase: 'studio_writer',
        obs,
        reasoningPreset,
      });

      if (signal?.aborted) {
        await setError();
        return;
      }

      emitStudioStatus(session, statusBlockId, '完成');

      session.emit('end', {});
      await finalizeMessage(session, input);
    } catch (err: unknown) {
      if (signal?.aborted || (err as Error)?.name === 'AbortError') {
        await setError();
        return;
      }
      console.error('[StudioAgent.runInitial]', err);
      await setError();
      session.emit('error', {
        data: err instanceof Error ? err.message : String(err),
      });
    }
  }

  async revise(session: SessionManager, input: StudioAgentInput): Promise<void> {
    const signal = input.abortSignal;
    const draft = input.currentDraft ?? '';
    const instruction = input.userInstruction ?? '';

    if (!draft.trim() || !instruction.trim()) {
      session.emit('error', { data: 'Missing draft or revision instruction.' });
      return;
    }

    input.config.llm.setGenerateContext?.({
      reasoningPreset: input.config.reasoningPreset ?? 'auto',
    });

    const statusBlockId = crypto.randomUUID();
    const obs = input.config.observability;
    const reasoningPreset = input.config.reasoningPreset ?? 'auto';

    const setError = async () => {
      await persistStudioFailure(
        { chatId: input.chatId, messageId: input.messageId },
        session,
      );
    };

    try {
      await ensureMessageRow(session, input, instruction);

      if (signal?.aborted) {
        await setError();
        return;
      }

      emitStudioStatus(session, statusBlockId, '修订中…');

      const reviserPrompt = getStudioReviserPrompt(
        input.spec,
        draft,
        instruction,
        undefined,
        input.sourceContext,
        input.sourceChatTitle,
      );

      const draftText = await streamStudioWriter({
        session,
        llm: input.config.llm,
        writerPrompt: reviserPrompt,
        userContent: instruction,
        abortSignal: signal,
        emitFinal: false,
        tokenPhase: 'studio_writer',
        obs,
        reasoningPreset,
      });

      if (signal?.aborted) {
        await setError();
        return;
      }

      emitStudioStatus(session, statusBlockId, '核查中…');

      let finalPrompt = reviserPrompt;
      try {
        const { result: verifierResult } = await runStudioVerifier({
          llm: input.config.llm,
          draft: draftText,
          spec: input.spec,
          sourcesXml: '',
          sourceContext: input.sourceContext,
          abortSignal: signal,
          obs,
          reasoningPreset,
        });

        finalPrompt = appendStudioVerifierRevisionInstructions(
          reviserPrompt,
          formatVerifierReport(verifierResult),
          draftText,
        );
      } catch (verifierErr) {
        if (signal?.aborted) {
          await setError();
          return;
        }
        console.warn('[StudioAgent] revise verifier failed:', verifierErr);
      }

      emitStudioStatus(session, statusBlockId, '定稿中…');

      await streamStudioWriter({
        session,
        llm: input.config.llm,
        writerPrompt: finalPrompt,
        userContent: instruction,
        abortSignal: signal,
        emitFinal: true,
        tokenPhase: 'studio_writer',
        obs,
        reasoningPreset,
      });

      if (signal?.aborted) {
        await setError();
        return;
      }

      emitStudioStatus(session, statusBlockId, '完成');

      session.emit('end', {});
      await finalizeMessage(session, input);
    } catch (err: unknown) {
      if (signal?.aborted || (err as Error)?.name === 'AbortError') {
        await setError();
        return;
      }
      console.error('[StudioAgent.revise]', err);
      await setError();
      session.emit('error', {
        data: err instanceof Error ? err.message : String(err),
      });
    }
  }
}

export default StudioAgent;
