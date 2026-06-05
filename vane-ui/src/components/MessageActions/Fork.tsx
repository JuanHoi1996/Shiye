import { GitBranch } from 'lucide-react';
import { useTranslation } from 'react-i18next';

const Fork = ({
  forkFromMessage,
  messageId,
  disabled,
}: {
  forkFromMessage: (messageId: string) => void | Promise<void>;
  messageId: string;
  disabled?: boolean;
}) => {
  const { t } = useTranslation();
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => void forkFromMessage(messageId)}
      title={t('messageActions.forkTitle')}
      className="p-2 text-black/70 dark:text-white/70 rounded-full hover:bg-light-secondary dark:hover:bg-dark-secondary transition duration-200 hover:text-black dark:hover:text-white disabled:opacity-35 disabled:pointer-events-none flex flex-row items-center space-x-1"
    >
      <GitBranch size={16} />
    </button>
  );
};

export default Fork;
