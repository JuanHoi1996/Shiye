import { UIConfigField } from '@/lib/config/types';
import SettingsField from '../SettingsField';
import Select from '@/components/ui/Select';
import { persistUiState } from '@/lib/config/clientStorageSync';
import {
  applyLocale,
  detectDefaultLocale,
  isAppLocale,
  type AppLocale,
} from '@/lib/i18n';
import i18n from '@/lib/i18n';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

/** Native endonyms — invariant across active UI locale (ISO/macOS convention). */
const LOCALE_LABELS: Record<AppLocale, string> = {
  en: 'English',
  'zh-CN': '简体中文',
  'zh-TW': '繁體中文',
};

function readStoredLocale(): AppLocale {
  const stored = localStorage.getItem('locale');
  if (stored && isAppLocale(stored)) return stored;
  const lang = i18n.language;
  if (isAppLocale(lang)) return lang;
  return detectDefaultLocale();
}

const Preferences = ({
  fields,
  values,
}: {
  fields: UIConfigField[];
  values: Record<string, any>;
}) => {
  const { t } = useTranslation();
  const [locale, setLocale] = useState<AppLocale>(readStoredLocale);
  const [localeSaving, setLocaleSaving] = useState(false);

  const handleLocaleChange = async (newLocale: string) => {
    if (!isAppLocale(newLocale)) return;
    setLocale(newLocale);
    setLocaleSaving(true);
    try {
      await applyLocale(newLocale);
      await persistUiState({ locale: newLocale });
    } finally {
      setLocaleSaving(false);
    }
  };

  return (
    <div className="flex-1 space-y-6 overflow-y-auto px-6 py-6">
      <section className="rounded-xl border border-light-200 bg-light-primary/80 p-4 lg:p-6 transition-colors dark:border-dark-200 dark:bg-dark-primary/80">
        <div className="space-y-3 lg:space-y-5">
          <div>
            <h4 className="text-sm lg:text-sm text-black dark:text-white">
              {t('settings.preferences.language')}
            </h4>
            <p className="text-[11px] lg:text-xs text-black/50 dark:text-white/50">
              {t('settings.preferences.languageDescription')}
            </p>
          </div>
          <Select
            value={locale}
            onChange={(e) => void handleLocaleChange(e.target.value)}
            options={[
              { value: 'en', label: LOCALE_LABELS.en },
              { value: 'zh-CN', label: LOCALE_LABELS['zh-CN'] },
              { value: 'zh-TW', label: LOCALE_LABELS['zh-TW'] },
            ]}
            className="!text-xs lg:!text-sm"
            loading={localeSaving}
            disabled={localeSaving}
          />
        </div>
      </section>
      {fields.map((field) => (
        <SettingsField
          key={field.key}
          field={field}
          value={
            (field.scope === 'client'
              ? localStorage.getItem(field.key)
              : values[field.key]) ?? field.default
          }
          dataAdd="preferences"
        />
      ))}
    </div>
  );
};

export default Preferences;
