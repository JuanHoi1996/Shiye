import { ArrowRight, CloudUpload, StopCircle } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import TextareaAutosize from 'react-textarea-autosize';
import Sources from './MessageInputActions/Sources';
import Optimization from './MessageInputActions/Optimization';
import Attach from './MessageInputActions/Attach';
import { useChat } from '@/lib/hooks/useChat';
import ModelSelector from './MessageInputActions/ChatModelSelector';
import { cn } from '@/lib/utils';
import {
  QuickPromptsPopover,
  insertQuickPromptAtSelection,
  loadQuickPromptsFromStorage,
  type QuickPromptItem,
} from './QuickPromptsPopover';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';

const EmptyChatMessageInput = () => {
  const { t } = useTranslation();
  const { sendMessage, stopGeneration, loading, files, setFiles, setFileIds, fileIds } =
    useChat();

  const [message, setMessage] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  const [quickPrompts, setQuickPrompts] = useState<QuickPromptItem[]>(() =>
    loadQuickPromptsFromStorage(),
  );
  const [selectedQuickIndex, setSelectedQuickIndex] = useState(0);
  const [forceShowPrompts, setForceShowPrompts] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    const saved = localStorage.getItem('vane_custom_prompts');
    const prompts = loadQuickPromptsFromStorage();
    if (!saved) {
      localStorage.setItem('vane_custom_prompts', JSON.stringify(prompts));
    }
  }, []);

  useEffect(() => {
    const sync = () => {
      const nextPrompts = loadQuickPromptsFromStorage();
      setQuickPrompts(nextPrompts);
      setSelectedQuickIndex((index) =>
        Math.min(index, Math.max(nextPrompts.length - 1, 0)),
      );
    };
    window.addEventListener('storage', sync);
    window.addEventListener('client-config-changed', sync);
    return () => {
      window.removeEventListener('storage', sync);
      window.removeEventListener('client-config-changed', sync);
    };
  }, []);

  const paletteOpen = forceShowPrompts && quickPrompts.length > 0;

  const applyQuickPromptPick = useCallback(
    (prompt: string) => {
      const ta = inputRef.current;
      const start = ta?.selectionStart ?? message.length;
      const end = ta?.selectionEnd ?? message.length;
      const { text, caret } = insertQuickPromptAtSelection(
        message,
        prompt,
        start,
        end,
      );
      setMessage(text);
      setForceShowPrompts(false);
      inputRef.current?.focus();
      setTimeout(() => {
        const el = inputRef.current;
        if (el) el.selectionStart = el.selectionEnd = caret;
      }, 10);
    },
    [message],
  );

  const handleUpload = async (droppedFiles: FileList | File[]) => {
    const data = new FormData();
    for (let i = 0; i < droppedFiles.length; i++) {
      data.append('files', droppedFiles[i]);
    }

    const embeddingModelProvider = localStorage.getItem('embeddingModelProviderId');
    const embeddingModel = localStorage.getItem('embeddingModelKey');
    data.append('embedding_model_provider_id', embeddingModelProvider!);
    data.append('embedding_model_key', embeddingModel!);

    const res = await fetch(`/api/uploads`, {
      method: 'POST',
      body: data,
    });

    const resData = await res.json();
    if (!res.ok) {
      const detail =
        typeof resData?.detail === 'string'
          ? resData.detail
          : typeof resData?.message === 'string'
            ? resData.message
            : t('common.uploadFailed');
      toast.error(detail);
      return;
    }
    setFiles([...files, ...resData.files]);
    setFileIds([...fileIds, ...resData.files.map((file: { fileId: string }) => file.fileId)]);
  };

  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const onDragLeave = () => {
    setIsDragging(false);
  };

  const onDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      await handleUpload(e.dataTransfer.files);
    }
  };

  const onPaste = async (e: React.ClipboardEvent) => {
    const items = e.clipboardData.items;
    const filesToUpload: File[] = [];
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.indexOf('image') !== -1 || items[i].kind === 'file') {
        const file = items[i].getAsFile();
        if (file) filesToUpload.push(file);
      }
    }
    if (filesToUpload.length > 0) {
      e.preventDefault();
      await handleUpload(filesToUpload);
    }
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const activeElement = document.activeElement;

      const isInputFocused =
        activeElement?.tagName === 'INPUT' ||
        activeElement?.tagName === 'TEXTAREA' ||
        activeElement?.hasAttribute('contenteditable');

      if (e.key === '/' && !isInputFocused) {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown);

    inputRef.current?.focus();

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  return (
    <div className="kami-composer relative w-full">
      <QuickPromptsPopover
        open={paletteOpen}
        items={quickPrompts}
        selectedIndex={selectedQuickIndex}
        onPick={applyQuickPromptPick}
      />
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (loading) {
            stopGeneration();
            return;
          }
          sendMessage(message);
          setMessage('');
        }}
        onKeyDown={(e) => {
          if ((e.ctrlKey || e.metaKey) && e.key === '/') {
            e.preventDefault();
            if (quickPrompts.length > 0) {
              setForceShowPrompts(true);
              setSelectedQuickIndex(0);
            }
            return;
          }
          if (paletteOpen) {
            const len = quickPrompts.length;
            if (e.key === 'ArrowDown') {
              e.preventDefault();
              setSelectedQuickIndex((i) => (i + 1) % len);
              return;
            }
            if (e.key === 'ArrowUp') {
              e.preventDefault();
              setSelectedQuickIndex((i) => (i - 1 + len) % len);
              return;
            }
            if (e.key === 'Escape') {
              e.preventDefault();
              setForceShowPrompts(false);
              return;
            }
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              const item = quickPrompts[selectedQuickIndex];
              if (item) applyQuickPromptPick(item.prompt);
              return;
            }
          }
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            if (loading) {
              stopGeneration();
            } else {
              sendMessage(message);
              setMessage('');
            }
          }
        }}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        className="w-full relative"
      >
        <div
          className={cn(
            'kami-composer-surface flex w-full flex-col border px-3 pb-3 pt-5 transition-all duration-200',
            isDragging
              ? 'kami-composer-surface--dragging'
              : '',
          )}
        >
          {isDragging && (
            <div className="kami-composer-drop absolute inset-0 z-10 flex items-center justify-center rounded-[inherit] pointer-events-none">
              <CloudUpload
                className="animate-bounce text-shiye-ink dark:text-[#84aad6]"
                size={24}
              />
            </div>
          )}
          <TextareaAutosize
            ref={inputRef}
            value={message}
            onChange={(e) => {
              setMessage(e.target.value);
              if (forceShowPrompts) setForceShowPrompts(false);
            }}
            onBlur={() => {
              if (forceShowPrompts) setForceShowPrompts(false);
            }}
            onPaste={onPaste}
            minRows={3}
            className="kami-composer-textarea w-full max-h-32 resize-none bg-transparent px-2 text-base text-black outline-none placeholder:text-[15px] dark:text-white lg:max-h-40 xl:max-h-52"
            placeholder={
              isDragging
                ? t('messageInput.dropFiles')
                : t('messageInput.askAnything')
            }
          />
          <div className="flex flex-row items-center justify-between mt-4">
            <Optimization />
            <div className="flex flex-row items-center space-x-2">
              <div className="flex flex-row items-center space-x-1">
                <Sources />
                <ModelSelector />
                <Attach />
              </div>
              {loading ? (
                <button
                  type="button"
                  onClick={stopGeneration}
                  title={t('common.stop')}
                  className="rounded-full bg-red-500 p-2 text-white transition duration-100 hover:bg-red-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500/40 focus-visible:ring-offset-2"
                >
                  <StopCircle className="bg-background" size={17} />
                </button>
              ) : (
                <button
                  type="submit"
                  disabled={message.trim().length === 0}
                  aria-label={t('messageInput.send')}
                  className="kami-composer-submit rounded-full p-2 transition duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-shiye-ink/30 focus-visible:ring-offset-2 disabled:cursor-not-allowed"
                >
                  <ArrowRight className="bg-background" size={17} />
                </button>
              )}
            </div>
          </div>
        </div>
      </form>
    </div>
  );
};

export default EmptyChatMessageInput;
