/**
 * Minimal Locale System for Preview Communication
 */

export interface LocaleOption {
  code: string;
  name: string;
  flag: string;
}

export interface LocaleMessage {
  type: 'LOCALE_CHANGE';
  locale: string;
  timestamp: number;
}

export const SUPPORTED_LOCALES: LocaleOption[] = [
  { code: 'en', name: 'English', flag: '🇺🇸' },
  { code: 'es', name: 'Español', flag: '🇪🇸' },
  { code: 'fr', name: 'Français', flag: '🇫🇷' },
  { code: 'de', name: 'Deutsch', flag: '🇩🇪' },
  { code: 'ja', name: '日本語', flag: '🇯🇵' },
  { code: 'zh', name: '中文', flag: '🇨🇳' },
];

export function createLocaleMessage(locale: string): LocaleMessage {
  return {
    type: 'LOCALE_CHANGE',
    locale,
    timestamp: Date.now()
  };
} 