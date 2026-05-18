import { eq } from 'drizzle-orm';

import db from '.';
import { chatBranches } from './schema';

export type MessageBranchPayload = {
  forkTargets?: { chatId: string }[];
  forkParentChatId?: string;
};

/** Branch navigation metadata keyed by assistant-turn `messageId` (see fork endpoint). */
export async function branchMetaByMessageIdForChat(
  chatId: string,
): Promise<Record<string, MessageBranchPayload>> {
  const outgoing = await db
    .select()
    .from(chatBranches)
    .where(eq(chatBranches.fromChatId, chatId))
    .execute();

  const incoming = await db
    .select()
    .from(chatBranches)
    .where(eq(chatBranches.toChatId, chatId))
    .execute();

  const map: Record<string, MessageBranchPayload> = {};

  for (const row of outgoing) {
    let payload = map[row.fromMessageId];
    if (!payload) {
      payload = {};
      map[row.fromMessageId] = payload;
    }
    if (!payload.forkTargets) payload.forkTargets = [];
    payload.forkTargets.push({ chatId: row.toChatId });
  }

  for (const row of incoming) {
    let payload = map[row.fromMessageId];
    if (!payload) {
      payload = {};
      map[row.fromMessageId] = payload;
    }
    payload.forkParentChatId = row.fromChatId;
  }

  return map;
}
