import { Settings } from 'lucide-react';
import { lazy, Suspense, useState } from 'react';
import Loader from '../ui/Loader';

const SettingsDialogue = lazy(() => import('./SettingsDialogue'));

const SettingsButtonMobile = () => {
  const [isOpen, setIsOpen] = useState<boolean>(false);

  return (
    <>
      <button className="lg:hidden" onClick={() => setIsOpen(true)}>
        <Settings size={18} />
      </button>
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

export default SettingsButtonMobile;
