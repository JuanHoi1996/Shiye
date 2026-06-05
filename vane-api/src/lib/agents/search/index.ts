import {
  ClassifierOutput,
  ResearcherOutput,
  SearchAgentConfig,
  SearchAgentInput,
} from './types';
import SessionManager from '@/lib/session';
import { classify } from './classifier';
import Researcher from './researcher';
import { getWriterPrompt } from '@/lib/prompts/search/writer';
import { SHIYE_PERSONA_NAME } from '@/lib/prompts/persona';
import { WidgetExecutor } from './widgets';
import db from '@/lib/db';
import { messages } from '@/lib/db/schema';
import { and, eq, gt } from 'drizzle-orm';
import { Message, ResearchBlock, TextBlock } from '@/lib/types';
import fs from 'fs';
import z from 'zod';
import { getVerifierPrompt } from '@/lib/prompts/search/verifier';
import type { TokenUsagePhase } from '@/lib/observability/tokenUsage';
import UploadManager from '@/lib/uploads/manager';
import {
  applyChatHistoryBudget,
  buildWriterSearchContextXml,
  capWidgetLlmContext,
} from '@/lib/utils/chatBudget';
import { touchChatLastMessageAt } from '@/lib/db/touchChatLastMessageAt';
import {
  appendTokenUsage,
  normalizeOpenAIUsage,
  tokenUsageModeFields,
} from '@/lib/observability/tokenUsage';

/** Persist error state when search aborts or throws; safe to call from routes catch. */
export async function persistSearchFailure(
  input: Pick<SearchAgentInput, 'chatId' | 'messageId'>,
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
function logProviderTurn(cfg: {
  config: SearchAgentConfig;
  phase: string;
  extra?: Record<string, unknown>;
}) {
  const chatProv =
    (cfg.config.llm as { config?: { model?: string } })?.config?.model ??
    '';
  console.log(
    JSON.stringify({
      event: 'search.provider_turn',
      phase: cfg.phase,
      modelKey: chatProv,
      mode: cfg.config.mode,
      reasoningPreset: cfg.config.reasoningPreset ?? 'auto',
      skipSearch: cfg.extra?.skipSearch,
      deepResearchForcedSearch: cfg.extra?.deepResearchForcedSearch,
      standaloneFollowUpLen:
        typeof cfg.extra?.standaloneFollowUp === 'string'
          ? (cfg.extra.standaloneFollowUp as string).length
          : undefined,
    }),
  );
}

/** DeepResearch (quality): always search; enable tools for each enabled source. */
function classificationForSearchPipeline(
  classification: ClassifierOutput,
  config: SearchAgentConfig,
): ClassifierOutput {
  if (config.mode !== 'quality') {
    return classification;
  }
  const next = {
    ...classification,
    classification: { ...classification.classification },
  };
  next.classification.skipSearch = false;
  if (config.sources.includes('academic')) {
    next.classification.academicSearch = true;
  }
  if (config.sources.includes('discussions')) {
    next.classification.discussionSearch = true;
  }
  return next;
}

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

function normalizeVerifierOutput(raw: unknown): VerifierOutput {
  if (typeof raw === 'string') {
    try {
      return normalizeVerifierOutput(JSON.parse(raw));
    } catch {
      /* fall through to safeParse */
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

type WriterEmitMode = 'draft' | 'final';

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

function appendVerifierRevisionInstructions(
  baseWriterPrompt: string,
  verifier: VerifierOutput,
  draft: string,
): string {
  return `${baseWriterPrompt}

### Verification review (mandatory — DeepResearch final pass)
Revise the draft using the verifier report below. This is the answer users will see.
- **no**: remove the claim or replace with careful uncertainty ("未核实", "存疑", "sources do not support").
- **partial**: keep only with explicit uncertainty qualifiers.
- **yes**: keep; cite sources as usual.

<verification_report>
${formatVerifierReport(verifier)}
</verification_report>

<draft_to_revise note="internal reference only">
${draft}
</draft_to_revise>`;
}

function emitResearchReasoningSubstep(
  session: SessionManager,
  heading: string,
  body?: string,
): void {
  const researchBlock = session
    .getAllBlocks()
    .find((b): b is ResearchBlock => b.type === 'research');
  if (!researchBlock) return;

  const reasoning = body ? `${heading}\n\n${body}` : heading;
  researchBlock.data.subSteps.push({
    id: crypto.randomUUID(),
    type: 'reasoning',
    reasoning,
  });
  session.updateBlock(researchBlock.id, [
    {
      op: 'replace',
      path: '/data/subSteps',
      value: researchBlock.data.subSteps,
    },
  ]);
}

function emitVerificationSubstep(
  session: SessionManager,
  verifier: VerifierOutput,
): void {
  emitResearchReasoningSubstep(
    session,
    '## Verification',
    formatVerifierReport(verifier),
  );
}

async function streamWriterAnswer(params: {
  session: SessionManager;
  llm: SearchAgentInput['config']['llm'];
  writerPrompt: string;
  budgetedHistory: Message[];
  userContentForLlm: string | Message['content'];
  abortSignal?: AbortSignal;
  emitMode: WriterEmitMode;
  obs?: SearchAgentInput['config']['observability'];
  tokenPhase: Extract<TokenUsagePhase, 'writer_draft' | 'writer'>;
  optimizationMode: SearchAgentInput['config']['mode'];
  reasoningPreset: string;
  researcherRan: boolean;
  skipSearch: boolean;
  personalSearch: boolean;
}): Promise<string> {
  const answerStream = params.llm.streamText({
    messages: [
      { role: 'system', content: params.writerPrompt },
      ...params.budgetedHistory,
      { role: 'user', content: params.userContentForLlm },
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
        researcherRan: params.researcherRan,
        skipSearch: params.skipSearch,
        personalSearch: params.personalSearch,
        ...normalizeOpenAIUsage(chunk.additionalInfo.usage),
        ...tokenUsageModeFields(params.optimizationMode),
        reasoningPreset: params.reasoningPreset,
      });
    }

    accumulated += chunk.contentChunk;

    if (params.emitMode === 'final') {
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

async function runVerifier(params: {
  llm: SearchAgentInput['config']['llm'];
  draft: string;
  sourcesXml: string;
  abortSignal?: AbortSignal;
}): Promise<{ result: VerifierOutput; usage?: unknown }> {
  const runGenerate = () =>
    params.llm.generateObject<typeof verifierSchema>({
      messages: [
        {
          role: 'system',
          content: getVerifierPrompt(params.draft, params.sourcesXml),
        },
        {
          role: 'user',
          content:
            'Audit the draft against sources. Return JSON only per the schema.',
        },
      ],
      schema: verifierSchema,
      options: {
        reasoningPreset: 'off',
        maxTokens: 4096,
        ...(params.abortSignal ? { signal: params.abortSignal } : {}),
      },
    });

  let lastErr: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const raw = await runGenerate();
      const usage = (raw as { _usage?: unknown })._usage;
      const result = normalizeVerifierOutput(raw);
      return { result, usage };
    } catch (err) {
      lastErr = err;
      if (attempt === 0) {
        console.warn('[verifier] generateObject failed, retrying once:', err);
      }
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}

class SearchAgent {
  async searchAsync(session: SessionManager, input: SearchAgentInput) {
    const signal = input.abortSignal;
    input.config.llm.setGenerateContext?.({
      reasoningPreset: input.config.reasoningPreset ?? 'auto',
    });
    const budgetedHistory = applyChatHistoryBudget([...input.chatHistory]);

    const setMessageError = async () => {
      await persistSearchFailure(
        { chatId: input.chatId, messageId: input.messageId },
        session,
      );
    };

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
        query: input.followUp,
        createdAt: new Date().toISOString(),
        status: 'answering',
        responseBlocks: [],
        providerId: input.config.llm.config?.providerId,
        modelKey: input.config.llm.config?.model,
        reasoningPreset: input.config.reasoningPreset ?? 'auto',
        optimizationMode: input.config.mode,
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
          optimizationMode: input.config.mode,
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

    if (signal?.aborted) {
      await setMessageError();
      return;
    }

    try {
      const obs = input.config.observability;
      const rawClassification = await classify({
        chatHistory: budgetedHistory,
        enabledSources: input.config.sources,
        query: input.followUp,
        llm: input.config.llm,
        abortSignal: signal,
      });
      const isDeepResearch = input.config.mode === 'quality';
      const classification = classificationForSearchPipeline(
        rawClassification,
        input.config,
      );
      const deepResearchForcedSearch =
        isDeepResearch &&
        rawClassification.classification.skipSearch === true;

      if (obs) {
        const u = (rawClassification as { _usage?: unknown })._usage;
        if (u != null) {
          appendTokenUsage({
            chatId: obs.chatId,
            messageId: obs.messageId,
            providerId: obs.providerId,
            modelKey: obs.modelKey,
            phase: 'classifier',
            skipSearch: rawClassification.classification.skipSearch,
            personalSearch: rawClassification.classification.personalSearch,
            ...normalizeOpenAIUsage(u),
            ...tokenUsageModeFields(input.config.mode),
            reasoningPreset: input.config.reasoningPreset ?? 'auto',
          });
        }
      }

      logProviderTurn({
      config: input.config,
      phase: 'post_classify',
      extra: {
        skipSearch: classification.classification.skipSearch,
        deepResearchForcedSearch,
        standaloneFollowUp: classification.standaloneFollowUp,
      },
    });

    const widgetPromise = WidgetExecutor.executeAll({
      classification: rawClassification,
      chatHistory: budgetedHistory,
      followUp: input.followUp,
      llm: input.config.llm,
    }).then((widgetOutputs) => {
      widgetOutputs.forEach((o) => {
        session.emitBlock({
          id: crypto.randomUUID(),
          type: 'widget',
          data: {
            widgetType: o.type,
            params: o.data,
          },
        });
      });
      return widgetOutputs;
    });

    let searchPromise: Promise<ResearcherOutput> | null = null;

    if (
      isDeepResearch ||
      !classification.classification.skipSearch ||
      classification.classification.personalSearch
    ) {
      const researcher = new Researcher();
      searchPromise = researcher.research(session, {
        chatHistory: budgetedHistory,
        followUp: input.followUp,
        classification: classification,
        config: input.config,
        abortSignal: signal,
      });
    }

    const [widgetOutputs, searchResults] = await Promise.all([
      widgetPromise,
      searchPromise,
    ]);

    if (signal?.aborted) {
      await setMessageError();
      return;
    }

    if (!isDeepResearch) {
      session.emit('data', {
        type: 'researchComplete',
      });
    }

    const { xml: finalContext, wasTruncated: writerContextTruncated } =
      buildWriterSearchContextXml(
        (searchResults?.searchFindings ?? []) as {
          content: string;
          metadata: { title?: string; url?: string };
        }[],
      );
    if (writerContextTruncated) {
      const q = input.followUp.trim();
      console.warn(
        `[SearchAgent] writer search context truncated to char budget chatId=${input.chatId} messageId=${input.messageId} researcherIterations=${searchResults?.researcherIterationsCompleted ?? 'n/a'} queryPreview=${JSON.stringify(q.slice(0, 120))}`,
      );
    }

    const widgetContext = widgetOutputs
      .map((o) => {
        return `<result>${capWidgetLlmContext(o.llmContext)}</result>`;
      })
      .join('\n-------------\n');

    const finalContextWithWidgets = `<search_results note="These are the search results and assistant can cite these">\n${finalContext}\n</search_results>\n<widgets_result noteForAssistant="Its output is already showed to the user, assistant can use this information to answer the query but do not CITE this as a souce">\n${widgetContext}\n</widgets_result>`;

    const writerPrompt = getWriterPrompt(
      finalContextWithWidgets,
      input.config.systemInstructions,
      input.config.mode,
      SHIYE_PERSONA_NAME,
    );
    const userMessageContent: any[] = [{ type: 'text', text: input.followUp }];

    input.config.fileIds.forEach((fileId) => {
      const file = UploadManager.getFile(fileId);
      if (
        file &&
        (file.filePath.endsWith('.png') ||
          file.filePath.endsWith('.jpg') ||
          file.filePath.endsWith('.jpeg') ||
          file.filePath.endsWith('.webp'))
      ) {
        const base64 = fs.readFileSync(file.filePath, { encoding: 'base64' });
        let mimeType = 'image/jpeg';
        if (file.filePath.endsWith('.png')) mimeType = 'image/png';
        else if (file.filePath.endsWith('.webp')) mimeType = 'image/webp';

        userMessageContent.push({
          type: 'image_url',
          image_url: { url: `data:${mimeType};base64,${base64}` },
        });
      }
    });

    const imagePartCount = userMessageContent.filter(
      (p) => p?.type === 'image_url',
    ).length;
    if (imagePartCount > 0 && !input.config.llm.supportsVision()) {
      userMessageContent.length = 0;
      userMessageContent.push({
        type: 'text',
        text: `${input.followUp}\n\n[System: ${imagePartCount} attached image(s) were not sent because this model does not support vision. Answer from text and retrieved context only.]`,
      });
    }

    const hasImageUrls = userMessageContent.some((p) => p?.type === 'image_url');
    const userContentForLlm = hasImageUrls
      ? userMessageContent
      : (userMessageContent[0]?.text ?? input.followUp);

    const researcherRan =
      isDeepResearch ||
      !classification.classification.skipSearch ||
      classification.classification.personalSearch;

    const writerStreamBase = {
      session,
      llm: input.config.llm,
      budgetedHistory,
      userContentForLlm,
      abortSignal: signal,
      obs,
      optimizationMode: input.config.mode,
      reasoningPreset: input.config.reasoningPreset ?? 'auto',
      researcherRan,
      skipSearch: classification.classification.skipSearch,
      personalSearch: classification.classification.personalSearch,
    };

    if (isDeepResearch) {
      emitResearchReasoningSubstep(
        session,
        '## Composing draft',
        'Internal draft for verification (not shown yet).',
      );

      const draftText = await streamWriterAnswer({
        ...writerStreamBase,
        writerPrompt,
        emitMode: 'draft',
        tokenPhase: 'writer_draft',
      });

      if (signal?.aborted) {
        await setMessageError();
        return;
      }

      emitResearchReasoningSubstep(
        session,
        '## Verifying',
        'Checking claims against sources…',
      );

      // Verifier is a value-add audit; if it fails we degrade to the unverified
      // draft answer rather than failing the whole turn.
      let finalWriterPrompt = writerPrompt;
      try {
        const { result: verifierResult, usage: verifierUsage } =
          await runVerifier({
            llm: input.config.llm,
            draft: draftText,
            sourcesXml: finalContext,
            abortSignal: signal,
          });

        if (obs && verifierUsage != null) {
          appendTokenUsage({
            chatId: obs.chatId,
            messageId: obs.messageId,
            providerId: obs.providerId,
            modelKey: obs.modelKey,
            phase: 'verifier',
            researcherRan,
            skipSearch: classification.classification.skipSearch,
            personalSearch: classification.classification.personalSearch,
            ...normalizeOpenAIUsage(verifierUsage),
            ...tokenUsageModeFields(input.config.mode),
            reasoningPreset: input.config.reasoningPreset ?? 'auto',
          });
        }

        emitVerificationSubstep(session, verifierResult);

        finalWriterPrompt = appendVerifierRevisionInstructions(
          writerPrompt,
          verifierResult,
          draftText,
        );
      } catch (verifierErr) {
        if (signal?.aborted) {
          await setMessageError();
          return;
        }
        console.warn(
          '[SearchAgent] verifier failed; falling back to unverified answer:',
          verifierErr,
        );
        emitResearchReasoningSubstep(
          session,
          '## Verification skipped',
          'Could not complete structured verification; publishing answer without audit pass.',
        );
      }

      session.emit('data', {
        type: 'researchComplete',
      });

      await streamWriterAnswer({
        ...writerStreamBase,
        writerPrompt: finalWriterPrompt,
        emitMode: 'final',
        tokenPhase: 'writer',
      });
    } else {
      await streamWriterAnswer({
        ...writerStreamBase,
        writerPrompt,
        emitMode: 'final',
        tokenPhase: 'writer',
      });
    }

    if (signal?.aborted) {
      await setMessageError();
      return;
    }

    session.emit('end', {});

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
    } catch (err: unknown) {
      if (signal?.aborted || (err as Error)?.name === 'AbortError') {
        await setMessageError();
        return;
      }
      console.error('[SearchAgent.searchAsync]', err);
      await setMessageError();
      session.emit('error', {
        data: err instanceof Error ? err.message : String(err),
      });
    }
  }
}

export default SearchAgent;
