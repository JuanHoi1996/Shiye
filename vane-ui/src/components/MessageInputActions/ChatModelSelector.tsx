'use client';

import { Cpu, Loader2, Search } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Popover, PopoverButton, PopoverPanel } from '@headlessui/react';
import { useEffect, useMemo, useState } from 'react';
import type { MinimalProvider, ReasoningPreset } from '@/lib/models/types';
import { useChat } from '@/lib/hooks/useChat';
import { AnimatePresence, motion } from 'motion/react';

const REASONING_PRESETS: { id: ReasoningPreset; label: string }[] = [
  { id: 'auto', label: 'Auto' },
  { id: 'off', label: 'Off' },
  { id: 'low', label: 'Low' },
  { id: 'high', label: 'High' },
  { id: 'max', label: 'Max' },
];

const ModelSelector = ({ align = 'right' }: { align?: 'left' | 'right' }) => {
  const [providers, setProviders] = useState<MinimalProvider[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  const { setChatModelProvider, chatModelProvider } = useChat();

  const [reasoningPreset, setReasoningPreset] = useState<ReasoningPreset>(
    () => {
      const s = localStorage.getItem(
        'chatReasoningPreset',
      ) as ReasoningPreset | null;
      return s && REASONING_PRESETS.some((r) => r.id === s) ? s : 'auto';
    },
  );

  const setReasoning = (p: ReasoningPreset) => {
    setReasoningPreset(p);
    localStorage.setItem('chatReasoningPreset', p);
  };

  useEffect(() => {
    const loadProviders = async () => {
      try {
        setIsLoading(true);
        const res = await fetch('/api/providers');

        if (!res.ok) {
          throw new Error('Failed to fetch providers');
        }

        const data: { providers: MinimalProvider[] } = await res.json();
        setProviders(data.providers);
      } catch (error) {
        console.error('Error loading providers:', error);
      } finally {
        setIsLoading(false);
      }
    };

    loadProviders();
  }, []);

  const orderedProviders = useMemo(() => {
    if (!chatModelProvider?.providerId) return providers;

    const currentProviderIndex = providers.findIndex(
      (p) => p.id === chatModelProvider.providerId,
    );

    if (currentProviderIndex === -1) {
      return providers;
    }

    const selectedProvider = providers[currentProviderIndex];
    const remainingProviders = providers.filter(
      (_, index) => index !== currentProviderIndex,
    );

    return [selectedProvider, ...remainingProviders];
  }, [providers, chatModelProvider]);

  const handleModelSelect = (providerId: string, modelKey: string) => {
    setChatModelProvider({ providerId, key: modelKey });
    localStorage.setItem('chatModelProviderId', providerId);
    localStorage.setItem('chatModelKey', modelKey);
  };

  const currentModelMeta = useMemo(() => {
    if (!chatModelProvider?.providerId) return undefined;
    const p = providers.find((x) => x.id === chatModelProvider.providerId);
    return p?.chatModels.find((m) => m.key === chatModelProvider.key);
  }, [providers, chatModelProvider]);

  const showReasoning =
    currentModelMeta?.capabilities?.reasoning !== false;

  const filteredProviders = orderedProviders
    .map((provider) => ({
      ...provider,
      chatModels: provider.chatModels.filter(
        (model) =>
          model.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          provider.name.toLowerCase().includes(searchQuery.toLowerCase()),
      ),
    }))
    .filter((provider) => provider.chatModels.length > 0);

  return (
    <Popover className="relative shrink-0 max-w-[min(100%,14rem)] sm:max-w-none">
      {({ open }) => (
        <>
          <PopoverButton
            type="button"
            className="active:border-none hover:bg-light-200  hover:dark:bg-dark-200 p-2 rounded-lg focus:outline-none headless-open:text-black dark:headless-open:text-white text-black/50 dark:text-white/50 active:scale-95 transition duration-200 hover:text-black dark:hover:text-white"
          >
            <Cpu size={16} className="text-sky-500" />
          </PopoverButton>
          <AnimatePresence>
            {open && (
              <PopoverPanel
                className={cn(
                  "absolute z-10 w-[230px] sm:w-[270px] md:w-[300px] bottom-full mb-2",
                  align === 'right' ? "right-0" : "left-0"
                )}
                static
              >
                <motion.div
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  transition={{ duration: 0.1, ease: 'easeOut' }}
                  className={cn(
                    "bg-light-primary dark:bg-dark-primary max-h-[300px] sm:max-w-none border rounded-lg border-light-200 dark:border-dark-200 w-full flex flex-col shadow-lg overflow-hidden",
                    align === 'right' ? "origin-bottom-right" : "origin-bottom-left"
                  )}
                >
                  <div className="p-2 border-b border-light-200 dark:border-dark-200">
                    <div className="relative">
                      <Search
                        size={16}
                        className="absolute left-3 top-1/2 -translate-y-1/2 text-black/40 dark:text-white/40"
                      />
                      <input
                        type="text"
                        placeholder="Search models..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full pl-8 pr-3 py-2 bg-light-secondary dark:bg-dark-secondary rounded-lg placeholder:text-xs placeholder:-translate-y-[1.5px] text-xs text-black dark:text-white placeholder:text-black/40 dark:placeholder:text-white/40 focus:outline-none border border-transparent transition duration-200"
                      />
                    </div>
                  </div>

                  {showReasoning && (
                    <div
                      className="px-2 py-2 border-b border-light-200 dark:border-dark-200 flex flex-wrap gap-0.5"
                      title="Reasoning / thinking budget (provider-specific)"
                    >
                      {REASONING_PRESETS.map((r) => (
                        <button
                          key={r.id}
                          type="button"
                          onClick={() => setReasoning(r.id)}
                          className={cn(
                            'text-[10px] leading-none px-1.5 py-0.5 rounded transition',
                            reasoningPreset === r.id
                              ? 'bg-sky-500/20 text-sky-600 dark:text-sky-300 font-medium'
                              : 'text-black/45 dark:text-white/45 hover:text-black/70 dark:hover:text-white/70',
                          )}
                        >
                          {r.label}
                        </button>
                      ))}
                    </div>
                  )}

                  <div className="max-h-[320px] overflow-y-auto">
                    {isLoading ? (
                      <div className="flex items-center justify-center py-16">
                        <Loader2
                          className="animate-spin text-black/40 dark:text-white/40"
                          size={24}
                        />
                      </div>
                    ) : filteredProviders.length === 0 ? (
                      <div className="text-center py-16 px-4 text-black/60 dark:text-white/60 text-sm">
                        {searchQuery
                          ? 'No models found'
                          : 'No chat models configured'}
                      </div>
                    ) : (
                      <div className="flex flex-col">
                        {filteredProviders.map((provider, providerIndex) => (
                          <div key={provider.id}>
                            <div className="px-4 py-2.5 sticky top-0 bg-light-primary dark:bg-dark-primary border-b border-light-200/50 dark:border-dark-200/50">
                              <p className="text-xs text-black/50 dark:text-white/50 uppercase tracking-wider">
                                {provider.name}
                              </p>
                            </div>

                            <div className="flex flex-col px-2 py-2 space-y-0.5">
                              {provider.chatModels.map((model) => (
                                <button
                                  key={model.key}
                                  onClick={() =>
                                    handleModelSelect(provider.id, model.key)
                                  }
                                  type="button"
                                  className={cn(
                                    'px-3 py-2 flex items-center justify-between text-start duration-200 cursor-pointer transition rounded-lg group',
                                    chatModelProvider?.providerId ===
                                      provider.id &&
                                      chatModelProvider?.key === model.key
                                      ? 'bg-light-secondary dark:bg-dark-secondary'
                                      : 'hover:bg-light-secondary dark:hover:bg-dark-secondary',
                                  )}
                                >
                                  <div className="flex items-center space-x-2.5 min-w-0 flex-1">
                                    <Cpu
                                      size={15}
                                      className={cn(
                                        'shrink-0',
                                        chatModelProvider?.providerId ===
                                          provider.id &&
                                          chatModelProvider?.key === model.key
                                          ? 'text-sky-500'
                                          : 'text-black/50 dark:text-white/50 group-hover:text-black/70 group-hover:dark:text-white/70',
                                      )}
                                    />
                                    <p
                                      className={cn(
                                        'text-xs truncate',
                                        chatModelProvider?.providerId ===
                                          provider.id &&
                                          chatModelProvider?.key === model.key
                                          ? 'text-sky-500 font-medium'
                                          : 'text-black/70 dark:text-white/70 group-hover:text-black dark:group-hover:text-white',
                                      )}
                                    >
                                      {model.name}
                                    </p>
                                  </div>
                                </button>
                              ))}
                            </div>

                            {providerIndex < filteredProviders.length - 1 && (
                              <div className="h-px bg-light-200 dark:bg-dark-200" />
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </motion.div>
              </PopoverPanel>
            )}
          </AnimatePresence>
        </>
      )}
    </Popover>
  );
};

export default ModelSelector;
