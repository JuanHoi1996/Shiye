import {
  ResearcherOutput,
  SearchAgentConfig,
  SearchAgentInput,
} from './types';
import SessionManager from '@/lib/session';
import { classify } from './classifier';
import Researcher from './researcher';
import { getWriterPrompt as getGenericWriterPrompt } from '@/lib/prompts/search/writer';
import { WidgetExecutor } from './widgets';
import db from '@/lib/db';
import { messages } from '@/lib/db/schema';
import { and, eq, gt } from 'drizzle-orm';
import { TextBlock } from '@/lib/types';
import fs from 'fs';
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
      standaloneFollowUpLen:
        typeof cfg.extra?.standaloneFollowUp === 'string'
          ? (cfg.extra.standaloneFollowUp as string).length
          : undefined,
    }),
  );
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
      const classification = await classify({
        chatHistory: budgetedHistory,
        enabledSources: input.config.sources,
        query: input.followUp,
        llm: input.config.llm,
        abortSignal: signal,
      });

      if (obs) {
        const u = (classification as { _usage?: unknown })._usage;
        if (u != null) {
          appendTokenUsage({
            chatId: obs.chatId,
            messageId: obs.messageId,
            providerId: obs.providerId,
            modelKey: obs.modelKey,
            phase: 'classifier',
            skipSearch: classification.classification.skipSearch,
            personalSearch: classification.classification.personalSearch,
            ...normalizeOpenAIUsage(u),
            optimizationMode: input.config.mode,
            reasoningPreset: input.config.reasoningPreset ?? 'auto',
          });
        }
      }

      logProviderTurn({
      config: input.config,
      phase: 'post_classify',
      extra: {
        skipSearch: classification.classification.skipSearch,
        standaloneFollowUp: classification.standaloneFollowUp,
      },
    });

    const widgetPromise = WidgetExecutor.executeAll({
      classification,
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

    if (!classification.classification.skipSearch || classification.classification.personalSearch) {
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

    session.emit('data', {
      type: 'researchComplete',
    });

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

    let getWriterPrompt = getGenericWriterPrompt;
    try {
      const shiye = require('@/lib/prompts/search/writer-shiye');
      if (shiye?.getWriterPrompt) {
        getWriterPrompt = shiye.getWriterPrompt;
      }
    } catch {
      // Private shiye prompt not available, using generic writer
    }

    const writerPrompt = getWriterPrompt(
      finalContextWithWidgets,
      input.config.systemInstructions,
      input.config.mode,
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

    const answerStream = input.config.llm.streamText({
      messages: [
        {
          role: 'system',
          content: writerPrompt,
        },
        ...budgetedHistory,
        {
          role: 'user',
          content: userContentForLlm,
        },
      ],
      options: signal ? { signal } : undefined,
    });

    const researcherRan =
      !classification.classification.skipSearch ||
      classification.classification.personalSearch;

    let responseBlockId = '';
    let writerUsageLogged = false;

    for await (const chunk of answerStream) {
      if (signal?.aborted) {
        break;
      }
      if (chunk.additionalInfo?.usage) {
        if (!writerUsageLogged && obs) {
          writerUsageLogged = true;
          appendTokenUsage({
            chatId: obs.chatId,
            messageId: obs.messageId,
            providerId: obs.providerId,
            modelKey: obs.modelKey,
            phase: 'writer',
            researcherRan,
            skipSearch: classification.classification.skipSearch,
            personalSearch: classification.classification.personalSearch,
            ...normalizeOpenAIUsage(chunk.additionalInfo.usage),
            optimizationMode: input.config.mode,
            reasoningPreset: input.config.reasoningPreset ?? 'auto',
          });
        }
      }
      if (!responseBlockId) {
        const block: TextBlock = {
          id: crypto.randomUUID(),
          type: 'text',
          data: chunk.contentChunk,
        };

        session.emitBlock(block);

        responseBlockId = block.id;
      } else {
        const block = session.getBlock(responseBlockId) as TextBlock | null;

        if (!block) {
          continue;
        }

        block.data += chunk.contentChunk;

        session.updateBlock(block.id, [
          {
            op: 'replace',
            path: '/data',
            value: block.data,
          },
        ]);
      }
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
