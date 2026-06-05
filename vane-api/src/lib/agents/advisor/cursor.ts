import db from '@/lib/db';
import { advisorRuns, chats } from '@/lib/db/schema';
import { and, desc, eq } from 'drizzle-orm';

type EffectiveAdvisorRun = {
  id: string;
  chatId: string;
  runAt: string;
  coveredUntilTimestamp: string;
  coveredChatCount: number;
  coveredUserMessageCount: number;
  status: 'running' | 'completed' | 'error';
};

export async function getEffectiveLastAdvisorRun(): Promise<EffectiveAdvisorRun | null> {
  const rows = await db
    .select({
      id: advisorRuns.id,
      chatId: advisorRuns.chatId,
      runAt: advisorRuns.runAt,
      coveredUntilTimestamp: advisorRuns.coveredUntilTimestamp,
      coveredChatCount: advisorRuns.coveredChatCount,
      coveredUserMessageCount: advisorRuns.coveredUserMessageCount,
      status: advisorRuns.status,
    })
    .from(advisorRuns)
    .innerJoin(chats, eq(advisorRuns.chatId, chats.id))
    .where(eq(advisorRuns.status, 'completed'))
    .orderBy(desc(advisorRuns.runAt))
    .limit(1)
    .execute();

  return rows[0] ?? null;
}

/** Latest completed advisor run whose chat still exists; empty coveredUntil → null. */
export async function getEffectiveAdvisorSince(): Promise<string | null> {
  const run = await getEffectiveLastAdvisorRun();
  if (!run) return null;
  const ts = run.coveredUntilTimestamp;
  if (!ts || ts.trim() === '') return null;
  return ts;
}
