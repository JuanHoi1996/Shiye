import {
  Dialog,
  DialogBackdrop,
  DialogPanel,
  DialogTitle,
} from '@headlessui/react';
import {
  ArrowLeft,
  BarChart3,
  BrainCog,
  ChevronLeft,
  ExternalLink,
  Search,
  Sliders,
  ToggleRight,
} from 'lucide-react';
import Preferences from './Sections/Preferences';
import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import Loader from '../ui/Loader';
import { cn } from '@/lib/utils';
import Models from './Sections/Models/Section';
import SearchSection from './Sections/Search';
import Select from '@/components/ui/Select';
import Personalization from './Sections/Personalization';

const Usage = lazy(() => import('./Sections/Usage'));

function UsageSection() {
  return (
    <Suspense fallback={<Loader />}>
      <Usage />
    </Suspense>
  );
}

const SettingsDialogue = ({
  isOpen,
  setIsOpen,
}: {
  isOpen: boolean;
  setIsOpen: (active: boolean) => void;
}) => {
  const { t } = useTranslation();
  const sections = useMemo(
    () => [
      {
        key: 'preferences',
        name: t('settings.sections.preferences.name'),
        description: t('settings.sections.preferences.description'),
        icon: Sliders,
        component: Preferences,
        dataAdd: 'preferences',
      },
      {
        key: 'personalization',
        name: t('settings.sections.personalization.name'),
        description: t('settings.sections.personalization.description'),
        icon: ToggleRight,
        component: Personalization,
        dataAdd: 'personalization',
      },
      {
        key: 'models',
        name: t('settings.sections.models.name'),
        description: t('settings.sections.models.description'),
        icon: BrainCog,
        component: Models,
        dataAdd: 'modelProviders',
      },
      {
        key: 'search',
        name: t('settings.sections.search.name'),
        description: t('settings.sections.search.description'),
        icon: Search,
        component: SearchSection,
        dataAdd: 'search',
      },
      {
        key: 'usage',
        name: t('settings.sections.usage.name'),
        description: t('settings.sections.usage.description'),
        icon: BarChart3,
        component: UsageSection,
        dataAdd: undefined,
      },
    ],
    [t],
  );

  const [isLoading, setIsLoading] = useState(true);
  const [config, setConfig] = useState<any>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [activeSection, setActiveSection] = useState<string>('preferences');
  const [selectedSection, setSelectedSection] = useState(sections[0]);

  useEffect(() => {
    const next = sections.find((s) => s.key === activeSection);
    if (next) setSelectedSection(next);
  }, [activeSection, sections]);

  useEffect(() => {
    if (!isOpen) return;

    setIsLoading(true);
    setLoadError(null);
    setConfig(null);

    const fetchConfig = async () => {
      try {
        const res = await fetch('/api/config', {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
          },
        });

        if (!res.ok) {
          throw new Error(`Config fetch failed: ${res.status}`);
        }

        const data = await res.json();

        if (!data?.fields || !data?.values) {
          throw new Error('Invalid config response');
        }

        setConfig(data);
      } catch (error) {
        console.error('Error fetching config:', error);
        const message =
          error instanceof Error ? error.message : t('common.loadConfigFailed');
        setLoadError(message);
        toast.error(t('common.loadConfigFailed'));
      } finally {
        setIsLoading(false);
      }
    };

    void fetchConfig();
  }, [isOpen]);

  return (
    <Dialog
      open={isOpen}
      onClose={() => setIsOpen(false)}
      className="relative z-50"
    >
      <DialogBackdrop
        transition={false}
        className="fixed inset-0 bg-black/30 backdrop-blur-sm"
      />
      <div className="fixed inset-0 flex w-screen items-center justify-center overflow-y-auto p-4">
        <DialogPanel className="space-y-4 border border-light-200 dark:border-dark-200 bg-light-primary dark:bg-dark-primary backdrop-blur-lg rounded-xl h-[calc(100vh-2%)] w-[calc(100vw-2%)] md:h-[calc(100vh-7%)] md:w-[calc(100vw-7%)] lg:h-[calc(100vh-20%)] lg:w-[calc(100vw-30%)] overflow-hidden flex flex-col">
          <DialogTitle className="sr-only">{t('settings.title')}</DialogTitle>
          {isLoading ? (
            <div className="flex items-center justify-center h-full w-full">
              <Loader />
            </div>
          ) : loadError || !config?.fields || !config?.values ? (
            <div className="flex flex-col items-center justify-center h-full w-full gap-3 px-6 text-center">
              <p className="text-sm text-black/70 dark:text-white/70">
                {loadError ?? t('settings.couldNotLoad')}
              </p>
              <p className="text-xs text-black/50 dark:text-white/50">
                {t('settings.loadErrorHint')}
              </p>
            </div>
          ) : (
            <div className="flex flex-1 inset-0 h-full overflow-hidden">
              <div className="hidden lg:flex flex-col justify-between w-[240px] border-r border-white-200 dark:border-dark-200 h-full px-3 pt-3 overflow-y-auto">
                <div className="flex flex-col">
                  <button
                    onClick={() => setIsOpen(false)}
                    className="group flex flex-row items-center hover:bg-light-200 hover:dark:bg-dark-200 p-2 rounded-lg"
                  >
                    <ChevronLeft
                      size={18}
                      className="text-black/50 dark:text-white/50 group-hover:text-black/70 group-hover:dark:text-white/70"
                    />
                    <p className="text-black/50 dark:text-white/50 group-hover:text-black/70 group-hover:dark:text-white/70 text-[14px]">
                      {t('common.back')}
                    </p>
                  </button>

                  <div className="flex flex-col items-start space-y-1 mt-8">
                    {sections.map((section) => (
                      <button
                        key={section.key}
                        className={cn(
                          `flex flex-row items-center space-x-2 px-2 py-1.5 rounded-lg w-full text-sm hover:bg-light-200 hover:dark:bg-dark-200 transition duration-200 active:scale-95`,
                          activeSection === section.key
                            ? 'bg-light-200 dark:bg-dark-200 text-black/90 dark:text-white/90'
                            : ' text-black/70 dark:text-white/70',
                        )}
                        onClick={() => setActiveSection(section.key)}
                      >
                        <section.icon size={17} />
                        <p>{section.name}</p>
                      </button>
                    ))}
                  </div>
                </div>
                <div className="flex flex-col space-y-1 py-[18px] px-2">
                  <p className="text-xs text-black/70 dark:text-white/70">
                    {t('common.version', { version: __APP_VERSION__ })}
                  </p>
                  <a
                    href="https://github.com/JuanHoi1996/shiye"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-black/70 dark:text-white/70 flex flex-row space-x-1 items-center transition duration-200 hover:text-black/90 hover:dark:text-white/90"
                  >
                    <span>{t('common.github')}</span>
                    <ExternalLink size={12} />
                  </a>
                </div>
              </div>
              <div className="w-full flex flex-col overflow-hidden">
                <div className="flex flex-row lg:hidden w-full justify-between px-[20px] my-4 flex-shrink-0">
                  <button
                    onClick={() => setIsOpen(false)}
                    className="group flex flex-row items-center hover:bg-light-200 hover:dark:bg-dark-200 rounded-lg mr-[40%]"
                  >
                    <ArrowLeft
                      size={18}
                      className="text-black/50 dark:text-white/50 group-hover:text-black/70 group-hover:dark:text-white/70"
                    />
                  </button>
                  <Select
                    options={sections.map((section) => {
                      return {
                        value: section.key,
                        key: section.key,
                        label: section.name,
                      };
                    })}
                    value={activeSection}
                    onChange={(e) => {
                      setActiveSection(e.target.value);
                    }}
                    className="!text-xs lg:!text-sm"
                  />
                </div>
                <div className="flex flex-1 flex-col overflow-hidden">
                    <div className="border-b border-light-200/60 px-6 pb-6 lg:pt-6 dark:border-dark-200/60 flex-shrink-0">
                      <div className="flex flex-col">
                        <h4 className="font-medium text-black dark:text-white text-sm lg:text-sm">
                          {selectedSection.name}
                        </h4>
                        <p className="text-[11px] lg:text-xs text-black/50 dark:text-white/50">
                          {selectedSection.description}
                        </p>
                      </div>
                    </div>
                    <div className="flex-1 overflow-y-auto">
                      {selectedSection.dataAdd === undefined ? (
                        <selectedSection.component />
                      ) : (
                        <selectedSection.component
                          fields={
                            config.fields[selectedSection.dataAdd] ?? []
                          }
                          values={
                            selectedSection.dataAdd === 'modelProviders'
                              ? (config.values.modelProviders ?? [])
                              : (config.values[selectedSection.dataAdd] ?? {})
                          }
                        />
                      )}
                    </div>
                  </div>
              </div>
            </div>
          )}
        </DialogPanel>
      </div>
    </Dialog>
  );
};

export default SettingsDialogue;
