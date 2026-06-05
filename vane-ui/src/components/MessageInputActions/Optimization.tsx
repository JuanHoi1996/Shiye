import { ChevronDown, Sliders, Star, Zap } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  Popover,
  PopoverButton,
  PopoverPanel,
  Transition,
} from '@headlessui/react';
import { Fragment } from 'react';
import { useChat } from '@/lib/hooks/useChat';
import { AnimatePresence, motion } from 'motion/react';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';

const Optimization = () => {
  const { t } = useTranslation();
  const { optimizationMode, setOptimizationMode } = useChat();

  const optimizationModes = useMemo(
    () => [
      {
        key: 'speed',
        title: t('optimization.speed.title'),
        description: t('optimization.speed.description'),
        icon: <Zap size={16} className="text-[#FF9800]" />,
      },
      {
        key: 'balanced',
        title: t('optimization.balanced.title'),
        description: t('optimization.balanced.description'),
        icon: <Sliders size={16} className="text-[#4CAF50]" />,
      },
      {
        key: 'quality',
        title: t('optimization.quality.title'),
        description: t('optimization.quality.description'),
        icon: (
          <Star
            size={16}
            className="text-[#2196F3] dark:text-[#BBDEFB] fill-[#BBDEFB] dark:fill-[#2196F3]"
          />
        ),
      },
    ],
    [t],
  );

  return (
    <Popover className="relative w-full max-w-[15rem] md:max-w-md lg:max-w-lg">
      {({ open }) => (
        <>
          <PopoverButton
            type="button"
            className="p-2 text-black/50 dark:text-white/50 rounded-xl hover:bg-light-secondary dark:hover:bg-dark-secondary active:scale-95 transition duration-200 hover:text-black dark:hover:text-white focus:outline-none"
          >
            <div className="flex flex-row items-center space-x-1">
              {
                optimizationModes.find((mode) => mode.key === optimizationMode)
                  ?.icon
              }
              <ChevronDown
                size={16}
                className={cn(
                  open ? 'rotate-180' : 'rotate-0',
                  'transition duration:200',
                )}
              />
            </div>
          </PopoverButton>
          <AnimatePresence>
            {open && (
              <PopoverPanel
                className="absolute z-10 w-64 md:w-[250px] left-0 bottom-full mb-2"
                static
              >
                <motion.div
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  transition={{ duration: 0.1, ease: 'easeOut' }}
                  className="origin-bottom-left flex flex-col space-y-2 bg-light-primary dark:bg-dark-primary border rounded-lg border-light-200 dark:border-dark-200 w-full p-2 max-h-[200px] md:max-h-none overflow-y-auto"
                >
                  {optimizationModes.map((mode, i) => (
                    <PopoverButton
                      onClick={() => setOptimizationMode(mode.key)}
                      key={i}
                      className={cn(
                        'p-2 rounded-lg flex flex-col items-start justify-start text-start space-y-1 duration-200 cursor-pointer transition focus:outline-none',
                        optimizationMode === mode.key
                          ? 'bg-light-secondary dark:bg-dark-secondary'
                          : 'hover:bg-light-secondary dark:hover:bg-dark-secondary',
                      )}
                    >
                      <div className="flex flex-row space-x-1 w-full text-black dark:text-white">
                        {mode.icon}
                        <p className="text-xs font-medium">{mode.title}</p>
                      </div>
                      <p className="text-black/70 dark:text-white/70 text-xs">
                        {mode.description}
                      </p>
                    </PopoverButton>
                  ))}
                </motion.div>
              </PopoverPanel>
            )}
          </AnimatePresence>
        </>
      )}
    </Popover>
  );
};

export default Optimization;
