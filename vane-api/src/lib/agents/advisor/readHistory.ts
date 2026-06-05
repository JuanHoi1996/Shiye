import db from '@/lib/db';
import { chats, messages } from '@/lib/db/schema';
import type { Block, TextBlock } from '@/lib/types';
import { and, asc, eq, gt } from 'drizzle-orm';

/** No time window — first run loads all normal chats; overflow trims oldest chats by lastMessageAt. */
const CORPUS_CHAR_LIMIT = 120_000;

function extractAssistantText(blocks: Block[]): string {
  return blocks
    .filter((b): b is TextBlock => b.type === 'text')
    .map((b) => b.data)
    .join('\n\n')
    .trim();
}

type CorpusSegment = {
  chatId: string;
  title: string;
  lastMessageAt: string;
  maxMessageCreatedAt: string;
  body: string;
  userMessageCount: number;
};

function formatSegment(seg: CorpusSegment): string {
  return `## 对话：${seg.title}（id: ${seg.chatId}）\n${seg.body}`;
}

export async function loadAdvisorCorpus(since: string | null): Promise<{
  text: string;
  chatCount: number;
  userMessageCount: number;
  coveredUntil: string;
}> {
  const normalChats = await db.query.chats.findMany({
    where: eq(chats.kind, 'normal'),
    orderBy: [asc(chats.lastMessageAt), asc(chats.id)],
  });

  const segments: CorpusSegment[] = [];
  let userMessageCount = 0;

  for (const chat of normalChats) {
    const chatMessages = await db.query.messages.findMany({
      where: eq(messages.chatId, chat.id),
      orderBy: [asc(messages.id)],
    });

    const filtered = since
      ? chatMessages.filter((m) => m.createdAt > since)
      : chatMessages;

    if (filtered.length === 0) continue;

    const turns: string[] = [];
    let maxMessageCreatedAt = '';
    for (const msg of filtered) {
      userMessageCount += 1;
      if (msg.createdAt > maxMessageCreatedAt) {
        maxMessageCreatedAt = msg.createdAt;
      }
      const assistantText = extractAssistantText(msg.responseBlocks ?? []);
      turns.push(
        `### 用户\n${msg.query}\n\n### 助手\n${assistantText || '（无正文）'}`,
      );
    }

    segments.push({
      chatId: chat.id,
      title: chat.title,
      lastMessageAt: chat.lastMessageAt,
      maxMessageCreatedAt,
      body: turns.join('\n\n---\n\n'),
      userMessageCount: filtered.length,
    });
  }

  let included = segments;
  let corpus = segments.map(formatSegment).join('\n\n========\n\n');
  if (corpus.length > CORPUS_CHAR_LIMIT) {
    const kept: CorpusSegment[] = [];
    let size = 0;
    let droppedUsers = 0;
    for (let i = segments.length - 1; i >= 0; i--) {
      const seg = segments[i]!;
      const piece = formatSegment(seg);
      const nextSize = size + (kept.length > 0 ? 12 : 0) + piece.length;
      if (nextSize > CORPUS_CHAR_LIMIT && kept.length > 0) {
        droppedUsers += seg.userMessageCount;
        continue;
      }
      kept.unshift(seg);
      size = nextSize;
    }
    userMessageCount -= droppedUsers;
    included = kept;
    corpus = kept.map(formatSegment).join('\n\n========\n\n');
  }

  let coveredUntil = since ?? '';
  for (const seg of included) {
    if (seg.maxMessageCreatedAt > coveredUntil) {
      coveredUntil = seg.maxMessageCreatedAt;
    }
  }

  return {
    text: corpus,
    chatCount: included.length,
    userMessageCount,
    coveredUntil: coveredUntil || new Date().toISOString(),
  };
}

/** Count user messages in normal chats after `since` (exclusive). */
export async function countUserMessagesSince(since: string | null): Promise<number> {
  if (!since) {
    const rows = await db
      .select({ id: messages.id })
      .from(messages)
      .innerJoin(chats, eq(messages.chatId, chats.id))
      .where(eq(chats.kind, 'normal'))
      .execute();
    return rows.length;
  }

  const rows = await db
    .select({ id: messages.id })
    .from(messages)
    .innerJoin(chats, eq(messages.chatId, chats.id))
    .where(and(eq(chats.kind, 'normal'), gt(messages.createdAt, since)))
    .execute();
  return rows.length;
}
