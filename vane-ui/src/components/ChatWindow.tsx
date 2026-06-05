import Navbar from './Navbar';
import Chat from './Chat';
import EmptyChat from './EmptyChat';
import StudioChatWindow from './Studio/StudioChatWindow';
import { useChat } from '@/lib/hooks/useChat';
import SettingsButtonMobile from './Settings/SettingsButtonMobile';
import { Block } from '@/lib/types';
import Loader from './ui/Loader';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router-dom';

export interface BaseMessage {
  chatId: string;
  messageId: string;
  createdAt: Date;
}

export interface Message extends BaseMessage {
  backendId: string;
  query: string;
  responseBlocks: Block[];
  status: 'answering' | 'completed' | 'error';
  providerId?: string;
  modelKey?: string;
  reasoningPreset?: string;
  optimizationMode?: string;
  branchMeta?: {
    forkTargets?: { chatId: string }[];
    forkParentChatId?: string;
  };
}

export interface File {
  fileName: string;
  fileExtension: string;
  fileId: string;
}

export interface Widget {
  widgetType: string;
  params: Record<string, any>;
}

const ChatWindow = () => {
  const { t } = useTranslation();
  const { chatId: routeChatId } = useParams();
  const { hasError, notFound, messages, isReady, chatKind } = useChat();

  if (chatKind === 'studio' && routeChatId) {
    return <StudioChatWindow />;
  }

  if (hasError) {
    return (
      <div className="relative">
        <div className="absolute w-full flex flex-row items-center justify-end mr-5 mt-5">
          <SettingsButtonMobile />
        </div>
        <div className="flex flex-col items-center justify-center min-h-screen">
          <p className="dark:text-white/70 text-black/70 text-sm">
            {t('chat.serverError')}
          </p>
        </div>
      </div>
    );
  }

  return isReady ? (
    notFound ? (
      <div className="flex min-h-screen w-full items-center justify-center">
        <p className="text-sm text-black/70 dark:text-white/70">{t('chat.notFound')}</p>
      </div>
    ) : (
      <div>
        {messages.length > 0 ? (
          <>
            <Navbar />
            <Chat />
          </>
        ) : (
          <EmptyChat />
        )}
      </div>
    )
  ) : (
    <div className="flex items-center justify-center min-h-screen w-full">
      <Loader />
    </div>
  );
};

export default ChatWindow;
