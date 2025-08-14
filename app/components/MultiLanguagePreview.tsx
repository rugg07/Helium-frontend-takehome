'use client';

import { useState, useEffect, useMemo } from 'react';
import { SandpackProvider, SandpackPreview } from '@codesandbox/sandpack-react';
import { LocalizationDB } from '../lib/database';

interface MultiLanguagePreviewProps {
  componentCode: string;
  className?: string;
}

interface LanguageConfig {
  code: string;
  name: string;
  flag: string;
}

const AVAILABLE_LANGUAGES: LanguageConfig[] = [
  { code: 'en', name: 'English', flag: '🇺🇸' },
  { code: 'es', name: 'Español', flag: '🇪🇸' },
  { code: 'fr', name: 'Français', flag: '🇫🇷' },
  { code: 'de', name: 'Deutsch', flag: '🇩🇪' },
  { code: 'ja', name: '日本語', flag: '🇯🇵' },
  { code: 'zh', name: '中文', flag: '🇨🇳' },
];

export default function MultiLanguagePreview({ componentCode, className = '' }: MultiLanguagePreviewProps) {
  const [selectedLanguages, setSelectedLanguages] = useState<string[]>(['en', 'es', 'fr', 'de']);
  const [translations, setTranslations] = useState<Record<string, Record<string, string>>>({});
  const [loading, setLoading] = useState(true);
  const [layoutIssues, setLayoutIssues] = useState<Record<string, string[]>>({});
  const [syncedState, setSyncedState] = useState<any>(null);

  const db = LocalizationDB.getInstance();
  
  // Debug logging
  console.log('[MultiLanguagePreview] Component initialized with:', {
    componentCodeLength: componentCode?.length || 0,
    hasComponentCode: !!componentCode,
    loading,
    selectedLanguagesCount: selectedLanguages.length,
    translationsKeys: Object.keys(translations)
  });

  // Load translations for all languages
  useEffect(() => {
    loadAllTranslations();
  }, []);

  const loadAllTranslations = async () => {
    try {
      setLoading(true);
      const allTranslations: Record<string, Record<string, string>> = {};
      
      for (const lang of AVAILABLE_LANGUAGES) {
        const langTranslations = await db.getTranslations(lang.code);
        allTranslations[lang.code] = langTranslations;
      }
      
      setTranslations(allTranslations);
    } catch (error) {
      console.error('Failed to load translations:', error);
    } finally {
      setLoading(false);
    }
  };

  // Listen for translation updates
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === 'LOCALIZATIONS_UPDATED') {
        loadAllTranslations();
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  // Process component code for Sandpack - SANITIZE TO PREVENT EXPORT CONFLICTS
  const processedCode = useMemo(() => {
    if (!componentCode || !componentCode.trim()) {
      console.log('[MultiLanguagePreview] No component code provided');
      return null;
    }

    let code = componentCode.trim();
    console.log('[MultiLanguagePreview] Processing component code:', code.substring(0, 100) + '...');
    
    // CRITICAL: Remove ALL import and export statements to prevent conflicts
    code = code.replace(/import\s+[^;]+;?\s*/g, '');
    code = code.replace(/export\s+default\s+/g, '');
    code = code.replace(/export\s+\{[^}]*\}[^;]*;?\s*/g, '');
    code = code.replace(/export\s+/g, '');
    
    // Extract component function name for proper referencing
    let componentName = 'UserComponent';
    
    // Try to find function name from various patterns
    const functionMatch = code.match(/(?:function\s+(\w+)|const\s+(\w+)\s*=|class\s+(\w+))/);
    if (functionMatch) {
      componentName = functionMatch[1] || functionMatch[2] || functionMatch[3];
      console.log('[MultiLanguagePreview] Found component name:', componentName);
    }
    
    // If code doesn't have a proper function declaration, wrap it
    if (!code.includes('function') && !code.includes('const') && !code.includes('class')) {
      console.log('[MultiLanguagePreview] Wrapping code in function');
      code = `function UserComponent(props) {
        return (${code});
      }`;
      componentName = 'UserComponent';
    }
    
    console.log('[MultiLanguagePreview] Sanitized component code ready');
    return { code, componentName };
  }, [componentCode]);

  // No longer needed - using inline approach

  const toggleLanguage = (langCode: string) => {
    setSelectedLanguages(prev => {
      if (prev.includes(langCode)) {
        return prev.filter(code => code !== langCode);
      } else {
        return [...prev, langCode].slice(0, 6); // Max 6 languages
      }
    });
  };

  const detectLayoutIssues = (langCode: string) => {
    // This would be enhanced with actual layout analysis
    // For now, we'll simulate some common issues
    const issues: string[] = [];
    const langTranslations = translations[langCode] || {};
    
    // Check for potentially long translations
    Object.entries(langTranslations).forEach(([key, value]) => {
      if (value.length > 50) {
        issues.push(`Long text in ${key} may cause overflow`);
      }
    });

    // Language-specific layout issues
    if (langCode === 'de') {
      issues.push('German text tends to be longer - check for overflow');
    }
    if (langCode === 'ja' || langCode === 'zh') {
      issues.push('CJK characters may need different line-height');
    }

    return issues;
  };

  useEffect(() => {
    const issues: Record<string, string[]> = {};
    selectedLanguages.forEach(lang => {
      issues[lang] = detectLayoutIssues(lang);
    });
    setLayoutIssues(issues);
  }, [selectedLanguages, translations]);

  if (loading) {
    console.log('[MultiLanguagePreview] Showing loading state');
    return (
      <div className={`bg-white dark:bg-gray-900 ${className}`}>
        <div className="p-4">
          <div className="animate-pulse">
            <div className="h-6 bg-gray-200 dark:bg-gray-700 rounded mb-4"></div>
            <div className="grid grid-cols-2 gap-4">
              {[1, 2, 3, 4].map(i => (
                <div key={i} className="h-48 bg-gray-200 dark:bg-gray-700 rounded"></div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  console.log('[MultiLanguagePreview] Render state check:', {
    loading,
    hasProcessedCode: !!processedCode,
    selectedLanguagesCount: selectedLanguages.length,
    translationsLoaded: Object.keys(translations).length
  });

  // Debug logging for validation
  console.log('[MultiLanguagePreview] Validation check:', {
    hasComponentCode: !!componentCode,
    componentCodeLength: componentCode?.length || 0,
    componentCodePreview: componentCode?.substring(0, 50) || 'none',
    hasProcessedCode: !!processedCode,
    processedCodeType: typeof processedCode
  });

  // Only show demo when no component code is provided
  const hasValidComponent = componentCode && componentCode.trim();
  
  if (!hasValidComponent) {
    console.log('[MultiLanguagePreview] No code, showing empty state');
    return (
      <div className={`bg-white dark:bg-gray-900 flex items-center justify-center ${className}`}>
        <div className="text-center p-8">
          <div className="text-4xl mb-4">🌍</div>
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
            Multi-Language Preview
          </h3>
          <p className="text-gray-600 dark:text-gray-400">
            Create a component to see how it looks in different languages
          </p>
        </div>
      </div>
    );
  }

  const gridCols = selectedLanguages.length <= 2 ? 'grid-cols-1 md:grid-cols-2' :
                   selectedLanguages.length <= 4 ? 'grid-cols-1 md:grid-cols-2 lg:grid-cols-2' :
                   'grid-cols-1 md:grid-cols-2 lg:grid-cols-3';

  console.log('[MultiLanguagePreview] About to render main component');

  return (
    <div className={`h-full bg-white dark:bg-gray-900 flex flex-col ${className}`}>
      {/* Header with language selector */}
      <div className="border-b border-gray-200 dark:border-gray-700 p-4">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
            🌍 Multi-Language Preview
          </h2>
          <div className="text-sm text-gray-500 dark:text-gray-400">
            {selectedLanguages.length} of {AVAILABLE_LANGUAGES.length} languages
          </div>
        </div>

        {/* Language selection */}
        <div className="flex flex-wrap gap-2">
          {AVAILABLE_LANGUAGES.map(lang => (
            <button
              key={lang.code}
              onClick={() => toggleLanguage(lang.code)}
              className={`inline-flex items-center px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                selectedLanguages.includes(lang.code)
                  ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300'
                  : 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
              }`}
            >
              <span className="mr-2">{lang.flag}</span>
              {lang.name}
            </button>
          ))}
        </div>
      </div>

      {/* Preview grid */}
      <div className="flex-1 p-4 overflow-auto min-h-0">
        {selectedLanguages.length === 0 ? (
          <div className="text-center py-12">
            <div className="text-4xl mb-4">🌐</div>
            <p className="text-gray-600 dark:text-gray-400">
              Select languages above to start the multi-language preview
            </p>
          </div>
        ) : (
          <div className={`grid ${gridCols} gap-4 h-full`}>
            {selectedLanguages.map(langCode => {
              const lang = AVAILABLE_LANGUAGES.find(l => l.code === langCode);
              if (!lang) return null;

              // Process component code for this language
              const processComponentCode = () => {
                if (!componentCode || !componentCode.trim()) {
                  return `import React from 'react';

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
        Preview Ready (${langCode})
      </h3>
      <p style={{ margin: '0', fontSize: '14px' }}>
        Your component will appear here when generated
      </p>
    </div>
  );
}`;
                }
                
                let code = componentCode.trim();
                
                // Ensure React import is present
                if (!code.includes('import React') && !code.includes('import * as React')) {
                  code = `import React from 'react';\n${code}`;
                }
                
                // Robustly ensure required React hooks are imported
                const usedHooks: string[] = [];
                const hookNames = ['useState', 'useEffect', 'useRef', 'useMemo', 'useCallback', 'useContext', 'useReducer'];
                for (const hook of hookNames) {
                  if (new RegExp(`\\b${hook}\\b`).test(code)) usedHooks.push(hook);
                }
                
                const importsFromReact = Array.from(code.matchAll(/import\s+(?:React(?:\s*,\s*)?)?\{([^}]+)\}\s+from\s+['\"]react['\"];?/g))
                  .flatMap(m => (m[1] || '').split(',').map(s => s.trim()))
                  .filter(Boolean);
                
                const missingHooks = usedHooks.filter(h => !importsFromReact.some(i => new RegExp(`^${h}$`).test(i)));
                
                if (missingHooks.length > 0) {
                  code = `import { ${missingHooks.join(', ')} } from 'react';\n` + code;
                }

                // Ensure the translation helper is available
                const hasTranslationsImport = code.includes("from './translations'") || code.includes('from "./translations"');
                if (!hasTranslationsImport) {
                  code = `import { t } from './translations';\n${code}`;
                }

                return code;
              };

              // Generate stable key without violating Rules of Hooks
              const codeHash = processedCode ? (processedCode.code || '').length : 0;
              const langTranslations = translations[langCode] || {};
              const translationsHash = Object.keys(langTranslations).sort().join(',').length;
              const sandpackKey = `${langCode}-${codeHash}-${translationsHash}`;
              const issues = layoutIssues[langCode] || [];
              
              console.log(`[MultiLanguagePreview] Rendering ${langCode} with:`, {
                codeHash,
                translationsCount: Object.keys(langTranslations).length,
                sandpackKey,
                hasProcessedCode: !!processedCode,
                componentCodePreview: processedCode ? (processedCode.code || '').substring(0, 50) + '...' : 'No code'
              });

              // Create files object outside JSX to avoid template literal issues
              const sandpackFiles = {
                '/App.tsx': `import React from 'react';
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
    locale: '${langCode}',
    t: safeT
  };

  console.log('[App ${langCode}] Rendering component with locale:', demoProps.locale);
  console.log('[App ${langCode}] Demo props:', Object.keys(demoProps));
  
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
        <h3 style={{ margin: '0 0 12px 0', fontSize: '16px', fontWeight: '600' }}>Component Error (${langCode})</h3>
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
}`,
                '/Component.tsx': processComponentCode(),
                '/translations.ts': `export const translations = ${JSON.stringify(langTranslations)};
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
};`,
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
              };

              return (
                <div key={langCode} className="flex flex-col border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
                  {/* Language header */}
                  <div className="bg-gray-50 dark:bg-gray-800 px-3 py-2 border-b border-gray-200 dark:border-gray-700">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-2">
                        <span className="text-lg">{lang.flag}</span>
                        <span className="font-medium text-gray-900 dark:text-white text-sm">
                          {lang.name}
                        </span>
                      </div>
                      {issues.length > 0 && (
                        <div className="flex items-center space-x-1 text-orange-600 dark:text-orange-400" title={issues.join('\n')}>
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.732-.833-2.5 0L4.268 16.5c-.77.833.192 2.5 1.732 2.5z" />
                          </svg>
                          <span className="text-xs">{issues.length}</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Preview */}
                  <div className="flex-1 min-h-0" style={{ height: '300px', width: '100%' }}>
                    <SandpackProvider
                      key={sandpackKey}
                      template="react-ts"
                      theme="light"
                      files={sandpackFiles}
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
                      <SandpackPreview
                        style={{ 
                          height: '100%',
                          width: '100%',
                          border: 'none',
                          borderRadius: '0'
                        }}
                        showOpenInCodeSandbox={false}
                        showRefreshButton={true}
                        actionsChildren={
                          <div style={{ fontSize: '10px', color: '#666', padding: '2px 4px' }}>
                            {langCode.toUpperCase()}
                          </div>
                        }
                      />
                    </SandpackProvider>
                  </div>

                  {/* Layout issues */}
                  {issues.length > 0 && (
                    <div className="bg-orange-50 dark:bg-orange-900/20 p-2 border-t border-orange-200 dark:border-orange-800">
                      <div className="text-xs text-orange-800 dark:text-orange-300">
                        <div className="font-medium mb-1">Layout Issues:</div>
                        {issues.slice(0, 2).map((issue, index) => (
                          <div key={index}>• {issue}</div>
                        ))}
                        {issues.length > 2 && (
                          <div>• +{issues.length - 2} more issues</div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Export options */}
      {selectedLanguages.length > 0 && (
        <div className="p-4">
          {/* <div className="flex items-center justify-between">
            <div className="text-sm text-gray-600 dark:text-gray-400">
              Showing {selectedLanguages.length} language{selectedLanguages.length !== 1 ? 's' : ''}
            </div>
            <div className="flex space-x-2">
              <button
                onClick={() => {
                  // This would implement screenshot functionality
                  console.log('Export screenshots for:', selectedLanguages);
                }}
                className="px-3 py-1.5 text-sm bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 rounded-md hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
              >
                📸 Export Screenshots
              </button>
              <button
                onClick={() => {
                  // This would implement comparison report
                  const report = {
                    languages: selectedLanguages,
                    layoutIssues,
                    timestamp: new Date().toISOString(),
                    component: processedCode
                  };
                  console.log('Comparison report:', report);
                }}
                className="px-3 py-1.5 text-sm bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded-md hover:bg-blue-200 dark:hover:bg-blue-900/50 transition-colors"
              >
                📊 Generate Report
              </button>
            </div>
          </div> */}
        </div>
      )}
    </div>
  );
}
