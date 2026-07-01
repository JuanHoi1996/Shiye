import { useCallback, useEffect, useRef, useState } from 'react';
import { Check, Edit2, GripVertical, Plus, Trash2, X } from 'lucide-react';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import TextareaAutosize from 'react-textarea-autosize';
import { cn } from '@/lib/utils';

interface QuickPrompt {
  title: string;
  command: string;
  prompt: string;
}

type QuickPromptRow = QuickPrompt & { id: string };

function parsePrompts(value: string): QuickPrompt[] {
  try {
    const parsed = JSON.parse(value || '[]');
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (p): p is QuickPrompt =>
        p &&
        typeof p.title === 'string' &&
        typeof p.command === 'string' &&
        typeof p.prompt === 'string',
    );
  } catch {
    return [];
  }
}

function serializePrompts(prompts: QuickPromptRow[]): string {
  return JSON.stringify(
    prompts.map(({ title, command, prompt }) => ({ title, command, prompt })),
  );
}

function withIds(items: QuickPrompt[]): QuickPromptRow[] {
  return items.map((p) => ({ ...p, id: crypto.randomUUID() }));
}

function reorderRows<T>(list: T[], from: number, to: number): T[] {
  const next = [...list];
  const [removed] = next.splice(from, 1);
  next.splice(to, 0, removed);
  return next;
}

function remapEditingIndex(
  editingIndex: number | null,
  from: number,
  to: number,
): number | null {
  if (editingIndex === null) return null;
  if (editingIndex === from) return to;
  if (from < editingIndex && to >= editingIndex) return editingIndex - 1;
  if (from > editingIndex && to <= editingIndex) return editingIndex + 1;
  return editingIndex;
}

const QuickPromptsEditor = ({
  value,
  onChange,
}: {
  value: string;
  onChange: (newValue: string) => void;
}) => {
  const { t } = useTranslation();
  const [prompts, setPrompts] = useState<QuickPromptRow[]>(() =>
    withIds(parsePrompts(value)),
  );
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editForm, setEditEditForm] = useState<QuickPrompt>({
    title: '',
    command: '',
    prompt: '',
  });
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dropIndex, setDropIndex] = useState<number | null>(null);

  const promptsRef = useRef(prompts);
  const lastSavedRef = useRef(value);
  const titleInputRef = useRef<HTMLInputElement>(null);

  promptsRef.current = prompts;

  useEffect(() => {
    if (value === lastSavedRef.current) return;
    const incoming = parsePrompts(value);
    if (serializePrompts(promptsRef.current) === JSON.stringify(incoming)) {
      lastSavedRef.current = value;
      return;
    }
    setPrompts(withIds(incoming));
    setEditingIndex(null);
    lastSavedRef.current = value;
  }, [value]);

  useEffect(() => {
    if (editingIndex === null) return;
    titleInputRef.current?.focus();
  }, [editingIndex]);

  const saveToConfig = useCallback(
    (newPrompts: QuickPromptRow[]) => {
      const json = serializePrompts(newPrompts);
      lastSavedRef.current = json;
      onChange(json);
      localStorage.setItem('vane_custom_prompts', json);
      window.dispatchEvent(new Event('client-config-changed'));
    },
    [onChange],
  );

  const handleAdd = () => {
    const newPrompt = {
      title: t('settings.quickPrompts.newPromptTitle'),
      command: t('settings.quickPrompts.newPromptCommand'),
      prompt: t('settings.quickPrompts.newPromptBody'),
    };
    const row: QuickPromptRow = { ...newPrompt, id: crypto.randomUUID() };
    const next = [...prompts, row];
    setPrompts(next);
    saveToConfig(next);
    setEditingIndex(next.length - 1);
    setEditEditForm(newPrompt);
  };

  const handleDelete = (index: number) => {
    const next = prompts.filter((_, i) => i !== index);
    setPrompts(next);
    saveToConfig(next);
    if (editingIndex === index) setEditingIndex(null);
    else if (editingIndex !== null && editingIndex > index) {
      setEditingIndex(editingIndex - 1);
    }
  };

  const startEdit = (index: number) => {
    setEditingIndex(index);
    setEditEditForm(prompts[index]);
  };

  const cancelEdit = () => setEditingIndex(null);

  const saveEdit = () => {
    if (editingIndex === null) return;
    if (!editForm.command.startsWith('/')) {
      toast.error(t('settings.quickPrompts.commandMustStartWithSlash'));
      return;
    }
    const next = [...prompts];
    next[editingIndex] = { ...editForm, id: prompts[editingIndex].id };
    setPrompts(next);
    saveToConfig(next);
    setEditingIndex(null);
  };

  const clearDrag = () => {
    setDragIndex(null);
    setDropIndex(null);
  };

  const handleDragStart = (e: React.DragEvent, index: number) => {
    if (editingIndex !== null) {
      e.preventDefault();
      return;
    }
    setDragIndex(index);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', String(index));
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (dragIndex === null || dragIndex === index) return;
    setDropIndex(index);
  };

  const handleDrop = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    const from =
      dragIndex ?? Number.parseInt(e.dataTransfer.getData('text/plain'), 10);
    if (Number.isNaN(from) || from === index) {
      clearDrag();
      return;
    }
    const next = reorderRows(prompts, from, index);
    setPrompts(next);
    saveToConfig(next);
    setEditingIndex(remapEditingIndex(editingIndex, from, index));
    clearDrag();
  };

  const handleEditKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      cancelEdit();
      return;
    }
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      saveEdit();
    }
  };

  return (
    <div className="space-y-4">
      <p className="text-[11px] text-black/45 dark:text-white/45">
        {t('settings.quickPrompts.usageHint')}
      </p>
      <div className="flex flex-col gap-2">
        {prompts.map((p, i) => {
          const isEditing = editingIndex === i;
          const isDragging = dragIndex === i;
          const isDropTarget =
            dropIndex === i && dragIndex !== null && dragIndex !== i;

          return (
            <div
              key={p.id}
              onDragOver={(e) => handleDragOver(e, i)}
              onDrop={(e) => handleDrop(e, i)}
              onDragLeave={() => {
                if (dropIndex === i) setDropIndex(null);
              }}
              className={cn(
                'group relative rounded-xl border bg-light-secondary/50 dark:bg-dark-secondary/50 transition-all duration-200',
                isEditing
                  ? 'border-sky-500/60 shadow-sm shadow-sky-500/10 p-4'
                  : 'border-light-200 dark:border-dark-200 p-3 hover:border-sky-500/40',
                isDragging && 'opacity-45 scale-[0.99]',
                isDropTarget && 'border-sky-500 ring-2 ring-sky-500/25',
              )}
            >
              {isEditing ? (
                <div className="space-y-3" onKeyDown={handleEditKeyDown}>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label className="text-[10px] uppercase font-bold text-black/40 dark:text-white/40">
                        {t('settings.quickPrompts.title')}
                      </label>
                      <input
                        ref={titleInputRef}
                        value={editForm.title}
                        onChange={(e) =>
                          setEditEditForm({ ...editForm, title: e.target.value })
                        }
                        className="w-full bg-light-primary dark:bg-dark-primary border border-light-200 dark:border-dark-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-sky-500 transition-colors"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] uppercase font-bold text-black/40 dark:text-white/40">
                        {t('settings.quickPrompts.command')}
                      </label>
                      <input
                        value={editForm.command}
                        onChange={(e) =>
                          setEditEditForm({ ...editForm, command: e.target.value })
                        }
                        className="w-full bg-light-primary dark:bg-dark-primary border border-light-200 dark:border-dark-200 rounded-lg px-3 py-1.5 text-sm font-mono focus:outline-none focus:border-sky-500 transition-colors"
                      />
                    </div>
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] uppercase font-bold text-black/40 dark:text-white/40">
                      {t('settings.quickPrompts.prompt')}
                    </label>
                    <TextareaAutosize
                      value={editForm.prompt}
                      onChange={(e) =>
                        setEditEditForm({ ...editForm, prompt: e.target.value })
                      }
                      minRows={3}
                      className="w-full bg-light-primary dark:bg-dark-primary border border-light-200 dark:border-dark-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-sky-500 resize-none transition-colors"
                    />
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[10px] text-black/35 dark:text-white/35">
                      {t('settings.quickPrompts.saveShortcut')}
                    </span>
                    <div className="flex gap-1">
                      <button
                        type="button"
                        onClick={cancelEdit}
                        className="px-3 py-1.5 text-xs rounded-lg text-black/50 dark:text-white/50 hover:bg-light-200 dark:hover:bg-dark-200 transition-colors"
                      >
                        <X size={16} className="inline mr-1 -mt-0.5" />
                        {t('common.cancel')}
                      </button>
                      <button
                        type="button"
                        onClick={saveEdit}
                        className="px-3 py-1.5 text-xs rounded-lg bg-sky-500 text-white hover:bg-sky-600 transition-colors"
                      >
                        <Check size={16} className="inline mr-1 -mt-0.5" />
                        {t('common.save')}
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="flex items-start gap-2">
                  <button
                    type="button"
                    draggable={editingIndex === null}
                    onDragStart={(e) => handleDragStart(e, i)}
                    onDragEnd={clearDrag}
                    disabled={editingIndex !== null}
                    title={t('settings.quickPrompts.dragToReorder')}
                    aria-label={t('settings.quickPrompts.dragToReorder')}
                    className={cn(
                      'mt-0.5 shrink-0 rounded-md p-1.5 text-black/30 dark:text-white/30',
                      'hover:text-black/60 dark:hover:text-white/60 hover:bg-light-200/80 dark:hover:bg-dark-200/80',
                      'cursor-grab active:cursor-grabbing transition-colors',
                      editingIndex !== null && 'opacity-30 cursor-not-allowed',
                    )}
                  >
                    <GripVertical size={16} />
                  </button>
                  <button
                    type="button"
                    onClick={() => startEdit(i)}
                    className="flex-1 min-w-0 text-left rounded-lg -m-1 p-1 hover:bg-light-primary/60 dark:hover:bg-dark-primary/40 transition-colors"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="font-bold text-sky-500 text-sm shrink-0">
                        {p.command}
                      </span>
                      <span className="text-xs font-medium text-black/60 dark:text-white/60 truncate">
                        — {p.title}
                      </span>
                    </div>
                    <p className="text-xs text-black/40 dark:text-white/40 line-clamp-2 italic mt-0.5">
                      &ldquo;{p.prompt}&rdquo;
                    </p>
                  </button>
                  <div className="flex items-center gap-0.5 shrink-0 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                    <button
                      type="button"
                      onClick={() => startEdit(i)}
                      className="p-2 text-black/40 dark:text-white/40 hover:text-sky-500 transition-colors rounded-lg"
                    >
                      <Edit2 size={16} />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(i)}
                      className="p-2 text-black/40 dark:text-white/40 hover:text-red-500 transition-colors rounded-lg"
                      title={t('common.delete')}
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
      <button
        type="button"
        onClick={handleAdd}
        className="w-full py-3 rounded-xl border-2 border-dashed border-light-200 dark:border-dark-200 text-black/40 dark:text-white/40 hover:border-sky-500/50 hover:text-sky-500 hover:bg-sky-500/5 transition-all flex items-center justify-center gap-2 text-sm font-medium"
      >
        <Plus size={18} />
        {t('settings.quickPrompts.addQuickPrompt')}
      </button>
    </div>
  );
};

export default QuickPromptsEditor;
