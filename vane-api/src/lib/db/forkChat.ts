import crypto from 'node:crypto';
import { asc, eq } from 'drizzle-orm';

import db from '@/lib/db';
import { chatBranches, chats, messages } from '@/lib/db/schema';
import type { InferSelectModel } from 'drizzle-orm';

type ChatRow = InferSelectModel<typeof chats>;

export async function forkChatFromAssistantMessage(input: {
  sourceChatId: string;
  sourceMessageId: string;
}) {
  const sourceChat = await db.query.chats.findFirst({
    where: eq(chats.id, input.sourceChatId),
  });

  if (!sourceChat) {
    return { ok: false as const, status: 404 as const, message: 'Chat not found' };
  }

  const sourceMessages = await db.query.messages.findMany({
    where: eq(messages.chatId, input.sourceChatId),
    orderBy: [asc(messages.id)],
  });

  const forkIdx = sourceMessages.findIndex(
    (m) => m.messageId === input.sourceMessageId,
  );

  if (forkIdx === -1) {
    return { ok: false as const, status: 404 as const, message: 'Message not found' };
  }

  const pivot = sourceMessages[forkIdx];

  if (pivot.status === 'answering') {
    return {
      ok: false as const,
      status: 400 as const,
      message: 'Cannot fork until the assistant message has finished generating',
    };
  }

  const prefixMessages = sourceMessages.slice(0, forkIdx + 1);
  const now = new Date().toISOString();
  const newChatId = crypto.randomBytes(20).toString('hex');
  const branchId = crypto.randomBytes(10).toString('hex');
  const lastMessageAt =
    prefixMessages[prefixMessages.length - 1]?.createdAt ?? now;

  db.transaction((tx) => {
    tx.insert(chats).values(chatRowClone(sourceChat, newChatId, now, lastMessageAt)).execute();

    for (const m of prefixMessages) {
      tx.insert(messages)
        .values({
          chatId: newChatId,
          messageId: m.messageId,
          // Avoid reusing parent's session id — reconnect checks last backendId.
          backendId: `fork:${crypto.randomBytes(16).toString('hex')}`,
          query: m.query,
          createdAt: m.createdAt,
          responseBlocks: m.responseBlocks ?? [],
          status: m.status,
          providerId: m.providerId,
          modelKey: m.modelKey,
          reasoningPreset: m.reasoningPreset,
          optimizationMode: m.optimizationMode,
        })
        .execute();
    }

    tx.insert(chatBranches)
      .values({
        id: branchId,
        fromChatId: input.sourceChatId,
        fromMessageId: pivot.messageId,
        toChatId: newChatId,
        createdAt: now,
      })
      .execute();
  });

  return {
    ok: true as const,
    chatId: newChatId,
    branch: {
      id: branchId,
      fromChatId: input.sourceChatId,
      fromMessageId: pivot.messageId,
      toChatId: newChatId,
      createdAt: now,
    },
  };
}

function chatRowClone(
  source: ChatRow,
  newChatId: string,
  createdAt: string,
  lastMessageAt: string,
) {
  return {
    id: newChatId,
    title: source.title,
    createdAt,
    lastMessageAt,
    sources: source.sources ?? [],
    files: source.files ?? [],
    folderId: source.folderId,
  };
}
