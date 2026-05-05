import DeleteChat from '@/components/DeleteChat';
import { cn, formatTimeDifference } from '@/lib/utils';
import { BookOpenText, ClockIcon, FileText, Globe2Icon, FolderPlus, Folder, MoreHorizontal, FolderOpen, Search as SearchIcon, Pencil, Trash2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useEffect, useState, useMemo } from 'react';
import { Menu, MenuButton, MenuItem, MenuItems, Transition } from '@headlessui/react';
import { toast } from 'sonner';

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
      const res = await fetch(`/api/chats`, {
        cache: 'no-store', // 强制不使用缓存
      });
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
    fetchChats();
    fetchFolders();
  }, []);

  const createFolder = async () => {
    if (!newFolderName.trim()) return;
    const res = await fetch('/api/folders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newFolderName }),
    });
    if (res.ok) {
      toast.success('Folder created');
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
      toast.success('Chat moved');
      fetchChats();
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
      toast.success('Space renamed');
      setEditingFolderId(null);
      fetchFolders();
    } else {
      toast.error('Failed to rename');
    }
  };

  const deleteFolder = async (folderId: string) => {
    if (
      !window.confirm(
        'Delete this space? Chats in it will stay in Library (uncategorized).',
      )
    ) {
      return;
    }
    const res = await fetch(`/api/folders/${folderId}`, { method: 'DELETE' });
    if (res.ok) {
      toast.success('Space deleted');
      if (selectedFolderId === folderId) setSelectedFolderId(null);
      fetchFolders();
      fetchChats();
    } else {
      toast.error('Failed to delete');
    }
  };

  const filteredChats = useMemo(() => {
    let result = (chats || []);
    
    // 文件夹过滤
    if (selectedFolderId) {
      result = result.filter(c => c?.folderId === selectedFolderId);
    }
    
    // 搜索过滤
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(c => 
        c?.title?.toLowerCase().includes(q)
      );
    }
    
    return result;
  }, [chats, selectedFolderId, searchQuery]);

  return (
    <div className="flex flex-col h-full lg:flex-row">
      {/* 文件夹边栏 */}
      <div className="w-full lg:w-64 border-b lg:border-b-0 lg:border-r border-light-200/20 dark:border-dark-200/20 p-6 flex flex-col space-y-4">
        <h2 className="text-xl font-medium flex items-center gap-2">
          <FolderOpen size={20} />
          Spaces
        </h2>
        
        {/* 搜索框 */}
        <div className="relative mb-2">
          <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 text-black/40 dark:text-white/40" size={14} />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search chats..."
            className="w-full pl-9 pr-3 py-2 text-sm rounded-xl bg-light-secondary dark:bg-dark-secondary border border-light-200 dark:border-dark-200 focus:outline-none focus:border-sky-500 transition-colors"
          />
        </div>

        <div className="flex flex-col space-y-1">
          <button
            onClick={() => setSelectedFolderId(null)}
            className={cn(
              "flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition duration-200",
              selectedFolderId === null ? "bg-light-secondary dark:bg-dark-secondary font-medium" : "hover:bg-light-secondary/50 dark:hover:bg-dark-secondary/50"
            )}
          >
            <BookOpenText size={16} />
            All Chats
          </button>
          {folders.map((f) =>
            editingFolderId === f.id ? (
              <div key={f.id} className="space-y-2 px-1 py-1">
                <input
                  autoFocus
                  value={renameFolderName}
                  onChange={(e) => setRenameFolderName(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && saveRenameFolder()}
                  className="w-full p-2 text-sm rounded-lg bg-light-secondary dark:bg-dark-secondary border border-light-200 dark:border-dark-200 focus:outline-none"
                />
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={saveRenameFolder}
                    className="text-[10px] bg-sky-500 hover:bg-sky-600 text-white px-2 py-1 rounded"
                  >
                    Save
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditingFolderId(null)}
                    className="text-[10px] bg-gray-500 hover:bg-gray-600 text-white px-2 py-1 rounded"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <div
                key={f.id}
                className="flex items-center gap-0.5 rounded-lg group/frow hover:bg-light-secondary/50 dark:hover:bg-dark-secondary/50"
              >
                <button
                  type="button"
                  onClick={() => setSelectedFolderId(f.id)}
                  className={cn(
                    'flex flex-1 items-center gap-3 min-w-0 px-3 py-2 rounded-lg text-sm transition duration-200 text-left',
                    selectedFolderId === f.id
                      ? 'bg-light-secondary dark:bg-dark-secondary font-medium text-[#24A0ED]'
                      : '',
                  )}
                >
                  <Folder size={16} className="shrink-0" />
                  <span className="truncate">{f.name}</span>
                </button>
                <Menu as="div" className="relative shrink-0">
                  <MenuButton
                    type="button"
                    className="p-2 text-black/40 dark:text-white/40 hover:text-black dark:hover:text-white rounded-lg opacity-0 group-hover/frow:opacity-100 focus:opacity-100"
                    aria-label="Space options"
                  >
                    <MoreHorizontal size={16} />
                  </MenuButton>
                  <Transition
                    enter="transition ease-out duration-100"
                    enterFrom="transform opacity-0 scale-95"
                    enterTo="transform opacity-100 scale-100"
                    leave="transition ease-in duration-75"
                    leaveFrom="transform opacity-100 scale-100"
                    leaveTo="transform opacity-0 scale-95"
                  >
                    <MenuItems className="absolute right-0 mt-1 w-40 origin-top-right rounded-xl bg-light-secondary dark:bg-dark-secondary border border-light-200 dark:border-dark-200 shadow-lg z-50 focus:outline-none">
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
                                'flex w-full items-center gap-2 px-3 py-2 text-sm rounded-lg',
                                active ? 'bg-light-200 dark:bg-dark-200' : '',
                              )}
                            >
                              <Pencil size={14} />
                              Rename
                            </button>
                          )}
                        </MenuItem>
                        <MenuItem>
                          {({ active }) => (
                            <button
                              type="button"
                              onClick={() => deleteFolder(f.id)}
                              className={cn(
                                'flex w-full items-center gap-2 px-3 py-2 text-sm rounded-lg text-red-600 dark:text-red-400',
                                active ? 'bg-light-200 dark:bg-dark-200' : '',
                              )}
                            >
                              <Trash2 size={14} />
                              Delete
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
              className="w-full p-2 text-sm rounded-lg bg-light-secondary dark:bg-dark-secondary border border-light-200 dark:border-dark-200 focus:outline-none"
              placeholder="Folder name..."
            />
            <div className="flex gap-2">
              <button 
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  createFolder();
                }} 
                className="text-[10px] bg-sky-500 hover:bg-sky-600 text-white px-2 py-1 rounded transition-colors"
              >
                Save
              </button>
              <button 
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  setIsCreatingFolder(false);
                }} 
                className="text-[10px] bg-gray-500 hover:bg-gray-600 text-white px-2 py-1 rounded transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setIsCreatingFolder(true)}
            className="flex items-center gap-2 text-xs text-black/50 dark:text-white/50 hover:text-sky-400 transition duration-200 px-3"
          >
            <FolderPlus size={14} />
            New Folder
          </button>
        )}
      </div>

      <div className="flex-1 flex flex-col overflow-y-auto">
        <div className="flex flex-col pt-10 border-b border-light-200/20 dark:border-dark-200/20 pb-6 px-6">
          <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-3">
            <div className="flex items-center">
              <BookOpenText size={45} className="mb-2.5" />
              <div className="flex flex-col ml-4">
                <h1
                  className="text-5xl font-normal pb-0"
                  style={{ fontFamily: 'PP Editorial, serif' }}
                >
                  {selectedFolderId ? folders.find(f => f.id === selectedFolderId)?.name : 'Library'}
                </h1>
                <div className="text-sm text-black/60 dark:text-white/60">
                  {selectedFolderId ? 'Grouping relevant insights.' : 'Past chats, sources, and uploads.'}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 text-xs text-black/60 dark:text-white/60 px-2">
              <span className="inline-flex items-center gap-1 rounded-full border border-black/20 dark:border-white/20 px-2 py-0.5">
                <BookOpenText size={14} />
                {loading
                  ? 'Loading…'
                  : `${filteredChats.length} ${filteredChats.length === 1 ? 'chat' : 'chats'}`}
              </span>
            </div>
          </div>
        </div>

        {loading ? (
          <div className="flex flex-row items-center justify-center min-h-[60vh]">
            <svg
              aria-hidden="true"
              className="w-8 h-8 text-light-200 fill-light-secondary dark:text-[#202020] animate-spin dark:fill-[#ffffff3b]"
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
          <div className="flex flex-col items-center justify-center min-h-[70vh] px-2 text-center">
            <div className="flex items-center justify-center w-12 h-12 rounded-2xl border border-light-200 dark:border-dark-200 bg-light-secondary dark:bg-dark-secondary">
              <BookOpenText className="text-black/70 dark:text-white/70" />
            </div>
            <p className="mt-2 text-black/70 dark:text-white/70 text-sm">
              No chats found in this space.
            </p>
          </div>
        ) : (
          <div className="pt-6 pb-28 px-6">
            <div className="rounded-2xl border border-light-200 dark:border-dark-200 overflow-hidden bg-light-primary dark:bg-dark-primary">
              {filteredChats.map((chat, index) => {
                const sourcesLabel =
                  chat.sources.length === 0
                    ? null
                    : chat.sources.length <= 2
                      ? chat.sources
                          .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
                          .join(', ')
                      : `${chat.sources
                          .slice(0, 2)
                          .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
                          .join(', ')} + ${chat.sources.length - 2}`;

                return (
                  <div
                    key={chat.id}
                    className={
                      'group flex flex-col gap-2 p-6 hover:bg-light-secondary dark:hover:bg-dark-secondary transition-colors duration-200 ' +
                      (index !== filteredChats.length - 1
                        ? 'border-b border-light-200 dark:border-dark-200'
                        : '')
                    }
                  >
                    <div className="flex items-start justify-between gap-3">
                      <Link
                        to={`/c/${chat.id}`}
                        className="flex-1 text-black dark:text-white text-base lg:text-lg font-medium leading-snug line-clamp-2 group-hover:text-[#24A0ED] transition duration-200"
                        title={chat.title}
                      >
                        {chat.title}
                      </Link>
                      <div className="flex items-center gap-2">
                        {/* 文件夹下拉选择 */}
                        <Menu as="div" className="relative">
                          <MenuButton className="p-2 text-black/40 dark:text-white/40 hover:text-black dark:hover:text-white transition duration-200 rounded-full hover:bg-light-200 dark:hover:bg-dark-200">
                            <MoreHorizontal size={18} />
                          </MenuButton>
                          <Transition
                            enter="transition ease-out duration-100"
                            enterFrom="transform opacity-0 scale-95"
                            enterTo="transform opacity-100 scale-100"
                            leave="transition ease-in duration-75"
                            leaveFrom="transform opacity-100 scale-100"
                            leaveTo="transform opacity-0 scale-95"
                          >
                            <MenuItems className="absolute right-0 mt-2 w-48 origin-top-right rounded-xl bg-light-secondary dark:bg-dark-secondary border border-light-200 dark:border-dark-200 shadow-lg focus:outline-none z-50">
                              <div className="p-1">
                                <p className="px-3 py-2 text-xs font-semibold text-black/50 dark:text-white/50">Move to Space</p>
                                <MenuItem>
                                  {({ active }) => (
                                    <button
                                      onClick={() => moveChatToFolder(chat.id, null)}
                                      className={cn(
                                        "flex w-full items-center px-3 py-2 text-sm rounded-lg",
                                        active ? "bg-light-200 dark:bg-dark-200" : ""
                                      )}
                                    >
                                      Library
                                    </button>
                                  )}
                                </MenuItem>
                                {folders.map(f => (
                                  <MenuItem key={f.id}>
                                    {({ active }) => (
                                      <button
                                        onClick={() => moveChatToFolder(chat.id, f.id)}
                                        className={cn(
                                          "flex w-full items-center px-3 py-2 text-sm rounded-lg",
                                          active ? "bg-light-200 dark:bg-dark-200 text-[#24A0ED]" : ""
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
                        ago
                      </span>

                      {sourcesLabel && (
                        <span className="inline-flex items-center gap-1 text-xs border border-black/20 dark:border-white/20 rounded-full px-2 py-0.5">
                          <Globe2Icon size={14} />
                          {sourcesLabel}
                        </span>
                      )}
                      {chat.files.length > 0 && (
                        <span className="inline-flex items-center gap-1 text-xs border border-black/20 dark:border-white/20 rounded-full px-2 py-0.5">
                          <FileText size={14} />
                          {chat.files.length}{' '}
                          {chat.files.length === 1 ? 'file' : 'files'}
                        </span>
                      )}
                      {chat.folderId && folders.find(f => f.id === chat.folderId) && (
                        <span className="inline-flex items-center gap-1 text-xs bg-sky-500/10 text-[#24A0ED] rounded-full px-2 py-0.5 font-medium">
                          <Folder size={12} />
                          {folders.find(f => f.id === chat.folderId)?.name}
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
