import OpenAI from 'openai';
import BaseLLM from '../../base/llm';
import {
  GenerateObjectInput,
  GenerateOptions,
  GenerateTextInput,
  GenerateTextOutput,
  StreamTextOutput,
  ToolCall,
} from '../../types';
import { parse } from 'partial-json';
import z from 'zod';
import {
  ChatCompletionAssistantMessageParam,
  ChatCompletionMessageParam,
  ChatCompletionTool,
  ChatCompletionToolMessageParam,
  ChatCompletionUserMessageParam,
} from 'openai/resources/index.mjs';
import { AssistantMessage, Message, ToolMessage } from '@/lib/types';
import { repairJson } from '@toolsycc/json-repair';
import {
  createDefaultOpenAICompatPolicy,
  type OpenAICompatPolicy,
} from '../policy/openaiCompatPolicy';

type OpenAIConfig = {
  apiKey: string;
  model: string;
  baseURL?: string;
  options?: GenerateOptions;
  policy?: OpenAICompatPolicy;
  /** When true, writer may send image_url parts to the API. */
  supportsVision?: boolean;
};

class OpenAILLM extends BaseLLM<OpenAIConfig> {
  openAIClient: OpenAI;
  private policy: OpenAICompatPolicy;
  private requestContext: Pick<
    GenerateOptions,
    'reasoning' | 'reasoningPreset'
  > = {};

  constructor(protected config: OpenAIConfig) {
    super(config);

    this.policy = config.policy ?? createDefaultOpenAICompatPolicy('openai');

    this.openAIClient = new OpenAI({
      apiKey: this.config.apiKey,
      baseURL: this.config.baseURL || 'https://api.openai.com/v1',
    });
  }

  setGenerateContext(
    ctx: Pick<GenerateOptions, 'reasoning' | 'reasoningPreset'>,
  ): void {
    this.requestContext = { ...ctx };
  }

  override supportsVision(): boolean {
    return this.config.supportsVision === true;
  }

  private mergeOptions(input?: GenerateOptions): GenerateOptions {
    return {
      ...this.config.options,
      ...this.requestContext,
      ...input,
    };
  }

  private getApiModel(): string {
    return this.policy.normalizeModelKey(this.config.model);
  }

  /**
   * Remove orphan `tool` rows and fix incomplete assistant+tool rounds so
   * OpenAI-compatible providers do not reject the request.
   */
  private pruneToolMessageSequence(messages: Message[]): Message[] {
    const out: Message[] = [];
    let expected: string[] | null = null;

    for (const m of messages) {
      if (m.role === 'tool') {
        const t = m as ToolMessage;
        if (expected && expected.length > 0 && t.id === expected[0]) {
          out.push(m);
          expected.shift();
          if (expected.length === 0) {
            expected = null;
          }
        } else {
          console.warn(
            '[OpenAILLM] Dropping orphan or out-of-order tool message',
            t.id,
          );
        }
        continue;
      }

      if (expected && expected.length > 0) {
        const last = out[out.length - 1] as Message | undefined;
        if (
          last &&
          last.role === 'assistant' &&
          (last as AssistantMessage).tool_calls
        ) {
          console.warn(
            '[OpenAILLM] Dropping unfulfilled assistant with pending tool results',
          );
          out.pop();
        }
        expected = null;
      }

      if (m.role === 'assistant' && (m as AssistantMessage).tool_calls?.length) {
        out.push(m);
        expected = (m as AssistantMessage).tool_calls!.map((c) => c.id);
      } else {
        out.push(m);
      }
    }

    if (expected && expected.length > 0) {
      const last = out[out.length - 1] as Message | undefined;
      if (
        last &&
        last.role === 'assistant' &&
        (last as AssistantMessage).tool_calls
      ) {
        console.warn(
          '[OpenAILLM] Dropping assistant with missing tool results at end of sequence',
        );
        out.pop();
      }
    }
    return out;
  }

  convertToOpenAIMessages(messages: Message[]): ChatCompletionMessageParam[] {
    return this.pruneToolMessageSequence(messages).map((msg) => {
      if (msg.role === 'tool') {
        return {
          role: 'tool',
          tool_call_id: msg.id,
          content: msg.content,
        } as ChatCompletionToolMessageParam;
      } else if (msg.role === 'assistant') {
        const am = msg as AssistantMessage;
        const param: Record<string, unknown> = {
          role: 'assistant',
          content: msg.content,
          ...(msg.tool_calls &&
            msg.tool_calls.length > 0 && {
              tool_calls: msg.tool_calls?.map((tc) => ({
                id: tc.id,
                type: 'function',
                function: {
                  name: tc.name,
                  arguments: JSON.stringify(tc.arguments),
                },
              })),
            }),
        };
        if (am.reasoning_content) {
          param.reasoning_content = am.reasoning_content;
        }
        return param as ChatCompletionAssistantMessageParam;
      } else if (msg.role === 'user') {
        if (Array.isArray(msg.content)) {
          if (!this.supportsVision()) {
            const texts = msg.content
              .filter((c): c is { type: 'text'; text: string } => c.type === 'text')
              .map((c) => c.text);
            const omitted = msg.content.filter((c) => c.type === 'image_url').length;
            let content = texts.join('\n');
            if (omitted > 0) {
              content += `\n\n[${omitted} image(s) omitted: this model has no vision capability.]`;
            }
            return {
              role: 'user',
              content,
            } as ChatCompletionUserMessageParam;
          }
          return {
            role: 'user',
            content: msg.content.map((c) => {
              if (c.type === 'text') {
                return { type: 'text', text: c.text };
              } else {
                return { type: 'image_url', image_url: { url: c.image_url.url } };
              }
            }),
          } as ChatCompletionUserMessageParam;
        }
        return {
          role: 'user',
          content: msg.content,
        } as ChatCompletionUserMessageParam;
      }

      return msg as ChatCompletionMessageParam;
    });
  }

  private buildSamplingParams(
    opts: GenerateOptions,
    policyExtras: Record<string, unknown>,
  ) {
    const base: Record<string, unknown> = {
      temperature: opts.temperature ?? this.config.options?.temperature ?? 1.0,
      top_p: opts.topP ?? this.config.options?.topP,
      max_completion_tokens:
        opts.maxTokens ?? this.config.options?.maxTokens,
      stop: opts.stopSequences ?? this.config.options?.stopSequences,
      frequency_penalty:
        opts.frequencyPenalty ?? this.config.options?.frequencyPenalty,
      presence_penalty:
        opts.presencePenalty ?? this.config.options?.presencePenalty,
    };
    const thinkingOn =
      (policyExtras as { thinking?: { type?: string } }).thinking?.type ===
      'enabled';
    if (this.policy.shouldOmitTemperatureWhenReasoning(this.config.model) && thinkingOn) {
      delete base.temperature;
      delete base.top_p;
    }
    return base;
  }

  private mergeCompletionCreate(
    body: Record<string, unknown>,
    opts: GenerateOptions,
    hasTools: boolean,
  ) {
    const extras = this.policy.buildChatCompletionExtras({
      modelKey: this.config.model,
      options: opts,
      hasTools,
    });
    return { ...body, ...extras } as Record<string, unknown>;
  }

  async generateText(input: GenerateTextInput): Promise<GenerateTextOutput> {
    const openaiTools: ChatCompletionTool[] = [];

    input.tools?.forEach((tool) => {
      openaiTools.push({
        type: 'function',
        function: {
          name: tool.name,
          description: tool.description,
          parameters: z.toJSONSchema(tool.schema),
        },
      });
    });

    const opts = this.mergeOptions(input.options);
    const apiModel = this.getApiModel();
    const hasToolList = openaiTools.length > 0;
    const preExtras = this.policy.buildChatCompletionExtras({
      modelKey: this.config.model,
      options: opts,
      hasTools: hasToolList,
    });
    const sampling = this.buildSamplingParams(opts, preExtras);

    const response = await this.openAIClient.chat.completions.create(
      this.mergeCompletionCreate(
        {
          model: apiModel,
          tools: hasToolList ? openaiTools : undefined,
          messages: this.convertToOpenAIMessages(input.messages),
          ...sampling,
          ...(opts.signal && { signal: opts.signal }),
        },
        opts,
        hasToolList,
      ) as OpenAI.Chat.ChatCompletionCreateParamsNonStreaming,
    );

    if (response.choices && response.choices.length > 0) {
      const choiceMsg = response.choices[0].message;
      const reasoning = (
        choiceMsg as { reasoning_content?: string | null }
      ).reasoning_content;
      return {
        content: choiceMsg.content!,
        toolCalls:
          choiceMsg.tool_calls
            ?.map((tc) => {
              if (tc.type === 'function') {
                return {
                  name: tc.function.name,
                  id: tc.id,
                  arguments: JSON.parse(tc.function.arguments),
                };
              }
            })
            .filter((tc) => tc !== undefined) || [],
        additionalInfo: {
          finishReason: response.choices[0].finish_reason,
          usage: response.usage,
          ...(reasoning ? { reasoningContent: reasoning } : {}),
        },
      };
    }

    throw new Error('No response from OpenAI');
  }

  async *streamText(
    input: GenerateTextInput,
  ): AsyncGenerator<StreamTextOutput> {
    const openaiTools: ChatCompletionTool[] = [];

    input.tools?.forEach((tool) => {
      openaiTools.push({
        type: 'function',
        function: {
          name: tool.name,
          description: tool.description,
          parameters: z.toJSONSchema(tool.schema),
        },
      });
    });

    const opts = this.mergeOptions(input.options);
    const apiModel = this.getApiModel();
    const hasToolList = openaiTools.length > 0;
    const preExtras = this.policy.buildChatCompletionExtras({
      modelKey: this.config.model,
      options: opts,
      hasTools: hasToolList,
    });
    const sampling = this.buildSamplingParams(opts, preExtras);

    const stream = await this.openAIClient.chat.completions.create(
      this.mergeCompletionCreate(
        {
          model: apiModel,
          messages: this.convertToOpenAIMessages(input.messages),
          tools: hasToolList ? openaiTools : undefined,
          ...sampling,
          stream: true,
          stream_options: { include_usage: true },
          ...(opts.signal && { signal: opts.signal }),
        },
        opts,
        hasToolList,
      ) as OpenAI.Chat.ChatCompletionCreateParamsStreaming,
    );

    const recievedToolCalls: { name: string; id: string; arguments: string }[] =
      [];

    for await (const chunk of stream) {
      if (chunk.choices && chunk.choices.length > 0) {
        const delta = chunk.choices[0].delta as Record<string, unknown>;
        const reasoningDelta =
          typeof delta.reasoning_content === 'string'
            ? delta.reasoning_content
            : '';
        const toolCalls = chunk.choices[0].delta.tool_calls;
        yield {
          contentChunk: chunk.choices[0].delta.content || '',
          reasoningChunk: reasoningDelta || undefined,
          toolCallChunk:
            toolCalls?.map((tc) => {
              if (!recievedToolCalls[tc.index!]) {
                const call = {
                  name: tc.function?.name!,
                  id: tc.id!,
                  arguments: tc.function?.arguments || '',
                };
                recievedToolCalls.push(call);
                return { ...call, arguments: parse(call.arguments || '{}') };
              } else {
                const existingCall = recievedToolCalls[tc.index!];
                existingCall.arguments += tc.function?.arguments || '';
                return {
                  ...existingCall,
                  arguments: parse(existingCall.arguments),
                };
              }
            }) || [],
          done: chunk.choices[0].finish_reason !== null,
          additionalInfo: {
            finishReason: chunk.choices[0].finish_reason,
            usage: chunk.usage,
          },
        };
      } else if (chunk.usage) {
        yield {
          contentChunk: '',
          toolCallChunk: [],
          done: true,
          additionalInfo: {
            usage: chunk.usage,
          },
        };
      }
    }
  }

  private objectMessagesForMode(
    messages: Message[],
    useJsonObject: boolean,
  ): Message[] {
    if (useJsonObject) {
      return messages;
    }
    return [
      ...messages,
      {
        role: 'user',
        content:
          'Return only one JSON object matching the requested schema, with no markdown or extra text.',
      } as Message,
    ];
  }

  async generateObject<T>(input: GenerateObjectInput): Promise<T> {
    const opts = this.mergeOptions(input.options);
    const apiModel = this.getApiModel();
    const mode = this.policy.resolveStructuredOutput(
      this.config.model,
      opts.structuredOutput,
    );
    const useJsonObject =
      (mode === 'json_object' || mode === 'native_schema') &&
      this.policy.allowsResponseFormatJsonObject(this.config.model);

    const preExtras = this.policy.buildChatCompletionExtras({
      modelKey: this.config.model,
      options: opts,
      hasTools: false,
    });
    const sampling = this.buildSamplingParams(opts, preExtras);

    const createBody: Record<string, unknown> = {
      messages: this.convertToOpenAIMessages(
        this.objectMessagesForMode(input.messages, useJsonObject),
      ),
      model: apiModel,
      ...sampling,
      ...(useJsonObject ? { response_format: { type: 'json_object' } } : {}),
      ...(opts.signal && { signal: opts.signal }),
    };

    const response = await this.openAIClient.chat.completions.create(
      this.mergeCompletionCreate(createBody, opts, false) as OpenAI.Chat.ChatCompletionCreateParamsNonStreaming,
    );

    if (response.choices && response.choices.length > 0) {
      try {
        const choiceMsg = response.choices[0].message as {
          content?: string | null;
          reasoning_content?: string | null;
        };
        let raw = choiceMsg.content ?? '';
        if (!String(raw).trim() && choiceMsg.reasoning_content?.trim()) {
          raw = choiceMsg.reasoning_content;
        }
        if (!String(raw).trim()) {
          throw new Error('Empty message.content and reasoning_content from model');
        }
        const repairedJson = repairJson(raw, {
          extractJson: true,
        }) as string;

        const result = input.schema.parse(JSON.parse(repairedJson));
        (result as T & { _usage?: unknown })._usage = response.usage;
        return result as T;
      } catch (err) {
        throw new Error(`Error parsing response from OpenAI: ${err}`);
      }
    }

    throw new Error('No response from OpenAI');
  }

  async *streamObject<T>(input: GenerateObjectInput): AsyncGenerator<T> {
    const opts = this.mergeOptions(input.options);
    const apiModel = this.getApiModel();
    const mode = this.policy.resolveStructuredOutput(
      this.config.model,
      opts.structuredOutput,
    );
    const useJsonObject =
      (mode === 'json_object' || mode === 'native_schema') &&
      this.policy.allowsResponseFormatJsonObject(this.config.model);
    const preExtras = this.policy.buildChatCompletionExtras({
      modelKey: this.config.model,
      options: opts,
      hasTools: false,
    });
    const sampling = this.buildSamplingParams(opts, preExtras);

    let recievedObj: string = '';

    const createBody: Record<string, unknown> = {
      model: apiModel,
      messages: this.convertToOpenAIMessages(
        this.objectMessagesForMode(input.messages, useJsonObject),
      ),
      ...sampling,
      ...(useJsonObject ? { response_format: { type: 'json_object' } } : {}),
      stream: true,
      ...(opts.signal && { signal: opts.signal }),
    };

    const stream = await this.openAIClient.chat.completions.create(
      this.mergeCompletionCreate(createBody, opts, false) as OpenAI.Chat.ChatCompletionCreateParamsStreaming,
    );

    for await (const chunk of stream) {
      if (chunk.choices && chunk.choices.length > 0) {
        const content = chunk.choices[0].delta.content || '';
        recievedObj += content;

        try {
          yield parse(recievedObj) as T;
        } catch (err) {
          yield {} as T;
        }
      }
    }
  }
}

export default OpenAILLM;
