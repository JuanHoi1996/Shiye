import { Model, ModelList, ProviderMetadata } from '../../types';
import BaseModelProvider from '../../base/provider';
import BaseLLM from '../../base/llm';
import BaseEmbedding from '../../base/embedding';
import OpenAILLM from './openaiLLM';
import OpenAIEmbedding from './openaiEmbedding';
import { UIConfigField } from '@/lib/config/types';
import { createDefaultOpenAICompatPolicy } from '../policy/openaiCompatPolicy';
import { normalizeDeepSeekOpenAIBaseURL } from '../deepseek/baseUrl';
import {
  fetchOpenAiCompatCatalog,
  getConfiguredModelList,
} from '../../configuredModels';

interface OpenAIConfig {
  apiKey: string;
  baseURL: string;
}

function inferOpenAiCompatVision(
  key: string,
  cap?: Model['capabilities'],
): boolean {
  if (cap?.vision === true) return true;
  if (cap?.vision === false) return false;
  const k = key.toLowerCase();
  if (k.includes('gpt-3.5') || k === 'gpt-4') return false;
  if (
    k.includes('gpt-4o') ||
    k.includes('gpt-4-turbo') ||
    k.includes('gpt-5') ||
    k.includes('gpt-4.1') ||
    k.startsWith('o1') ||
    k.startsWith('o3') ||
    k.startsWith('o4')
  ) {
    return true;
  }
  return false;
}

const providerConfigFields: UIConfigField[] = [
  {
    type: 'password',
    name: 'API Key',
    key: 'apiKey',
    description: 'Your OpenAI API key',
    required: true,
    placeholder: 'OpenAI API Key',
    env: 'OPENAI_API_KEY',
    scope: 'server',
  },
  {
    type: 'string',
    name: 'Base URL',
    key: 'baseURL',
    description: 'The base URL for the OpenAI API',
    required: true,
    placeholder: 'OpenAI Base URL',
    default: 'https://api.openai.com/v1',
    env: 'OPENAI_BASE_URL',
    scope: 'server',
  },
];

class OpenAIProvider extends BaseModelProvider<OpenAIConfig> {
  constructor(id: string, name: string, config: OpenAIConfig) {
    super(id, name, {
      ...config,
      baseURL: normalizeDeepSeekOpenAIBaseURL(config.baseURL),
    });
  }

  /** Live /models catalog for Add-model UI — never auto-enabled. */
  async getDefaultModels(): Promise<ModelList> {
    return fetchOpenAiCompatCatalog(this.config.baseURL, this.config.apiKey);
  }

  async getModelList(): Promise<ModelList> {
    return getConfiguredModelList(this.id);
  }

  async loadChatModel(key: string): Promise<BaseLLM<any>> {
    const modelList = await this.getModelList();
    const exists = modelList.chat.find((m) => m.key === key);

    if (!exists) {
      throw new Error(
        'Error Loading OpenAI Chat Model. Invalid Model Selected',
      );
    }

    return new OpenAILLM({
      apiKey: this.config.apiKey,
      model: key,
      baseURL: this.config.baseURL,
      policy: createDefaultOpenAICompatPolicy('openai'),
      supportsVision: inferOpenAiCompatVision(key, exists.capabilities),
    });
  }

  async loadEmbeddingModel(key: string): Promise<BaseEmbedding<any>> {
    const modelList = await this.getModelList();
    const exists = modelList.embedding.find((m) => m.key === key);

    if (!exists) {
      throw new Error(
        'Error Loading OpenAI Embedding Model. Invalid Model Selected.',
      );
    }

    return new OpenAIEmbedding({
      apiKey: this.config.apiKey,
      model: key,
      baseURL: this.config.baseURL,
    });
  }

  static parseAndValidate(raw: any): OpenAIConfig {
    if (!raw || typeof raw !== 'object')
      throw new Error('Invalid config provided. Expected object');
    if (!raw.apiKey || !raw.baseURL)
      throw new Error(
        'Invalid config provided. API key and base URL must be provided',
      );

    return {
      apiKey: String(raw.apiKey),
      baseURL: normalizeDeepSeekOpenAIBaseURL(String(raw.baseURL)),
    };
  }

  static getProviderConfigFields(): UIConfigField[] {
    return providerConfigFields;
  }

  static getProviderMetadata(): ProviderMetadata {
    return {
      key: 'openai',
      name: 'OpenAI',
    };
  }
}

export default OpenAIProvider;
