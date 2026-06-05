import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from './locales/en.json';
import zhCN from './locales/zh-CN.json';

export type AppLocale = 'en' | 'zh-CN';

const APP_LOCALES: AppLocale[] = ['en', 'zh-CN'];

export function isAppLocale(value: string): value is AppLocale {
  return (APP_LOCALES as string[]).includes(value);
}

export function detectDefaultLocale(): AppLocale {
  if (typeof navigator !== 'undefined') {
    const lang = navigator.language.toLowerCase();
    if (lang.startsWith('zh')) return 'zh-CN';
  }
  return 'en';
}

void i18n.use(initReactI18next).init({
  resources: {
    en: { translation: en },
    'zh-CN': { translation: zhCN },
  },
  lng: detectDefaultLocale(),
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
});

export async function applyLocale(locale: AppLocale): Promise<void> {
  await i18n.changeLanguage(locale);
}

export default i18n;
