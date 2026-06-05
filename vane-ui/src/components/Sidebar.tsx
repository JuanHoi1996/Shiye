import { cn } from '@/lib/utils';
import { BookOpenText, Plus } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';
import React, { useEffect, useState, type ReactNode } from 'react';
import Layout from './Layout';
import {
  Description,
  Dialog,
  DialogPanel,
  DialogTitle,
} from '@headlessui/react';
import SettingsButton from './Settings/SettingsButton';
import { useChat } from '@/lib/hooks/useChat';
import { useTranslation } from 'react-i18next';

const VerticalIconContainer = ({ children }: { children: ReactNode }) => {
  return <div className="flex flex-col items-center w-full">{children}</div>;
};

const Sidebar = ({ children }: { children: React.ReactNode }) => {
  const { t } = useTranslation();
  const { pathname } = useLocation();
  const { startNewChat } = useChat();
  const segments = pathname.split('/').filter(Boolean);
  const [isOpen, setIsOpen] = useState<boolean>(true);

  const navLinks = [
    {
      icon: BookOpenText,
      href: '/library',
      active: segments.includes('library'),
      label: t('sidebar.library'),
    },
  ];

  useEffect(() => {
    if (segments.length === 0) document.title = t('sidebar.documentTitle');
    else if (segments[0] === 'library')
      document.title = t('sidebar.documentTitleLibrary');
  }, [pathname, t]);

  const handleNewChatClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
    if (e.button === 0 && !e.metaKey && !e.ctrlKey && !e.shiftKey) {
      e.preventDefault();
      startNewChat();
    }
  };

  return (
    <div>
      <div className="hidden lg:fixed lg:inset-y-0 lg:z-50 lg:flex lg:w-[72px] lg:flex-col border-r border-light-200 dark:border-dark-200">
        <div className="flex grow flex-col items-center justify-between gap-y-5 overflow-y-auto bg-light-secondary dark:bg-dark-secondary px-2 py-8 shadow-sm shadow-light-200/10 dark:shadow-black/25">
          <Link
            to="/"
            title={t('sidebar.newChat')}
            onClick={handleNewChatClick}
            className="p-2.5 rounded-full bg-light-200 text-shiye-ink ring-1 ring-shiye-ink/20 dark:bg-dark-200 dark:text-shiye-paper dark:ring-shiye-paper/15 hover:opacity-70 hover:scale-105 tansition duration-200"
          >
            <Plus size={19} className="cursor-pointer" />
          </Link>
          <VerticalIconContainer>
            {navLinks.map((link, i) => (
              <Link
                key={i}
                to={link.href}
                className={cn(
                  'relative flex flex-col items-center justify-center space-y-0.5 cursor-pointer w-full py-2 rounded-lg',
                  link.active
                    ? 'text-shiye-ink dark:text-shiye-paper'
                    : 'text-black/60 dark:text-white/60',
                )}
              >
                <div
                  className={cn(
                    link.active && 'bg-light-200 dark:bg-dark-200',
                    'group rounded-lg hover:bg-light-200 hover:dark:bg-dark-200 transition duration-200',
                  )}
                >
                  <link.icon
                    size={25}
                    className={cn(
                      !link.active && 'group-hover:scale-105',
                      'transition duration:200 m-1.5',
                    )}
                  />
                </div>
                <p
                  className={cn(
                    link.active
                      ? 'text-shiye-ink dark:text-shiye-paper'
                      : 'text-black/60 dark:text-white/60',
                    'text-[10px]',
                  )}
                >
                  {link.label}
                </p>
              </Link>
            ))}
          </VerticalIconContainer>

          <SettingsButton />
        </div>
      </div>

      <div className="fixed bottom-0 w-full z-50 flex flex-row items-center gap-x-6 bg-light-secondary dark:bg-dark-secondary px-4 py-4 shadow-sm lg:hidden">
        {navLinks.map((link, i) => (
          <Link
            to={link.href}
            key={i}
            className={cn(
              'relative flex flex-col items-center space-y-1 text-center w-full',
              link.active
                ? 'text-black dark:text-white'
                : 'text-black dark:text-white/70',
            )}
          >
            {link.active && (
              <div className="absolute top-0 -mt-4 h-1 w-full rounded-b-lg bg-shiye-ink dark:bg-shiye-paper" />
            )}
            <link.icon />
            <p className="text-xs">{link.label}</p>
          </Link>
        ))}
      </div>

      <Layout>{children}</Layout>
    </div>
  );
};

export default Sidebar;
