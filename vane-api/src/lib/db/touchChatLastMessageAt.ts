import { eq } from 'drizzle-orm';
import db from '@/lib/db';
import { chats } from '@/lib/db/schema';

export async function touchChatLastMessageAt(
  chatId: string,
  at: Date = new Date(),
): Promise<void> {
  await db
    .update(chats)
    .set({ lastMessageAt: at.toISOString() })
    .where(eq(chats.id, chatId))
    .execute();
}
