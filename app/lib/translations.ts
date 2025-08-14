import { LocalizationDB } from './database';

// Simple translation utility
export class Translations {
  private static instance: Translations;
  private cache: Record<string, Record<string, string>> = {};
  private db = LocalizationDB.getInstance();

  static getInstance(): Translations {
    if (!Translations.instance) {
      Translations.instance = new Translations();
    }
    return Translations.instance;
  }

  // Get translation for a key in a specific locale
  async get(key: string, locale: string = 'en', fallback?: string): Promise<string> {
    // Check cache first
    if (!this.cache[locale]) {
      this.cache[locale] = await this.db.getTranslations(locale);
    }

    const translation = this.cache[locale][key];
    if (translation) {
      return translation;
    }

    // Return fallback or key itself
    return fallback || key;
  }

  // Get all translations for a locale
  async getAll(locale: string = 'en'): Promise<Record<string, string>> {
    if (!this.cache[locale]) {
      this.cache[locale] = await this.db.getTranslations(locale);
    }
    return this.cache[locale];
  }

  // Clear cache (call when translations are updated)
  clearCache(locale?: string): void {
    if (locale) {
      delete this.cache[locale];
    } else {
      this.cache = {};
    }
  }

  // Available locales
  getAvailableLocales(): Array<{ code: string; name: string; flag: string }> {
    return [
      { code: 'en', name: 'English', flag: '🇺🇸' },
      { code: 'es', name: 'Español', flag: '🇪🇸' },
      { code: 'fr', name: 'Français', flag: '🇫🇷' },
      { code: 'de', name: 'Deutsch', flag: '🇩🇪' },
      { code: 'ja', name: '日本語', flag: '🇯🇵' },
      { code: 'zh', name: '中文', flag: '🇨🇳' },
    ];
  }
}

// Simple helper functions for easy access
export const translations = Translations.getInstance();

// Get a translation
export const t = (key: string, locale: string = 'en', fallback?: string) => 
  translations.get(key, locale, fallback);

// Get all translations for a locale
export const getTranslations = (locale: string = 'en') => 
  translations.getAll(locale);

// Translation key parser utility
export class TranslationKeyParser {
  /**
   * Parses component code to extract all t() function calls and their fallback values
   * @param code - React component code
   * @returns Record<string, string> mapping keys to fallback values
   */
  static parseTranslationKeys(code: string): Record<string, string> {
    const translations: Record<string, string> = {};
    
    if (!code || typeof code !== 'string') {
      return translations;
    }

    // Regex to match t() function calls with various formats:
    // t('key'), t("key"), t('key', 'fallback'), t("key", "fallback"), t(`key`, `fallback`)
    // Also handles template literals and escaped quotes
    const tFunctionRegex = /\bt\s*\(\s*(['"`])([^'"`\n]+?)\1(?:\s*,\s*(['"`])([^'"`\n]*?)\3)?\s*\)/g;
    
    let match;
    while ((match = tFunctionRegex.exec(code)) !== null) {
      const key = match[2];
      const fallback = match[4] || key; // Use key as fallback if no fallback provided
      
      // Only add valid keys (basic validation)
      if (key && key.trim().length > 0) {
        translations[key.trim()] = fallback.trim();
      }
    }

    // Also handle template literal keys like t(`component.${name}.title`, 'fallback')
    const templateLiteralRegex = /\bt\s*\(\s*`([^`\n]+?)`(?:\s*,\s*(['"`])([^'"`\n]*?)\2)?\s*\)/g;
    
    while ((match = templateLiteralRegex.exec(code)) !== null) {
      const keyTemplate = match[1];
      const fallback = match[3] || '';
      
      // For template literals, we'll try to resolve simple cases
      // More complex cases would need runtime evaluation which we can't do here
      if (keyTemplate && !keyTemplate.includes('${')) {
        // Static template literal
        translations[keyTemplate.trim()] = fallback.trim();
      }
    }

    return translations;
  }

  /**
   * Extracts translation keys that are currently in use by component code
   * @param code - React component code
   * @returns Array of translation keys found in the code
   */
  static extractUsedKeys(code: string): string[] {
    const translations = this.parseTranslationKeys(code);
    return Object.keys(translations);
  }

  /**
   * Validates if a key follows the expected format
   * @param key - Translation key to validate
   * @returns boolean indicating if key is valid
   */
  static isValidKey(key: string): boolean {
    if (!key || typeof key !== 'string') return false;
    
    const trimmed = key.trim();
    if (trimmed.length < 3 || trimmed.length > 128) return false;
    
    // Expected format: component.name.section.element
    return /^[a-z0-9]+(?:[.-][a-z0-9]+)*\.[a-z0-9]+(?:[.-][a-z0-9]+)*$/.test(trimmed);
  }
} 