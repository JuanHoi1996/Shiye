import { UIConfigField } from '@/lib/config/types';
import { getConfiguredModelProviderById } from '@/lib/config/serverRegistry';
import { Model, ModelList, ProviderMetadata } from '../../types';
import OpenAIEmbedding from '../openai/openaiEmbedding';
import BaseEmbedding from '../../base/embedding';
import BaseModelProvider from '../../base/provider';
import BaseLLM from '../../base/llm';
import OpenAILLM from '../openai/openaiLLM';
import { createDeepSeekOpenAICompatPolicy, stripModelsPrefix } from '../policy/openaiCompatPolicy';
import {
  DEEPSEEK_OPENAI_DEFAULT_BASE,
  normalizeDeepSeekOpenAIBaseURL,
} from './baseUrl';

interface DeepSeekConfig {
  apiKey: string;
  baseURL: string;
}

const defaultChatModels: Model[] = [
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

const defaultEmbeddingModels: Model[] = [];

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
    return {
      embedding: defaultEmbeddingModels,
      chat: defaultChatModels,
    };
  }

  async getModelList(): Promise<ModelList> {
    const defaultModels = await this.getDefaultModels();
    const configProvider = getConfiguredModelProviderById(this.id)!;

    return {
      embedding: [
        ...defaultModels.embedding,
        ...configProvider.embeddingModels,
      ],
      chat: [...defaultModels.chat, ...configProvider.chatModels],
    };
  }

  async loadChatModel(key: string): Promise<BaseLLM<any>> {
    const modelList = await this.getModelList();

    const exists = modelList.chat.find((m) => m.key === key);

    if (!exists) {
      throw new Error(
        'Error Loading DeepSeek Chat Model. Invalid Model Selected',
      );
    }

    return new OpenAILLM({
      apiKey: this.config.apiKey,
      model: key,
      baseURL: this.config.baseURL,
      policy: createDeepSeekOpenAICompatPolicy(),
      supportsVision: exists.capabilities?.vision === true,
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
