import { useEffect, useState } from 'react';
import EmptyChatMessageInput from './EmptyChatMessageInput';
import WeatherWidget from './WeatherWidget';
import SettingsButtonMobile from '@/components/Settings/SettingsButtonMobile';
import { getShowWeatherWidget } from '@/lib/config/clientRegistry';
import { useTranslation } from 'react-i18next';

const EmptyChat = () => {
  const { i18n, t } = useTranslation();
  const [showWeather, setShowWeather] = useState(
    () => typeof window !== 'undefined' && getShowWeatherWidget(),
  );

  useEffect(() => {
    const updateWidgetVisibility = () => {
      setShowWeather(getShowWeatherWidget());
    };

    updateWidgetVisibility();

    window.addEventListener('client-config-changed', updateWidgetVisibility);
    window.addEventListener('storage', updateWidgetVisibility);

    return () => {
      window.removeEventListener(
        'client-config-changed',
        updateWidgetVisibility,
      );
      window.removeEventListener('storage', updateWidgetVisibility);
    };
  }, []);

  return (
    <div className="kami-empty-page relative" lang={i18n.resolvedLanguage}>
      <div className="absolute right-4 top-4 z-10 flex items-center justify-end sm:right-6 sm:top-6">
        <SettingsButtonMobile />
      </div>

      <main className="kami-empty-frame" aria-labelledby="empty-chat-title">
        <div className="kami-empty-kicker" aria-hidden="true">
          <span className="kami-empty-kicker-number">00</span>
          <span>{t('chat.emptyEyebrow')}</span>
          <span className="kami-empty-kicker-rule" />
        </div>

        <div className="kami-empty-grid">
          <header className="kami-empty-copy">
            <p className="kami-empty-brand">{t('chat.emptyBrand')}</p>
            <h1 id="empty-chat-title">{t('chat.emptyHeadline')}</h1>
            <p className="kami-empty-description">
              {t('chat.emptyDescription')}
            </p>
          </header>

          <section
            className="kami-empty-workbench"
            aria-label={t('chat.emptyComposerLabel')}
          >
            <EmptyChatMessageInput />
            <div className="kami-empty-capabilities" role="list">
              <span role="listitem">{t('chat.emptyCapabilityResearch')}</span>
              <span role="listitem">{t('chat.emptyCapabilityVerify')}</span>
              <span role="listitem">{t('chat.emptyCapabilityCounsel')}</span>
            </div>
          </section>
        </div>

        {showWeather && (
          <div className="kami-empty-weather">
            <WeatherWidget />
          </div>
        )}
      </main>
    </div>
  );
};

export default EmptyChat;
