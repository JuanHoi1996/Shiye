import { useEffect, useRef } from 'react';
import { cn } from '@/lib/utils';

export type QuickPromptItem = {
  title: string;
  command: string;
  prompt: string;
};

export const DEFAULT_QUICK_PROMPTS: QuickPromptItem[] = [
  {
    title: 'Summarize',
    command: '/summarize',
    prompt:
      'Please summarize our discussion so far and highlight the key takeaways.',
  },
  {
    title: 'Analyze Power Logic',
    command: '/shiye',
    prompt:
      '作为幕僚，请深入分析以下局势背后的底层逻辑、权力博弈和潜在的增量认知：',
  },
  {
    title: 'Explain Concept',
    command: '/explain',
    prompt:
      'Please explain this concept in a way that is easy to understand, using analogies if possible:',
  },
  {
    title: 'Critique',
    command: '/critic',
    prompt: '请作为严厉的批评者，指出以下观点中的逻辑漏洞和思维盲区：',
  },
];

function normalizeQuickPromptItem(item: QuickPromptItem): QuickPromptItem {
  return {
    title: item.title.trim(),
    command: item.command.trim(),
    prompt: item.prompt.trim(),
  };
}

export function loadQuickPromptsFromStorage(): QuickPromptItem[] {
  try {
    const saved = localStorage.getItem('vane_custom_prompts');
    if (saved) {
      const parsed = JSON.parse(saved) as QuickPromptItem[];
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed.map(normalizeQuickPromptItem);
      }
    }
  } catch {
    /* ignore */
  }
  return DEFAULT_QUICK_PROMPTS;
}

/** Insert prompt at selection; does not add a separator space. */
export function insertQuickPromptAtSelection(
  current: string,
  prompt: string,
  selectionStart: number,
  selectionEnd: number,
): { text: string; caret: number } {
  const trimmed = prompt.trim();
  const start = Math.max(0, Math.min(selectionStart, current.length));
  const end = Math.max(start, Math.min(selectionEnd, current.length));
  const text = current.slice(0, start) + trimmed + current.slice(end);
  return { text, caret: start + trimmed.length };
}

type QuickPromptsPopoverProps = {
  open: boolean;
  items: QuickPromptItem[];
  selectedIndex: number;
  onPick: (prompt: string) => void;
};

/**
 * Quick Prompts dropdown; parent handles keyboard and passes filtered `items`.
 */
export function QuickPromptsPopover({
  open,
  items,
  selectedIndex,
  onPick,
}: QuickPromptsPopoverProps) {
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);

  useEffect(() => {
    itemRefs.current = itemRefs.current.slice(0, items.length);
  }, [items.length]);

  useEffect(() => {
    if (!open || items.length === 0) return;
    const el = itemRefs.current[selectedIndex];
    el?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [open, selectedIndex, items.length]);

  if (!open || items.length === 0) return null;

  return (
    <div
      className="absolute bottom-full left-0 w-full mb-2 bg-light-primary dark:bg-dark-primary border border-light-200 dark:border-dark-200 rounded-xl shadow-xl z-50 overflow-hidden"
      onMouseDown={(e) => {
        // Prevent textarea blur before click; parent closes palette on blur.
        e.preventDefault();
      }}
    >
      <div className="p-2 border-b border-light-200 dark:border-dark-200 bg-light-secondary dark:bg-dark-secondary">
        <span className="text-xs font-bold text-black/50 dark:text-white/50 uppercase px-2">
          Quick Prompts
        </span>
      </div>
      <div className="max-h-60 overflow-y-auto">
        {items.map((p, i) => (
          <button
            key={`${p.command}-${i}`}
            type="button"
            ref={(el) => {
              itemRefs.current[i] = el;
            }}
            onClick={() => onPick(p.prompt.trim())}
            className={cn(
              'w-full text-left px-4 py-3 flex flex-col transition-colors duration-200',
              i === selectedIndex
                ? 'bg-light-secondary dark:bg-dark-secondary'
                : 'hover:bg-light-secondary dark:hover:bg-dark-secondary',
            )}
          >
            <span className="font-bold text-sky-500 text-sm">{p.command}</span>
            <span className="text-xs text-black/70 dark:text-white/70 truncate">
              {p.title}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
