import { ArrowRight, CloudUpload, StopCircle } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import TextareaAutosize from 'react-textarea-autosize';
import Sources from './MessageInputActions/Sources';
import Optimization from './MessageInputActions/Optimization';
import Attach from './MessageInputActions/Attach';
import { useChat } from '@/lib/hooks/useChat';
import ModelSelector from './MessageInputActions/ChatModelSelector';
import { cn } from '@/lib/utils';
import {
  QuickPromptsPopover,
  appendQuickPromptToMessage,
  filterQuickPrompts,
  loadQuickPromptsFromStorage,
  type QuickPromptItem,
} from './QuickPromptsPopover';
import { toast } from 'sonner';

const EmptyChatMessageInput = () => {
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
    if (saved) {
      try {
        const parsed = JSON.parse(saved) as QuickPromptItem[];
        if (Array.isArray(parsed) && parsed.length > 0) {
          setQuickPrompts(parsed);
          return;
        }
      } catch {
        /* fall through */
      }
    }
    const defaults = loadQuickPromptsFromStorage();
    setQuickPrompts(defaults);
    if (!saved) {
      localStorage.setItem('vane_custom_prompts', JSON.stringify(defaults));
    }
  }, []);

  useEffect(() => {
    const sync = () => setQuickPrompts(loadQuickPromptsFromStorage());
    window.addEventListener('storage', sync);
    window.addEventListener('client-config-changed', sync);
    return () => {
      window.removeEventListener('storage', sync);
      window.removeEventListener('client-config-changed', sync);
    };
  }, []);

  const showPrompts = message.startsWith('/');
  const filteredQuick = useMemo(
    () => filterQuickPrompts(message, quickPrompts),
    [message, quickPrompts],
  );
  const paletteOpen =
    (showPrompts && filteredQuick.length > 0) ||
    (forceShowPrompts && quickPrompts.length > 0);
  const paletteItems = forceShowPrompts ? quickPrompts : filteredQuick;

  const focusInputEnd = (text: string) => {
    inputRef.current?.focus();
    setTimeout(() => {
      const ta = inputRef.current;
      if (ta) ta.selectionStart = ta.selectionEnd = text.length;
    }, 10);
  };

  useEffect(() => {
    if (!showPrompts && !forceShowPrompts) {
      setSelectedQuickIndex(0);
      return;
    }
    const len = forceShowPrompts ? quickPrompts.length : filteredQuick.length;
    if (len === 0) {
      setSelectedQuickIndex(0);
      return;
    }
    setSelectedQuickIndex((i) => Math.min(Math.max(i, 0), len - 1));
  }, [showPrompts, forceShowPrompts, filteredQuick.length, quickPrompts.length, message]);

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
            : 'Upload failed';
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
    <div className="relative w-full">
      <QuickPromptsPopover
        open={paletteOpen}
        items={paletteItems}
        selectedIndex={selectedQuickIndex}
        onPick={(prompt) => {
          if (forceShowPrompts) {
            const next = appendQuickPromptToMessage(message, prompt);
            setMessage(next);
            setForceShowPrompts(false);
            focusInputEnd(next);
          } else {
            setMessage(prompt);
            inputRef.current?.focus();
          }
        }}
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
          if (!showPrompts && (e.ctrlKey || e.metaKey) && e.key === '/') {
            e.preventDefault();
            if (quickPrompts.length > 0) {
              setForceShowPrompts(true);
              setSelectedQuickIndex(0);
            }
            return;
          }
          if (paletteOpen) {
            const len = paletteItems.length;
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
              if (forceShowPrompts) {
                setForceShowPrompts(false);
              } else {
                setMessage('');
              }
              return;
            }
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              const item = paletteItems[selectedQuickIndex];
              if (item) {
                if (forceShowPrompts) {
                  const next = appendQuickPromptToMessage(message, item.prompt);
                  setMessage(next);
                  setForceShowPrompts(false);
                  focusInputEnd(next);
                } else {
                  setMessage(item.prompt);
                  inputRef.current?.focus();
                }
              }
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
            'flex flex-col bg-light-secondary dark:bg-dark-secondary px-3 pt-5 pb-3 rounded-2xl w-full border transition-all duration-200 shadow-sm shadow-light-200/10 dark:shadow-black/20 focus-within:border-light-300 dark:focus-within:border-dark-300',
            isDragging
              ? 'border-sky-500 bg-sky-500/10 dark:bg-sky-500/5'
              : 'border-light-200 dark:border-dark-200',
          )}
        >
          {isDragging && (
            <div className="absolute inset-0 flex items-center justify-center bg-sky-500/10 backdrop-blur-[1px] rounded-inherit z-10 pointer-events-none">
              <CloudUpload className="text-sky-500 animate-bounce" size={24} />
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
            minRows={2}
            className="px-2 bg-transparent placeholder:text-[15px] placeholder:text-black/50 dark:placeholder:text-white/50 text-sm text-black dark:text-white resize-none focus:outline-none w-full max-h-24 lg:max-h-36 xl:max-h-48"
            placeholder={
              isDragging ? 'Drop files to upload' : 'Ask Shiye anything...'
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
                  title="Stop"
                  className="bg-red-500 text-white hover:bg-red-600 transition duration-100 rounded-full p-2"
                >
                  <StopCircle className="bg-background" size={17} />
                </button>
              ) : (
                <button
                  type="submit"
                  disabled={message.trim().length === 0}
                  className="bg-sky-500 text-white disabled:text-black/50 dark:disabled:text-white/50 disabled:bg-[#e0e0dc] dark:disabled:bg-[#ececec21] hover:bg-opacity-85 transition duration-100 rounded-full p-2"
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
