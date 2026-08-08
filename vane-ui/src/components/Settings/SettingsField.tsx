import { useEffect, useState } from 'react';
import Select from '../ui/Select';
import { toast } from 'sonner';
import { useTheme } from 'next-themes';
import { Eye, EyeOff, Loader2, Plus, RefreshCw, Trash2 } from 'lucide-react';
import { Switch } from '@headlessui/react';
import QuickPromptsEditor from './Sections/QuickPromptsEditor';
import { persistClientField } from '@/lib/config/clientStorageSync';
import { useConfigFieldLabels } from '@/lib/i18n/fieldLabels';
import { useTranslation } from 'react-i18next';
import {
  SelectUIConfigField,
  StringUIConfigField,
  StringListUIConfigField,
  SwitchUIConfigField,
  TextareaUIConfigField,
  UIConfigField,
} from '@/lib/config/types';

const emitClientConfigChanged = () => {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event('client-config-changed'));
  }
};

const SettingsSelect = ({
  field,
  value,
  setValue,
  dataAdd,
}: {
  field: SelectUIConfigField;
  value?: any;
  setValue: (value: any) => void;
  dataAdd: string;
}) => {
  const [loading, setLoading] = useState(false);
  const { setTheme } = useTheme();
  const { t } = useTranslation();
  const labels = useConfigFieldLabels(field);

  const handleSave = async (newValue: any) => {
    setLoading(true);
    setValue(newValue);
    try {
      if (field.scope === 'client') {
        localStorage.setItem(field.key, newValue);
        if (field.key === 'theme') {
          setTheme(newValue);
        }
        await persistClientField(
          dataAdd as 'preferences' | 'personalization',
          field.key,
          String(newValue),
        );
        emitClientConfigChanged();
      } else {
        const res = await fetch('/api/config', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            key: `${dataAdd}.${field.key}`,
            value: newValue,
          }),
        });

        if (!res.ok) {
          console.error('Failed to save config:', await res.text());
          throw new Error('Failed to save configuration');
        }
      }
    } catch (error) {
      console.error('Error saving config:', error);
      toast.error(t('common.saveConfigFailed'));
    } finally {
      setTimeout(() => setLoading(false), 150);
    }
  };

  return (
    <section className="rounded-xl border border-light-200 bg-light-primary/80 p-4 lg:p-6 transition-colors dark:border-dark-200 dark:bg-dark-primary/80">
      <div className="space-y-3 lg:space-y-5">
        <div>
          <h4 className="text-sm lg:text-sm text-black dark:text-white">
            {labels.name}
          </h4>
          <p className="text-[11px] lg:text-xs text-black/50 dark:text-white/50">
            {labels.description}
          </p>
        </div>
        <Select
          value={value}
          onChange={(event) => handleSave(event.target.value)}
          options={(field.options ?? []).map((option) => ({
            value: option.value,
            label: t(`settings.fields.${field.key}.options.${option.value}`, {
              defaultValue: option.name,
            }),
          }))}
          className="!text-xs lg:!text-sm"
          loading={loading}
          disabled={loading}
        />
      </div>
    </section>
  );
};

const SettingsInput = ({
  field,
  value,
  setValue,
  dataAdd,
}: {
  field: StringUIConfigField;
  value?: any;
  setValue: (value: any) => void;
  dataAdd: string;
}) => {
  const [loading, setLoading] = useState(false);
  const { t } = useTranslation();
  const labels = useConfigFieldLabels(field);
  const placeholder = t(`settings.fields.${field.key}.placeholder`, {
    defaultValue: field.placeholder ?? '',
  });

  const handleSave = async (newValue: any) => {
    setLoading(true);
    setValue(newValue);
    try {
      if (field.scope === 'client') {
        localStorage.setItem(field.key, newValue);
        await persistClientField(
          dataAdd as 'preferences' | 'personalization',
          field.key,
          String(newValue),
        );
        emitClientConfigChanged();
      } else {
        const res = await fetch('/api/config', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            key: `${dataAdd}.${field.key}`,
            value: newValue,
          }),
        });

        if (!res.ok) {
          console.error('Failed to save config:', await res.text());
          throw new Error('Failed to save configuration');
        }
      }
    } catch (error) {
      console.error('Error saving config:', error);
      toast.error(t('common.saveConfigFailed'));
    } finally {
      setTimeout(() => setLoading(false), 150);
    }
  };

  return (
    <section className="rounded-xl border border-light-200 bg-light-primary/80 p-4 lg:p-6 transition-colors dark:border-dark-200 dark:bg-dark-primary/80">
      <div className="space-y-3 lg:space-y-5">
        <div>
          <h4 className="text-sm lg:text-sm text-black dark:text-white">
            {labels.name}
          </h4>
          <p className="text-[11px] lg:text-xs text-black/50 dark:text-white/50">
            {labels.description}
          </p>
        </div>
        <div className="relative">
          <input
            value={value ?? field.default ?? ''}
            onChange={(event) => setValue(event.target.value)}
            onBlur={(event) => handleSave(event.target.value)}
            className="w-full rounded-lg border border-light-200 dark:border-dark-200 bg-light-primary dark:bg-dark-primary px-3 py-2 lg:px-4 lg:py-3 pr-10 !text-xs lg:!text-[13px] text-black/80 dark:text-white/80 placeholder:text-black/40 dark:placeholder:text-white/40 focus-visible:outline-none focus-visible:border-light-300 dark:focus-visible:border-dark-300 transition-colors disabled:cursor-not-allowed disabled:opacity-60"
            placeholder={placeholder || undefined}
            type="text"
            disabled={loading}
          />
          {loading && (
            <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-black/40 dark:text-white/40">
              <Loader2 className="h-4 w-4 animate-spin" />
            </span>
          )}
        </div>
      </div>
    </section>
  );
};

type TavilyUsageRow = {
  index: number;
  hint: string;
  ok: boolean;
  usage?: number;
  limit?: number | null;
  remaining?: number | null;
  plan?: string;
  error?: string;
};

const SettingsStringList = ({
  field,
  value,
  setValue,
  dataAdd,
}: {
  field: StringListUIConfigField;
  value?: string[];
  setValue: (value: string[]) => void;
  dataAdd: string;
}) => {
  const [loading, setLoading] = useState(false);
  const [revealed, setRevealed] = useState<Record<number, boolean>>({});
  const [usageRows, setUsageRows] = useState<TavilyUsageRow[] | null>(null);
  const [usageLoading, setUsageLoading] = useState(false);
  const { t } = useTranslation();
  const labels = useConfigFieldLabels(field);
  const placeholder = t(`settings.fields.${field.key}.placeholder`, {
    defaultValue: field.placeholder ?? '',
  });
  const items = Array.isArray(value) ? value : [];
  const showTavilyUsage = field.key === 'tavilyApiKeys';

  const fetchTavilyUsage = async () => {
    if (!showTavilyUsage) return;
    setUsageLoading(true);
    try {
      const res = await fetch('/api/search/tavily-usage');
      if (!res.ok) {
        throw new Error(await res.text());
      }
      const data = (await res.json()) as { keys?: TavilyUsageRow[] };
      setUsageRows(Array.isArray(data.keys) ? data.keys : []);
    } catch (error) {
      console.error('Tavily usage fetch failed:', error);
      toast.error(
        t('settings.tavilyUsage.fetchFailed', {
          defaultValue: 'Failed to fetch Tavily credits',
        }),
      );
    } finally {
      setUsageLoading(false);
    }
  };

  useEffect(() => {
    if (showTavilyUsage && items.some((k) => k.trim())) {
      void fetchTavilyUsage();
    }
    // Only on mount / when switching to this field with keys present.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showTavilyUsage]);

  const persist = async (next: string[]) => {
    const cleaned = next.map((k) => k.trim()).filter(Boolean);
    setLoading(true);
    setValue(cleaned);
    try {
      const res = await fetch('/api/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          key: `${dataAdd}.${field.key}`,
          value: cleaned,
        }),
      });
      if (!res.ok) {
        console.error('Failed to save config:', await res.text());
        throw new Error('Failed to save configuration');
      }
      if (showTavilyUsage) {
        void fetchTavilyUsage();
      }
    } catch (error) {
      console.error('Error saving config:', error);
      toast.error(t('common.saveConfigFailed'));
    } finally {
      setTimeout(() => setLoading(false), 150);
    }
  };

  const updateAt = (index: number, text: string) => {
    const next = [...items];
    next[index] = text;
    setValue(next);
  };

  const removeAt = (index: number) => {
    setRevealed((prev) => {
      const next: Record<number, boolean> = {};
      for (const [k, v] of Object.entries(prev)) {
        const i = Number(k);
        if (i < index) next[i] = v;
        else if (i > index) next[i - 1] = v;
      }
      return next;
    });
    void persist(items.filter((_, i) => i !== index));
  };

  const addRow = () => {
    setValue([...items, '']);
  };

  const toggleReveal = (index: number) => {
    setRevealed((prev) => ({ ...prev, [index]: !prev[index] }));
  };

  return (
    <section className="rounded-xl border border-light-200 bg-light-primary/80 p-4 lg:p-6 transition-colors dark:border-dark-200 dark:bg-dark-primary/80">
      <div className="space-y-3 lg:space-y-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h4 className="text-sm lg:text-sm text-black dark:text-white">
              {labels.name}
            </h4>
            <p className="text-[11px] lg:text-xs text-black/50 dark:text-white/50">
              {labels.description}
            </p>
          </div>
          <button
            type="button"
            onClick={addRow}
            disabled={loading}
            className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-light-200 dark:border-dark-200 px-2.5 py-1.5 text-[11px] lg:text-xs text-black/70 dark:text-white/70 hover:bg-light-200/60 dark:hover:bg-dark-200/60 transition-colors disabled:opacity-60"
          >
            <Plus className="h-3.5 w-3.5" />
            {t('settings.stringList.add', { defaultValue: 'Add' })}
          </button>
        </div>
        <div className="space-y-2">
          {items.length === 0 ? (
            <p className="text-[11px] lg:text-xs text-black/40 dark:text-white/40">
              {t('settings.stringList.empty', {
                defaultValue: 'No keys yet. Click Add to enter one.',
              })}
            </p>
          ) : (
            items.map((item, index) => {
              const isRevealed = !!revealed[index];
              return (
                <div key={index} className="flex items-center gap-2">
                  <div className="relative min-w-0 flex-1">
                    <input
                      value={item}
                      onChange={(event) => updateAt(index, event.target.value)}
                      onBlur={(event) => {
                        const next = [...items];
                        next[index] = event.target.value;
                        void persist(next);
                      }}
                      className="w-full rounded-lg border border-light-200 dark:border-dark-200 bg-light-primary dark:bg-dark-primary px-3 py-2 lg:px-4 lg:py-3 pr-10 !text-xs lg:!text-[13px] text-black/80 dark:text-white/80 placeholder:text-black/40 dark:placeholder:text-white/40 focus-visible:outline-none focus-visible:border-light-300 dark:focus-visible:border-dark-300 transition-colors disabled:cursor-not-allowed disabled:opacity-60"
                      placeholder={placeholder || undefined}
                      type={isRevealed ? 'text' : 'password'}
                      autoComplete="off"
                      spellCheck={false}
                      disabled={loading}
                    />
                    <button
                      type="button"
                      onClick={() => toggleReveal(index)}
                      disabled={loading}
                      aria-label={
                        isRevealed
                          ? t('settings.stringList.hide', {
                              defaultValue: 'Hide',
                            })
                          : t('settings.stringList.show', {
                              defaultValue: 'Show',
                            })
                      }
                      className="absolute right-2 top-1/2 -translate-y-1/2 inline-flex h-7 w-7 items-center justify-center rounded-md text-black/40 dark:text-white/40 hover:text-black/70 dark:hover:text-white/70 transition-colors disabled:opacity-60"
                    >
                      {isRevealed ? (
                        <EyeOff className="h-3.5 w-3.5" />
                      ) : (
                        <Eye className="h-3.5 w-3.5" />
                      )}
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={() => removeAt(index)}
                    disabled={loading}
                    aria-label={t('settings.stringList.remove', {
                      defaultValue: 'Remove',
                    })}
                    className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-light-200 dark:border-dark-200 text-black/50 dark:text-white/50 hover:text-red-500 hover:border-red-300 dark:hover:border-red-400 transition-colors disabled:opacity-60"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              );
            })
          )}
          {loading && (
            <span className="inline-flex items-center gap-1.5 text-[11px] text-black/40 dark:text-white/40">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              {t('common.saving', { defaultValue: 'Saving…' })}
            </span>
          )}
        </div>

        {showTavilyUsage && items.some((k) => k.trim()) && (
          <div className="space-y-2 border-t border-light-200 dark:border-dark-200 pt-3">
            <div className="flex items-center justify-between gap-2">
              <p className="text-[11px] lg:text-xs text-black/60 dark:text-white/60">
                {t('settings.tavilyUsage.title', {
                  defaultValue: 'Credits this billing cycle',
                })}
              </p>
              <button
                type="button"
                onClick={() => void fetchTavilyUsage()}
                disabled={usageLoading}
                className="inline-flex items-center gap-1 rounded-lg border border-light-200 dark:border-dark-200 px-2 py-1 text-[11px] text-black/70 dark:text-white/70 hover:bg-light-200/60 dark:hover:bg-dark-200/60 transition-colors disabled:opacity-60"
              >
                {usageLoading ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <RefreshCw className="h-3.5 w-3.5" />
                )}
                {t('settings.tavilyUsage.refresh', { defaultValue: 'Refresh' })}
              </button>
            </div>
            {usageRows === null && usageLoading ? (
              <p className="text-[11px] text-black/40 dark:text-white/40">
                {t('settings.tavilyUsage.loading', {
                  defaultValue: 'Loading…',
                })}
              </p>
            ) : usageRows && usageRows.length === 0 ? (
              <p className="text-[11px] text-black/40 dark:text-white/40">
                {t('settings.tavilyUsage.empty', {
                  defaultValue: 'No saved keys to check.',
                })}
              </p>
            ) : (
              <ul className="space-y-1.5">
                {(usageRows ?? []).map((row) => (
                  <li
                    key={`${row.index}-${row.hint}`}
                    className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 text-[11px] lg:text-xs"
                  >
                    <span className="font-mono text-black/55 dark:text-white/55">
                      #{row.index + 1} {row.hint}
                      {row.plan ? ` · ${row.plan}` : ''}
                    </span>
                    {row.ok ? (
                      <span className="text-black/80 dark:text-white/80">
                        {typeof row.remaining === 'number' &&
                        typeof row.limit === 'number'
                          ? t('settings.tavilyUsage.remaining', {
                              remaining: row.remaining,
                              limit: row.limit,
                              used: row.usage ?? 0,
                              defaultValue: `{{remaining}} left / {{limit}} (used {{used}})`,
                            })
                          : t('settings.tavilyUsage.usedUnlimited', {
                              used: row.usage ?? 0,
                              defaultValue: `used {{used}} (no limit)`,
                            })}
                      </span>
                    ) : (
                      <span className="text-red-500/90">
                        {row.error ||
                          t('settings.tavilyUsage.error', {
                            defaultValue: 'Failed',
                          })}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    </section>
  );
};

const SettingsTextarea = ({
  field,
  value,
  setValue,
  dataAdd,
}: {
  field: TextareaUIConfigField;
  value?: any;
  setValue: (value: any) => void;
  dataAdd: string;
}) => {
  const [loading, setLoading] = useState(false);
  const { t } = useTranslation();
  const labels = useConfigFieldLabels(field);
  const placeholder = t(`settings.fields.${field.key}.placeholder`, {
    defaultValue: field.placeholder ?? '',
  });

  const handleSave = async (newValue: any) => {
    setLoading(true);
    setValue(newValue);
    try {
      if (field.scope === 'client') {
        localStorage.setItem(field.key, newValue);
        await persistClientField(
          dataAdd as 'preferences' | 'personalization',
          field.key,
          String(newValue),
        );
        emitClientConfigChanged();
      } else {
        const res = await fetch('/api/config', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            key: `${dataAdd}.${field.key}`,
            value: newValue,
          }),
        });

        if (!res.ok) {
          console.error('Failed to save config:', await res.text());
          throw new Error('Failed to save configuration');
        }
      }
    } catch (error) {
      console.error('Error saving config:', error);
      toast.error(t('common.saveConfigFailed'));
    } finally {
      setTimeout(() => setLoading(false), 150);
    }
  };

  return (
    <section className="rounded-xl border border-light-200 bg-light-primary/80 p-4 lg:p-6 transition-colors dark:border-dark-200 dark:bg-dark-primary/80">
      <div className="space-y-3 lg:space-y-5">
        <div>
          <h4 className="text-sm lg:text-sm text-black dark:text-white">
            {labels.name}
          </h4>
          <p className="text-[11px] lg:text-xs text-black/50 dark:text-white/50 mb-4">
            {labels.description}
          </p>
        </div>
        {field.key === 'vane_custom_prompts' ? (
          <QuickPromptsEditor value={value} onChange={handleSave} />
        ) : (
          <div className="relative">
            <textarea
              value={value ?? field.default ?? ''}
              onChange={(event) => setValue(event.target.value)}
              onBlur={(event) => handleSave(event.target.value)}
              className="w-full rounded-lg border border-light-200 dark:border-dark-200 bg-light-primary dark:bg-dark-primary px-3 py-2 lg:px-4 lg:py-3 pr-10 !text-xs lg:!text-[13px] text-black/80 dark:text-white/80 placeholder:text-black/40 dark:placeholder:text-white/40 focus-visible:outline-none focus-visible:border-light-300 dark:focus-visible:border-dark-300 transition-colors disabled:cursor-not-allowed disabled:opacity-60"
              placeholder={placeholder || undefined}
              rows={4}
              disabled={loading}
            />
            {loading && (
              <span className="pointer-events-none absolute right-3 translate-y-3 text-black/40 dark:text-white/40">
                <Loader2 className="h-4 w-4 animate-spin" />
              </span>
            )}
          </div>
        )}
      </div>
    </section>
  );
};

const SettingsSwitch = ({
  field,
  value,
  setValue,
  dataAdd,
}: {
  field: SwitchUIConfigField;
  value?: any;
  setValue: (value: any) => void;
  dataAdd: string;
}) => {
  const [loading, setLoading] = useState(false);
  const { t } = useTranslation();
  const labels = useConfigFieldLabels(field);

  const handleSave = async (newValue: boolean) => {
    setLoading(true);
    setValue(newValue);
    try {
      if (field.scope === 'client') {
        localStorage.setItem(field.key, String(newValue));
        await persistClientField(
          dataAdd as 'preferences' | 'personalization',
          field.key,
          String(newValue),
        );
        emitClientConfigChanged();
      } else {
        const res = await fetch('/api/config', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            key: `${dataAdd}.${field.key}`,
            value: newValue,
          }),
        });

        if (!res.ok) {
          console.error('Failed to save config:', await res.text());
          throw new Error('Failed to save configuration');
        }
      }
    } catch (error) {
      console.error('Error saving config:', error);
      toast.error(t('common.saveConfigFailed'));
    } finally {
      setTimeout(() => setLoading(false), 150);
    }
  };

  const isChecked = value === true || value === 'true';

  return (
    <section className="rounded-xl border border-light-200 bg-light-primary/80 p-4 lg:p-6 transition-colors dark:border-dark-200 dark:bg-dark-primary/80">
      <div className="flex flex-row items-center space-x-3 lg:space-x-5 w-full justify-between">
        <div>
          <h4 className="text-sm lg:text-sm text-black dark:text-white">
            {labels.name}
          </h4>
          <p className="text-[11px] lg:text-xs text-black/50 dark:text-white/50">
            {labels.description}
          </p>
        </div>
        <Switch
          checked={isChecked}
          onChange={handleSave}
          disabled={loading}
          className="group relative flex h-6 w-12 shrink-0 cursor-pointer rounded-full bg-light-200 dark:bg-white/10 p-1 duration-200 ease-in-out focus:outline-none transition-colors disabled:opacity-60 disabled:cursor-not-allowed data-[checked]:bg-sky-500 dark:data-[checked]:bg-sky-500"
        >
          <span
            aria-hidden="true"
            className="pointer-events-none inline-block size-4 translate-x-0 rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out group-data-[checked]:translate-x-6"
          />
        </Switch>
      </div>
    </section>
  );
};

const SettingsField = ({
  field,
  value,
  dataAdd,
}: {
  field: UIConfigField;
  value: any;
  dataAdd: string;
}) => {
  const [val, setVal] = useState(value);

  switch (field.type) {
    case 'select':
      return (
        <SettingsSelect
          field={field}
          value={val}
          setValue={setVal}
          dataAdd={dataAdd}
        />
      );
    case 'string':
      return (
        <SettingsInput
          field={field}
          value={val}
          setValue={setVal}
          dataAdd={dataAdd}
        />
      );
    case 'stringList':
      return (
        <SettingsStringList
          field={field}
          value={val}
          setValue={setVal}
          dataAdd={dataAdd}
        />
      );
    case 'textarea':
      return (
        <SettingsTextarea
          field={field}
          value={val}
          setValue={setVal}
          dataAdd={dataAdd}
        />
      );
    case 'switch':
      return (
        <SettingsSwitch
          field={field}
          value={val}
          setValue={setVal}
          dataAdd={dataAdd}
        />
      );
    default:
      return <div>Unsupported field type: {(field as UIConfigField).type}</div>;
  }
};

export default SettingsField;
