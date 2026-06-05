import { Dialog, DialogPanel, DialogTitle } from '@headlessui/react';
import { PenTool, X } from 'lucide-react';
import { Fragment, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import type { StudioLengthPreference, StudioSpec } from '@/lib/studio/types';
import { formatStudioDisplayQuery } from '@/lib/studio/types';
import { setPendingStudioStream } from '@/lib/studio/studioStreamBridge';

type Props = {
  open: boolean;
  onClose: () => void;
  fromChatId?: string;
};

const AUDIENCE_OPTIONS = [
  'general',
  'professional',
  'executive',
] as const;

const GENRE_OPTIONS = [
  'analysis',
  'editorial',
  'productDoc',
  'memo',
] as const;

const LENGTH_OPTIONS: StudioLengthPreference[] = [
  'shorter',
  'standard',
  'longer',
];

const StudioModal = ({ open, onClose, fromChatId }: Props) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [submitting, setSubmitting] = useState(false);
  const [instruction, setInstruction] = useState('');
  const [lengthPreference, setLengthPreference] =
    useState<StudioLengthPreference>('standard');
  const [audience, setAudience] = useState<string>('general');
  const [genre, setGenre] = useState<string>('analysis');
  const [useResearch, setUseResearch] = useState(false);

  const resetForm = () => {
    setInstruction('');
    setLengthPreference('standard');
    setAudience('general');
    setGenre('analysis');
    setUseResearch(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!instruction.trim() || submitting) return;

    if (!fromChatId) {
      toast.error(t('studio.modal.sourceChatRequired'));
      return;
    }

    const chatModelKey = localStorage.getItem('chatModelKey');
    const chatModelProviderId = localStorage.getItem('chatModelProviderId');
    const embeddingModelKey = localStorage.getItem('embeddingModelKey');
    const embeddingModelProviderId = localStorage.getItem(
      'embeddingModelProviderId',
    );

    if (
      !chatModelKey ||
      !chatModelProviderId ||
      !embeddingModelKey ||
      !embeddingModelProviderId
    ) {
      toast.error(t('studio.modal.configRequired'));
      return;
    }

    const spec: StudioSpec = {
      instruction: instruction.trim(),
      lengthPreference,
      audience: t(`studio.audience.${audience}`),
      genre: t(`studio.genre.${genre}`),
      useResearch,
      fromChatId,
    };

    setSubmitting(true);

    try {
      const res = await fetch('/api/studio/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          spec,
          chatModel: {
            key: chatModelKey,
            providerId: chatModelProviderId,
          },
          embeddingModel: {
            key: embeddingModelKey,
            providerId: embeddingModelProviderId,
          },
          reasoningPreset:
            (localStorage.getItem('chatReasoningPreset') as
              | 'auto'
              | 'off'
              | 'low'
              | 'high'
              | 'max'
              | null) ?? 'auto',
        }),
      });

      if (!res.ok || !res.body) {
        const errText = await res.text().catch(() => '');
        toast.error(errText || t('studio.modal.createFailed'));
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder('utf-8');
      let partial = '';
      let chatId: string | undefined;
      let messageId: string | undefined;

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        partial += decoder.decode(value, { stream: true });
        const lines = partial.split('\n');
        partial = lines.pop() ?? '';

        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const json = JSON.parse(line) as {
              type?: string;
              chatId?: string;
              messageId?: string;
            };
            if (json.type === 'chatCreated' && json.chatId && json.messageId) {
              chatId = json.chatId;
              messageId = json.messageId;
              break;
            }
          } catch {
            /* wait for complete line */
          }
        }
        if (chatId && messageId) break;
      }

      if (!chatId || !messageId) {
        toast.error(t('studio.modal.createFailed'));
        return;
      }

      setPendingStudioStream({
        chatId,
        messageId,
        displayQuery: formatStudioDisplayQuery(spec),
        reader,
      });

      resetForm();
      onClose();
      navigate(`/c/${chatId}?studio=1`);
    } catch (err: unknown) {
      toast.error(
        err instanceof Error ? err.message : t('studio.modal.createFailed'),
      );
    } finally {
      setSubmitting(false);
    }
  };

  const inputClass =
    'w-full rounded-xl border border-light-200 dark:border-dark-200 bg-light-primary dark:bg-dark-primary px-3 py-2 text-sm text-black dark:text-white outline-none focus:ring-2 focus:ring-[#24A0ED]/40';

  return (
    <Dialog open={open} onClose={onClose} as={Fragment}>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div
          className="fixed inset-0 bg-black/40 backdrop-blur-sm"
          aria-hidden="true"
        />
        <DialogPanel className="relative z-10 w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl border border-light-200 dark:border-dark-200 bg-light-primary dark:bg-dark-primary shadow-xl">
          <div className="flex items-center justify-between border-b border-light-200 dark:border-dark-200 px-5 py-4">
            <DialogTitle className="flex items-center gap-2 text-base font-medium text-black dark:text-white">
              <PenTool size={18} className="text-[#24A0ED]" />
              {t('studio.modal.title')}
            </DialogTitle>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg p-1.5 hover:bg-light-secondary dark:hover:bg-dark-secondary"
            >
              <X size={16} className="text-black/60 dark:text-white/60" />
            </button>
          </div>

          <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4 p-5">
            <p className="text-xs text-black/55 dark:text-white/55">
              {t('studio.modal.sourceHint')}
            </p>

            <div>
              <label className="mb-1 block text-xs font-medium text-black/60 dark:text-white/60">
                {t('studio.modal.instruction')}
              </label>
              <textarea
                className={`${inputClass} min-h-[88px] resize-y`}
                value={instruction}
                onChange={(e) => setInstruction(e.target.value)}
                placeholder={t('studio.modal.instructionPlaceholder')}
                required
              />
            </div>

            <div>
              <span className="mb-2 block text-xs font-medium text-black/60 dark:text-white/60">
                {t('studio.modal.lengthPreference')}
              </span>
              <div className="flex flex-wrap gap-2">
                {LENGTH_OPTIONS.map((key) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setLengthPreference(key)}
                    className={
                      lengthPreference === key ?
                        'rounded-xl border border-[#24A0ED] bg-[#24A0ED]/10 px-3 py-2 text-sm text-[#24A0ED]'
                      : 'rounded-xl border border-light-200 dark:border-dark-200 px-3 py-2 text-sm text-black/70 dark:text-white/70 hover:bg-light-secondary dark:hover:bg-dark-secondary'
                    }
                  >
                    {t(`studio.length.${key}`)}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-black/60 dark:text-white/60">
                  {t('studio.modal.audience')}
                </label>
                <select
                  className={inputClass}
                  value={audience}
                  onChange={(e) => setAudience(e.target.value)}
                >
                  {AUDIENCE_OPTIONS.map((key) => (
                    <option key={key} value={key}>
                      {t(`studio.audience.${key}`)}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-black/60 dark:text-white/60">
                  {t('studio.modal.genre')}
                </label>
                <select
                  className={inputClass}
                  value={genre}
                  onChange={(e) => setGenre(e.target.value)}
                >
                  {GENRE_OPTIONS.map((key) => (
                    <option key={key} value={key}>
                      {t(`studio.genre.${key}`)}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <label className="flex items-center gap-2 text-sm text-black/80 dark:text-white/80">
              <input
                type="checkbox"
                checked={useResearch}
                onChange={(e) => setUseResearch(e.target.checked)}
                className="rounded border-light-200 dark:border-dark-200"
              />
              {t('studio.modal.useResearch')}
            </label>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={onClose}
                className="rounded-xl px-4 py-2 text-sm text-black/70 dark:text-white/70 hover:bg-light-secondary dark:hover:bg-dark-secondary"
              >
                {t('common.cancel')}
              </button>
              <button
                type="submit"
                disabled={submitting || !instruction.trim()}
                className="rounded-xl bg-[#24A0ED] px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
              >
                {submitting ? t('common.loading') : t('studio.modal.submit')}
              </button>
            </div>
          </form>
        </DialogPanel>
      </div>
    </Dialog>
  );
};

export default StudioModal;
