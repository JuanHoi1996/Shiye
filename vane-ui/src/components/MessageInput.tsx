import { cn } from '@/lib/utils';
import { ArrowUp, CloudUpload, StopCircle } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import TextareaAutosize from 'react-textarea-autosize';
import AttachSmall from './MessageInputActions/AttachSmall';
import Sources from './MessageInputActions/Sources';
import Optimization from './MessageInputActions/Optimization';
import ModelSelector from './MessageInputActions/ChatModelSelector';
import { useChat } from '@/lib/hooks/useChat';
import { toast } from 'sonner';

const MessageInput = () => {
  const { loading, sendMessage, stopGeneration, files, setFiles, setFileIds, fileIds } =
    useChat();

  const [copilotEnabled, setCopilotEnabled] = useState(false);
  const [message, setMessage] = useState('');
  const [textareaRows, setTextareaRows] = useState(1);
  const [mode, setMode] = useState<'multi' | 'single'>('single');
  const [isDragging, setIsDragging] = useState(false);
  const [showPrompts, setShowPrompts] = useState(false);
  const [customPrompts, setCustomPrompts] = useState<any[]>([]);

  useEffect(() => {
    const saved = localStorage.getItem('vane_custom_prompts');
    if (saved) {
      setCustomPrompts(JSON.parse(saved));
    } else {
      const defaultPrompts = [
        { title: 'Summarize', command: '/summarize', prompt: 'Please summarize our discussion so far and highlight the key takeaways.' },
        { title: 'Analyze Power Logic', command: '/shiye', prompt: '作为幕僚，请深入分析以下局势背后的底层逻辑、权力博弈和潜在的增量认知：' },
        { title: 'Explain Concept', command: '/explain', prompt: 'Please explain this concept in a way that is easy to understand, using analogies if possible:' },
        { title: 'Critique', command: '/critic', prompt: '请作为严厉的批评者，指出以下观点中的逻辑漏洞和思维盲区：' },
      ];
      setCustomPrompts(defaultPrompts);
      localStorage.setItem('vane_custom_prompts', JSON.stringify(defaultPrompts));
    }
  }, []);

  const PROMPTS = customPrompts;

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
    setFileIds([...fileIds, ...resData.files.map((file: any) => file.fileId)]);
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
    if (textareaRows >= 2 && message && mode === 'single') {
      setMode('multi');
    } else if (!message && mode === 'multi') {
      setMode('single');
    }
  }, [textareaRows, mode, message]);

  const inputRef = useRef<HTMLTextAreaElement | null>(null);

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

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  useEffect(() => {
    if (message.startsWith('/')) {
      setShowPrompts(true);
    } else {
      setShowPrompts(false);
    }
  }, [message]);

  return (
    <div className="relative w-full">
      {showPrompts && (
        <div className="absolute bottom-full left-0 w-full mb-2 bg-light-primary dark:bg-dark-primary border border-light-200 dark:border-dark-200 rounded-xl shadow-xl z-50 overflow-hidden">
          <div className="p-2 border-b border-light-200 dark:border-dark-200 bg-light-secondary dark:bg-dark-secondary">
            <span className="text-xs font-bold text-black/50 dark:text-white/50 uppercase px-2">Quick Prompts</span>
          </div>
          <div className="max-h-60 overflow-y-auto">
            {PROMPTS.filter(p => p.command.startsWith(message.toLowerCase()) || message === '/').map((p, i) => (
              <button
                key={i}
                onClick={() => {
                  setMessage(p.prompt);
                  setShowPrompts(false);
                  inputRef.current?.focus();
                }}
                className="w-full text-left px-4 py-3 hover:bg-light-secondary dark:hover:bg-dark-secondary flex flex-col transition-colors duration-200"
              >
                <span className="font-bold text-sky-500 text-sm">{p.command}</span>
                <span className="text-xs text-black/70 dark:text-white/70 truncate">{p.title}</span>
              </button>
            ))}
          </div>
        </div>
      )}
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
      className={cn(
        'relative bg-light-secondary dark:bg-dark-secondary p-4 flex items-center overflow-visible border transition-all duration-200 shadow-sm shadow-light-200/10 dark:shadow-black/20 focus-within:border-light-300 dark:focus-within:border-dark-300',
        mode === 'multi' ? 'flex-col rounded-2xl' : 'flex-row rounded-full',
        isDragging 
          ? 'border-sky-500 bg-sky-500/10 dark:bg-sky-500/5' 
          : 'border-light-200 dark:border-dark-200'
      )}
    >
      {isDragging && (
        <div className="absolute inset-0 flex items-center justify-center bg-sky-500/10 backdrop-blur-[1px] rounded-inherit z-10 pointer-events-none">
          <CloudUpload className="text-sky-500 animate-bounce" size={24} />
        </div>
      )}
      {mode === 'single' && (
        <div className="flex flex-row items-center space-x-1 flex-shrink-0">
          <Optimization />
          <Sources />
          <AttachSmall />
        </div>
      )}
      <TextareaAutosize
        ref={inputRef}
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        onHeightChange={(height, props) => {
          setTextareaRows(Math.ceil(height / props.rowHeight));
        }}
        onPaste={onPaste}
        className="transition bg-transparent dark:placeholder:text-white/50 placeholder:text-sm text-sm dark:text-white resize-none focus:outline-none w-full px-2 max-h-24 lg:max-h-36 xl:max-h-48 flex-grow flex-shrink"
        placeholder={isDragging ? "Drop files to upload" : "Ask a follow-up"}
      />
      {mode === 'single' && (
        <div className="flex flex-row items-center space-x-1 flex-shrink-0">
          <ModelSelector />
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
              className="bg-[#24A0ED] text-white disabled:text-black/50 dark:disabled:text-white/50 hover:bg-opacity-85 transition duration-100 disabled:bg-[#e0e0dc79] dark:disabled:bg-[#ececec21] rounded-full p-2"
            >
              <ArrowUp className="bg-background" size={17} />
            </button>
          )}
        </div>
      )}
      {mode === 'multi' && (
        <div className="flex flex-row items-center justify-between w-full pt-2">
          <div className="flex flex-row items-center space-x-2">
            <Optimization />
            <Sources />
            <ModelSelector />
            <AttachSmall />
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
              className="bg-[#24A0ED] text-white disabled:text-black/50 dark:disabled:text-white/50 hover:bg-opacity-85 transition duration-100 disabled:bg-[#e0e0dc79] dark:disabled:bg-[#ececec21] rounded-full p-2"
            >
              <ArrowUp className="bg-background" size={17} />
            </button>
          )}
        </div>
      )}
      </form>
    </div>
  );
};

export default MessageInput;
