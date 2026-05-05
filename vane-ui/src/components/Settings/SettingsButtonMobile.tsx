import { Settings } from 'lucide-react';
import { useState } from 'react';
import SettingsDialogue from './SettingsDialogue';
const SettingsButtonMobile = () => {
  const [isOpen, setIsOpen] = useState<boolean>(false);

  return (
    <>
      <button className="lg:hidden" onClick={() => setIsOpen(true)}>
        <Settings size={18} />
      </button>
      {isOpen && (
        <SettingsDialogue isOpen={isOpen} setIsOpen={setIsOpen} />
      )}
    </>
  );
};

export default SettingsButtonMobile;
