import { Dialog, DialogPanel } from '@headlessui/react';
import { Loader2, Plus } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ConfigModelProvider } from '@/lib/config/types';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';

type CatalogModel = {
  name: string;
  key: string;
  capabilities?: Record<string, unknown>;
};

const AddModel = ({
  providerId,
  setProviders,
  type,
  enabledKeys,
}: {
  providerId: string;
  setProviders: React.Dispatch<React.SetStateAction<ConfigModelProvider[]>>;
  type: 'chat' | 'embedding';
  enabledKeys: string[];
}) => {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [modelName, setModelName] = useState('');
  const [modelKey, setModelKey] = useState('');
  const [loading, setLoading] = useState(false);
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [catalog, setCatalog] = useState<CatalogModel[]>([]);

  const enabledSet = useMemo(() => new Set(enabledKeys), [enabledKeys]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      setCatalogLoading(true);
      try {
        const res = await fetch(`/api/providers/${providerId}/catalog`);
        if (!res.ok) throw new Error('catalog failed');
        const data = (await res.json()) as {
          chat?: CatalogModel[];
          embedding?: CatalogModel[];
        };
        if (cancelled) return;
        setCatalog(type === 'chat' ? (data.chat ?? []) : (data.embedding ?? []));
      } catch {
        if (!cancelled) setCatalog([]);
      } finally {
        if (!cancelled) setCatalogLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, providerId, type]);

  const suggestions = catalog.filter((m) => m.key && !enabledSet.has(m.key));

  const persistAdd = async (name: string, key: string, capabilities?: unknown) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/providers/${providerId}/models`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name,
          key,
          type,
          ...(capabilities ? { capabilities } : {}),
        }),
      });

      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        throw new Error(
          (errBody as { message?: string }).message || 'Failed to add model',
        );
      }

      const newModel = { name, key, ...(capabilities ? { capabilities } : {}) };
      setProviders((prev) =>
        prev.map((provider) => {
          if (provider.id !== providerId) return provider;
          return {
            ...provider,
            chatModels:
              type === 'chat'
                ? [...provider.chatModels, newModel as any]
                : provider.chatModels,
            embeddingModels:
              type === 'embedding'
                ? [...provider.embeddingModels, newModel as any]
                : provider.embeddingModels,
          };
        }),
      );

      toast.success(t('settings.models.modelAdded'));
      setModelName('');
      setModelKey('');
      return true;
    } catch (error) {
      console.error('Error adding model:', error);
      toast.error(
        error instanceof Error
          ? error.message
          : t('settings.models.modelAddFailed'),
      );
      return false;
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const ok = await persistAdd(modelName.trim(), modelKey.trim());
    if (ok) setOpen(false);
  };

  const handleQuickAdd = async (m: CatalogModel) => {
    const ok = await persistAdd(m.name || m.key, m.key, m.capabilities);
    if (ok) {
      /* keep dialog open so user can add more from catalog */
    }
  };

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="text-xs text-black/70 dark:text-white/70 hover:text-black hover:dark:text-white flex flex-row items-center space-x-1 active:scale-95 transition duration-200"
      >
        <Plus size={12} />
        <span>Add</span>
      </button>
      <AnimatePresence>
        {open && (
          <Dialog
            static
            open={open}
            onClose={() => setOpen(false)}
            className="relative z-[60]"
          >
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.1 }}
              className="fixed inset-0 flex w-screen items-center justify-center p-4 bg-black/30 backdrop-blur-sm"
            >
              <DialogPanel className="w-full mx-4 lg:w-[600px] max-h-[85vh] flex flex-col border bg-light-primary dark:bg-dark-primary border-light-secondary dark:border-dark-secondary rounded-lg">
                <div className="px-6 pt-6 pb-4">
                  <h3 className="text-black/90 dark:text-white/90 font-medium text-sm">
                    Add new {type === 'chat' ? 'chat' : 'embedding'} model
                  </h3>
                  <p className="mt-1 text-[11px] text-black/50 dark:text-white/50">
                    Enable models one by one. Pick from the provider catalog when
                    available, or type a model key manually.
                  </p>
                </div>
                <div className="border-t border-light-200 dark:border-dark-200" />
                <div className="flex-1 overflow-y-auto px-6 py-4">
                  <div className="flex flex-col space-y-4 mb-4">
                    <div className="flex flex-row items-center justify-between">
                      <p className="text-[11px] font-medium text-black/70 dark:text-white/70 uppercase tracking-wide">
                        From provider
                      </p>
                      {catalogLoading && (
                        <Loader2 className="animate-spin" size={14} />
                      )}
                    </div>
                    {!catalogLoading && suggestions.length === 0 ? (
                      <p className="text-xs text-black/45 dark:text-white/45">
                        No catalog entries (or all already enabled). Enter a key
                        below.
                      </p>
                    ) : (
                      <div className="flex flex-row flex-wrap gap-2 max-h-40 overflow-y-auto">
                        {suggestions.map((m) => (
                          <button
                            key={m.key}
                            type="button"
                            disabled={loading}
                            onClick={() => handleQuickAdd(m)}
                            className="text-xs rounded-lg border border-light-200 dark:border-dark-200 bg-light-secondary dark:bg-dark-secondary px-2.5 py-1.5 text-black/70 dark:text-white/70 hover:border-sky-400 hover:text-sky-600 dark:hover:text-sky-400 disabled:opacity-60 transition-colors"
                            title={m.key}
                          >
                            {m.name || m.key}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  <form
                    onSubmit={handleSubmit}
                    className="flex flex-col h-full"
                  >
                    <div className="flex flex-col space-y-4 flex-1">
                      <div className="flex flex-col items-start space-y-2">
                        <label className="text-xs text-black/70 dark:text-white/70">
                          Model name*
                        </label>
                        <input
                          value={modelName}
                          onChange={(e) => setModelName(e.target.value)}
                          className="w-full rounded-lg border border-light-200 dark:border-dark-200 bg-light-primary dark:bg-dark-primary px-4 py-3 text-[13px] text-black/80 dark:text-white/80 placeholder:text-black/40 dark:placeholder:text-white/40 focus-visible:outline-none focus-visible:border-light-300 dark:focus-visible:border-dark-300 transition-colors disabled:cursor-not-allowed disabled:opacity-60"
                          placeholder={t('settings.models.modelNamePlaceholder')}
                          type="text"
                          required
                        />
                      </div>
                      <div className="flex flex-col items-start space-y-2">
                        <label className="text-xs text-black/70 dark:text-white/70">
                          Model key*
                        </label>
                        <input
                          value={modelKey}
                          onChange={(e) => setModelKey(e.target.value)}
                          className="w-full rounded-lg border border-light-200 dark:border-dark-200 bg-light-primary dark:bg-dark-primary px-4 py-3 text-[13px] text-black/80 dark:text-white/80 placeholder:text-black/40 dark:placeholder:text-white/40 focus-visible:outline-none focus-visible:border-light-300 dark:focus-visible:border-dark-300 transition-colors disabled:cursor-not-allowed disabled:opacity-60"
                          placeholder={t('settings.models.modelKeyPlaceholder')}
                          type="text"
                          required
                        />
                      </div>
                    </div>
                    <div className="border-t border-light-200 dark:border-dark-200 -mx-6 my-4" />
                    <div className="flex justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => setOpen(false)}
                        className="px-4 py-2 rounded-lg text-[13px] text-black/70 dark:text-white/70 hover:bg-light-secondary dark:hover:bg-dark-secondary transition"
                      >
                        Done
                      </button>
                      <button
                        type="submit"
                        disabled={loading}
                        className="px-4 py-2 rounded-lg text-[13px] bg-sky-500 text-white font-medium disabled:opacity-85 hover:opacity-85 active:scale-95 transition duration-200"
                      >
                        {loading ? (
                          <Loader2 className="animate-spin" size={16} />
                        ) : (
                          'Add Model'
                        )}
                      </button>
                    </div>
                  </form>
                </div>
              </DialogPanel>
            </motion.div>
          </Dialog>
        )}
      </AnimatePresence>
    </>
  );
};

export default AddModel;
