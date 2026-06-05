import crypto from 'node:crypto';
import { Router } from 'express';
import { z } from 'zod';
import { and, desc, eq } from 'drizzle-orm';
import ModelRegistry from '@/lib/models/registry';
import type { ModelWithProvider } from '@/lib/models/types';
import StudioAgent, { persistStudioFailure } from '@/lib/agents/studio';
import { loadStudioSourceContext } from '@/lib/agents/studio/loadSourceContext';
import { normalizeStudioSpec } from '@/lib/agents/studio/spec';
import {
  encodeStudioQuery,
  parseStudioSpecFromQuery,
  type StudioSpec,
} from '@/lib/agents/studio/types';
import SessionManager from '@/lib/session';
import db from '@/lib/db';
import { chats, messages } from '@/lib/db/schema';
import { touchChatLastMessageAt } from '@/lib/db/touchChatLastMessageAt';
import { pipeWebReadableToResponse } from '@/pipeWebStream';
import type { TextBlock } from '@/lib/types';

const studioSpecSchema: z.ZodType<StudioSpec> = z.object({
  instruction: z.string().min(1),
  lengthPreference: z
    .enum(['shorter', 'standard', 'longer'])
    .default('standard'),
  audience: z.string().min(1),
  genre: z.string().min(1),
  useResearch: z.boolean().default(false),
  fromChatId: z.string().min(1),
});

const chatModelSchema: z.ZodType<ModelWithProvider> = z.object({
  providerId: z.string(),
  key: z.string(),
});

const embeddingModelSchema: z.ZodType<ModelWithProvider> = z.object({
  providerId: z.string(),
  key: z.string(),
});

const createBodySchema = z.object({
  spec: studioSpecSchema,
  chatModel: chatModelSchema,
  embeddingModel: embeddingModelSchema,
  reasoningPreset: z
    .enum(['auto', 'off', 'low', 'high', 'max'])
    .optional()
    .default('auto'),
});

const reviseBodySchema = z.object({
  chatId: z.string().min(1),
  instruction: z.string().min(1),
  chatModel: chatModelSchema,
  embeddingModel: embeddingModelSchema,
  reasoningPreset: z
    .enum(['auto', 'off', 'low', 'high', 'max'])
    .optional()
    .default('auto'),
});

function randomHex(byteLength: number): string {
  return crypto.randomBytes(byteLength).toString('hex');
}

function extractLatestDraftText(
  chatMessages: { responseBlocks: unknown[] }[],
): string {
  for (let i = chatMessages.length - 1; i >= 0; i--) {
    const blocks = chatMessages[i]?.responseBlocks as TextBlock[] | undefined;
    if (!blocks) continue;
    const text = blocks
      .filter((b): b is TextBlock => b.type === 'text')
      .map((b) => b.data)
      .join('\n')
      .trim();
    if (text) return text;
  }
  return '';
}

function extractStudioSpecFromMessages(
  chatMessages: { query: string }[],
): StudioSpec | null {
  for (const msg of chatMessages) {
    const { spec } = parseStudioSpecFromQuery(msg.query);
    if (spec) return spec;
  }
  return null;
}

function subscribeSessionToStream(
  session: SessionManager,
  writer: WritableStreamDefaultWriter<Uint8Array>,
  encoder: TextEncoder,
  writerRelease: { done: boolean },
  extraFirstLine?: string,
): () => void {
  if (extraFirstLine) {
    void writer.write(encoder.encode(extraFirstLine));
  }

  const releaseStreamWriter = () => {
    if (writerRelease.done) return;
    writerRelease.done = true;
    void writer.close().catch(() => {});
  };

  const disconnect = session.subscribe((event: string, data: unknown) => {
    if (event === 'data') {
      const payload = data as { type?: string; block?: unknown; blockId?: string; patch?: unknown };
      if (payload.type === 'block') {
        void writer.write(
          encoder.encode(
            JSON.stringify({ type: 'block', block: payload.block }) + '\n',
          ),
        );
      } else if (payload.type === 'updateBlock') {
        void writer.write(
          encoder.encode(
            JSON.stringify({
              type: 'updateBlock',
              blockId: payload.blockId,
              patch: payload.patch,
            }) + '\n',
          ),
        );
      }
    } else if (event === 'end') {
      void writer.write(
        encoder.encode(JSON.stringify({ type: 'messageEnd' }) + '\n'),
      );
      releaseStreamWriter();
      session.removeAllListeners();
    } else if (event === 'error') {
      const errData = data as { data?: string };
      void writer.write(
        encoder.encode(
          JSON.stringify({ type: 'error', data: errData.data }) + '\n',
        ),
      );
      releaseStreamWriter();
      session.removeAllListeners();
    }
  });

  return () => {
    disconnect();
    releaseStreamWriter();
  };
}

function scheduleStudioRun(
  run: (session: SessionManager) => Promise<void>,
  session: SessionManager,
  input: { chatId: string; messageId: string },
) {
  void run(session).catch(async (err: unknown) => {
    const name = err instanceof Error ? err.name : '';
    if (name === 'AbortError') return;
    console.error('[studioAsync]', err);
    try {
      await persistStudioFailure(input, session);
    } catch (persistErr) {
      console.error('[scheduleStudioRun] persistStudioFailure:', persistErr);
    }
    session.emit('error', {
      data: err instanceof Error ? err.message : String(err),
    });
  });
}

export const studioRouter = Router();

studioRouter.post('/create', async (req, res) => {
  try {
    const parsed = createBodySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        message: 'Invalid request body',
        error: parsed.error.issues,
      });
      return;
    }

    const body = parsed.data;
    const spec = normalizeStudioSpec(body.spec) ?? body.spec;

    let source;
    try {
      source = await loadStudioSourceContext(spec.fromChatId);
    } catch (err) {
      res.status(400).json({
        message:
          err instanceof Error ? err.message : 'Invalid source chat.',
      });
      return;
    }

    if (!source.text.trim() || source.turnCount === 0) {
      res.status(400).json({ message: 'Source chat has no messages.' });
      return;
    }

    const chatId = randomHex(20);
    const messageId = randomHex(7);
    const now = new Date().toISOString();

    await db.insert(chats).values({
      id: chatId,
      kind: 'studio',
      title: `写作团队 · ${spec.instruction.slice(0, 40)} · ${spec.genre}`,
      createdAt: now,
      lastMessageAt: now,
      sources: spec.useResearch ? ['web'] : [],
      files: [],
    });

    const registry = new ModelRegistry();
    const [llm, embedding] = await Promise.all([
      registry.loadChatModel(body.chatModel.providerId, body.chatModel.key),
      registry.loadEmbeddingModel(
        body.embeddingModel.providerId,
        body.embeddingModel.key,
      ),
    ]);

    const session = SessionManager.createSession();
    const abort = new AbortController();
    const agent = new StudioAgent();

    const responseStream = new TransformStream();
    const writer = responseStream.writable.getWriter();
    const encoder = new TextEncoder();
    const writerRelease = { done: false };

    const firstLine =
      JSON.stringify({ type: 'chatCreated', chatId, messageId }) + '\n';

    const cleanup = subscribeSessionToStream(
      session,
      writer,
      encoder,
      writerRelease,
      firstLine,
    );

    scheduleStudioRun(
      (s) =>
        agent.runInitial(s, {
          chatId,
          messageId,
          spec,
          sourceContext: source.text,
          sourceChatTitle: source.chatTitle,
          chatHistory: [],
          userInstruction: encodeStudioQuery(spec),
          config: {
            llm,
            embedding,
            sources: spec.useResearch ? ['web'] : [],
            fileIds: [],
            reasoningPreset: body.reasoningPreset,
            observability: {
              chatId,
              messageId,
              providerId: body.chatModel.providerId,
              modelKey: body.chatModel.key,
            },
          },
          abortSignal: abort.signal,
        }),
      session,
      { chatId, messageId },
    );

    const onClose = () => {
      abort.abort();
      cleanup();
    };
    req.on('close', onClose);
    res.on('finish', () => req.off('close', onClose));

    pipeWebReadableToResponse(responseStream.readable, res, {
      'Content-Type': 'text/event-stream',
      Connection: 'keep-alive',
      'Cache-Control': 'no-cache, no-transform',
    });
  } catch (err) {
    console.error('[studio/create]', err);
    res.status(500).json({ message: 'Failed to create studio chat.' });
  }
});

studioRouter.post('/revise', async (req, res) => {
  try {
    const parsed = reviseBodySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        message: 'Invalid request body',
        error: parsed.error.issues,
      });
      return;
    }

    const body = parsed.data;

    const chat = await db.query.chats.findFirst({
      where: eq(chats.id, body.chatId),
    });

    if (!chat || chat.kind !== 'studio') {
      res.status(404).json({ message: 'Studio chat not found.' });
      return;
    }

    const chatMessages = await db.query.messages.findMany({
      where: eq(messages.chatId, body.chatId),
      orderBy: [desc(messages.id)],
    });

    const ordered = [...chatMessages].reverse();
    const spec = extractStudioSpecFromMessages(ordered);
    if (!spec) {
      res.status(400).json({ message: 'Studio spec not found in chat history.' });
      return;
    }

    let sourceContext: string | undefined;
    let sourceChatTitle: string | undefined;
    if (spec.fromChatId) {
      try {
        const source = await loadStudioSourceContext(spec.fromChatId);
        sourceContext = source.text;
        sourceChatTitle = source.chatTitle;
      } catch (err) {
        console.warn('[studio/revise] source chat reload failed:', err);
      }
    }

    const currentDraft = extractLatestDraftText(ordered);
    if (!currentDraft) {
      res.status(400).json({ message: 'No draft found to revise.' });
      return;
    }

    const messageId = randomHex(7);
    const registry = new ModelRegistry();
    const [llm, embedding] = await Promise.all([
      registry.loadChatModel(body.chatModel.providerId, body.chatModel.key),
      registry.loadEmbeddingModel(
        body.embeddingModel.providerId,
        body.embeddingModel.key,
      ),
    ]);

    const session = SessionManager.createSession();
    const abort = new AbortController();
    const agent = new StudioAgent();

    const responseStream = new TransformStream();
    const writer = responseStream.writable.getWriter();
    const encoder = new TextEncoder();
    const writerRelease = { done: false };

    const cleanup = subscribeSessionToStream(
      session,
      writer,
      encoder,
      writerRelease,
    );

    scheduleStudioRun(
      (s) =>
        agent.revise(s, {
          chatId: body.chatId,
          messageId,
          spec,
          sourceContext,
          sourceChatTitle,
          currentDraft,
          userInstruction: body.instruction,
          chatHistory: [],
          config: {
            llm,
            embedding,
            sources: chat.sources ?? ['web'],
            fileIds: [],
            reasoningPreset: body.reasoningPreset,
            observability: {
              chatId: body.chatId,
              messageId,
              providerId: body.chatModel.providerId,
              modelKey: body.chatModel.key,
            },
          },
          abortSignal: abort.signal,
        }),
      session,
      { chatId: body.chatId, messageId },
    );

    const onClose = () => {
      abort.abort();
      cleanup();
    };
    req.on('close', onClose);
    res.on('finish', () => req.off('close', onClose));

    pipeWebReadableToResponse(responseStream.readable, res, {
      'Content-Type': 'text/event-stream',
      Connection: 'keep-alive',
      'Cache-Control': 'no-cache, no-transform',
    });
  } catch (err) {
    console.error('[studio/revise]', err);
    res.status(500).json({ message: 'Failed to revise studio draft.' });
  }
});

studioRouter.get('/:chatId/export', async (req, res) => {
  try {
    const { chatId } = req.params;

    const chat = await db.query.chats.findFirst({
      where: eq(chats.id, chatId),
    });

    if (!chat || chat.kind !== 'studio') {
      res.status(404).json({ message: 'Studio chat not found.' });
      return;
    }

    const chatMessages = await db.query.messages.findMany({
      where: eq(messages.chatId, chatId),
      orderBy: [desc(messages.id)],
    });

    const draft = extractLatestDraftText([...chatMessages].reverse());
    if (!draft) {
      res.status(404).json({ message: 'No draft to export.' });
      return;
    }

    const safeTitle = chat.title.replace(/[^\w\u4e00-\u9fff.-]+/g, '_').slice(0, 80);
    res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${safeTitle || 'studio-draft'}.md"`,
    );
    res.status(200).send(draft);
  } catch (err) {
    console.error('[studio/export]', err);
    res.status(500).json({ message: 'Failed to export draft.' });
  }
});
