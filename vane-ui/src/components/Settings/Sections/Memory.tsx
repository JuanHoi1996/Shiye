import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import Loader from '@/components/ui/Loader';

type MemoryRecord = {
  body: string;
  updatedAt: string;
  updatedBy: string;
};

const Memory = () => {
  const { t, i18n } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [body, setBody] = useState('');
  const [meta, setMeta] = useState<Pick<MemoryRecord, 'updatedAt' | 'updatedBy'> | null>(
    null,
  );
  const [dirty, setDirty] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/memory', { cache: 'no-store' });
      if (!res.ok) throw new Error(String(res.status));
      const data = (await res.json()) as MemoryRecord;
      setBody(data.body ?? '');
      setMeta({ updatedAt: data.updatedAt, updatedBy: data.updatedBy });
      setDirty(false);
    } catch {
      toast.error(t('settings.memory.loadError'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch('/api/memory', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body }),
      });
      if (!res.ok) throw new Error(String(res.status));
      const data = (await res.json()) as Partial<MemoryRecord>;
      if (typeof data.body === 'string') setBody(data.body);
      if (data.updatedAt && data.updatedBy) {
        setMeta({ updatedAt: data.updatedAt, updatedBy: data.updatedBy });
      } else {
        await load();
      }
      setDirty(false);
      toast.success(t('settings.memory.saveSuccess'));
    } catch {
      toast.error(t('settings.memory.saveError'));
    } finally {
      setSaving(false);
    }
  };

  const formatUpdatedAt = (iso: string) => {
    try {
      return new Intl.DateTimeFormat(i18n.language, {
        dateStyle: 'medium',
        timeStyle: 'short',
      }).format(new Date(iso));
    } catch {
      return iso;
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 px-6 py-6">
      <p className="text-xs text-black/50 dark:text-white/50">
        {t('settings.memory.hint')}
      </p>
      <textarea
        value={body}
        onChange={(e) => {
          setBody(e.target.value);
          setDirty(true);
        }}
        rows={16}
        placeholder={t('settings.memory.placeholder')}
        className="w-full resize-y rounded-lg border border-light-200 bg-light-primary px-3 py-2 text-sm text-black/90 focus:border-light-300 focus:outline-none dark:border-dark-200 dark:bg-dark-primary dark:text-white/90 dark:focus:border-dark-300"
      />
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        {meta?.updatedAt ? (
          <p className="text-[11px] text-black/40 dark:text-white/40">
            {t('settings.memory.lastUpdated', {
              date: formatUpdatedAt(meta.updatedAt),
              by: meta.updatedBy || '—',
            })}
          </p>
        ) : (
          <span />
        )}
        <button
          type="button"
          onClick={() => void handleSave()}
          disabled={saving || !dirty}
          className="shrink-0 rounded-lg bg-shiye-ink px-4 py-2 text-sm font-medium text-shiye-paper transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40 dark:bg-shiye-paper dark:text-shiye-ink"
        >
          {saving ? t('common.loading') : t('common.save')}
        </button>
      </div>
    </div>
  );
};

export default Memory;
