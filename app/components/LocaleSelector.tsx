'use client';

import { useState } from 'react';
import { SUPPORTED_LOCALES } from '../types/locale';

interface LocaleSelectorProps {
  currentLocale: string;
  onLocaleChange: (locale: string) => void;
}

export default function LocaleSelector({ currentLocale, onLocaleChange }: LocaleSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);

  const handleLocaleChange = (locale: string) => {
    onLocaleChange(locale);
    setIsOpen(false);
  };

  const currentLocaleData = SUPPORTED_LOCALES.find(l => l.code === currentLocale);

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-3 py-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors text-sm"
        aria-label="Select language"
      >
        <span className="text-lg" role="img" aria-label={currentLocaleData?.name}>
          {currentLocaleData?.flag || '🇺🇸'}
        </span>
        <span className="text-gray-700 dark:text-gray-300 font-medium">
          {currentLocaleData?.code.toUpperCase() || 'EN'}
        </span>
        <svg
          className={`w-4 h-4 text-gray-400 transition-transform ${isOpen ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {isOpen && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-10"
            onClick={() => setIsOpen(false)}
          />
          
          {/* Dropdown */}
          <div className="absolute top-full right-0 mt-2 w-48 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg z-20 py-1">
            {SUPPORTED_LOCALES.map((locale) => (
              <button
                key={locale.code}
                onClick={() => handleLocaleChange(locale.code)}
                className={`w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors ${
                  currentLocale === locale.code 
                    ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400' 
                    : 'text-gray-700 dark:text-gray-300'
                }`}
              >
                <span className="text-lg" role="img" aria-label={locale.name}>
                  {locale.flag}
                </span>
                <div className="flex-1">
                  <div className="font-medium">{locale.name}</div>
                  <div className="text-xs text-gray-500 dark:text-gray-400">
                    {locale.code.toUpperCase()}
                  </div>
                </div>
                {currentLocale === locale.code && (
                  <svg className="w-4 h-4 text-blue-500" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                )}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
} 