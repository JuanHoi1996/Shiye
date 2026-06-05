import crypto from 'node:crypto';
import BaseLLM from '@/lib/models/base/llm';
import type { TextBlock } from '@/lib/types';
import {
  appendTokenUsage,
  normalizeOpenAIUsage,
} from '@/lib/observability/tokenUsage';
import { getAdvisorSystemPrompt, getAdvisorUserPrompt } from './prompts';
import { loadAdvisorCorpus } from './readHistory';

export type AdvisorRunObservability = {
  chatId: string;
  messageId: string;
  providerId: string;
  modelKey: string;
};

export async function runAdvisorOnce(input: {
  llm: BaseLLM<unknown>;
  since: string | null;
  memory?: string;
  observability?: AdvisorRunObservability;
  onChunk?: (text: string, blockId: string) => void;
}): Promise<{
  text: string;
  coveredUntil: string;
  chatCount: number;
  userMessageCount: number;
  blockId: string;
}> {
  const corpus = await loadAdvisorCorpus(input.since);
  const systemPrompt = getAdvisorSystemPrompt(input.memory ?? '');
  const userPrompt = getAdvisorUserPrompt(corpus.text);

  input.llm.setGenerateContext?.({ reasoningPreset: 'high' });

  const stream = input.llm.streamText({
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    options: { reasoningPreset: 'high' },
  });

  let accumulated = '';
  const blockId = crypto.randomUUID();
  let usageLogged = false;

  for await (const chunk of stream) {
    if (chunk.additionalInfo?.usage && !usageLogged && input.observability) {
      usageLogged = true;
      appendTokenUsage({
        chatId: input.observability.chatId,
        messageId: input.observability.messageId,
        providerId: input.observability.providerId,
        modelKey: input.observability.modelKey,
        phase: 'advisor',
        reasoningPreset: 'high',
        ...normalizeOpenAIUsage(chunk.additionalInfo.usage),
      });
    }

    accumulated += chunk.contentChunk;
    input.onChunk?.(accumulated, blockId);
  }

  return {
    text: accumulated,
    coveredUntil: corpus.coveredUntil,
    chatCount: corpus.chatCount,
    userMessageCount: corpus.userMessageCount,
    blockId,
  };
}

export { getEffectiveAdvisorSince } from './cursor';
export { loadAdvisorCorpus } from './readHistory';
export { checkEligibility } from './eligibility';
export {
  getAdvisorSystemPrompt,
  getAdvisorFollowUpSystemPrompt,
} from './prompts';
export {
  buildAdvisorChatHistory,
  getFollowUpSystemPrompt,
  userMessageSuggestsMemoryUpdate,
} from './followUp';
