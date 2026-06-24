import z from 'zod';
import { ClassifierInput } from './types';
import { classifierPrompt } from '@/lib/prompts/search/classifier';
import formatChatHistoryAsString from '@/lib/utils/formatHistory';

const schema = z.object({
  classification: z.object({
    skipSearch: z
      .boolean()
      .describe('Indicates whether to skip the search step.'),
    personalSearch: z
      .boolean()
      .describe('Indicates whether to perform a personal search.'),
    academicSearch: z
      .boolean()
      .describe('Indicates whether to perform an academic search.'),
    discussionSearch: z
      .boolean()
      .describe('Indicates whether to perform a discussion search.'),
    showWeatherWidget: z
      .boolean()
      .describe('Indicates whether to show the weather widget.'),
    showStockWidget: z
      .boolean()
      .describe('Indicates whether to show the stock widget.'),
    showCalculationWidget: z
      .boolean()
      .describe('Indicates whether to show the calculation widget.'),
  }),
  standaloneFollowUp: z
    .string()
    .describe(
      "A self-contained, context-independent reformulation of the user's question.",
    ),
});

export const classify = async (input: ClassifierInput) => {
  if (input.enabledSources.length === 0) {
    return {
      classification: {
        skipSearch: true,
        personalSearch: false,
        academicSearch: false,
        discussionSearch: false,
        showWeatherWidget: false,
        showStockWidget: false,
        showCalculationWidget: false,
      },
      standaloneFollowUp: input.query,
    };
  }

  const classifyOptions = {
    reasoningPreset: 'off' as const,
    /** DeepSeek V4 + thinking can leave `content` empty; classifier must not inherit chat reasoning. */
    maxTokens: 2048,
    ...(input.abortSignal ? { signal: input.abortSignal } : {}),
  };

  const runGenerate = (retry: boolean) =>
    input.llm.generateObject<typeof schema>({
      messages: [
        {
          role: 'system',
          content: classifierPrompt,
        },
        {
          role: 'user',
          content: `<conversation_history>\n${retry ? '' : formatChatHistoryAsString(input.chatHistory)}\n</conversation_history>\n<user_query>\n${input.query}\n</user_query>${retry ? '\nReturn only valid json object.' : ''}`,
        },
      ],
      schema,
      options: classifyOptions,
    });

  let lastErr: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      return await runGenerate(attempt === 1);
    } catch (err) {
      lastErr = err;
      if (attempt === 0) {
        console.warn('[classifier] generateObject failed, retrying once:', err);
      }
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
};
