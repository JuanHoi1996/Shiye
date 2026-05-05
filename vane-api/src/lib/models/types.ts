import z from 'zod';
import { Message } from '../types';

type StructuredOutputMode = 'json_object' | 'prompt_repair' | 'native_schema';

type ReasoningEffortLevel = 'low' | 'medium' | 'high' | 'max';

/** UI preset: Auto uses provider-specific defaults (conservative for tool calls). */
type ReasoningPreset = 'auto' | 'off' | 'low' | 'high' | 'max';

type ModelCapabilities = {
  /** Model supports extended reasoning / thinking controls. */
  reasoning?: boolean;
  /** Safe to use OpenAI-style response_format json_object for structured outputs. */
  jsonObjectMode?: boolean;
  /** Multimodal image input (OpenAI-style `image_url` message parts). */
  vision?: boolean;
};

type ModelDefaults = {
  reasoningPreset?: ReasoningPreset;
};

type Model = {
  name: string;
  key: string;
  capabilities?: ModelCapabilities;
  defaults?: ModelDefaults;
  /** Provider API model id if different from list `key` (e.g. alias). */
  providerModelKey?: string;
};

type ModelList = {
  embedding: Model[];
  chat: Model[];
};

type ProviderMetadata = {
  name: string;
  key: string;
};

type MinimalProvider = {
  id: string;
  name: string;
  chatModels: Model[];
  embeddingModels: Model[];
};

type ModelWithProvider = {
  key: string;
  providerId: string;
};

type GenerateOptions = {
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  stopSequences?: string[];
  frequencyPenalty?: number;
  presencePenalty?: number;
  signal?: AbortSignal;
  structuredOutput?: StructuredOutputMode;
  reasoning?: { enabled?: boolean; effort?: ReasoningEffortLevel };
  reasoningPreset?: ReasoningPreset;
  providerOptions?: Record<string, unknown>;
};

type Tool = {
  name: string;
  description: string;
  schema: z.ZodObject<any>;
};

type ToolCall = {
  id: string;
  name: string;
  arguments: Record<string, any>;
};

type GenerateTextInput = {
  messages: Message[];
  tools?: Tool[];
  options?: GenerateOptions;
};

type GenerateTextOutput = {
  content: string;
  toolCalls: ToolCall[];
  additionalInfo?: Record<string, any>;
};

type StreamTextOutput = {
  contentChunk: string;
  /** Vendor-specific streamed reasoning (e.g. DeepSeek `reasoning_content`). */
  reasoningChunk?: string;
  toolCallChunk: ToolCall[];
  additionalInfo?: Record<string, any>;
  done?: boolean;
};

type GenerateObjectInput = {
  schema: z.ZodTypeAny;
  messages: Message[];
  options?: GenerateOptions;
};

type GenerateObjectOutput<T> = {
  object: T;
  additionalInfo?: Record<string, any>;
};

type StreamObjectOutput<T> = {
  objectChunk: Partial<T>;
  additionalInfo?: Record<string, any>;
  done?: boolean;
};

export type {
  Model,
  ModelList,
  ModelCapabilities,
  ModelDefaults,
  ProviderMetadata,
  MinimalProvider,
  ModelWithProvider,
  GenerateOptions,
  StructuredOutputMode,
  ReasoningEffortLevel,
  ReasoningPreset,
  GenerateTextInput,
  GenerateTextOutput,
  StreamTextOutput,
  GenerateObjectInput,
  GenerateObjectOutput,
  StreamObjectOutput,
  Tool,
  ToolCall,
};
