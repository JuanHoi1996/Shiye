import db from '@/lib/db';
import { chats, messages } from '@/lib/db/schema';
import type { Block, TextBlock } from '@/lib/types';
import { and, asc, eq } from 'drizzle-orm';

const SOURCE_CHAR_LIMIT = 60_000;

function extractAssistantText(blocks: Block[]): string {
  return blocks
    .filter((b): b is TextBlock => b.type === 'text')
    .map((b) => b.data)
    .join('\n\n')
    .trim();
}

export async function loadStudioSourceContext(fromChatId: string): Promise<{
  text: string;
  chatTitle: string;
  turnCount: number;
}> {
  const chat = await db.query.chats.findFirst({
    where: and(eq(chats.id, fromChatId), eq(chats.kind, 'normal')),
  });

  if (!chat) {
    throw new Error('Source chat not found or is not a normal conversation.');
  }

  const chatMessages = await db.query.messages.findMany({
    where: eq(messages.chatId, fromChatId),
    orderBy: [asc(messages.id)],
  });

  const turns: string[] = [];
  for (const msg of chatMessages) {
    const assistantText = extractAssistantText(msg.responseBlocks ?? []);
    turns.push(
      `### User\n${msg.query}\n\n### Assistant\n${assistantText || '(no body)'}`,
    );
  }

  let text = turns.join('\n\n---\n\n');
  if (text.length > SOURCE_CHAR_LIMIT) {
    text = text.slice(-SOURCE_CHAR_LIMIT);
    text = `…(truncated to last ${SOURCE_CHAR_LIMIT} characters)\n\n${text}`;
  }

  return {
    text,
    chatTitle: chat.title,
    turnCount: chatMessages.length,
  };
}
