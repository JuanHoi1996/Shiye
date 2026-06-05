import { useState } from 'react';
import TextareaAutosize from 'react-textarea-autosize';
import { useTranslation } from 'react-i18next';
import { useChat } from '@/lib/hooks/useChat';
import { ArrowUp } from 'lucide-react';

const StudioMessageInput = () => {
  const { t } = useTranslation();
  const { loading, sendStudioRevision, stopGeneration } = useChat();
  const [input, setInput] = useState('');

  const handleSubmit = () => {
    const text = input.trim();
    if (!text || loading) return;
    setInput('');
    void sendStudioRevision(text);
  };

  return (
    <div className="sticky bottom-0 z-30 border-t border-light-200/50 dark:border-dark-200/30 bg-light-primary/95 dark:bg-dark-primary/95 backdrop-blur-sm px-4 py-3 lg:px-6">
      <div className="mx-auto flex max-w-3xl items-end gap-2 rounded-2xl border border-light-200 dark:border-dark-200 bg-light-secondary/50 dark:bg-dark-secondary/50 p-2">
        <TextareaAutosize
          value={input}
          onChange={(e) => setInput(e.target.value)}
          minRows={1}
          maxRows={4}
          disabled={loading}
          placeholder={t('studio.revisePlaceholder')}
          className="flex-1 resize-none bg-transparent px-2 py-1.5 text-sm text-black dark:text-white outline-none placeholder:text-black/40 dark:placeholder:text-white/40"
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              handleSubmit();
            }
          }}
        />
        {loading ? (
          <button
            type="button"
            onClick={stopGeneration}
            className="rounded-xl bg-red-500/90 px-3 py-2 text-xs font-medium text-white"
          >
            {t('common.stop')}
          </button>
        ) : (
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!input.trim()}
            className="rounded-xl bg-[#24A0ED] p-2 text-white disabled:opacity-40"
          >
            <ArrowUp size={16} />
          </button>
        )}
      </div>
    </div>
  );
};

export default StudioMessageInput;
