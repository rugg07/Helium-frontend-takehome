'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import { SandpackProvider, SandpackPreview, useSandpack } from '@codesandbox/sandpack-react';
import { LocalizationDB } from '../lib/database';
import LocaleSelector from './LocaleSelector';

interface ComponentPreviewProps {
  componentCode: string;
}

// Component to listen for Sandpack render events and notify parent
function SandpackEventListener() {
  const { listen } = useSandpack();
  
  useEffect(() => {
    const stopListening = listen((message) => {
      if (message.type === 'done') {
        // Component successfully compiled and rendered
        console.log('[ComponentPreview] Component rendered successfully in Sandpack');
        window.postMessage({ 
          type: 'COMPONENT_RENDERED_SUCCESS', 
          timestamp: Date.now() 
        }, '*');
      } else if (message.type === 'action' && message.action === 'show-error') {
        // Component failed to render
        console.log('[ComponentPreview] Component render failed in Sandpack:', message);
        window.postMessage({ 
          type: 'COMPONENT_RENDERED_ERROR', 
          timestamp: Date.now(),
          error: message 
        }, '*');
      }
    });
    
    return () => stopListening();
  }, [listen]);
  
  return null; // This component doesn't render anything
}

export default function ComponentPreview({ componentCode }: ComponentPreviewProps) {
  const [processedCode, setProcessedCode] = useState<string>('');
  const [currentLocale, setCurrentLocale] = useState<string>('en');
  const [translations, setTranslations] = useState<Record<string, string>>({});
  const [isLoadingTranslations, setIsLoadingTranslations] = useState<boolean>(false);
  const [hasError, setHasError] = useState<boolean>(false);
  const autoTranslateRanRef = useRef<Set<string>>(new Set());
  const db = LocalizationDB.getInstance();

  useEffect(() => {
    if (!componentCode.trim()) {
      setProcessedCode('');
      return;
    }

    // Process the component code for Sandpack
    let code = componentCode.trim();
    
    if (code) {
      // Ensure React import is present
      if (!code.includes('import React') && !code.includes('import * as React')) {
        code = `import React from 'react';\n${code}`;
      }
      
      // Robustly ensure required React hooks are imported.
      // 1) Detect hooks that are used anywhere in the code
      const usedHooks: string[] = [];
      const hookNames = ['useState', 'useEffect', 'useRef', 'useMemo', 'useCallback', 'useContext', 'useReducer'];
      for (const hook of hookNames) {
        if (new RegExp(`\\b${hook}\\b`).test(code)) usedHooks.push(hook);
      }
      // 2) Find which of those are already imported from 'react'
      const importsFromReact = Array.from(code.matchAll(/import\s+(?:React(?:\s*,\s*)?)?\{([^}]+)\}\s+from\s+['\"]react['\"];?/g))
        .flatMap(m => (m[1] || '').split(',').map(s => s.trim()))
        .filter(Boolean);
      const missingHooks = usedHooks.filter(h => !importsFromReact.some(i => new RegExp(`^${h}$`).test(i)));
      // 3) If any are missing, add a separate import line (valid even when a default React import exists)
      if (missingHooks.length > 0) {
        code = `import { ${missingHooks.join(', ')} } from 'react';\n` + code;
      }

      // Ensure the translation helper is available to the component code
      // Many generated components call t('key') directly without receiving it via props
      // Import it so it's in module scope inside /Component.tsx
      const hasTranslationsImport = code.includes("from './translations'") || code.includes('from "./translations"');
      if (!hasTranslationsImport) {
        code = `import { t } from './translations';\n${code}`;
      }

    }
    
    setProcessedCode(code);
  }, [componentCode]);

  useEffect(() => {
    let cancelled = false;
    setIsLoadingTranslations(true);
    setHasError(false);
    
    (async () => {
      try {
        console.log(`[ComponentPreview] Loading translations for locale: ${currentLocale}`);
        await new Promise(resolve => setTimeout(resolve, 100)); // Small delay to prevent race conditions
        const data = await db.getTranslations(currentLocale);
        console.log(`[ComponentPreview] Loaded ${Object.keys(data || {}).length} translations for ${currentLocale}:`, data);
        if (!cancelled) {
          setTranslations(data || {});
          setIsLoadingTranslations(false);
          setHasError(false);
          console.log(`[ComponentPreview] Successfully set translations for ${currentLocale}`);
        }
      } catch (e) {
        console.error(`[ComponentPreview] Failed to load translations for ${currentLocale}:`, e);
        if (!cancelled) {
          setTranslations({});
          setIsLoadingTranslations(false);
          setHasError(true);
          console.log(`[ComponentPreview] Set empty translations due to error for ${currentLocale}`);
        }
      }
    })();
    
    return () => {
      cancelled = true;
    };
  }, [currentLocale]);

  // Listen for granular translation updates from LocalizationTable
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === 'LOCALIZATION_ENTRY_UPDATED') {
        const { key, locale, newValue } = event.data;
        console.log(`[ComponentPreview] Received granular update for ${key} in ${locale}:`, newValue);
        
        // Only update if this is for the current locale
        if (locale === currentLocale) {
          setTranslations(prev => ({
            ...prev,
            [key]: newValue
          }));
          console.log(`[ComponentPreview] Updated translation for key "${key}" in current locale "${locale}"`);
        }
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [currentLocale]); // Re-bind when locale changes

  // Show a test component when no code is provided
  const displayCode = processedCode || `import React from 'react';

export default function EmptyState() {
  return (
    <div style={{ 
      padding: '40px', 
      textAlign: 'center', 
      color: '#666',
      fontFamily: 'system-ui, sans-serif'
    }}>
      <div style={{ 
        width: '64px', 
        height: '64px', 
        margin: '0 auto 16px', 
        backgroundColor: '#f3f4f6', 
        borderRadius: '8px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center'
      }}>
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <polyline points="16,18 22,12 16,6"></polyline>
          <polyline points="8,6 2,12 8,18"></polyline>
        </svg>
      </div>
      <h3 style={{ margin: '0 0 8px', fontSize: '18px', fontWeight: '600' }}>
        Preview Ready
      </h3>
      <p style={{ margin: '0', fontSize: '14px' }}>
        Your component will appear here when generated
      </p>
    </div>
  );
}`;

  // Create a simple App component that renders the user's component
  const appCode = `import React from 'react';
import Component from './Component';
import { t } from './translations';

export default function App() {
  // Safe translation function that always returns a string
  const safeT = (key, fallback) => {
    try {
      const result = t(key, fallback);
      return (result && typeof result === 'string') ? result : (fallback || key);
    } catch (e) {
      console.warn('Translation error for key:', key, e);
      return fallback || key;
    }
  };

  const demoProps = {
    items: [
      { label: safeT('navigation.home', 'Home'), href: '#home' },
      { label: safeT('component.navbar.item.about', 'About'), href: '#about' },
      { label: safeT('component.navbar.item.services', 'Services'), href: '#services' },
      { label: safeT('component.navbar.item.contact', 'Contact'), href: '#contact' }
    ],
    children: safeT('component.button.text', 'Click me'),
    onClick: () => console.log('Button clicked!'),
    title: safeT('component.navbar.title', 'Demo Title'),
    description: safeT('component.userProfileCard.description', 'This is a demo description.'),
    placeholder: safeT('form.email', 'Enter text here...'),
    text: safeT('component.button.text', 'Demo text'),
    name: safeT('component.userProfileCard.title', 'Demo Name'),
    value: safeT('component.userProfileCard.title', 'Demo Value'),
    locale: '` + currentLocale + `',
    t: safeT
  };

  console.log('[App] Rendering component with locale:', demoProps.locale);
  console.log('[App] Demo props:', Object.keys(demoProps));
  
  try {
    return (
      <div style={{ padding: '20px', fontFamily: 'system-ui, sans-serif' }}>
        <Component {...demoProps} />
      </div>
    );
  } catch (error) {
    console.error('Component render error:', error);
    return (
      <div style={{ 
        padding: '20px', 
        color: '#dc2626', 
        backgroundColor: '#fef2f2', 
        border: '1px solid #fecaca',
        borderRadius: '8px',
        fontFamily: 'system-ui, sans-serif'
      }}>
        <h3 style={{ margin: '0 0 12px 0', fontSize: '16px', fontWeight: '600' }}>Component Error</h3>
        <p style={{ margin: '0 0 8px 0', fontSize: '14px' }}>
          The component failed to render. This might be due to:
        </p>
        <ul style={{ margin: '0 0 12px 0', paddingLeft: '20px', fontSize: '14px' }}>
          <li>Missing translation keys</li>
          <li>Invalid component code</li>
          <li>Runtime JavaScript errors</li>
        </ul>
        <details style={{ fontSize: '12px' }}>
          <summary style={{ cursor: 'pointer', fontWeight: '500' }}>Error Details</summary>
          <pre style={{ 
            marginTop: '8px', 
            padding: '8px', 
            backgroundColor: '#f9fafb', 
            border: '1px solid #e5e7eb',
            borderRadius: '4px',
            fontSize: '11px',
            overflow: 'auto'
          }}>{error.toString()}</pre>
        </details>
      </div>
    );
  }
}`;

  // Rebuild translations module whenever translations change
  const translationsModule = useMemo(() => {
    const safeTranslations = translations || {};
    console.log(`[ComponentPreview] Building translations module for ${currentLocale} with ${Object.keys(safeTranslations).length} entries`);
    
    return `export const translations = ${JSON.stringify(safeTranslations)};
export const t = (key, fallback) => {
  try {
    if (!translations || typeof translations !== 'object') {
      console.warn('Translations object is invalid:', translations);
      return fallback || key;
    }
    const value = translations[key];
    if (value && typeof value === 'string' && value.trim()) {
      return value;
    }
    return fallback || key;
  } catch (e) {
    console.error('Translation function error:', e);
    return fallback || key;
  }
};`;
  }, [translations, currentLocale]);

  // STRATEGIC: Remount when component code changes OR when translations module changes
  // This ensures locale changes are reflected without causing infinite loops
  const sandpackKey = useMemo(() => {
    const codeLen = processedCode ? String(processedCode.length) : 'empty';
    // Create a stable hash that only changes when necessary
    const translationsKeys = Object.keys(translations || {}).sort().join(',');
    const translationsKeyHash = translationsKeys.length.toString();
    // Only include locale in key to ensure remount on language change
    const key = `${codeLen}:${translationsKeyHash}:${currentLocale}`;
    console.log(`[ComponentPreview] Generated sandpack key: ${key} for locale ${currentLocale}`);
    return key;
  }, [processedCode, currentLocale, translations]);

  return (
    <div className="h-full flex flex-col">
      <div className="border-b border-gray-200 dark:border-gray-700 p-4 flex-shrink-0">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Live Preview</h2>
          <LocaleSelector 
            currentLocale={currentLocale}
            onLocaleChange={setCurrentLocale}
          />
        </div>
      </div>
      
      <div className="flex-1 min-h-0" style={{ height: '100%', width: '100%' }}>
        {isLoadingTranslations ? (
          <div className="h-full flex items-center justify-center bg-gray-50 dark:bg-gray-800">
            <div className="text-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-3"></div>
              <p className="text-gray-600 dark:text-gray-400 text-sm">Loading component preview...</p>
            </div>
          </div>
        ) : hasError ? (
          <div className="h-full flex items-center justify-center bg-red-50 dark:bg-red-900/20">
            <div className="text-center p-6">
              <div className="text-red-500 mb-4">
                <svg className="w-12 h-12 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.732-.833-2.5 0L4.268 16.5c-.77.833.192 2.5 1.732 2.5z" />
                </svg>
              </div>
              <p className="text-red-600 dark:text-red-400 font-medium mb-2">Translation Loading Error</p>
              <p className="text-gray-600 dark:text-gray-400 text-sm">Failed to load translations for {currentLocale}</p>
              <button 
                onClick={() => setCurrentLocale(currentLocale)} 
                className="mt-4 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors text-sm"
              >
                Retry
              </button>
            </div>
          </div>
        ) : (
          <SandpackProvider
            key={sandpackKey}
            template="react-ts"
            theme="light"
            files={{
              '/App.tsx': appCode,
              '/Component.tsx': displayCode,
              '/translations.ts': translationsModule,
              '/styles.css': `
                @tailwind base;
                @tailwind components;
                @tailwind utilities;
              `,
              'postcss.config.js': `
                module.exports = {
                  plugins: {
                    tailwindcss: {},
                    autoprefixer: {},
                  },
                }
              `,
              'tailwind.config.js': `
                module.exports = {
                  content: [
                    './pages/**/*.{js,ts,jsx,tsx}',
                    './components/**/*.{js,ts,jsx,tsx}',
                  ],
                  theme: {
                    extend: {},
                  },
                  plugins: [],
                }
              `,
            }}
            style={{
              height: '100%',
              width: '100%',
              border: 'none',
              borderRadius: '0'
            }}
            options={{
              autorun: true,
              externalResources: ['https://cdn.tailwindcss.com'],
            }}
          >
            <SandpackEventListener />
            <SandpackPreview
              style={{ 
                height: '100%', 
                width: '100%',
                border: 'none',
                borderRadius: '0'
              }}
              showOpenInCodeSandbox={false}
              showRefreshButton={true}
              actionsChildren={null}
            />
          </SandpackProvider>
        )}
      </div>
    </div>
  );
} 