import BaseLLM from '../../models/base/llm';
import BaseEmbedding from '@/lib/models/base/embedding';
import type { ReasoningPreset } from '@/lib/models/types';
import type { SearchSources } from '../search/types';
import type { ChatTurnMessage } from '@/lib/types';
import { normalizeStudioSpec } from './spec';
import { lengthPreferenceLabelZh } from './specLabels';

export type StudioLengthPreference = 'shorter' | 'standard' | 'longer';

export type StudioSpec = {
  /** User-facing writing directive for the Studio agent. */
  instruction: string;
  lengthPreference: StudioLengthPreference;
  audience: string;
  genre: string;
  useResearch: boolean;
  /** Normal chat this draft is based on. */
  fromChatId: string;
};

export type StudioAgentConfig = {
  llm: BaseLLM<any>;
  embedding: BaseEmbedding<any>;
  sources: SearchSources[];
  fileIds: string[];
  reasoningPreset?: ReasoningPreset;
  observability?: {
    chatId: string;
    messageId: string;
    providerId: string;
    modelKey: string;
  };
};

export type StudioAgentInput = {
  chatId: string;
  messageId: string;
  spec: StudioSpec;
  /** Serialized user/assistant turns from `spec.fromChatId`. */
  sourceContext?: string;
  sourceChatTitle?: string;
  chatHistory: ChatTurnMessage[];
  userInstruction?: string;
  currentDraft?: string;
  config: StudioAgentConfig;
  abortSignal?: AbortSignal;
};

export const STUDIO_SPEC_MARKER = '__STUDIO_SPEC__';

export function encodeStudioQuery(spec: StudioSpec): string {
  return `${STUDIO_SPEC_MARKER}${JSON.stringify(spec)}`;
}

export function parseStudioSpecFromQuery(query: string): {
  spec: StudioSpec | null;
  displayQuery: string;
} {
  if (!query.startsWith(STUDIO_SPEC_MARKER)) {
    return { spec: null, displayQuery: query };
  }
  try {
    const raw = JSON.parse(query.slice(STUDIO_SPEC_MARKER.length));
    const spec = normalizeStudioSpec(raw);
    if (!spec) return { spec: null, displayQuery: query };
    return { spec, displayQuery: formatStudioDisplayQuery(spec) };
  } catch {
    return { spec: null, displayQuery: query };
  }
}

export function formatStudioDisplayQuery(spec: StudioSpec): string {
  return `撰写：${spec.instruction}（${lengthPreferenceLabelZh(spec.lengthPreference)} · ${spec.audience} · ${spec.genre}）`;
}
