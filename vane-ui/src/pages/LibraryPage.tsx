import DeleteChat from '@/components/DeleteChat';
import { cn, formatTimeDifference } from '@/lib/utils';
import {
  BookOpenText,
  ClockIcon,
  FileText,
  Globe2Icon,
  FolderPlus,
  Folder,
  MoreHorizontal,
  FolderOpen,
  Search as SearchIcon,
  Pencil,
  Trash2,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { useEffect, useMemo, useState } from 'react';
import { Menu, MenuButton, MenuItem, MenuItems, Transition } from '@headlessui/react';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';

export interface Chat {
  id: string;
  title: string;
  createdAt: string;
  /** ISO time of last send / completion / error; falls back to createdAt if absent. */
  lastMessageAt?: string;
  sources: string[];
  files: { fileId: string; name: string }[];
  folderId?: string;
}

export interface FolderType {
  id: string;
  name: string;
  createdAt: string;
}

const Page = () => {
  const { t } = useTranslation();
  const [chats, setChats] = useState<Chat[]>([]);
  const [folders, setFolders] = useState<FolderType[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [isCreatingFolder, setIsCreatingFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [editingFolderId, setEditingFolderId] = useState<string | null>(null);
  const [renameFolderName, setRenameFolderName] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  const fetchChats = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/chats`, { cache: 'no-store' });
      const data = await res.json();
      setChats(data.chats || []);
    } catch (err) {
      console.error('Fetch chats error:', err);
      setChats([]);
    } finally {
      setLoading(false);
    }
  };

  const fetchFolders = async () => {
    try {
      const res = await fetch(`/api/folders`);
      const data = await res.json();
      setFolders(data.folders || []);
    } catch (err) {
      console.error('Fetch folders error:', err);
      setFolders([]);
    }
  };

  useEffect(() => {
    void fetchChats();
    void fetchFolders();
  }, []);

  const filteredChats = useMemo(() => {
    let result = chats || [];

    if (selectedFolderId) {
      result = result.filter((c) => c?.folderId === selectedFolderId);
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter((c) => c?.title?.toLowerCase().includes(q));
    }

    return result;
  }, [chats, selectedFolderId, searchQuery]);

  const createFolder = async () => {
    if (!newFolderName.trim()) return;
    const res = await fetch('/api/folders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newFolderName }),
    });
    if (res.ok) {
      toast.success(t('library.folderCreated'));
      setNewFolderName('');
      setIsCreatingFolder(false);
      fetchFolders();
    }
  };

  const moveChatToFolder = async (chatId: string, folderId: string | null) => {
    const res = await fetch(`/api/chats/${chatId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ folderId }),
    });
    if (res.ok) {
      toast.success(t('library.chatMoved'));
      await fetchChats();
    }
  };

  const saveRenameFolder = async () => {
    if (!editingFolderId || !renameFolderName.trim()) return;
    const res = await fetch(`/api/folders/${editingFolderId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: renameFolderName.trim() }),
    });
    if (res.ok) {
      toast.success(t('library.spaceRenamed'));
      setEditingFolderId(null);
      fetchFolders();
    } else {
      toast.error(t('library.renameFailed'));
    }
  };

  const deleteFolder = async (folderId: string) => {
    if (
      !window.confirm(t('library.deleteSpaceConfirm'))
    ) {
      return;
    }
    const res = await fetch(`/api/folders/${folderId}`, { method: 'DELETE' });
    if (res.ok) {
      toast.success(t('library.spaceDeleted'));
      if (selectedFolderId === folderId) setSelectedFolderId(null);
      fetchFolders();
      await fetchChats();
    } else {
      toast.error(t('library.deleteFailed'));
    }
  };

  return (
    <div className="flex h-full w-full flex-col lg:flex-row">
      <div className="flex w-full shrink-0 flex-col space-y-4 border-b border-light-200/20 p-6 dark:border-dark-200/20 lg:w-64 lg:border-b-0 lg:border-r">
        <h2 className="flex items-center gap-2 text-xl font-medium">
          <FolderOpen size={20} />
          {t('library.spaces')}
        </h2>

        <div className="relative mb-2">
          <SearchIcon
            className="absolute left-3 top-1/2 -translate-y-1/2 text-black/40 dark:text-white/40"
            size={14}
          />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={t('library.searchPlaceholder')}
            className="w-full rounded-xl border border-light-200 bg-light-secondary py-2 pl-9 pr-3 text-sm transition-colors focus:border-sky-500 focus:outline-none dark:border-dark-200 dark:bg-dark-secondary"
          />
        </div>

        <div className="flex flex-col space-y-1">
          <button
            type="button"
            onClick={() => setSelectedFolderId(null)}
            className={cn(
              'flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition duration-200',
              selectedFolderId === null
                ? 'bg-light-secondary font-medium dark:bg-dark-secondary'
                : 'hover:bg-light-secondary/50 dark:hover:bg-dark-secondary/50',
            )}
          >
            <BookOpenText size={16} />
            {t('library.allChats')}
          </button>
          {folders.map((f) =>
            editingFolderId === f.id ? (
              <div key={f.id} className="space-y-2 px-1 py-1">
                <input
                  autoFocus
                  value={renameFolderName}
                  onChange={(e) => setRenameFolderName(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && saveRenameFolder()}
                  className="w-full rounded-lg border border-light-200 bg-light-secondary p-2 text-sm focus:outline-none dark:border-dark-200 dark:bg-dark-secondary"
                />
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={saveRenameFolder}
                    className="rounded bg-sky-500 px-2 py-1 text-[10px] text-white hover:bg-sky-600"
                  >
                    {t('common.save')}
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditingFolderId(null)}
                    className="rounded bg-gray-500 px-2 py-1 text-[10px] text-white hover:bg-gray-600"
                  >
                    {t('common.cancel')}
                  </button>
                </div>
              </div>
            ) : (
              <div
                key={f.id}
                className="group/frow flex items-center gap-0.5 rounded-lg hover:bg-light-secondary/50 dark:hover:bg-dark-secondary/50"
              >
                <button
                  type="button"
                  onClick={() => setSelectedFolderId(f.id)}
                  className={cn(
                    'flex min-w-0 flex-1 items-center gap-3 rounded-lg px-3 py-2 text-left text-sm transition duration-200',
                    selectedFolderId === f.id
                      ? 'bg-light-secondary font-medium text-[#24A0ED] dark:bg-dark-secondary'
                      : '',
                  )}
                >
                  <Folder size={16} className="shrink-0" />
                  <span className="truncate">{f.name}</span>
                </button>
                <Menu as="div" className="relative shrink-0">
                  <MenuButton
                    type="button"
                    className="rounded-lg p-2 text-black/40 opacity-0 hover:text-black focus:opacity-100 group-hover/frow:opacity-100 dark:text-white/40 dark:hover:text-white"
                    aria-label={t('library.spaceOptions')}
                  >
                    <MoreHorizontal size={16} />
                  </MenuButton>
                  <Transition
                    enter="transition ease-out duration-100"
                    enterFrom="transform scale-95 opacity-0"
                    enterTo="transform scale-100 opacity-100"
                    leave="transition ease-in duration-75"
                    leaveFrom="transform scale-100 opacity-100"
                    leaveTo="transform scale-95 opacity-0"
                  >
                    <MenuItems className="absolute right-0 z-50 mt-1 w-40 origin-top-right rounded-xl border border-light-200 bg-light-secondary shadow-lg focus:outline-none dark:border-dark-200 dark:bg-dark-secondary">
                      <div className="p-1">
                        <MenuItem>
                          {({ active }) => (
                            <button
                              type="button"
                              onClick={() => {
                                setEditingFolderId(f.id);
                                setRenameFolderName(f.name);
                              }}
                              className={cn(
                                'flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm',
                                active ? 'bg-light-200 dark:bg-dark-200' : '',
                              )}
                            >
                              <Pencil size={14} />
                              {t('library.rename')}
                            </button>
                          )}
                        </MenuItem>
                        <MenuItem>
                          {({ active }) => (
                            <button
                              type="button"
                              onClick={() => deleteFolder(f.id)}
                              className={cn(
                                'flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-red-600 dark:text-red-400',
                                active ? 'bg-light-200 dark:bg-dark-200' : '',
                              )}
                            >
                              <Trash2 size={14} />
                              {t('common.delete')}
                            </button>
                          )}
                        </MenuItem>
                      </div>
                    </MenuItems>
                  </Transition>
                </Menu>
              </div>
            ),
          )}
        </div>

        {isCreatingFolder ? (
          <div className="space-y-2 pt-2">
            <input
              autoFocus
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && createFolder()}
              className="w-full rounded-lg border border-light-200 bg-light-secondary p-2 text-sm focus:outline-none dark:border-dark-200 dark:bg-dark-secondary"
              placeholder={t('library.folderNamePlaceholder')}
            />
            <div className="flex gap-2">
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  createFolder();
                }}
                className="rounded bg-sky-500 px-2 py-1 text-[10px] text-white transition-colors hover:bg-sky-600"
              >
                {t('common.save')}
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  setIsCreatingFolder(false);
                }}
                className="rounded bg-gray-500 px-2 py-1 text-[10px] text-white transition-colors hover:bg-gray-600"
              >
                {t('common.cancel')}
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setIsCreatingFolder(true)}
            className="flex items-center gap-2 px-3 text-xs text-black/50 transition duration-200 hover:text-sky-400 dark:text-white/50"
          >
            <FolderPlus size={14} />
            {t('library.newFolder')}
          </button>
        )}
      </div>

      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto">
        <div className="shrink-0 border-b border-light-200/20 px-6 pb-6 pt-10 dark:border-dark-200/20">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
            <div className="flex items-center">
              <BookOpenText size={45} className="mb-2.5" />
              <div className="ml-4 flex flex-col">
                <h1
                  className="pb-0 text-5xl font-normal"
                  style={{ fontFamily: 'PP Editorial, serif' }}
                >
                  {selectedFolderId
                    ? folders.find((f) => f.id === selectedFolderId)?.name
                    : t('library.title')}
                </h1>
                <div className="text-sm text-black/60 dark:text-white/60">
                  {selectedFolderId
                    ? t('library.spaceSubtitle')
                    : t('library.subtitle')}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 px-2 text-xs text-black/60 dark:text-white/60">
              <span className="inline-flex items-center gap-1 rounded-full border border-black/20 px-2 py-0.5 dark:border-white/20">
                <BookOpenText size={14} />
                {loading
                  ? t('common.loading')
                  : t('library.chatCount', { count: filteredChats.length })}
              </span>
            </div>
          </div>
        </div>

        {loading ? (
          <div className="flex min-h-[60vh] flex-row items-center justify-center">
            <svg
              aria-hidden="true"
              className="h-8 w-8 animate-spin fill-light-secondary text-light-200 dark:fill-[#ffffff3b] dark:text-[#202020]"
              viewBox="0 0 100 101"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                d="M100 50.5908C100.003 78.2051 78.1951 100.003 50.5908 100C22.9765 99.9972 0.997224 78.018 1 50.4037C1.00281 22.7993 22.8108 0.997224 50.4251 1C78.0395 1.00281 100.018 22.8108 100 50.4251ZM9.08164 50.594C9.06312 73.3997 27.7909 92.1272 50.5966 92.1457C73.4023 92.1642 92.1298 73.4365 92.1483 50.6308C92.1669 27.8251 73.4392 9.0973 50.6335 9.07878C27.8278 9.06026 9.10003 27.787 9.08164 50.594Z"
                fill="currentColor"
              />
              <path
                d="M93.9676 39.0409C96.393 38.4037 97.8624 35.9116 96.9801 33.5533C95.1945 28.8227 92.871 24.3692 90.0681 20.348C85.6237 14.1775 79.4473 9.36872 72.0454 6.45794C64.6435 3.54717 56.3134 2.65431 48.3133 3.89319C45.869 4.27179 44.3768 6.77534 45.014 9.20079C45.6512 11.6262 48.1343 13.0956 50.5786 12.717C56.5073 11.8281 62.5542 12.5399 68.0406 14.7911C73.527 17.0422 78.2187 20.7487 81.5841 25.4923C83.7976 28.5886 85.4467 32.059 86.4416 35.7474C87.1273 38.1189 89.5423 39.6781 91.9676 39.0409Z"
                fill="currentFill"
              />
            </svg>
          </div>
        ) : filteredChats.length === 0 ? (
          <div className="flex min-h-[70vh] flex-col items-center justify-center px-2 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-light-200 bg-light-secondary dark:border-dark-200 dark:bg-dark-secondary">
              <BookOpenText className="text-black/70 dark:text-white/70" />
            </div>
            <p className="mt-2 text-sm text-black/70 dark:text-white/70">
              {t('library.empty')}
            </p>
          </div>
        ) : (
          <div className="px-6 pb-28 pt-6">
            <div className="rounded-2xl border border-light-200 bg-light-primary dark:border-dark-200 dark:bg-dark-primary">
              {filteredChats.map((chat, index) => {
                const formatSource = (s: string) =>
                  t(`library.sources.${s}`, {
                    defaultValue: s.charAt(0).toUpperCase() + s.slice(1),
                  });
                const sourcesLabel =
                  chat.sources.length === 0
                    ? null
                    : chat.sources.length <= 2
                      ? chat.sources.map(formatSource).join(', ')
                      : `${chat.sources
                          .slice(0, 2)
                          .map(formatSource)
                          .join(', ')} + ${chat.sources.length - 2}`;

                return (
                  <div
                    key={chat.id}
                    className={cn(
                      'group flex flex-col gap-2 p-6 transition-colors duration-200 hover:bg-light-secondary dark:hover:bg-dark-secondary',
                      index === 0 && 'rounded-t-2xl',
                      index === filteredChats.length - 1
                        ? 'rounded-b-2xl'
                        : 'border-b border-light-200 dark:border-dark-200',
                    )}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <Link
                        to={`/c/${chat.id}`}
                        className="line-clamp-2 flex-1 text-base font-medium leading-snug text-black transition duration-200 group-hover:text-[#24A0ED] dark:text-white lg:text-lg"
                        title={chat.title}
                      >
                        {chat.title}
                      </Link>
                      <div className="flex items-center gap-2">
                        <Menu as="div" className="relative">
                          <MenuButton className="rounded-full p-2 text-black/40 transition duration-200 hover:bg-light-200 hover:text-black dark:text-white/40 dark:hover:bg-dark-200 dark:hover:text-white">
                            <MoreHorizontal size={18} />
                          </MenuButton>
                          <Transition
                            enter="transition ease-out duration-100"
                            enterFrom="transform scale-95 opacity-0"
                            enterTo="transform scale-100 opacity-100"
                            leave="transition ease-in duration-75"
                            leaveFrom="transform scale-100 opacity-100"
                            leaveTo="transform scale-95 opacity-0"
                          >
                            <MenuItems className="absolute right-0 z-50 mt-2 w-48 origin-top-right rounded-xl border border-light-200 bg-light-secondary shadow-lg focus:outline-none dark:border-dark-200 dark:bg-dark-secondary">
                              <div className="p-1">
                                <p className="px-3 py-2 text-xs font-semibold text-black/50 dark:text-white/50">
                                  {t('library.moveToSpace')}
                                </p>
                                <MenuItem>
                                  {({ active }) => (
                                    <button
                                      type="button"
                                      onClick={() => moveChatToFolder(chat.id, null)}
                                      className={cn(
                                        'flex w-full items-center rounded-lg px-3 py-2 text-sm',
                                        active ? 'bg-light-200 dark:bg-dark-200' : '',
                                      )}
                                    >
                                      {t('library.title')}
                                    </button>
                                  )}
                                </MenuItem>
                                {folders.map((f) => (
                                  <MenuItem key={f.id}>
                                    {({ active }) => (
                                      <button
                                        type="button"
                                        onClick={() => moveChatToFolder(chat.id, f.id)}
                                        className={cn(
                                          'flex w-full items-center rounded-lg px-3 py-2 text-sm',
                                          active
                                            ? 'bg-light-200 text-[#24A0ED] dark:bg-dark-200'
                                            : '',
                                        )}
                                      >
                                        {f.name}
                                      </button>
                                    )}
                                  </MenuItem>
                                ))}
                              </div>
                            </MenuItems>
                          </Transition>
                        </Menu>

                        <DeleteChat
                          chatId={chat.id}
                          chats={chats}
                          setChats={setChats}
                        />
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 text-black/70 dark:text-white/70">
                      <span className="inline-flex items-center gap-1 text-xs">
                        <ClockIcon size={14} />
                        {formatTimeDifference(
                          new Date(),
                          chat.lastMessageAt ?? chat.createdAt,
                        )}{' '}
                        {t('common.ago')}
                      </span>

                      {sourcesLabel && (
                        <span className="inline-flex items-center gap-1 rounded-full border border-black/20 px-2 py-0.5 text-xs dark:border-white/20">
                          <Globe2Icon size={14} />
                          {sourcesLabel}
                        </span>
                      )}
                      {chat.files.length > 0 && (
                        <span className="inline-flex items-center gap-1 rounded-full border border-black/20 px-2 py-0.5 text-xs dark:border-white/20">
                          <FileText size={14} />
                          {t('library.file', { count: chat.files.length })}
                        </span>
                      )}
                      {chat.folderId && folders.find((f) => f.id === chat.folderId) && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-sky-500/10 px-2 py-0.5 text-xs font-medium text-[#24A0ED]">
                          <Folder size={12} />
                          {folders.find((f) => f.id === chat.folderId)?.name}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default Page;
