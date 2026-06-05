import { useTranslation } from 'react-i18next';
import type { UIConfigField } from '@/lib/config/types';

export function useConfigFieldLabels(field: Pick<UIConfigField, 'key' | 'name' | 'description'>) {
  const { t } = useTranslation();
  const base = `settings.fields.${field.key}`;
  return {
    name: t(`${base}.name`, { defaultValue: field.name }),
    description: t(`${base}.description`, { defaultValue: field.description }),
  };
}

export function useConfigOptionLabel(
  fieldKey: string,
  optionValue: string,
  fallback: string,
): string {
  const { t } = useTranslation();
  return t(`settings.fields.${fieldKey}.options.${optionValue}`, {
    defaultValue: fallback,
  });
}
