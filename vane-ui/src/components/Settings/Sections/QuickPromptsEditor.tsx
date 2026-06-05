import { useState, useEffect } from 'react';
import { Plus, Trash2, Edit2, Check, X } from 'lucide-react';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';

interface QuickPrompt {
  title: string;
  command: string;
  prompt: string;
}

const QuickPromptsEditor = ({
  value,
  onChange,
}: {
  value: string;
  onChange: (newValue: string) => void;
}) => {
  const { t } = useTranslation();
  const [prompts, setPrompts] = useState<QuickPrompt[]>([]);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editForm, setEditEditForm] = useState<QuickPrompt>({ title: '', command: '', prompt: '' });

  useEffect(() => {
    try {
      const parsed = JSON.parse(value || '[]');
      if (Array.isArray(parsed)) {
        setPrompts(parsed);
      }
    } catch (e) {
      console.error('Failed to parse quick prompts:', e);
    }
  }, [value]);

  const saveToConfig = (newPrompts: QuickPrompt[]) => {
    const json = JSON.stringify(newPrompts);
    onChange(json);
    localStorage.setItem('vane_custom_prompts', json);
    window.dispatchEvent(new Event('client-config-changed'));
  };

  const handleAdd = () => {
    const newPrompt = {
      title: t('settings.quickPrompts.newPromptTitle'),
      command: t('settings.quickPrompts.newPromptCommand'),
      prompt: t('settings.quickPrompts.newPromptBody'),
    };
    const next = [...prompts, newPrompt];
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
  };

  const startEdit = (index: number) => {
    setEditingIndex(index);
    setEditEditForm(prompts[index]);
  };

  const saveEdit = () => {
    if (editingIndex === null) return;
    if (!editForm.command.startsWith('/')) {
      toast.error(t('settings.quickPrompts.commandMustStartWithSlash'));
      return;
    }
    const next = [...prompts];
    next[editingIndex] = editForm;
    setPrompts(next);
    saveToConfig(next);
    setEditingIndex(null);
  };

  return (
    <div className="space-y-4">
      <p className="text-[11px] text-black/45 dark:text-white/45">
        {t('settings.quickPrompts.usageHint')}
      </p>
      <div className="flex flex-col gap-3">
        {prompts.map((p, i) => (
          <div
            key={i}
            className="group relative rounded-xl border border-light-200 dark:border-dark-200 bg-light-secondary/50 dark:bg-dark-secondary/50 p-4 transition-all hover:border-sky-500/50"
          >
            {editingIndex === i ? (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-[10px] uppercase font-bold text-black/40 dark:text-white/40">{t('settings.quickPrompts.title')}</label>
                    <input
                      value={editForm.title}
                      onChange={(e) => setEditEditForm({ ...editForm, title: e.target.value })}
                      className="w-full bg-light-primary dark:bg-dark-primary border border-light-200 dark:border-dark-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-sky-500"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] uppercase font-bold text-black/40 dark:text-white/40">{t('settings.quickPrompts.command')}</label>
                    <input
                      value={editForm.command}
                      onChange={(e) => setEditEditForm({ ...editForm, command: e.target.value })}
                      className="w-full bg-light-primary dark:bg-dark-primary border border-light-200 dark:border-dark-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-sky-500"
                    />
                  </div>
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] uppercase font-bold text-black/40 dark:text-white/40">{t('settings.quickPrompts.prompt')}</label>
                  <textarea
                    value={editForm.prompt}
                    onChange={(e) => setEditEditForm({ ...editForm, prompt: e.target.value })}
                    rows={3}
                    className="w-full bg-light-primary dark:bg-dark-primary border border-light-200 dark:border-dark-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-sky-500 resize-none"
                  />
                </div>
                <div className="flex justify-end gap-2">
                  <button
                    onClick={() => setEditingIndex(null)}
                    className="p-2 text-black/40 dark:text-white/40 hover:text-red-500 transition-colors"
                  >
                    <X size={18} />
                  </button>
                  <button
                    onClick={saveEdit}
                    className="p-2 text-sky-500 hover:text-sky-600 transition-colors"
                  >
                    <Check size={18} />
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex items-start justify-between">
                <div className="flex flex-col gap-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-sky-500 text-sm">{p.command}</span>
                    <span className="text-xs font-medium text-black/60 dark:text-white/60">— {p.title}</span>
                  </div>
                  <p className="text-xs text-black/40 dark:text-white/40 line-clamp-2 italic">
                    "{p.prompt}"
                  </p>
                </div>
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={() => startEdit(i)}
                    className="p-2 text-black/40 dark:text-white/40 hover:text-sky-500 transition-colors"
                  >
                    <Edit2 size={16} />
                  </button>
                  <button
                    onClick={() => handleDelete(i)}
                    className="p-2 text-black/40 dark:text-white/40 hover:text-red-500 transition-colors"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
      <button
        onClick={handleAdd}
        className="w-full py-3 rounded-xl border-2 border-dashed border-light-200 dark:border-dark-200 text-black/40 dark:text-white/40 hover:border-sky-500/50 hover:text-sky-500 transition-all flex items-center justify-center gap-2 text-sm font-medium"
      >
        <Plus size={18} />
        {t('settings.quickPrompts.addQuickPrompt')}
      </button>
    </div>
  );
};

export default QuickPromptsEditor;
