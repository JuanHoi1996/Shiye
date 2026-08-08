import { UIConfigField } from '@/lib/config/types';
import { Model, ModelList, ProviderMetadata } from '../../types';
import { getConfiguredModelList } from '../../configuredModels';
import GeminiEmbedding from './geminiEmbedding';
import BaseEmbedding from '../../base/embedding';
import BaseModelProvider from '../../base/provider';
import BaseLLM from '../../base/llm';
import GeminiLLM from './geminiLLM';
import { createGeminiOpenAICompatPolicy, stripModelsPrefix } from '../policy/openaiCompatPolicy';

interface GeminiConfig {
  apiKey: string;
}

const providerConfigFields: UIConfigField[] = [
  {
    type: 'password',
    name: 'API Key',
    key: 'apiKey',
    description: 'Your Gemini API key',
    required: true,
    placeholder: 'Gemini API Key',
    env: 'GEMINI_API_KEY',
    scope: 'server',
  },
];

class GeminiProvider extends BaseModelProvider<GeminiConfig> {
  constructor(id: string, name: string, config: GeminiConfig) {
    super(id, name, config);
  }

  async getDefaultModels(): Promise<ModelList> {
    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models?key=${this.config.apiKey}`,
        {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
          },
        },
      );

      if (!res.ok) {
        return { embedding: [], chat: [] };
      }

      const data = await res.json();
      const defaultEmbeddingModels: Model[] = [];
      const defaultChatModels: Model[] = [];

      for (const m of data.models ?? []) {
        const methods: string[] = m.supportedGenerationMethods ?? [];
        if (
          methods.some(
            (genMethod: string) =>
              genMethod === 'embedText' || genMethod === 'embedContent',
          )
        ) {
          defaultEmbeddingModels.push({
            key: m.name,
            name: m.displayName ?? m.name,
          });
        } else if (methods.includes('generateContent')) {
          defaultChatModels.push({
            key: m.name,
            name: m.displayName ?? m.name,
          });
        }
      }

      return {
        embedding: defaultEmbeddingModels,
        chat: defaultChatModels,
      };
    } catch {
      return { embedding: [], chat: [] };
    }
  }

  async getModelList(): Promise<ModelList> {
    return getConfiguredModelList(this.id);
  }

  async loadChatModel(key: string): Promise<BaseLLM<any>> {
    const modelList = await this.getModelList();

    const exists = modelList.chat.find((m) => m.key === key);

    if (!exists) {
      throw new Error(
        'Error Loading Gemini Chat Model. Invalid Model Selected',
      );
    }

    return new GeminiLLM({
      apiKey: this.config.apiKey,
      model: key,
      baseURL: 'https://generativelanguage.googleapis.com/v1beta/openai',
      policy: createGeminiOpenAICompatPolicy(),
      supportsVision: exists.capabilities?.vision !== false,
    });
  }

  async loadEmbeddingModel(key: string): Promise<BaseEmbedding<any>> {
    const modelList = await this.getModelList();
    const exists = modelList.embedding.find((m) => m.key === key);

    if (!exists) {
      throw new Error(
        'Error Loading Gemini Embedding Model. Invalid Model Selected.',
      );
    }

    return new GeminiEmbedding({
      apiKey: this.config.apiKey,
      model: stripModelsPrefix(key),
      baseURL: 'https://generativelanguage.googleapis.com/v1beta/openai',
    });
  }

  static parseAndValidate(raw: any): GeminiConfig {
    if (!raw || typeof raw !== 'object')
      throw new Error('Invalid config provided. Expected object');
    if (!raw.apiKey)
      throw new Error('Invalid config provided. API key must be provided');

    return {
      apiKey: String(raw.apiKey),
    };
  }

  static getProviderConfigFields(): UIConfigField[] {
    return providerConfigFields;
  }

  static getProviderMetadata(): ProviderMetadata {
    return {
      key: 'gemini',
      name: 'Gemini',
    };
  }
}

export default GeminiProvider;
