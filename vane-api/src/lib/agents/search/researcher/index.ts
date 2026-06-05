import { ActionOutput, ResearcherInput, ResearcherOutput } from '../types';
import { ActionRegistry } from './actions';
import { getResearcherPrompt } from '@/lib/prompts/search/researcher';
import SessionManager from '@/lib/session';
import { Message, ReasoningResearchBlock } from '@/lib/types';
import formatChatHistoryAsString from '@/lib/utils/formatHistory';
import { ToolCall } from '@/lib/models/types';
import {
  capResearcherAgentHistory,
  truncateToolContentJson,
} from '@/lib/utils/chatBudget';
import {
  appendTokenUsage,
  normalizeOpenAIUsage,
  tokenUsageModeFields,
} from '@/lib/observability/tokenUsage';

class Researcher {
  async research(
    session: SessionManager,
    input: ResearcherInput,
  ): Promise<ResearcherOutput> {
    let actionOutput: ActionOutput[] = [];
    let maxIteration =
      input.config.mode === 'speed'
        ? 6
        : input.config.mode === 'balanced'
          ? 12
          : 25;

    const availableTools = ActionRegistry.getAvailableActionTools({
      classification: input.classification,
      fileIds: input.config.fileIds,
      mode: input.config.mode,
      sources: input.config.sources,
    });

    const availableActionsDescription =
      ActionRegistry.getAvailableActionsDescriptions({
        classification: input.classification,
        fileIds: input.config.fileIds,
        mode: input.config.mode,
        sources: input.config.sources,
      });

    const researchBlockId = crypto.randomUUID();

    session.emitBlock({
      id: researchBlockId,
      type: 'research',
      data: {
        subSteps: [],
      },
    });

    let agentMessageHistory: Message[] = [
      {
        role: 'user',
        content: `
          <conversation>
          ${formatChatHistoryAsString(input.chatHistory.slice(-10))}
           User: ${input.followUp} (Standalone question: ${input.classification.standaloneFollowUp})
           </conversation>
        `,
      },
    ];

    const obs = input.config.observability;

    let researcherIterationsCompleted = 0;

    for (let i = 0; i < maxIteration; i++) {
      console.log(
        JSON.stringify({
          event: 'researcher.iteration',
          phase: 'start',
          iteration: i + 1,
          maxIteration,
          mode: input.config.mode,
          ...(obs?.chatId ? { chatId: obs.chatId } : {}),
        }),
      );

      if (input.abortSignal?.aborted) {
        break;
      }

      const researcherPrompt = getResearcherPrompt(
        availableActionsDescription,
        input.config.mode,
        i,
        maxIteration,
        input.config.fileIds,
      );

      const actionStream = input.config.llm.streamText({
        messages: [
          {
            role: 'system',
            content: researcherPrompt,
          },
          ...agentMessageHistory,
        ],
        tools: availableTools,
        options: input.abortSignal
          ? { signal: input.abortSignal }
          : undefined,
      });

      const block = session.getBlock(researchBlockId);

      let reasoningEmitted = false;
      let reasoningId = crypto.randomUUID();

      let finalToolCalls: ToolCall[] = [];

      let assistantText = '';
      let assistantReasoning = '';
      let iterationUsageLogged = false;

      for await (const partialRes of actionStream) {
        if (input.abortSignal?.aborted) {
          break;
        }
        assistantText += partialRes.contentChunk ?? '';
        if (partialRes.reasoningChunk) {
          assistantReasoning += partialRes.reasoningChunk;
        }
        if (partialRes.additionalInfo?.usage && obs && !iterationUsageLogged) {
          iterationUsageLogged = true;
          appendTokenUsage({
            chatId: obs.chatId,
            messageId: obs.messageId,
            providerId: obs.providerId,
            modelKey: obs.modelKey,
            phase: 'researcher',
            researcherIteration: i,
            skipSearch: input.classification.classification.skipSearch,
            personalSearch: input.classification.classification.personalSearch,
            ...normalizeOpenAIUsage(partialRes.additionalInfo.usage),
            ...tokenUsageModeFields(input.config.mode),
            reasoningPreset: input.config.reasoningPreset ?? 'auto',
          });
        }
        if (partialRes.toolCallChunk.length > 0) {
          partialRes.toolCallChunk.forEach((tc) => {
            if (
              tc.name === '__reasoning_preamble' &&
              tc.arguments['plan'] &&
              !reasoningEmitted &&
              block &&
              block.type === 'research'
            ) {
              reasoningEmitted = true;

              block.data.subSteps.push({
                id: reasoningId,
                type: 'reasoning',
                reasoning: tc.arguments['plan'],
              });

              session.updateBlock(researchBlockId, [
                {
                  op: 'replace',
                  path: '/data/subSteps',
                  value: block.data.subSteps,
                },
              ]);
            } else if (
              tc.name === '__reasoning_preamble' &&
              tc.arguments['plan'] &&
              reasoningEmitted &&
              block &&
              block.type === 'research'
            ) {
              const subStepIndex = block.data.subSteps.findIndex(
                (step: any) => step.id === reasoningId,
              );

              if (subStepIndex !== -1) {
                const subStep = block.data.subSteps[
                  subStepIndex
                ] as ReasoningResearchBlock;
                subStep.reasoning = tc.arguments['plan'];
                session.updateBlock(researchBlockId, [
                  {
                    op: 'replace',
                    path: '/data/subSteps',
                    value: block.data.subSteps,
                  },
                ]);
              }
            }

            const existingIndex = finalToolCalls.findIndex(
              (ftc) => ftc.id === tc.id,
            );

            if (existingIndex !== -1) {
              finalToolCalls[existingIndex].arguments = tc.arguments;
            } else {
              finalToolCalls.push(tc);
            }
          });
        }
      }

      researcherIterationsCompleted = i + 1;

      const logIterationEnd = () => {
        const toolNames = finalToolCalls.map((tc) => tc.name);
        console.log(
          JSON.stringify({
            event: 'researcher.iteration',
            phase: 'end',
            iteration: i + 1,
            maxIteration,
            mode: input.config.mode,
            tools: toolNames,
            done: toolNames.includes('done'),
            ...(obs?.chatId ? { chatId: obs.chatId } : {}),
          }),
        );
      };

      if (input.abortSignal?.aborted) {
        break;
      }

      if (finalToolCalls.length === 0) {
        logIterationEnd();
        break;
      }

      if (finalToolCalls[finalToolCalls.length - 1].name === 'done') {
        logIterationEnd();
        break;
      }

      agentMessageHistory.push({
        role: 'assistant',
        content: assistantText,
        ...(assistantReasoning
          ? { reasoning_content: assistantReasoning }
          : {}),
        tool_calls: finalToolCalls,
      });

      if (input.abortSignal?.aborted) {
        break;
      }

      const actionResults = await ActionRegistry.executeAll(finalToolCalls, {
        llm: input.config.llm,
        embedding: input.config.embedding,
        session: session,
        researchBlockId: researchBlockId,
        fileIds: input.config.fileIds,
      });

      actionOutput.push(...actionResults);

      actionResults.forEach((action, i) => {
        agentMessageHistory.push({
          role: 'tool',
          id: finalToolCalls[i].id,
          name: finalToolCalls[i].name,
          content: truncateToolContentJson(JSON.stringify(action)),
        });
      });

      agentMessageHistory = capResearcherAgentHistory(agentMessageHistory);

      logIterationEnd();
    }

    const searchResults = actionOutput
      .filter((a) => a.type === 'search_results')
      .flatMap((a) => a.results);

    const seenUrls = new Map<string, number>();

    const filteredSearchResults = searchResults
      .map((result, index) => {
        if (result.metadata.url && !seenUrls.has(result.metadata.url)) {
          seenUrls.set(result.metadata.url, index);
          return result;
        } else if (result.metadata.url && seenUrls.has(result.metadata.url)) {
          const existingIndex = seenUrls.get(result.metadata.url)!;

          const existingResult = searchResults[existingIndex];

          existingResult.content += `\n\n${result.content}`;

          return undefined;
        }

        return result;
      })
      .filter((r) => r !== undefined);

    session.emitBlock({
      id: crypto.randomUUID(),
      type: 'source',
      data: filteredSearchResults,
    });

    return {
      findings: actionOutput,
      searchFindings: filteredSearchResults,
      researcherIterationsCompleted,
    };
  }
}

export default Researcher;
