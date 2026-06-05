import type { Config } from '@/lib/config/types';
import { applyLocale, isAppLocale } from '@/lib/i18n';

const UI_STATE_KEYS = [
  'chatModelKey',
  'chatModelProviderId',
  'chatReasoningPreset',
  'embeddingModelKey',
  'embeddingModelProviderId',
  'locale',
] as const;

type UiStateKey = (typeof UI_STATE_KEYS)[number];

function isPresent(value: unknown): boolean {
  if (value === undefined || value === null) return false;
  if (typeof value === 'string') return value !== '';
  return true;
}

function toStorageString(value: unknown): string {
  if (typeof value === 'boolean') return String(value);
  if (typeof value === 'string') return value;
  return String(value);
}

async function postConfig(key: string, value: unknown): Promise<void> {
  const res = await fetch('/api/config', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ key, value }),
  });

  if (!res.ok) {
    throw new Error(`Failed to save config: ${await res.text()}`);
  }
}

export function hydrateClientStorageFromConfig(values: Config): void {
  if (typeof window === 'undefined') return;

  for (const section of ['preferences', 'personalization'] as const) {
    const data = values[section];
    if (!data || typeof data !== 'object') continue;

    for (const [key, value] of Object.entries(data)) {
      if (isPresent(value)) {
        localStorage.setItem(key, toStorageString(value));
      }
    }
  }

  const uiState = values.uiState;
  if (uiState && typeof uiState === 'object') {
    for (const key of UI_STATE_KEYS) {
      const value = uiState[key];
      if (isPresent(value) && typeof value === 'string') {
        localStorage.setItem(key, value);
      }
    }
    const locale = uiState.locale;
    if (isPresent(locale) && typeof locale === 'string' && isAppLocale(locale)) {
      void applyLocale(locale);
    }
  }
}

export async function persistClientField(
  dataAdd: 'preferences' | 'personalization',
  key: string,
  value: string,
): Promise<void> {
  localStorage.setItem(key, value);
  await postConfig(`${dataAdd}.${key}`, value);
}

export async function persistUiState(
  partial: Partial<Record<UiStateKey, string>>,
): Promise<void> {
  for (const [key, value] of Object.entries(partial)) {
    if (value === undefined) continue;
    localStorage.setItem(key, value);
    await postConfig(`uiState.${key}`, value);
  }
}
