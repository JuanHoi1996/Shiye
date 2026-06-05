import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import Markdown from 'markdown-to-jsx';
import { Download, FilePen, Trash } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useChat } from '@/lib/hooks/useChat';
import {
  countWords,
  extractLatestDraftFromMessages,
  extractStudioStatusLine,
  parseStudioSpecFromQuery,
} from '@/lib/studio/types';
import DeleteChat from '../DeleteChat';
import StudioMessageInput from './StudioMessageInput';
import Loader from '../ui/Loader';
import CodeBlock from '../MessageRenderer/CodeBlock';

const StudioChatWindow = () => {
  const { t } = useTranslation();
  const { messages, chatId, loading, notFound, isReady, hasError } = useChat();

  const draftText = useMemo(
    () => extractLatestDraftFromMessages(messages),
    [messages],
  );

  const wordCount = useMemo(() => countWords(draftText), [draftText]);

  const handleExport = () => {
    if (!chatId) return;
    window.open(`/api/studio/${chatId}/export`, '_blank');
  };

  if (hasError) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-sm text-black/70 dark:text-white/70">
          {t('chat.serverError')}
        </p>
      </div>
    );
  }

  if (!isReady) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader />
      </div>
    );
  }

  if (notFound) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-sm text-black/70 dark:text-white/70">
          {t('chat.notFound')}
        </p>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col">
      <div className="sticky top-0 z-40 border-b border-light-200/50 dark:border-dark-200/30 bg-light-primary/95 dark:bg-dark-primary/95 backdrop-blur-sm">
        <div className="flex items-center justify-between px-4 py-3 lg:px-6">
          <Link
            to="/studio"
            className="flex items-center gap-2 text-sm font-medium text-black/70 dark:text-white/70 hover:text-[#24A0ED]"
          >
            <FilePen size={16} />
            {t('sidebar.studio')}
          </Link>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={handleExport}
              disabled={!draftText}
              className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium text-[#24A0ED] hover:bg-light-secondary dark:hover:bg-dark-secondary disabled:opacity-40"
            >
              <Download size={14} />
              {t('studio.export')}
            </button>
            {chatId && (
              <DeleteChat
                redirect
                chatId={chatId}
                chats={[]}
                setChats={() => {}}
              />
            )}
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4 lg:px-6">
        <div className="mx-auto max-w-3xl">
          <div className="rounded-2xl border border-light-200 dark:border-dark-200 bg-light-secondary/30 dark:bg-dark-secondary/30 p-4 lg:p-6">
            <div className="mb-3 flex items-center justify-between gap-2">
              <h2 className="text-sm font-medium text-black/80 dark:text-white/90">
                {t('studio.draftCard.title')}
              </h2>
              {draftText && (
                <span className="text-xs text-black/50 dark:text-white/50">
                  {t('studio.draftCard.wordCount', { count: wordCount })}
                </span>
              )}
            </div>
            {draftText ? (
              <div className="prose prose-sm dark:prose-invert max-w-none text-black/90 dark:text-white/90">
                <Markdown
                  options={{
                    overrides: {
                      code: CodeBlock,
                    },
                  }}
                >
                  {draftText}
                </Markdown>
              </div>
            ) : loading ? (
              <div className="flex items-center gap-2 py-8 text-sm text-black/50 dark:text-white/50">
                <Loader />
                <span>{t('studio.draftCard.generating')}</span>
              </div>
            ) : (
              <p className="py-4 text-sm text-black/50 dark:text-white/50">
                {t('studio.draftCard.empty')}
              </p>
            )}
          </div>

          {messages.length > 0 && (
            <div className="mt-8 space-y-4">
              <h3 className="text-xs font-medium uppercase tracking-wide text-black/40 dark:text-white/40">
                {t('studio.history.title')}
              </h3>
              {messages.map((msg) => {
                const { displayQuery } = parseStudioSpecFromQuery(msg.query);
                const statusLine = extractStudioStatusLine(msg.responseBlocks);
                const isAnswering = msg.status === 'answering';

                return (
                  <div key={msg.messageId} className="space-y-2">
                    <div className="rounded-xl bg-[#24A0ED]/10 px-3 py-2 text-sm text-black/80 dark:text-white/80">
                      {displayQuery}
                    </div>
                    {(statusLine || isAnswering) && (
                      <p className="px-1 text-xs text-black/50 dark:text-white/50">
                        {statusLine || t('studio.history.revising')}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <StudioMessageInput />
    </div>
  );
};

export default StudioChatWindow;
