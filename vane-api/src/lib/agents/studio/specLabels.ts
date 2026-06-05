import type { StudioLengthPreference } from './types';

export function lengthPreferenceLabelZh(
  pref: StudioLengthPreference,
): string {
  switch (pref) {
    case 'shorter':
      return '短一些';
    case 'longer':
      return '长一些';
    default:
      return '适中';
  }
}
