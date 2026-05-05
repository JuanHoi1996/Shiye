import z from 'zod';
import { Message } from '../types';

type StructuredOutputMode = 'json_object' | 'prompt_repair' | 'native_schema';

type ReasoningEffortLevel = 'low' | 'medium' | 'high' | 'max';

type ReasoningPreset = 'auto' | 'off' | 'low' | 'high' | 'max';

type ModelCapabilities = {
  reasoning?: boolean;
  jsonObjectMode?: boolean;
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
