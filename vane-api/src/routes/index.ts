import crypto from 'node:crypto';
import { Router } from 'express';
import { z } from 'zod';
import multer from 'multer';
import ModelRegistry from '@/lib/models/registry';
import type { ModelWithProvider } from '@/lib/models/types';
import SearchAgent, {
  persistSearchFailure,
} from '@/lib/agents/search';
import SessionManager from '@/lib/session';
import type { ChatTurnMessage } from '@/lib/types';
import type { SearchAgentInput, SearchSources } from '@/lib/agents/search/types';
import db from '@/lib/db';
import { and, asc, desc, eq } from 'drizzle-orm';
import { chats, folders, messages } from '@/lib/db/schema';
import { forkChatFromAssistantMessage } from '@/lib/db/forkChat';
import { branchMetaByMessageIdForChat } from '@/lib/db/messageBranchMeta';
import UploadManager from '@/lib/uploads/manager';
import { UploadRejectedError } from '@/lib/uploads/uploadErrors';
import configManager from '@/lib/config';
import type { ConfigModelProvider } from '@/lib/config/types';
import generateSuggestions from '@/lib/agents/suggestions';
import APISearchAgent from '@/lib/agents/search/api';
import searchImages from '@/lib/agents/media/image';
import handleVideoSearch from '@/lib/agents/media/video';
import type { Model } from '@/lib/models/types';
import { touchChatLastMessageAt } from '@/lib/db/touchChatLastMessageAt';
import { pipeWebReadableToResponse } from '@/pipeWebStream';
import {
  buildUsageSummary,
  clampUsageDays,
} from '@/lib/observability/usageSummary';

function scheduleSearchAsync(
  agent: {
    searchAsync: (
      session: SessionManager,
      input: SearchAgentInput,
    ) => Promise<void>;
  },
  session: SessionManager,
  input: SearchAgentInput,
) {
  void agent.searchAsync(session, input).catch(async (err: unknown) => {
    if (input.abortSignal?.aborted) {
      return;
    }
    const name = err instanceof Error ? err.name : '';
    if (name === 'AbortError') {
      return;
    }
    console.error('[searchAsync]', err);
    try {
      await persistSearchFailure(
        { chatId: input.chatId, messageId: input.messageId },
        session,
      );
    } catch (persistErr) {
      console.error('[scheduleSearchAsync] persistSearchFailure:', persistErr);
    }
    session.emit('error', {
      data: err instanceof Error ? err.message : String(err),
    });
  });
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 100 * 1024 * 1024 },
});

const messageSchema = z.object({
  messageId: z.string().min(1, 'Message ID is required'),
  chatId: z.string().min(1, 'Chat ID is required'),
  content: z.string().min(1, 'Message content is required'),
});

const chatModelSchema: z.ZodType<ModelWithProvider> = z.object({
  providerId: z.string({ message: 'Chat model provider id must be provided' }),
  key: z.string({ message: 'Chat model key must be provided' }),
});

const embeddingModelSchema: z.ZodType<ModelWithProvider> = z.object({
  providerId: z.string({
    message: 'Embedding model provider id must be provided',
  }),
  key: z.string({ message: 'Embedding model key must be provided' }),
});

const chatBodySchema = z.object({
  message: messageSchema,
  optimizationMode: z.enum(['speed', 'balanced', 'quality'], {
    message: 'Optimization mode must be one of: speed, balanced, quality',
  }),
  sources: z.array(z.string()).optional().default([]),
  history: z
    .array(z.tuple([z.string(), z.string()]))
    .optional()
    .default([]),
  files: z.array(z.string()).optional().default([]),
  chatModel: chatModelSchema,
  embeddingModel: embeddingModelSchema,
  systemInstructions: z.string().nullable().optional().default(''),
  reasoningPreset: z
    .enum(['auto', 'off', 'low', 'high', 'max'])
    .optional()
    .default('auto'),
});

type ChatBody = z.infer<typeof chatBodySchema>;

const safeValidateBody = (data: unknown) => {
  const result = chatBodySchema.safeParse(data);
  if (!result.success) {
    return {
      success: false as const,
      error: result.error.issues.map((e) => ({
        path: e.path.join('.'),
        message: e.message,
      })),
    };
  }
  return { success: true as const, data: result.data };
};

const ensureChatExists = async (input: {
  id: string;
  sources: SearchSources[];
  query: string;
  fileIds: string[];
}) => {
  try {
    const exists = await db.query.chats
      .findFirst({
        where: eq(chats.id, input.id),
      })
      .execute();

    if (!exists) {
      const now = new Date().toISOString();
      await db.insert(chats).values({
        id: input.id,
        createdAt: now,
        lastMessageAt: now,
        sources: input.sources,
        title: input.query,
        files: input.fileIds.map((id) => {
          return {
            fileId: id,
            name: UploadManager.getFile(id)?.name || 'Uploaded File',
          };
        }),
      });
    }
  } catch (err) {
    console.error('Failed to check/save chat:', err);
  }
};

export const apiRouter = Router();

apiRouter.get('/usage/summary', async (req, res) => {
  try {
    const days = clampUsageDays(req.query.days);
    const summary = await buildUsageSummary(days);
    res.status(200).json(summary);
  } catch (err) {
    console.error('Error building usage summary:', err);
    res.status(500).json({ message: 'Failed to build usage summary.' });
  }
});

apiRouter.post('/chat', async (req, res) => {
  try {
    const parseBody = safeValidateBody(req.body);

    if (!parseBody.success) {
      res.status(400).json({
        message: 'Invalid request body',
        error: parseBody.error,
      });
      return;
    }

    const body = parseBody.data as ChatBody;
    const { message } = body;

    console.log(
      JSON.stringify({
        event: 'api.chat.request',
        providerId: body.chatModel.providerId,
        modelKey: body.chatModel.key,
        mode: body.optimizationMode,
        reasoningPreset: body.reasoningPreset,
        sourceCount: body.sources.length,
      }),
    );

    if (message.content === '') {
      res.status(400).json({ message: 'Please provide a message to process' });
      return;
    }

    const registry = new ModelRegistry();

    const [llm, embedding] = await Promise.all([
      registry.loadChatModel(body.chatModel.providerId, body.chatModel.key),
      registry.loadEmbeddingModel(
        body.embeddingModel.providerId,
        body.embeddingModel.key,
      ),
    ]);

    const history: ChatTurnMessage[] = body.history.map((msg) => {
      if (msg[0] === 'human') {
        return { role: 'user', content: msg[1] };
      }
      return { role: 'assistant', content: msg[1] };
    });

    const agent = new SearchAgent();
    const session = SessionManager.createSession();
    const chatAbort = new AbortController();

    const responseStream = new TransformStream();
    const writer = responseStream.writable.getWriter();
    const encoder = new TextEncoder();
    const writerRelease = { done: false };
    const releaseStreamWriter = () => {
      if (writerRelease.done) return;
      writerRelease.done = true;
      void writer.close().catch(() => {
        /* already closed or aborted */
      });
    };

    const disconnect = session.subscribe((event: string, data: any) => {
      if (event === 'data') {
        if (data.type === 'block') {
          writer.write(
            encoder.encode(
              JSON.stringify({ type: 'block', block: data.block }) + '\n',
            ),
          );
        } else if (data.type === 'updateBlock') {
          writer.write(
            encoder.encode(
              JSON.stringify({
                type: 'updateBlock',
                blockId: data.blockId,
                patch: data.patch,
              }) + '\n',
            ),
          );
        } else if (data.type === 'researchComplete') {
          writer.write(
            encoder.encode(
              JSON.stringify({ type: 'researchComplete' }) + '\n',
            ),
          );
        }
      } else if (event === 'end') {
        writer.write(
          encoder.encode(JSON.stringify({ type: 'messageEnd' }) + '\n'),
        );
        releaseStreamWriter();
        session.removeAllListeners();
      } else if (event === 'error') {
        writer.write(
          encoder.encode(
            JSON.stringify({ type: 'error', data: data.data }) + '\n',
          ),
        );
        releaseStreamWriter();
        session.removeAllListeners();
      }
    });

    await ensureChatExists({
      id: body.message.chatId,
      sources: body.sources as SearchSources[],
      fileIds: body.files,
      query: body.message.content,
    });

    scheduleSearchAsync(agent, session, {
      chatHistory: history,
      followUp: message.content,
      chatId: body.message.chatId,
      messageId: body.message.messageId,
      abortSignal: chatAbort.signal,
      config: {
        llm,
        embedding,
        sources: body.sources as SearchSources[],
        mode: body.optimizationMode,
        fileIds: body.files,
        systemInstructions: body.systemInstructions || 'None',
        reasoningPreset: body.reasoningPreset,
        observability: {
          chatId: body.message.chatId,
          messageId: body.message.messageId,
          providerId: body.chatModel.providerId,
          modelKey: body.chatModel.key,
        },
      },
    });

    const onClose = () => {
      chatAbort.abort();
      disconnect();
      releaseStreamWriter();
    };
    req.on('close', onClose);
    res.on('finish', () => req.off('close', onClose));

    pipeWebReadableToResponse(responseStream.readable, res, {
      'Content-Type': 'text/event-stream',
      Connection: 'keep-alive',
      'Cache-Control': 'no-cache, no-transform',
    });
  } catch (err) {
    console.error('An error occurred while processing chat request:', err);
    res.status(500).json({
      message: 'An error occurred while processing chat request',
    });
  }
});

apiRouter.get('/chats', async (_req, res) => {
  try {
    const list = await db.query.chats.findMany({
      orderBy: [desc(chats.lastMessageAt), desc(chats.id)],
    });
    res.status(200).json({ chats: list });
  } catch (err) {
    console.error('Error in getting chats: ', err);
    res.status(500).json({ message: 'An error has occurred.' });
  }
});

apiRouter.get('/chats/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const chat = await db.query.chats.findFirst({
      where: eq(chats.id, id),
    });

    if (!chat) {
      res.status(404).json({ message: 'Chat not found' });
      return;
    }

    const chatMessages = await db.query.messages.findMany({
      where: eq(messages.chatId, id),
      orderBy: [asc(messages.id)],
    });

    const branchMap = await branchMetaByMessageIdForChat(id);
    const branchByMessageId = Object.fromEntries(
      Object.entries(branchMap).filter(
        ([, v]) =>
          (v.forkTargets?.length ?? 0) > 0 || v.forkParentChatId != null,
      ),
    );

    const payload: Record<string, unknown> = { chat, messages: chatMessages };
    if (Object.keys(branchByMessageId).length > 0) {
      payload.branchByMessageId = branchByMessageId;
    }
    res.json(payload);
  } catch (err) {
    console.error('Error in getting chat: ', err);
    res.status(500).json({ message: 'An error has occurred.' });
  }
});

/** Stale session (e.g. reconnect 404): mark answering row as error. */
apiRouter.post(
  '/chats/:chatId/messages/:messageId/mark-error',
  async (req, res) => {
    try {
      const { chatId, messageId } = req.params;
      await db
        .update(messages)
        .set({ status: 'error' })
        .where(
          and(
            eq(messages.chatId, chatId),
            eq(messages.messageId, messageId),
            eq(messages.status, 'answering'),
          ),
        )
        .execute();
      await touchChatLastMessageAt(chatId);
      res.json({ ok: true });
    } catch (err) {
      console.error('mark-error:', err);
      res.status(500).json({ message: 'Failed to mark message' });
    }
  },
);

apiRouter.post(
  '/chats/:chatId/messages/:messageId/fork',
  async (req, res) => {
    try {
      const { chatId, messageId } = req.params;
      const result = await forkChatFromAssistantMessage({
        sourceChatId: chatId,
        sourceMessageId: messageId,
      });

      if (!result.ok) {
        res.status(result.status).json({ message: result.message });
        return;
      }

      res.status(200).json({ chatId: result.chatId, branch: result.branch });
    } catch (err) {
      console.error('fork chat:', err);
      res.status(500).json({ message: 'Failed to fork chat' });
    }
  },
);

apiRouter.patch('/chats/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { folderId } = req.body;

    await db
      .update(chats)
      .set({ folderId: folderId || null })
      .where(eq(chats.id, id))
      .execute();

    res.json({ message: 'Chat updated' });
  } catch (err) {
    console.error('Error updating chat folder:', err);
    res.status(500).json({ message: 'Failed to update chat' });
  }
});

apiRouter.delete('/chats/:id', async (req, res) => {
  try {
    const { id } = req.params;
    await db.delete(chats).where(eq(chats.id, id)).execute();
    res.json({ message: 'Chat deleted' });
  } catch (err) {
    console.error('Error deleting chat:', err);
    res.status(500).json({ message: 'Failed to delete chat' });
  }
});

apiRouter.get('/folders', async (_req, res) => {
  try {
    const allFolders = await db.select().from(folders).execute();
    res.json({ folders: allFolders });
  } catch (err) {
    console.error('Failed to get folders:', err);
    res.status(500).json({ message: 'Failed to get folders' });
  }
});

const createFolderSchema = z.object({
  name: z.string().min(1, 'Folder name is required'),
});

apiRouter.post('/folders', async (req, res) => {
  try {
    const result = createFolderSchema.safeParse(req.body);

    if (!result.success) {
      res.status(400).json({ message: 'Invalid folder name' });
      return;
    }

    const folderId = crypto.randomBytes(10).toString('hex');
    await db.insert(folders).values({
      id: folderId,
      name: result.data.name,
      createdAt: new Date().toISOString(),
    });

    res.json({ message: 'Folder created', id: folderId });
  } catch (err) {
    console.error('Failed to create folder:', err);
    res.status(500).json({ message: 'Failed to create folder' });
  }
});

apiRouter.patch('/folders/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const result = createFolderSchema.safeParse(req.body);

    if (!result.success) {
      res.status(400).json({ message: 'Invalid folder name' });
      return;
    }

    const existing = await db
      .select()
      .from(folders)
      .where(eq(folders.id, id))
      .execute();

    if (existing.length === 0) {
      res.status(404).json({ message: 'Folder not found' });
      return;
    }

    await db
      .update(folders)
      .set({ name: result.data.name })
      .where(eq(folders.id, id))
      .execute();

    res.json({ message: 'Folder updated' });
  } catch (err) {
    console.error('Failed to update folder:', err);
    res.status(500).json({ message: 'Failed to update folder' });
  }
});

apiRouter.delete('/folders/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const existing = await db
      .select()
      .from(folders)
      .where(eq(folders.id, id))
      .execute();

    if (existing.length === 0) {
      res.status(404).json({ message: 'Folder not found' });
      return;
    }

    await db
      .update(chats)
      .set({ folderId: null })
      .where(eq(chats.folderId, id))
      .execute();

    await db.delete(folders).where(eq(folders.id, id)).execute();

    res.json({ message: 'Folder deleted' });
  } catch (err) {
    console.error('Failed to delete folder:', err);
    res.status(500).json({ message: 'Failed to delete folder' });
  }
});

apiRouter.get('/config', async (_req, res) => {
  try {
    const values = configManager.getCurrentConfig();
    const fields = configManager.getUIConfigSections();

    const modelRegistry = new ModelRegistry();
    const modelProviders = await modelRegistry.getActiveProviders();

    values.modelProviders = values.modelProviders.map(
      (mp: ConfigModelProvider) => {
        const activeProvider = modelProviders.find((p) => p.id === mp.id);

        return {
          ...mp,
          chatModels: activeProvider?.chatModels ?? mp.chatModels,
          embeddingModels:
            activeProvider?.embeddingModels ?? mp.embeddingModels,
        };
      },
    );

    res.json({ values, fields });
  } catch (err) {
    console.error('Error in getting config: ', err);
    res.status(500).json({ message: 'An error has occurred.' });
  }
});

apiRouter.post('/config', async (req, res) => {
  try {
    const body = req.body as { key: string; value: string };

    if (!body.key || !body.value) {
      res.status(400).json({ message: 'Key and value are required.' });
      return;
    }

    configManager.updateConfig(body.key, body.value);

    res.status(200).json({ message: 'Config updated successfully.' });
  } catch (err) {
    console.error('Error in getting config: ', err);
    res.status(500).json({ message: 'An error has occurred.' });
  }
});

apiRouter.post('/config/setup-complete', async (_req, res) => {
  try {
    configManager.markSetupComplete();
    res.status(200).json({ message: 'Setup marked as complete.' });
  } catch (err) {
    console.error('Error marking setup as complete: ', err);
    res.status(500).json({ message: 'An error has occurred.' });
  }
});

apiRouter.get('/providers', async (_req, res) => {
  try {
    const registry = new ModelRegistry();

    const activeProviders = await registry.getActiveProviders();

    const filteredProviders = activeProviders.filter((p) => {
      return !p.chatModels.some((m) => m.key === 'error');
    });

    res.status(200).json({ providers: filteredProviders });
  } catch (err) {
    console.error('An error occurred while fetching providers', err);
    res.status(500).json({ message: 'An error has occurred.' });
  }
});

apiRouter.post('/providers', async (req, res) => {
  try {
    const { type, name, config } = req.body;

    if (!type || !name || !config) {
      res.status(400).json({ message: 'Missing required fields.' });
      return;
    }

    const registry = new ModelRegistry();

    const newProvider = await registry.addProvider(type, name, config);

    res.status(200).json({ provider: newProvider });
  } catch (err) {
    console.error('An error occurred while creating provider', err);
    res.status(500).json({ message: 'An error has occurred.' });
  }
});

apiRouter.delete('/providers/:id', async (req, res) => {
  try {
    const { id } = req.params;

    if (!id) {
      res.status(400).json({ message: 'Provider ID is required.' });
      return;
    }

    const registry = new ModelRegistry();
    await registry.removeProvider(id);

    res.status(200).json({ message: 'Provider deleted successfully.' });
  } catch (err: any) {
    console.error('An error occurred while deleting provider', err.message);
    res.status(500).json({ message: 'An error has occurred.' });
  }
});

apiRouter.patch('/providers/:id', async (req, res) => {
  try {
    const { name, config } = req.body;
    const { id } = req.params;

    if (!id || !name || !config) {
      res.status(400).json({ message: 'Missing required fields.' });
      return;
    }

    const registry = new ModelRegistry();

    const updatedProvider = await registry.updateProvider(id, name, config);

    res.status(200).json({ provider: updatedProvider });
  } catch (err: any) {
    console.error('An error occurred while updating provider', err.message);
    res.status(500).json({ message: 'An error has occurred.' });
  }
});

apiRouter.post('/providers/:id/models', async (req, res) => {
  try {
    const { id } = req.params;

    const body: Partial<Model> & { type: 'embedding' | 'chat' } = req.body;

    if (!body.key || !body.name) {
      res.status(400).json({ message: 'Key and name must be provided' });
      return;
    }

    const registry = new ModelRegistry();

    await registry.addProviderModel(id, body.type, body);

    res.status(200).json({ message: 'Model added successfully' });
  } catch (err) {
    console.error('An error occurred while adding provider model', err);
    res.status(500).json({ message: 'An error has occurred.' });
  }
});

apiRouter.delete('/providers/:id/models', async (req, res) => {
  try {
    const { id } = req.params;

    const body: { key: string; type: 'embedding' | 'chat' } = req.body;

    if (!body.key) {
      res.status(400).json({ message: 'Key and name must be provided' });
      return;
    }

    const registry = new ModelRegistry();

    await registry.removeProviderModel(id, body.type, body.key);

    res.status(200).json({ message: 'Model added successfully' });
  } catch (err) {
    console.error('An error occurred while deleting provider model', err);
    res.status(500).json({ message: 'An error has occurred.' });
  }
});

apiRouter.post(
  '/uploads',
  upload.array('files'),
  async (req, res) => {
    try {
      const files = req.files as Express.Multer.File[];
      const embeddingModel = req.body.embedding_model_key as string;
      const embeddingModelProvider = req.body
        .embedding_model_provider_id as string;

      if (!embeddingModel || !embeddingModelProvider) {
        res.status(400).json({ message: 'Missing embedding model or provider' });
        return;
      }

      if (!files?.length) {
        res.status(400).json({ message: 'No files uploaded' });
        return;
      }

      const registry = new ModelRegistry();

      const model = await registry.loadEmbeddingModel(
        embeddingModelProvider,
        embeddingModel,
      );

      const uploadManager = new UploadManager({
        embeddingModel: model,
      });

      const webFiles = files.map((f) => {
        const originalname = Buffer.from(f.originalname, 'latin1').toString(
          'utf8',
        );
        return new File([new Uint8Array(f.buffer)], originalname, {
          type: f.mimetype || 'application/octet-stream',
        });
      });

      const processedFiles = await uploadManager.processFiles(webFiles);

      res.json({ files: processedFiles });
    } catch (error) {
      if (error instanceof UploadRejectedError) {
        console.warn('Upload rejected:', error.message);
        res.status(error.statusCode).json({
          message: 'Upload rejected',
          detail: error.message,
        });
        return;
      }
      const detail = error instanceof Error ? error.message : String(error);
      console.error('Error uploading file:', error);
      res.status(500).json({
        message: 'Upload failed',
        detail,
      });
    }
  },
);

apiRouter.post('/suggestions', async (req, res) => {
  try {
    const body = req.body as {
      chatHistory: any[];
      chatModel: ModelWithProvider;
    };

    const registry = new ModelRegistry();

    const llm = await registry.loadChatModel(
      body.chatModel.providerId,
      body.chatModel.key,
    );

    const suggestions = await generateSuggestions(
      {
        chatHistory: body.chatHistory.map(([role, content]) => ({
          role: role === 'human' ? 'user' : 'assistant',
          content,
        })),
      },
      llm,
    );

    res.status(200).json({ suggestions });
  } catch (err) {
    console.error(`An error occurred while generating suggestions: ${err}`);
    res
      .status(500)
      .json({ message: 'An error occurred while generating suggestions' });
  }
});

apiRouter.post('/reconnect/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const session = SessionManager.getSession(id);

    if (!session) {
      res.status(404).json({ message: 'Session not found' });
      return;
    }

    const responseStream = new TransformStream();
    const writer = responseStream.writable.getWriter();
    const encoder = new TextEncoder();
    const writerRelease = { done: false };
    const releaseStreamWriter = () => {
      if (writerRelease.done) return;
      writerRelease.done = true;
      void writer.close().catch(() => {
        /* already closed */
      });
    };

    const disconnect = session.subscribe((event, data) => {
      if (event === 'data') {
        if (data.type === 'block') {
          writer.write(
            encoder.encode(
              JSON.stringify({ type: 'block', block: data.block }) + '\n',
            ),
          );
        } else if (data.type === 'updateBlock') {
          writer.write(
            encoder.encode(
              JSON.stringify({
                type: 'updateBlock',
                blockId: data.blockId,
                patch: data.patch,
              }) + '\n',
            ),
          );
        } else if (data.type === 'researchComplete') {
          writer.write(
            encoder.encode(
              JSON.stringify({ type: 'researchComplete' }) + '\n',
            ),
          );
        }
      } else if (event === 'end') {
        writer.write(
          encoder.encode(JSON.stringify({ type: 'messageEnd' }) + '\n'),
        );
        releaseStreamWriter();
        disconnect();
      } else if (event === 'error') {
        writer.write(
          encoder.encode(
            JSON.stringify({ type: 'error', data: data.data }) + '\n',
          ),
        );
        releaseStreamWriter();
        disconnect();
      }
    });

    req.on('close', () => {
      disconnect();
      releaseStreamWriter();
    });

    pipeWebReadableToResponse(responseStream.readable, res, {
      'Content-Type': 'text/event-stream',
      Connection: 'keep-alive',
      'Cache-Control': 'no-cache, no-transform',
    });
  } catch (err) {
    console.error('Error in reconnecting to session stream: ', err);
    res.status(500).json({ message: 'An error has occurred.' });
  }
});

apiRouter.post('/search', async (req, res) => {
  try {
    const body = req.body as {
      optimizationMode: 'speed' | 'balanced' | 'quality';
      sources: SearchSources[];
      chatModel: ModelWithProvider;
      embeddingModel: ModelWithProvider;
      query: string;
      history: Array<[string, string]>;
      stream?: boolean;
      systemInstructions?: string;
    };

    if (!body.sources || !body.query) {
      res.status(400).json({ message: 'Missing sources or query' });
      return;
    }

    body.history = body.history || [];
    body.optimizationMode = body.optimizationMode || 'speed';
    body.stream = body.stream || false;

    const registry = new ModelRegistry();

    const [llm, embeddings] = await Promise.all([
      registry.loadChatModel(body.chatModel.providerId, body.chatModel.key),
      registry.loadEmbeddingModel(
        body.embeddingModel.providerId,
        body.embeddingModel.key,
      ),
    ]);

    const history: ChatTurnMessage[] = body.history.map((msg) => {
      return msg[0] === 'human'
        ? { role: 'user', content: msg[1] }
        : { role: 'assistant', content: msg[1] };
    });

    const session = SessionManager.createSession();

    const agent = new APISearchAgent();

    const apiSearchChatId = crypto.randomUUID();
    const apiSearchMessageId = crypto.randomUUID();

    scheduleSearchAsync(agent, session, {
      chatHistory: history,
      config: {
        embedding: embeddings,
        llm,
        sources: body.sources,
        mode: body.optimizationMode,
        fileIds: [],
        systemInstructions: body.systemInstructions || '',
        observability: {
          chatId: apiSearchChatId,
          messageId: apiSearchMessageId,
          providerId: body.chatModel.providerId,
          modelKey: body.chatModel.key,
        },
      },
      followUp: body.query,
      chatId: apiSearchChatId,
      messageId: apiSearchMessageId,
    });

    if (!body.stream) {
      await new Promise<void>((resolve, reject) => {
        let message = '';
        let sources: any[] = [];

        session.subscribe((event: string, data: Record<string, any>) => {
          if (event === 'data') {
            try {
              if (data.type === 'response') {
                message += data.data;
              } else if (data.type === 'searchResults') {
                sources = data.data;
              }
            } catch {
              reject(new Error('parse'));
            }
          }

          if (event === 'end') {
            res.status(200).json({ message, sources });
            resolve();
          }

          if (event === 'error') {
            res.status(500).json({ message: 'Search error', error: data });
            reject(new Error('search error'));
          }
        });
      });
      return;
    }

    const encoder = new TextEncoder();

    const abortController = new AbortController();
    const { signal } = abortController;

    const stream = new ReadableStream({
      start(controller) {
        let sources: any[] = [];

        controller.enqueue(
          encoder.encode(
            JSON.stringify({
              type: 'init',
              data: 'Stream connected',
            }) + '\n',
          ),
        );

        signal.addEventListener('abort', () => {
          session.removeAllListeners();

          try {
            controller.close();
          } catch {
            /* ignore */
          }
        });

        session.subscribe((event: string, data: Record<string, any>) => {
          if (event === 'data') {
            if (signal.aborted) return;

            try {
              if (data.type === 'response') {
                controller.enqueue(
                  encoder.encode(
                    JSON.stringify({
                      type: 'response',
                      data: data.data,
                    }) + '\n',
                  ),
                );
              } else if (data.type === 'searchResults') {
                sources = data.data;
                controller.enqueue(
                  encoder.encode(
                    JSON.stringify({
                      type: 'sources',
                      data: sources,
                    }) + '\n',
                  ),
                );
              }
            } catch (error) {
              controller.error(error);
            }
          }

          if (event === 'end') {
            if (signal.aborted) return;

            controller.enqueue(
              encoder.encode(
                JSON.stringify({
                  type: 'done',
                }) + '\n',
              ),
            );
            controller.close();
          }

          if (event === 'error') {
            if (signal.aborted) return;

            controller.error(data);
          }
        });
      },
      cancel() {
        abortController.abort();
      },
    });

    req.on('close', () => abortController.abort());

    pipeWebReadableToResponse(stream, res, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    });
  } catch (err: any) {
    console.error(`Error in getting search results: ${err.message}`);
    res.status(500).json({ message: 'An error has occurred.' });
  }
});

apiRouter.post('/images', async (req, res) => {
  try {
    const body = req.body as {
      query: string;
      chatHistory: any[];
      chatModel: ModelWithProvider;
    };

    const registry = new ModelRegistry();

    const llm = await registry.loadChatModel(
      body.chatModel.providerId,
      body.chatModel.key,
    );

    const images = await searchImages(
      {
        chatHistory: body.chatHistory.map(([role, content]) => ({
          role: role === 'human' ? 'user' : 'assistant',
          content,
        })),
        query: body.query,
      },
      llm,
    );

    res.status(200).json({ images });
  } catch (err) {
    console.error(`An error occurred while searching images: ${err}`);
    res
      .status(500)
      .json({ message: 'An error occurred while searching images' });
  }
});

apiRouter.post('/videos', async (req, res) => {
  try {
    const body = req.body as {
      query: string;
      chatHistory: any[];
      chatModel: ModelWithProvider;
    };

    const registry = new ModelRegistry();

    const llm = await registry.loadChatModel(
      body.chatModel.providerId,
      body.chatModel.key,
    );

    const videos = await handleVideoSearch(
      {
        chatHistory: body.chatHistory.map(([role, content]) => ({
          role: role === 'human' ? 'user' : 'assistant',
          content,
        })),
        query: body.query,
      },
      llm,
    );

    res.status(200).json({ videos });
  } catch (err) {
    console.error(`An error occurred while searching videos: ${err}`);
    res
      .status(500)
      .json({ message: 'An error occurred while searching videos' });
  }
});

apiRouter.post('/weather', async (req, res) => {
  try {
    const body = req.body as {
      lat?: number;
      lng?: number;
      measureUnit?: 'Imperial' | 'Metric';
    };

    if (
      !body ||
      typeof body.lat !== 'number' ||
      typeof body.lng !== 'number' ||
      Number.isNaN(body.lat) ||
      Number.isNaN(body.lng)
    ) {
      res.status(400).json({ message: 'Invalid request.' });
      return;
    }

    const meteo = await fetch(
      `https://api.open-meteo.com/v1/forecast?latitude=${body.lat}&longitude=${body.lng}&current=weather_code,temperature_2m,is_day,relative_humidity_2m,wind_speed_10m&timezone=auto${
        body.measureUnit === 'Metric' ? '' : '&temperature_unit=fahrenheit'
      }${body.measureUnit === 'Metric' ? '' : '&wind_speed_unit=mph'}`,
    );

    const data = await meteo.json();

    if (data.error) {
      console.error(`Error fetching weather data: ${data.reason}`);
      res.status(500).json({ message: 'An error has occurred.' });
      return;
    }

    const weather: {
      temperature: number;
      condition: string;
      humidity: number;
      windSpeed: number;
      icon: string;
      temperatureUnit: 'C' | 'F';
      windSpeedUnit: 'm/s' | 'mph';
    } = {
      temperature: data.current.temperature_2m,
      condition: '',
      humidity: data.current.relative_humidity_2m,
      windSpeed: data.current.wind_speed_10m,
      icon: '',
      temperatureUnit: body.measureUnit === 'Metric' ? 'C' : 'F',
      windSpeedUnit: body.measureUnit === 'Metric' ? 'm/s' : 'mph',
    };

    const code = data.current.weather_code;
    const isDay = data.current.is_day === 1;
    const dayOrNight = isDay ? 'day' : 'night';

    switch (code) {
      case 0:
        weather.icon = `clear-${dayOrNight}`;
        weather.condition = 'Clear';
        break;

      case 1:
        weather.condition = 'Mainly Clear';
      case 2:
        weather.condition = 'Partly Cloudy';
      case 3:
        weather.icon = `cloudy-1-${dayOrNight}`;
        weather.condition = 'Cloudy';
        break;

      case 45:
        weather.condition = 'Fog';
      case 48:
        weather.icon = `fog-${dayOrNight}`;
        weather.condition = 'Fog';
        break;

      case 51:
        weather.condition = 'Light Drizzle';
      case 53:
        weather.condition = 'Moderate Drizzle';
      case 55:
        weather.icon = `rainy-1-${dayOrNight}`;
        weather.condition = 'Dense Drizzle';
        break;

      case 56:
        weather.condition = 'Light Freezing Drizzle';
      case 57:
        weather.icon = `frost-${dayOrNight}`;
        weather.condition = 'Dense Freezing Drizzle';
        break;

      case 61:
        weather.condition = 'Slight Rain';
      case 63:
        weather.condition = 'Moderate Rain';
      case 65:
        weather.condition = 'Heavy Rain';
        weather.icon = `rainy-2-${dayOrNight}`;
        break;

      case 66:
        weather.condition = 'Light Freezing Rain';
      case 67:
        weather.condition = 'Heavy Freezing Rain';
        weather.icon = 'rain-and-sleet-mix';
        break;

      case 71:
        weather.condition = 'Slight Snow Fall';
      case 73:
        weather.condition = 'Moderate Snow Fall';
      case 75:
        weather.condition = 'Heavy Snow Fall';
        weather.icon = `snowy-2-${dayOrNight}`;
        break;

      case 77:
        weather.condition = 'Snow';
        weather.icon = `snowy-1-${dayOrNight}`;
        break;

      case 80:
        weather.condition = 'Slight Rain Showers';
      case 81:
        weather.condition = 'Moderate Rain Showers';
      case 82:
        weather.condition = 'Heavy Rain Showers';
        weather.icon = `rainy-3-${dayOrNight}`;
        break;

      case 85:
        weather.condition = 'Slight Snow Showers';
      case 86:
        weather.condition = 'Moderate Snow Showers';
      case 87:
        weather.condition = 'Heavy Snow Showers';
        weather.icon = `snowy-3-${dayOrNight}`;
        break;

      case 95:
        weather.condition = 'Thunderstorm';
        weather.icon = `scattered-thunderstorms-${dayOrNight}`;
        break;

      case 96:
        weather.condition = 'Thunderstorm with Slight Hail';
      case 99:
        weather.condition = 'Thunderstorm with Heavy Hail';
        weather.icon = 'severe-thunderstorm';
        break;

      default:
        weather.icon = `clear-${dayOrNight}`;
        weather.condition = 'Clear';
        break;
    }

    res.json(weather);
  } catch (err) {
    console.error('An error occurred while getting home widgets', err);
    res.status(500).json({ message: 'An error has occurred.' });
  }
});
