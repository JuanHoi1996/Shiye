import crypto from 'node:crypto';
import { Router } from 'express';
import { z } from 'zod';
import { and, asc, eq } from 'drizzle-orm';
import db from '@/lib/db';
import { advisorRuns, chats, messages } from '@/lib/db/schema';
import {
  buildAdvisorChatHistory,
  checkEligibility,
  getEffectiveAdvisorSince,
  getFollowUpSystemPrompt,
  runAdvisorOnce,
  userMessageSuggestsMemoryUpdate,
} from '@/lib/agents/advisor';
import { touchChatLastMessageAt } from '@/lib/db/touchChatLastMessageAt';
import ModelRegistry from '@/lib/models/registry';
import configManager from '@/lib/config';
import type { TextBlock } from '@/lib/types';
import {
  loadUserMemory,
  saveUserMemory,
  updateMemoryFromAdvisor,
} from '@/lib/memory';
import { pipeWebReadableToResponse } from '@/pipeWebStream';
import {
  appendTokenUsage,
  normalizeOpenAIUsage,
} from '@/lib/observability/tokenUsage';

export const advisorRouter = Router();

const followUpBodySchema = z.object({
  content: z.string().min(1),
  messageId: z.string().min(1).optional(),
});

async function resolveDefaultChatModel(): Promise<{
  providerId: string;
  key: string;
}> {
  const registry = new ModelRegistry();
  const providers = await registry.getActiveProviders();
  const uiState = configManager.getCurrentConfig().uiState ?? {};

  if (uiState.chatModelProviderId && uiState.chatModelKey) {
    const provider = providers.find((p) => p.id === uiState.chatModelProviderId);
    if (provider?.chatModels.some((m) => m.key === uiState.chatModelKey)) {
      return {
        providerId: uiState.chatModelProviderId,
        key: uiState.chatModelKey,
      };
    }
  }

  const first = providers.find((p) => p.chatModels.length > 0);
  if (!first) {
    throw new Error('No chat model configured');
  }
  return { providerId: first.id, key: first.chatModels[0]!.key };
}

function advisorTitle(runIndex: number): string {
  const d = new Date();
  const y = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `师爷进言 · ${y}-${mo}-${day} 第 ${runIndex} 次`;
}

advisorRouter.get('/eligibility', async (_req, res) => {
  try {
    const result = await checkEligibility();
    res.status(200).json(result);
  } catch (err) {
    console.error('[advisor] eligibility:', err);
    res.status(500).json({ message: 'Failed to check advisor eligibility.' });
  }
});

advisorRouter.post('/run', async (req, res) => {
  const force = req.body?.force === true;
  let chatId: string | undefined;
  let assistantMessageId: string | undefined;
  let runId: string | undefined;

  try {
    const eligibility = await checkEligibility();
    if (!force && !eligibility.eligible) {
      res.status(400).json({
        message: 'Advisor run not due yet.',
        ...eligibility,
      });
      return;
    }

    const since = await getEffectiveAdvisorSince();
    const memory = await loadUserMemory();

    const priorRuns = await db.select({ id: advisorRuns.id }).from(advisorRuns);
    const runIndex = priorRuns.length + 1;

    chatId = crypto.randomUUID();
    assistantMessageId = crypto.randomUUID();
    runId = crypto.randomUUID();
    const now = new Date().toISOString();

    await db.insert(chats).values({
      id: chatId,
      title: advisorTitle(runIndex),
      createdAt: now,
      lastMessageAt: now,
      kind: 'advisor',
      sources: [],
      files: [],
    });

    await db.insert(messages).values({
      chatId,
      messageId: assistantMessageId,
      backendId: runId,
      query: 'auto',
      createdAt: now,
      status: 'answering',
      responseBlocks: [],
    });

    await db.insert(advisorRuns).values({
      id: runId,
      chatId,
      runAt: now,
      coveredUntilTimestamp: since ?? '',
      coveredChatCount: 0,
      coveredUserMessageCount: 0,
      status: 'running',
    });

    await touchChatLastMessageAt(chatId);

    const model = await resolveDefaultChatModel();
    const registry = new ModelRegistry();
    const llm = await registry.loadChatModel(model.providerId, model.key);

    let lastPersist = 0;
    const persistBlocks = async (text: string, blockId: string) => {
      const block: TextBlock = { id: blockId, type: 'text', data: text };
      await db
        .update(messages)
        .set({ responseBlocks: [block] })
        .where(
          and(
            eq(messages.chatId, chatId!),
            eq(messages.messageId, assistantMessageId!),
          ),
        )
        .execute();
    };

    const result = await runAdvisorOnce({
      llm,
      since,
      memory,
      observability: {
        chatId,
        messageId: assistantMessageId,
        providerId: model.providerId,
        modelKey: model.key,
      },
      onChunk: (text, blockId) => {
        const nowMs = Date.now();
        if (nowMs - lastPersist < 500) return;
        lastPersist = nowMs;
        void persistBlocks(text, blockId);
      },
    });

    const finalBlock: TextBlock = {
      id: result.blockId,
      type: 'text',
      data: result.text,
    };

    await db
      .update(messages)
      .set({
        status: 'completed',
        responseBlocks: [finalBlock],
        providerId: model.providerId,
        modelKey: model.key,
        reasoningPreset: 'high',
      })
      .where(
        and(
          eq(messages.chatId, chatId),
          eq(messages.messageId, assistantMessageId),
        ),
      )
      .execute();

    await db
      .update(advisorRuns)
      .set({
        status: 'completed',
        coveredUntilTimestamp: result.coveredUntil,
        coveredChatCount: result.chatCount,
        coveredUserMessageCount: result.userMessageCount,
      })
      .where(eq(advisorRuns.id, runId))
      .execute();

    await touchChatLastMessageAt(chatId);

    try {
      const updated = await updateMemoryFromAdvisor({
        currentMemory: memory,
        advisorReport: result.text,
        observability: {
          chatId,
          messageId: assistantMessageId,
        },
      });
      await saveUserMemory(updated, 'advisor');
    } catch (memErr) {
      console.error('[advisor] memory update after run:', memErr);
    }

    res.status(200).json({ chatId, runId });
  } catch (err) {
    console.error('[advisor] run:', err);
    if (runId) {
      await db
        .update(advisorRuns)
        .set({ status: 'error' })
        .where(eq(advisorRuns.id, runId))
        .execute()
        .catch(() => {});
    }
    if (chatId && assistantMessageId) {
      await db
        .update(messages)
        .set({ status: 'error' })
        .where(
          and(
            eq(messages.chatId, chatId),
            eq(messages.messageId, assistantMessageId),
          ),
        )
        .execute()
        .catch(() => {});
    }
    res.status(500).json({
      message: err instanceof Error ? err.message : 'Advisor run failed.',
    });
  }
});

advisorRouter.post('/chats/:chatId/message', async (req, res) => {
  const { chatId } = req.params;

  try {
    const parsed = followUpBodySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ message: 'Invalid request body.' });
      return;
    }

    const chat = await db.query.chats.findFirst({
      where: eq(chats.id, chatId),
    });
    if (!chat) {
      res.status(404).json({ message: 'Chat not found' });
      return;
    }
    if (chat.kind !== 'advisor') {
      res.status(400).json({ message: 'Not an advisor chat.' });
      return;
    }

    const userMessageId = parsed.data.messageId ?? crypto.randomUUID();
    const backendId = crypto.randomUUID();
    const now = new Date().toISOString();
    const userContent = parsed.data.content.trim();

    const existingRows = await db.query.messages.findMany({
      where: eq(messages.chatId, chatId),
      orderBy: [asc(messages.id)],
    });
    const memory = await loadUserMemory();
    const history = buildAdvisorChatHistory(existingRows);
    const systemPrompt = getFollowUpSystemPrompt(memory);

    const llmMessages = [
      { role: 'system' as const, content: systemPrompt },
      ...history,
      { role: 'user' as const, content: userContent },
    ];

    await db.insert(messages).values({
      chatId,
      messageId: userMessageId,
      backendId,
      query: userContent,
      createdAt: now,
      status: 'answering',
      responseBlocks: [],
    });
    await touchChatLastMessageAt(chatId);

    const model = await resolveDefaultChatModel();
    const registry = new ModelRegistry();
    const llm = await registry.loadChatModel(model.providerId, model.key);
    llm.setGenerateContext?.({ reasoningPreset: 'high' });

    const responseStream = new TransformStream();
    const writer = responseStream.writable.getWriter();
    const encoder = new TextEncoder();
    const writerRelease = { done: false };
    const releaseStreamWriter = () => {
      if (writerRelease.done) return;
      writerRelease.done = true;
      void writer.close().catch(() => {});
    };

    const blockId = crypto.randomUUID();
    const initialBlock: TextBlock = { id: blockId, type: 'text', data: '' };
    void writer.write(
      encoder.encode(
        JSON.stringify({ type: 'block', block: initialBlock }) + '\n',
      ),
    );

    const abort = new AbortController();
    const onClose = () => {
      abort.abort();
      releaseStreamWriter();
    };
    req.on('close', onClose);
    res.on('finish', () => req.off('close', onClose));

    pipeWebReadableToResponse(responseStream.readable, res, {
      'Content-Type': 'text/event-stream',
      Connection: 'keep-alive',
      'Cache-Control': 'no-cache, no-transform',
    });

    let accumulated = '';
    let usageLogged = false;
    let lastStreamWrite = 0;

    const stream = llm.streamText({
      messages: llmMessages,
      options: { reasoningPreset: 'high', signal: abort.signal },
    });

    try {
      for await (const chunk of stream) {
        if (abort.signal.aborted) break;

        if (chunk.additionalInfo?.usage && !usageLogged) {
          usageLogged = true;
          appendTokenUsage({
            chatId,
            messageId: userMessageId,
            providerId: model.providerId,
            modelKey: model.key,
            phase: 'advisor',
            reasoningPreset: 'high',
            ...normalizeOpenAIUsage(chunk.additionalInfo.usage),
          });
        }

        accumulated += chunk.contentChunk;
        const nowMs = Date.now();
        if (nowMs - lastStreamWrite >= 80 && accumulated) {
          lastStreamWrite = nowMs;
          await writer.write(
            encoder.encode(
              JSON.stringify({
                type: 'updateBlock',
                blockId,
                patch: { data: accumulated },
              }) + '\n',
            ),
          );
        }
      }

      if (accumulated && !abort.signal.aborted) {
        await writer.write(
          encoder.encode(
            JSON.stringify({
              type: 'updateBlock',
              blockId,
              patch: { data: accumulated },
            }) + '\n',
          ),
        );
      }

      const finalBlock: TextBlock = {
        id: blockId,
        type: 'text',
        data: accumulated,
      };

      if (!abort.signal.aborted) {
        await db
          .update(messages)
          .set({
            status: 'completed',
            responseBlocks: [finalBlock],
            providerId: model.providerId,
            modelKey: model.key,
            reasoningPreset: 'high',
          })
          .where(
            and(
              eq(messages.chatId, chatId),
              eq(messages.messageId, userMessageId),
            ),
          )
          .execute();
        await touchChatLastMessageAt(chatId);

        if (userMessageSuggestsMemoryUpdate(userContent)) {
          try {
            const conversationSnippet = [
              `主人：${userContent}`,
              `师爷：${accumulated}`,
            ].join('\n\n');
            const updated = await updateMemoryFromAdvisor({
              currentMemory: memory,
              advisorReport: conversationSnippet,
              observability: { chatId, messageId: userMessageId },
            });
            await saveUserMemory(updated, 'advisor');
          } catch (memErr) {
            console.error('[advisor] memory update after follow-up:', memErr);
          }
        }

        await writer.write(
          encoder.encode(JSON.stringify({ type: 'messageEnd' }) + '\n'),
        );
      }
    } catch (streamErr) {
      if (!abort.signal.aborted) {
        console.error('[advisor] follow-up stream:', streamErr);
        await db
          .update(messages)
          .set({ status: 'error' })
          .where(
            and(
              eq(messages.chatId, chatId),
              eq(messages.messageId, userMessageId),
            ),
          )
          .execute()
          .catch(() => {});
        await writer.write(
          encoder.encode(
            JSON.stringify({
              type: 'error',
              data:
                streamErr instanceof Error
                  ? streamErr.message
                  : 'Advisor follow-up failed.',
            }) + '\n',
          ),
        );
      }
    } finally {
      releaseStreamWriter();
    }
  } catch (err) {
    console.error('[advisor] follow-up:', err);
    if (!res.headersSent) {
      res.status(500).json({
        message: err instanceof Error ? err.message : 'Advisor follow-up failed.',
      });
    }
  }
});
