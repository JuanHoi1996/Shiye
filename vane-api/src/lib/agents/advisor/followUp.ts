import type { Block, ChatTurnMessage, TextBlock } from '@/lib/types';
import { getAdvisorFollowUpSystemPrompt } from './prompts';

function extractAssistantText(blocks: Block[]): string {
  return blocks
    .filter((b): b is TextBlock => b.type === 'text')
    .map((b) => b.data)
    .join('\n\n')
    .trim();
}

export function buildAdvisorChatHistory(
  rows: { query: string; responseBlocks: Block[] | null }[],
): ChatTurnMessage[] {
  const history: ChatTurnMessage[] = [];
  for (const row of rows) {
    const assistantText = extractAssistantText(row.responseBlocks ?? []);
    if (row.query && row.query !== 'auto') {
      history.push({ role: 'user', content: row.query });
    }
    if (assistantText) {
      history.push({ role: 'assistant', content: assistantText });
    }
  }
  return history;
}

export function userMessageSuggestsMemoryUpdate(content: string): boolean {
  const trimmed = content.trim();
  if (trimmed.length < 8) return false;
  const cues =
    /印象|纠正|其实|不是|记得|记住|误解|误会|补充|我并不是|你应该|别把我|重新理解|更新|看法|误判/i;
  return cues.test(trimmed);
}

export function getFollowUpSystemPrompt(memory: string): string {
  return getAdvisorFollowUpSystemPrompt(memory);
}
