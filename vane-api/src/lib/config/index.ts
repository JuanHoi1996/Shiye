import path from 'node:path';
import fs from 'fs';
import { Config, ConfigModelProvider, UIConfigSections } from './types';
import { hashObj } from '../utils/hash';
import { getModelProvidersUIConfigSection } from '../models/providers';

class ConfigManager {
  configPath: string = path.join(
    process.env.DATA_DIR || process.cwd(),
    '/data/config.json',
  );
  configVersion = 1;
  currentConfig: Config = {
    version: this.configVersion,
    setupComplete: false,
    preferences: {},
    personalization: {},
    uiState: {},
    modelProviders: [],
    search: {
      searxngURL: '',
      provider: 'searxng',
      tavilyApiKeys: [] as string[],
    },
  };
  uiConfigSections: UIConfigSections = {
    preferences: [
      {
        name: 'Theme',
        key: 'theme',
        type: 'select',
        options: [
          {
            name: 'Light',
            value: 'light',
          },
          {
            name: 'Dark',
            value: 'dark',
          },
        ],
        required: false,
        description: 'Choose between light and dark layouts for the app.',
        default: 'dark',
        scope: 'client',
      },
      {
        name: 'Measurement Unit',
        key: 'measureUnit',
        type: 'select',
        options: [
          {
            name: 'Imperial',
            value: 'Imperial',
          },
          {
            name: 'Metric',
            value: 'Metric',
          },
        ],
        required: false,
        description: 'Choose between Metric  and Imperial measurement unit.',
        default: 'Metric',
        scope: 'client',
      },
      {
        name: 'Auto video & image search',
        key: 'autoMediaSearch',
        type: 'switch',
        required: false,
        description: 'Automatically search for relevant images and videos.',
        default: true,
        scope: 'client',
      },
      {
        name: 'Show weather widget',
        key: 'showWeatherWidget',
        type: 'switch',
        required: false,
        description: 'Display the weather card on the home screen.',
        default: false,
        scope: 'client',
      },
      {
        name: 'Text-to-speech (browser)',
        key: 'enableTts',
        type: 'switch',
        required: false,
        description: 'Show the read-aloud button on assistant messages (browser speech synthesis).',
        default: false,
        scope: 'client',
      },
      {
        name: 'Related follow-up suggestions',
        key: 'enableRelatedSuggestions',
        type: 'switch',
        required: false,
        description:
          'After an answer, automatically generate follow-up questions (uses an extra model call).',
        default: false,
        scope: 'client',
      },
    ],
    personalization: [
      {
        name: 'System Instructions',
        key: 'systemInstructions',
        type: 'textarea',
        required: false,
        description: 'Add custom behavior or tone for the model.',
        placeholder:
          'e.g., "Respond in a friendly and concise tone" or "Use British English and format answers as bullet points."',
        scope: 'client',
      },
      {
        name: 'Quick Prompts (JSON)',
        key: 'vane_custom_prompts',
        type: 'textarea',
        required: false,
        description: 'Customize your "/" shortcuts. Provide a JSON array of prompt objects.',
        placeholder:
          '[{"title": "Summarize", "command": "/summarize", "prompt": "..."}]',
        scope: 'client',
      },
    ],
    modelProviders: [],
    search: [
      {
        name: 'Search provider',
        key: 'provider',
        type: 'select',
        required: false,
        description:
          'Web search backend. Use Tavily when SearXNG engines are rate-limited (needs API key).',
        options: [
          { name: 'SearXNG (local)', value: 'searxng' },
          { name: 'Tavily (API)', value: 'tavily' },
        ],
        default: 'searxng',
        scope: 'server',
        env: 'SEARCH_PROVIDER',
      },
      {
        name: 'SearXNG URL',
        key: 'searxngURL',
        type: 'string',
        required: false,
        description: 'The URL of your SearXNG instance',
        placeholder: 'http://localhost:4000',
        default: '',
        scope: 'server',
        env: 'SEARXNG_API_URL',
      },
      {
        name: 'Tavily API keys',
        key: 'tavilyApiKeys',
        type: 'stringList',
        required: false,
        description:
          'From https://app.tavily.com — free tier ~1000 credits/key/month (basic search = 1 credit/query). Add multiple keys to rotate.',
        placeholder: 'tvly-…',
        default: [],
        scope: 'server',
        env: 'TAVILY_API_KEYS',
      },
    ],
  };

  constructor() {
    this.initialize();
  }

  private initialize() {
    this.initializeConfig();
    this.initializeFromEnv();
  }

  private saveConfig() {
    fs.writeFileSync(
      this.configPath,
      JSON.stringify(this.currentConfig, null, 2),
    );
  }

  private initializeConfig() {
    const exists = fs.existsSync(this.configPath);
    if (!exists) {
      fs.writeFileSync(
        this.configPath,
        JSON.stringify(this.currentConfig, null, 2),
      );
    } else {
      try {
        this.currentConfig = JSON.parse(
          fs.readFileSync(this.configPath, 'utf-8'),
        );
      } catch (err) {
        if (err instanceof SyntaxError) {
          console.error(
            `Error parsing config file at ${this.configPath}:`,
            err,
          );
          console.log(
            'Loading default config and overwriting the existing file.',
          );
          fs.writeFileSync(
            this.configPath,
            JSON.stringify(this.currentConfig, null, 2),
          );
          return;
        } else {
          console.log('Unknown error reading config file:', err);
        }
      }

      this.currentConfig = this.migrateConfig(this.currentConfig);
      this.saveConfig();
    }
  }

  private migrateConfig(config: Config): Config {
    if (!config.uiState) {
      config.uiState = {};
    }

    // C5: Transformers no longer auto-merges catalog into the enabled list.
    // One-time seed so existing installs keep a working embedding model.
    const uiState = config.uiState as Config['uiState'] & {
      c5TransformersEmbeddingsSeeded?: boolean;
    };
    if (!uiState.c5TransformersEmbeddingsSeeded) {
      for (const p of config.modelProviders ?? []) {
        if (
          p.type === 'transformers' &&
          (!p.embeddingModels || p.embeddingModels.length === 0)
        ) {
          p.embeddingModels = [
            {
              name: 'all-MiniLM-L6-v2',
              key: 'Xenova/all-MiniLM-L6-v2',
            },
            {
              name: 'mxbai-embed-large-v1',
              key: 'mixedbread-ai/mxbai-embed-large-v1',
            },
            {
              name: 'nomic-embed-text-v1',
              key: 'Xenova/nomic-embed-text-v1',
            },
          ];
        }
      }
      uiState.c5TransformersEmbeddingsSeeded = true;
      config.uiState = uiState;
    }

    // Migrate legacy search.tavilyApiKey (string) → search.tavilyApiKeys (string[]).
    if (!config.search) config.search = {};
    const search = config.search;
    const legacyKey = search.tavilyApiKey;
    const existingKeys = search.tavilyApiKeys;
    if (!Array.isArray(existingKeys)) {
      const migrated: string[] = [];
      if (typeof legacyKey === 'string' && legacyKey.trim()) {
        migrated.push(legacyKey.trim());
      }
      search.tavilyApiKeys = migrated;
    } else if (typeof legacyKey === 'string' && legacyKey.trim()) {
      const trimmed = legacyKey.trim();
      if (!existingKeys.includes(trimmed)) {
        search.tavilyApiKeys = [...existingKeys, trimmed];
      }
    }
    if ('tavilyApiKey' in search) {
      delete search.tavilyApiKey;
    }

    return config;
  }

  private initializeFromEnv() {
    /* providers section*/
    const providerConfigSections = getModelProvidersUIConfigSection();

    this.uiConfigSections.modelProviders = providerConfigSections;

    const newProviders: ConfigModelProvider[] = [];

    providerConfigSections.forEach((provider) => {
      const newProvider: ConfigModelProvider & { required?: string[] } = {
        id: crypto.randomUUID(),
        name: `${provider.name}`,
        type: provider.key,
        chatModels: [],
        embeddingModels: [],
        config: {},
        required: [],
        hash: '',
      };

      provider.fields.forEach((field) => {
        newProvider.config[field.key] =
          process.env[field.env!] ||
          field.default ||
          ''; /* Env var must exist for providers */

        if (field.required) newProvider.required?.push(field.key);
      });

      let configured = true;

      newProvider.required?.forEach((r) => {
        if (!newProvider.config[r]) {
          configured = false;
        }
      });

      if (configured) {
        const hash = hashObj(newProvider.config);
        newProvider.hash = hash;
        delete newProvider.required;

        const exists = this.currentConfig.modelProviders.find(
          (p) => p.hash === hash,
        );

        if (!exists) {
          newProviders.push(newProvider);
        }
      }
    });

    this.currentConfig.modelProviders.push(...newProviders);

    /* search section */
    this.uiConfigSections.search.forEach((f) => {
      if (!f.env) return;
      const current = this.currentConfig.search[f.key];
      if (f.type === 'stringList') {
        const empty =
          !Array.isArray(current) ||
          current.filter((k: unknown) => typeof k === 'string' && k.trim())
            .length === 0;
        if (empty && process.env[f.env]) {
          this.currentConfig.search[f.key] = process.env[f.env]!
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean);
        }
        return;
      }
      if (!current) {
        this.currentConfig.search[f.key] =
          process.env[f.env] ?? f.default ?? '';
      }
    });

    this.saveConfig();
  }

  public getConfig(key: string, defaultValue?: any): any {
    const nested = key.split('.');
    let obj: any = this.currentConfig;

    for (let i = 0; i < nested.length; i++) {
      const part = nested[i];
      if (obj == null) return defaultValue;

      obj = obj[part];
    }

    return obj === undefined ? defaultValue : obj;
  }

  public updateConfig(key: string, val: any) {
    const parts = key.split('.');
    if (parts.length === 0) return;

    let target: any = this.currentConfig;
    for (let i = 0; i < parts.length - 1; i++) {
      const part = parts[i];
      if (target[part] === null || typeof target[part] !== 'object') {
        target[part] = {};
      }

      target = target[part];
    }

    const finalKey = parts[parts.length - 1];
    target[finalKey] = val;

    this.saveConfig();
  }

  public addModelProvider(type: string, name: string, config: any) {
    const newModelProvider: ConfigModelProvider = {
      id: crypto.randomUUID(),
      name,
      type,
      config,
      chatModels: [],
      embeddingModels: [],
      hash: hashObj(config),
    };

    this.currentConfig.modelProviders.push(newModelProvider);
    this.saveConfig();

    return newModelProvider;
  }

  public removeModelProvider(id: string) {
    const index = this.currentConfig.modelProviders.findIndex(
      (p) => p.id === id,
    );

    if (index === -1) return;

    this.currentConfig.modelProviders =
      this.currentConfig.modelProviders.filter((p) => p.id !== id);

    this.saveConfig();
  }

  public async updateModelProvider(id: string, name: string, config: any) {
    const provider = this.currentConfig.modelProviders.find((p) => {
      return p.id === id;
    });

    if (!provider) throw new Error('Provider not found');

    provider.name = name;
    provider.config = config;

    this.saveConfig();

    return provider;
  }

  public addProviderModel(
    providerId: string,
    type: 'embedding' | 'chat',
    model: any,
  ) {
    const provider = this.currentConfig.modelProviders.find(
      (p) => p.id === providerId,
    );

    if (!provider) throw new Error('Invalid provider id');

    delete model.type;
    const key = String(model.key ?? '').trim();
    if (!key) throw new Error('Model key is required');

    const list =
      type === 'chat' ? provider.chatModels : provider.embeddingModels;
    if (list.some((m) => m.key === key)) {
      throw new Error(`Model already enabled: ${key}`);
    }

    const entry = {
      name: String(model.name ?? key),
      key,
      ...(model.capabilities ? { capabilities: model.capabilities } : {}),
    };

    if (type === 'chat') {
      provider.chatModels.push(entry);
    } else {
      provider.embeddingModels.push(entry);
    }

    this.saveConfig();

    return entry;
  }

  public removeProviderModel(
    providerId: string,
    type: 'embedding' | 'chat',
    modelKey: string,
  ) {
    const provider = this.currentConfig.modelProviders.find(
      (p) => p.id === providerId,
    );

    if (!provider) throw new Error('Invalid provider id');

    if (type === 'chat') {
      provider.chatModels = provider.chatModels.filter(
        (m) => m.key !== modelKey,
      );
    } else {
      provider.embeddingModels = provider.embeddingModels.filter(
        (m) => m.key != modelKey,
      );
    }

    this.saveConfig();
  }

  public isSetupComplete() {
    return this.currentConfig.setupComplete;
  }

  public markSetupComplete() {
    if (!this.currentConfig.setupComplete) {
      this.currentConfig.setupComplete = true;
    }

    this.saveConfig();
  }

  public getUIConfigSections(): UIConfigSections {
    return this.uiConfigSections;
  }

  public getCurrentConfig(): Config {
    return JSON.parse(JSON.stringify(this.currentConfig));
  }
}

const configManager = new ConfigManager();

export default configManager;
