import { UIConfigField } from '@/lib/config/types';
import { Model, ModelList, ProviderMetadata } from '../../types';
import OpenAIEmbedding from '../openai/openaiEmbedding';
import BaseEmbedding from '../../base/embedding';
import BaseModelProvider from '../../base/provider';
import BaseLLM from '../../base/llm';
import OpenAILLM from '../openai/openaiLLM';
import {
  createDeepSeekOpenAICompatPolicy,
  stripModelsPrefix,
} from '../policy/openaiCompatPolicy';
import {
  DEEPSEEK_OPENAI_DEFAULT_BASE,
  normalizeDeepSeekOpenAIBaseURL,
} from './baseUrl';
import {
  fetchOpenAiCompatCatalog,
  getConfiguredModelList,
} from '../../configuredModels';

interface DeepSeekConfig {
  apiKey: string;
  baseURL: string;
}

/** Suggestions only when /models is empty — never auto-merged into enabled list. */
const deepSeekCatalogHints: Model[] = [
  {
    name: 'DeepSeek V4 Flash',
    key: 'deepseek-v4-flash',
    capabilities: { reasoning: true, jsonObjectMode: false, vision: false },
  },
  {
    name: 'DeepSeek V4 Pro',
    key: 'deepseek-v4-pro',
    capabilities: { reasoning: true, jsonObjectMode: false, vision: false },
  },
  {
    name: 'DeepSeek Chat (legacy)',
    key: 'deepseek-chat',
    capabilities: { reasoning: false, jsonObjectMode: true, vision: false },
  },
  {
    name: 'DeepSeek Reasoner (legacy)',
    key: 'deepseek-reasoner',
    capabilities: { reasoning: true, jsonObjectMode: true, vision: false },
  },
];

export function inferDeepSeekCapabilities(
  key: string,
  cap?: Model['capabilities'],
): Model['capabilities'] {
  if (cap && (cap.reasoning != null || cap.jsonObjectMode != null)) {
    return {
      reasoning: cap.reasoning ?? false,
      jsonObjectMode: cap.jsonObjectMode ?? false,
      vision: cap.vision ?? false,
    };
  }
  const hint = deepSeekCatalogHints.find((m) => m.key === key);
  if (hint?.capabilities) return { ...hint.capabilities };
  const k = key.toLowerCase();
  if (k.includes('v4') || k.includes('reasoner')) {
    return {
      reasoning: true,
      jsonObjectMode: k.includes('reasoner') && !k.includes('v4'),
      vision: false,
    };
  }
  return { reasoning: false, jsonObjectMode: true, vision: false };
}

const providerConfigFields: UIConfigField[] = [
  {
    type: 'password',
    name: 'API Key',
    key: 'apiKey',
    description: 'Your DeepSeek API key',
    required: true,
    placeholder: 'DeepSeek API Key',
    env: 'DEEPSEEK_API_KEY',
    scope: 'server',
  },
  {
    type: 'string',
    name: 'Base URL',
    key: 'baseURL',
    description:
      'OpenAI-compatible base URL (official: https://api.deepseek.com — no /v1; legacy /v1 is auto-normalized)',
    required: true,
    placeholder: DEEPSEEK_OPENAI_DEFAULT_BASE,
    default: DEEPSEEK_OPENAI_DEFAULT_BASE,
    env: 'DEEPSEEK_BASE_URL',
    scope: 'server',
  },
];

class DeepSeekProvider extends BaseModelProvider<DeepSeekConfig> {
  constructor(id: string, name: string, config: DeepSeekConfig) {
    super(id, name, {
      ...config,
      baseURL: normalizeDeepSeekOpenAIBaseURL(config.baseURL),
    });
  }

  async getDefaultModels(): Promise<ModelList> {
    const live = await fetchOpenAiCompatCatalog(
      this.config.baseURL,
      this.config.apiKey,
    );
    if (live.chat.length > 0) {
      return {
        chat: live.chat.map((m) => ({
          ...m,
          capabilities: inferDeepSeekCapabilities(m.key),
          name:
            deepSeekCatalogHints.find((h) => h.key === m.key)?.name ?? m.name,
        })),
        embedding: live.embedding,
      };
    }
    return { chat: [...deepSeekCatalogHints], embedding: [] };
  }

  async getModelList(): Promise<ModelList> {
    return getConfiguredModelList(this.id);
  }

  async loadChatModel(key: string): Promise<BaseLLM<any>> {
    const modelList = await this.getModelList();
    const exists = modelList.chat.find((m) => m.key === key);

    if (!exists) {
      throw new Error(
        'Error Loading DeepSeek Chat Model. Invalid Model Selected',
      );
    }

    const capabilities = inferDeepSeekCapabilities(key, exists.capabilities);

    return new OpenAILLM({
      apiKey: this.config.apiKey,
      model: key,
      baseURL: this.config.baseURL,
      policy: createDeepSeekOpenAICompatPolicy(),
      supportsVision: capabilities?.vision === true,
    });
  }

  async loadEmbeddingModel(key: string): Promise<BaseEmbedding<any>> {
    const modelList = await this.getModelList();
    const exists = modelList.embedding.find((m) => m.key === key);

    if (!exists) {
      throw new Error(
        'Error Loading DeepSeek Embedding Model. Invalid Model Selected.',
      );
    }

    return new OpenAIEmbedding({
      apiKey: this.config.apiKey,
      model: stripModelsPrefix(key),
      baseURL: this.config.baseURL,
    });
  }

  static parseAndValidate(raw: any): DeepSeekConfig {
    if (!raw || typeof raw !== 'object') {
      throw new Error('Invalid config provided. Expected object');
    }
    if (!raw.apiKey) {
      throw new Error('Invalid config provided. API key must be provided');
    }

    const base = raw.baseURL
      ? String(raw.baseURL)
      : DEEPSEEK_OPENAI_DEFAULT_BASE;
    return {
      apiKey: String(raw.apiKey),
      baseURL: normalizeDeepSeekOpenAIBaseURL(base),
    };
  }

  static getProviderConfigFields(): UIConfigField[] {
    return providerConfigFields;
  }

  static getProviderMetadata(): ProviderMetadata {
    return {
      key: 'deepseek',
      name: 'DeepSeek',
    };
  }
}

export default DeepSeekProvider;
