import { countUserMessagesSince } from './readHistory';
import {
  getEffectiveAdvisorSince,
  getEffectiveLastAdvisorRun,
} from './cursor';

const DAYS_THRESHOLD = 28;
const MESSAGES_THRESHOLD = 30;

export async function checkEligibility(): Promise<{
  eligible: boolean;
  reason: string;
  daysSinceLast: number;
  newUserMessages: number;
  lastRunAt: string | null;
}> {
  const lastRun = await getEffectiveLastAdvisorRun();

  if (!lastRun) {
    const total = await countUserMessagesSince(null);
    return {
      eligible: true,
      reason: 'first-run',
      daysSinceLast: 0,
      newUserMessages: total,
      lastRunAt: null,
    };
  }

  const lastRunAt = lastRun.runAt;
  const daysSinceLast =
    (Date.now() - new Date(lastRunAt).getTime()) / (1000 * 60 * 60 * 24);
  const since = await getEffectiveAdvisorSince();
  const newUserMessages = await countUserMessagesSince(since);

  if (daysSinceLast >= DAYS_THRESHOLD) {
    return {
      eligible: true,
      reason: 'days-threshold',
      daysSinceLast: Math.floor(daysSinceLast),
      newUserMessages,
      lastRunAt,
    };
  }

  if (newUserMessages >= MESSAGES_THRESHOLD) {
    return {
      eligible: true,
      reason: 'messages-threshold',
      daysSinceLast: Math.floor(daysSinceLast),
      newUserMessages,
      lastRunAt,
    };
  }

  return {
    eligible: false,
    reason: 'not-due',
    daysSinceLast: Math.floor(daysSinceLast),
    newUserMessages,
    lastRunAt,
  };
}
