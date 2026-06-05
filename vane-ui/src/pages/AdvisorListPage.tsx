import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { formatTimeDifference } from '@/lib/utils';
import type { Chat } from './LibraryPage';

type AdvisorChat = Chat & { preview?: string };

type Eligibility = {
  eligible: boolean;
  reason: string;
  daysSinceLast: number;
  newUserMessages: number;
  lastRunAt: string | null;
};

const AdvisorListPage = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [chats, setChats] = useState<AdvisorChat[]>([]);
  const [eligibility, setEligibility] = useState<Eligibility | null>(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);

  const loadData = useCallback(async () => {
    try {
      const [chatsRes, eligRes] = await Promise.all([
        fetch('/api/chats?kind=advisor', { cache: 'no-store' }),
        fetch('/api/advisor/eligibility', { cache: 'no-store' }),
      ]);
      const chatsData = await chatsRes.json();
      const eligData = await eligRes.json();
      setChats(chatsData.chats || []);
      setEligibility(eligData);
    } catch {
      setChats([]);
      setEligibility(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const eligibilityHint = () => {
    if (!eligibility) return null;
    if (eligibility.reason === 'first-run') {
      return t('advisor.eligibility.firstRun');
    }
    if (eligibility.eligible) {
      if (eligibility.reason === 'days-threshold') {
        return t('advisor.eligibility.dueDays', {
          days: eligibility.daysSinceLast,
          messages: eligibility.newUserMessages,
        });
      }
      return t('advisor.eligibility.dueMessages', {
        days: eligibility.daysSinceLast,
        messages: eligibility.newUserMessages,
      });
    }
    return t('advisor.eligibility.notDue', {
      days: eligibility.daysSinceLast,
      messages: eligibility.newUserMessages,
    });
  };

  const handleRun = async () => {
    if (running) return;
    if (eligibility && !eligibility.eligible) {
      toast.error(t('advisor.eligibility.notDueShort'));
      return;
    }

    setRunning(true);
    try {
      const res = await fetch('/api/advisor/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || t('advisor.runFailed'));
      }
      await loadData();
      navigate(`/c/${data.chatId}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('advisor.runFailed'));
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="flex min-h-full flex-col p-6 pb-28">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-medium">{t('sidebar.advisor')}</h1>
          <p className="mt-2 text-sm text-black/60 dark:text-white/60">
            {t('advisor.subtitle')}
          </p>
          {eligibility && (
            <p className="mt-2 text-xs text-black/50 dark:text-white/50">
              {eligibilityHint()}
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={() => void handleRun()}
          disabled={running || loading || (eligibility !== null && !eligibility.eligible)}
          className="shrink-0 rounded-lg bg-shiye-ink px-4 py-2 text-sm font-medium text-shiye-paper transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40 dark:bg-shiye-paper dark:text-shiye-ink"
        >
          {running ? t('advisor.running') : t('advisor.runButton')}
        </button>
      </div>

      {loading ? (
        <p className="mt-6 text-sm text-black/50 dark:text-white/50">
          {t('common.loading')}
        </p>
      ) : chats.length > 0 ? (
        <ul className="mt-8 space-y-3">
          {chats.map((chat) => {
            const when = chat.lastMessageAt ?? chat.createdAt;
            return (
              <li key={chat.id}>
                <Link
                  to={`/c/${chat.id}`}
                  className="block rounded-lg border border-light-200 p-4 transition hover:border-shiye-ink/30 dark:border-dark-200 dark:hover:border-shiye-paper/20"
                >
                  <div className="flex items-start justify-between gap-3">
                    <h2 className="text-sm font-medium text-black/90 dark:text-white/90">
                      {chat.title}
                    </h2>
                    <span className="shrink-0 text-xs text-black/45 dark:text-white/45">
                      {formatTimeDifference(new Date(), new Date(when))}{' '}
                      {t('common.ago')}
                    </span>
                  </div>
                  {chat.preview ? (
                    <p className="mt-2 line-clamp-2 text-sm text-black/55 dark:text-white/55">
                      {chat.preview}
                      {chat.preview.length >= 80 ? '…' : ''}
                    </p>
                  ) : null}
                </Link>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="mt-8 text-sm text-black/50 dark:text-white/50">
          {t('advisor.empty')}
        </p>
      )}
    </div>
  );
};

export default AdvisorListPage;
