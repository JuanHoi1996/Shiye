import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Clock, FilePen } from 'lucide-react';
import { formatTimeDifference } from '@/lib/utils';
import type { Chat } from './LibraryPage';

const StudioListPage = () => {
  const { t } = useTranslation();
  const [chats, setChats] = useState<Chat[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch('/api/chats?kind=studio', { cache: 'no-store' });
        const data = await res.json();
        setChats(data.chats || []);
      } catch {
        setChats([]);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const parseTitleParts = (title: string) => {
    const parts = title.replace(/^工房 ·\s*/, '').split(' · ');
    return {
      topic: parts[0] ?? title,
      genre: parts[1] ?? '',
    };
  };

  return (
    <div className="flex min-h-full flex-col p-6 pb-28">
      <div className="flex items-center gap-2">
        <FilePen size={22} className="text-[#24A0ED]" />
        <h1 className="text-2xl font-medium">{t('sidebar.studio')}</h1>
      </div>
      <p className="mt-2 text-sm text-black/60 dark:text-white/60">
        {t('studio.list.subtitle')}
      </p>

      {loading ? (
        <p className="mt-8 text-sm text-black/50 dark:text-white/50">
          {t('common.loading')}
        </p>
      ) : chats.length === 0 ? (
        <p className="mt-8 text-sm text-black/50 dark:text-white/50">
          {t('studio.list.empty')}
        </p>
      ) : (
        <ul className="mt-6 space-y-2">
          {chats.map((chat) => {
            const { topic, genre } = parseTitleParts(chat.title);
            const when = new Date(chat.lastMessageAt ?? chat.createdAt);

            return (
              <li key={chat.id}>
                <Link
                  to={`/c/${chat.id}`}
                  className="flex items-center justify-between gap-4 rounded-xl border border-light-200 dark:border-dark-200 bg-light-secondary/20 dark:bg-dark-secondary/20 px-4 py-3 hover:border-[#24A0ED]/40 transition-colors"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-black dark:text-white">
                      {topic}
                    </p>
                    {genre && (
                      <p className="mt-0.5 truncate text-xs text-black/50 dark:text-white/50">
                        {genre}
                      </p>
                    )}
                  </div>
                  <span className="flex shrink-0 items-center gap-1 text-xs text-black/40 dark:text-white/40">
                    <Clock size={12} />
                    {formatTimeDifference(new Date(), when)} {t('common.ago')}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
};

export default StudioListPage;
