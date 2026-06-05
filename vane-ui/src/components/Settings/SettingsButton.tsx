import { Settings } from 'lucide-react';
import { lazy, Suspense, useState } from 'react';
import Loader from '../ui/Loader';

const SettingsDialogue = lazy(() => import('./SettingsDialogue'));

const SettingsButton = () => {
  const [isOpen, setIsOpen] = useState<boolean>(false);

  return (
    <>
      <div
        className="p-2.5 rounded-full bg-light-200 text-black/70 dark:bg-dark-200 dark:text-white/70 hover:opacity-70 hover:scale-105 transition duration-200 cursor-pointer active:scale-95"
        onClick={() => setIsOpen(true)}
      >
        <Settings size={19} className="cursor-pointer" />
      </div>
      {isOpen && (
        <Suspense
          fallback={
            <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/20 dark:bg-black/40">
              <Loader />
            </div>
          }
        >
          <SettingsDialogue isOpen={isOpen} setIsOpen={setIsOpen} />
        </Suspense>
      )}
    </>
  );
};

export default SettingsButton;
