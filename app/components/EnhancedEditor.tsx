'use client';

import { useChat } from '@ai-sdk/react';
import { useState, useEffect, useRef } from 'react';
import ComponentPreview from './ComponentPreview';
import SuggestionSidebar from './SuggestionSidebar';
import NaturalLanguageBridge from './NaturalLanguageBridge';
import { LocalizationDB } from '../lib/database';
import { SessionManager, ComponentManager } from '../lib/database';
import type { ComponentRecord, ComponentVersion } from '../lib/database';
import { TranslationKeyParser } from '../lib/translations';
import type { ComponentSuggestion } from '../lib/suggestions';

// Helper functions for localStorage - Safe for SSR
const saveCurrentComponent = (code: string) => {
  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem('currentComponent', code);
    } catch (e) {
      console.warn('Failed to save current component to localStorage:', e);
    }
  }
};

const loadCurrentComponent = (): string => {
  if (typeof window !== 'undefined') {
    try {
      return localStorage.getItem('currentComponent') || '';
    } catch (e) {
      console.warn('Failed to load current component from localStorage:', e);
      return '';
    }
  }
  return '';
};

export default function EnhancedEditor() {
  const [input, setInput] = useState('');
  const { messages, sendMessage } = useChat();
  const [currentComponent, setCurrentComponent] = useState<string>('');
  const [showSuggestions, setShowSuggestions] = useState(true);
  const [showWizard, setShowWizard] = useState(false);
  
  const db = LocalizationDB.getInstance();
  const sessionManager = SessionManager.getInstance();
  const componentManager = ComponentManager.getInstance();
  const [history, setHistory] = useState<ComponentRecord[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [versions, setVersions] = useState<Record<string, ComponentVersion[]>>({});
  const [historyQuery, setHistoryQuery] = useState('');
  
  // Track last processed artifacts to be resilient to streaming updates
  const lastProcessedCodeRef = useRef<string>('');
  const lastProcessedTranslationsRef = useRef<string>('');
  const [allKeys, setAllKeys] = useState<string[]>([]);
  const [keySuggestions, setKeySuggestions] = useState<string[]>([]);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  
  // Translation queue system to defer processing until component renders
  const [pendingTranslations, setPendingTranslations] = useState<{
    translationsFromBlocks: Record<string, string> | null;
    extractedFromCode: Record<string, string> | null;
    componentCode: string | null;
  }>({
    translationsFromBlocks: null,
    extractedFromCode: null,
    componentCode: null
  });
  const processingTranslationsRef = useRef<boolean>(false);
  
  // Robustly extract plain text content from a message, regardless of SDK shape
  const getMessageText = (msg: unknown): string => {
    if (!msg || typeof msg !== 'object') return '';
    
    const msgObj = msg as Record<string, unknown>;
    
    if (Array.isArray(msgObj.parts)) {
      return msgObj.parts
        .filter((p: unknown) => p && (typeof p === 'object' && (p as Record<string, unknown>).type === 'text' || typeof p === 'string'))
        .map((p: unknown) => {
          if (typeof p === 'string') return p;
          const partObj = p as Record<string, unknown>;
          return typeof partObj.text === 'string' ? partObj.text : '';
        })
        .join('\n');
    }
    if (typeof msgObj.content === 'string') return msgObj.content;
    if (Array.isArray(msgObj.content)) {
      return msgObj.content
        .map((c: unknown) => {
          if (typeof c === 'string') return c;
          if (typeof c === 'object' && c) {
            const cObj = c as Record<string, unknown>;
            if (cObj.type === 'text' && typeof cObj.text === 'string') return cObj.text;
            if (typeof cObj.content === 'string') return cObj.content;
          }
          return '';
        })
        .join('\n');
    }
    return '';
  };

  // Best-effort JSON object parser
  const parseJsonObjectLoose = (raw: string): Record<string, unknown> | null => {
    const tryParse = (s: string) => {
      try { return JSON.parse(s); } catch { return null; }
    };
    let obj = tryParse(raw);
    if (obj && typeof obj === 'object') return obj;
    
    let s = raw
      .replace(/^```[a-zA-Z]*\n/, '')
      .replace(/```\s*$/, '');
    s = s.replace(/\/\*[^*]*\*+(?:[^/*][^*]*\*+)*\//g, '').replace(/(^|\n)\s*\/\/.*(?=\n|$)/g, '$1');
    s = s.replace(/,(\s*[}\]])/g, '$1');
    obj = tryParse(s);
    if (obj && typeof obj === 'object') return obj;
    
    const m = s.match(/\{[\s\S]*\}/);
    if (m) {
      const cleaned = m[0].replace(/,(\s*[}\]])/g, '$1');
      obj = tryParse(cleaned);
      if (obj && typeof obj === 'object') return obj;
    }
    return null;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (input.trim()) {
      sendMessage({ text: input });
      setInput('');
    }
  };

  const handleSuggestionSelect = (suggestion: ComponentSuggestion) => {
    setInput(suggestion.prompt);
    if (inputRef.current) {
      inputRef.current.focus();
    }
  };

  const handleWizardPrompt = (prompt: string) => {
    setInput(prompt);
    if (inputRef.current) {
      inputRef.current.focus();
    }
  };

  const loadHistory = async () => {
    try {
      await sessionManager.getOrCreateActiveSession();
      const items = await componentManager.listComponents('*');
      setHistory(items);
    } catch {
      // no-op
    }
  };

  // Extract React component code + TRANSLATIONS from AI responses
  useEffect(() => {
    const lastMessage = messages[messages.length - 1];
    if (lastMessage && lastMessage.role === 'assistant') {
      const text = getMessageText(lastMessage);
      
      // Look for React component code in code blocks
      const codeBlockRegex = /```(?:tsx?|jsx?|react)?\n([\s\S]*?)\n```/g;
      const matches = [...text.matchAll(codeBlockRegex)];
      
      if (matches.length > 0) {
        const componentCode = matches[matches.length - 1][1];
        if (
          componentCode &&
          (componentCode.includes('export default') || componentCode.includes('function') || componentCode.includes('const')) &&
          componentCode !== lastProcessedCodeRef.current
        ) {
          lastProcessedCodeRef.current = componentCode;
          setCurrentComponent(componentCode);
          saveCurrentComponent(componentCode);
        }
      }

      // Look for TRANSLATIONS JSON block
      try {
        const jsonBlockRegex = /```(?:jsonc?|js|ts)\n([\s\S]*?)\n```/g;
        const jsonMatches = [...text.matchAll(jsonBlockRegex)];
        let translationsRaw = '';
        if (jsonMatches.length > 0) {
          translationsRaw = jsonMatches[jsonMatches.length - 1][1];
        } else {
          const transRegex = /TRANSLATIONS\s*:\s*(\{[\s\S]*?\})/;
          const m = text.match(transRegex);
          if (m) translationsRaw = m[1];
        }

        if (translationsRaw && translationsRaw !== lastProcessedTranslationsRef.current) {
          const parsed = parseJsonObjectLoose(translationsRaw);
          if (parsed && typeof parsed === 'object') {
            // Convert unknown values to strings
            const translationsRecord: Record<string, string> = {};
            for (const [key, value] of Object.entries(parsed)) {
              translationsRecord[key] = typeof value === 'string' ? value : String(value || '');
            }
            console.log('[EnhancedEditor] Queuing TRANSLATIONS block for processing:', Object.keys(translationsRecord));
            setPendingTranslations(prev => ({
              ...prev,
              translationsFromBlocks: translationsRecord
            }));
            lastProcessedTranslationsRef.current = translationsRaw;
          }
        }
      } catch (err) {
        console.warn('Failed to parse TRANSLATIONS block:', err);
      }

      // Process and save component
      (async () => {
        try {
          const codeToSave = (() => {
            const codeBlockRegex2 = /```(?:tsx?|jsx?|react)?\n([\s\S]*?)\n```/g;
            const all = [...text.matchAll(codeBlockRegex2)];
            if (all.length > 0) return all[all.length - 1][1];
            return currentComponent;
          })();
          if (!codeToSave) return;
          
          console.log('[EnhancedEditor] Parsing component code for translation keys...');
          
          const extractedTranslations = TranslationKeyParser.parseTranslationKeys(codeToSave);
          console.log('[EnhancedEditor] Extracted translations from code:', extractedTranslations);
          
          if (Object.keys(extractedTranslations).length > 0) {
            console.log('[EnhancedEditor] Queuing extracted translations for processing:', Object.keys(extractedTranslations));
            setPendingTranslations(prev => ({
              ...prev,
              extractedFromCode: extractedTranslations,
              componentCode: codeToSave
            }));
          }
          
          const session = await sessionManager.getOrCreateActiveSession();
          const firstHeadlineMatch = codeToSave.match(/\bfunction\s+(\w+)\b|export\s+default\s+function\s+(\w+)/);
          const compName = firstHeadlineMatch ? (firstHeadlineMatch[1] || firstHeadlineMatch[2]) : null;
          const name = compName || `Component ${new Date().toLocaleString()}`;
          await componentManager.saveComponent({ sessionId: session.id, name, code: codeToSave });
          await loadHistory();
          console.log('[EnhancedEditor] Component saved successfully');
        } catch (err) {
          console.warn('Failed to persist component:', err);
        }
      })();
    }
  }, [messages, currentComponent, componentManager, loadHistory, sessionManager]);

  // Initial load
  useEffect(() => {
    loadHistory();
    const savedComponent = loadCurrentComponent();
    if (savedComponent) {
      setCurrentComponent(savedComponent);
    }
  }, []);

  // Listen for component render success and process queued translations
  useEffect(() => {
    const handleComponentRendered = async (event: MessageEvent) => {
      if (event.data?.type === 'COMPONENT_RENDERED_SUCCESS') {
        if (processingTranslationsRef.current) {
          console.log('[EnhancedEditor] Already processing translations, skipping...');
          return;
        }
        
        const { translationsFromBlocks, extractedFromCode } = pendingTranslations;
        
        if (!translationsFromBlocks && !extractedFromCode) {
          console.log('[EnhancedEditor] No pending translations to process');
          return;
        }
        
        console.log('[EnhancedEditor] Component rendered successfully, processing queued translations...');
        processingTranslationsRef.current = true;
        
        try {
          await sessionManager.getOrCreateActiveSession();
          
          if (translationsFromBlocks) {
            console.log('[EnhancedEditor] Processing TRANSLATIONS block:', Object.keys(translationsFromBlocks));
            await db.upsertTranslations(translationsFromBlocks);
          }
          
          if (extractedFromCode) {
            console.log('[EnhancedEditor] Processing extracted translations:', Object.keys(extractedFromCode));
            await db.upsertTranslations(extractedFromCode);
            
            const keysToTranslate = Object.keys(extractedFromCode);
            
            if (keysToTranslate.length > 0) {
              console.log(`[EnhancedEditor] Translating ${keysToTranslate.length} keys for current component:`, keysToTranslate);
              
              const supportedLocales = ['es', 'fr', 'de', 'ja', 'zh'];
              const allEntries = await db.getAll();
              
              for (const locale of supportedLocales) {
                const current = await db.getTranslations(locale);
                const toTranslate: Record<string, string> = {};
                
                for (const key of keysToTranslate) {
                  const entry = allEntries.find(e => e.key === key);
                  const hasVal = (current[key] || '').toString().trim();
                  const enVal = (entry?.en || '').toString().trim();
                  
                  if (!hasVal && enVal) {
                    toTranslate[key] = enVal;
                  }
                }
                
                const keys = Object.keys(toTranslate);
                if (keys.length === 0) continue;
                
                console.log(`[EnhancedEditor] Translating ${keys.length} ${locale} keys for current component`);
                
                const res = await fetch('/api/translate', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ locale, entries: toTranslate })
                });
                
                if (!res.ok) {
                  console.warn(`[EnhancedEditor] Translation API failed for ${locale}:`, res.status);
                  continue;
                }
                
                const json = await res.json();
                const translated = (json?.translations || {}) as Record<string, string>;
                
                for (const [key, value] of Object.entries(translated)) {
                  const rec = allEntries.find(e => e.key === key);
                  if (rec) {
                    await db.update(rec.id, locale, String(value || ''));
                  }
                }
                
                console.log(`[EnhancedEditor] Successfully translated ${Object.keys(translated).length} ${locale} keys for current component`);
              }
            }
          }
          
          setPendingTranslations({
            translationsFromBlocks: null,
            extractedFromCode: null,
            componentCode: null
          });
          
          try { 
            window.postMessage({ type: 'LOCALIZATIONS_UPDATED', timestamp: Date.now() }, '*'); 
          } catch {}
          
          console.log('[EnhancedEditor] Successfully processed all queued translations');
          
        } catch (error) {
          console.error('[EnhancedEditor] Failed to process queued translations:', error);
        } finally {
          processingTranslationsRef.current = false;
        }
      } else if (event.data?.type === 'COMPONENT_RENDERED_ERROR') {
        console.log('[EnhancedEditor] Component render failed, clearing pending translations');
        setPendingTranslations({
          translationsFromBlocks: null,
          extractedFromCode: null,
          componentCode: null
        });
        processingTranslationsRef.current = false;
      }
    };
    
    window.addEventListener('message', handleComponentRendered);
    return () => window.removeEventListener('message', handleComponentRendered);
  }, [pendingTranslations, sessionManager, db]);

  // Load translation keys for prompt assist
  useEffect(() => {
    (async () => {
      try {
        const entries = await db.getAll();
        setAllKeys(entries.map(e => e.key));
      } catch {}
    })();
  }, [db]);

  const updateKeySuggestions = (value: string) => {
    const q = value.split(/\s+/).pop() || '';
    const query = q.replace(/[^a-z0-9\.-]/gi, '').toLowerCase();
    if (!query || query.length < 2) {
      setKeySuggestions([]);
      return;
    }
    const filtered = allKeys.filter(k => k.toLowerCase().includes(query)).slice(0, 8);
    setKeySuggestions(filtered);
  };

  const insertKeyIntoPrompt = (key: string) => {
    const snippet = ` t('${key}', '')`;
    setInput(prev => (prev.endsWith(' ') || prev.length === 0 ? prev + snippet : prev + ' ' + snippet));
    setKeySuggestions([]);
    if (inputRef.current) inputRef.current.focus();
  };

  const clearCurrentComponent = () => {
    console.log('[EnhancedEditor] Clearing current component');
    setCurrentComponent('');
    saveCurrentComponent('');
  };

  const handleSelectComponent = async (id: string) => {
    const rec = await componentManager.getComponent(id);
    if (rec) {
      console.log('[EnhancedEditor] Loading component from history:', rec.name);
      console.log('[EnhancedEditor] Component code length:', rec.code.length);
      console.log('[EnhancedEditor] Component code preview:', rec.code.substring(0, 200));
      setCurrentComponent(rec.code);
      saveCurrentComponent(rec.code);
    }
  };

  // Removed unused toggleVersions function

  return (
    <div className="flex h-full">
      {/* Suggestion Sidebar */}
      {showSuggestions && (
        <SuggestionSidebar
          onSuggestionSelect={handleSuggestionSelect}
          className="w-80 flex-shrink-0"
        />
      )}

      {/* Main Chat Section */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header with controls */}
        <div className="border-b border-gray-200 dark:border-gray-700 p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <h1 className="text-xl font-bold text-gray-900 dark:text-white">
                Enhanced Component Creator
              </h1>
              <div className="flex items-center space-x-2">
                <button
                  onClick={() => setShowSuggestions(!showSuggestions)}
                  className={`px-3 py-1.5 text-sm rounded-md border transition-colors ${
                    showSuggestions
                      ? 'bg-blue-50 border-blue-200 text-blue-700 dark:bg-blue-900/20 dark:border-blue-800 dark:text-blue-300'
                      : 'bg-gray-50 border-gray-200 text-gray-700 dark:bg-gray-800 dark:border-gray-600 dark:text-gray-300'
                  }`}
                >
                  💡 Suggestions
                </button>
                <button
                  onClick={() => setShowWizard(true)}
                  className="px-3 py-1.5 text-sm bg-purple-50 border border-purple-200 text-purple-700 dark:bg-purple-900/20 dark:border-purple-800 dark:text-purple-300 rounded-md hover:bg-purple-100 dark:hover:bg-purple-900/30 transition-colors"
                >
                  🧙‍♂️ Wizard
                </button>
              </div>
            </div>


          </div>
        </div>

        <div className="flex flex-1 min-h-0">
          {/* Chat Section */}
          <div className="w-1/2 flex flex-col relative">
            {/* Scrollable Messages Area */}
            <div className="flex-1 overflow-y-auto p-6 pb-32">
              <div className="max-w-2xl mx-auto">
                {messages.length === 0 && (
                  <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-6 mb-6">
                    <h3 className="font-semibold text-gray-900 dark:text-white mb-3">Enhanced Features Available:</h3>
                    <div className="space-y-2 text-sm text-gray-600 dark:text-gray-400">
                      <div>• 💡 <strong>Smart Suggestions:</strong> AI-powered component recommendations</div>
                      <div>• 🧙‍♂️ <strong>Component Wizard:</strong> Convert business requirements to technical specs</div>
                    </div>
                  </div>
                )}

                {/* Component History */}
                <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-3 sm:p-4 mb-6 border border-gray-200 dark:border-gray-700">
                  <div className="flex flex-col gap-3 mb-4">
                    <h3 className="font-semibold text-gray-900 dark:text-white text-sm sm:text-base">Component History</h3>
                    <div className="flex flex-row justify-between gap-2">
                      <input
                        value={historyQuery}
                        onChange={(e) => setHistoryQuery(e.currentTarget.value)}
                        placeholder="Search by name..."
                        className="text-xs sm:text-sm px-2 sm:px-3 py-1.5 sm:py-2 rounded-md bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 text-gray-700 dark:text-gray-200 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      />
                      <div className="flex gap-1.5 sm:gap-2">
                        <button
                          onClick={clearCurrentComponent}
                          className="text-xs sm:text-sm px-2 sm:px-3 py-1.5 sm:py-2 rounded-md bg-red-100 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30 transition-colors flex-1 sm:flex-none"
                          title="Clear current component"
                        >
                          Clear
                        </button>
                        <button
                          onClick={loadHistory}
                          className="text-xs sm:text-sm px-2 sm:px-3 py-1.5 sm:py-2 rounded-md bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-600 transition-colors flex-1 sm:flex-none"
                        >
                          Refresh
                        </button>
                      </div>
                    </div>
                  </div>
                  
                  {history.length === 0 ? (
                    <div className="text-sm text-gray-600 dark:text-gray-400">No components saved yet.</div>
                  ) : (
                    <ul className="space-y-2">
                      {history
                        .filter(h => !historyQuery || (h.name || '').toLowerCase().includes(historyQuery.toLowerCase()))
                        .slice(0, 5)
                        .map(item => (
                        <li key={item.id} className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-md p-2 sm:p-3 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                          <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3">
                            <div className="flex-1 min-w-0">
                              <div className="text-xs sm:text-sm font-medium text-gray-900 dark:text-white truncate">{item.name || 'Untitled Component'}</div>
                              <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 sm:mt-1">{item.updated_at || item.created_at}</div>
                            </div>
                            <button
                              onClick={() => handleSelectComponent(item.id)}
                              className="text-xs px-2 sm:px-3 py-1 sm:py-1.5 rounded-md bg-blue-600 text-white hover:bg-blue-700 transition-colors font-medium flex-shrink-0 self-end sm:self-auto"
                            >
                              Load
                            </button>
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                
                {messages.map(message => (
                  <div key={message.id} className="mb-6">
                    <div className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                      <div className={`max-w-3xl rounded-lg px-4 py-3 ${
                        message.role === 'user' 
                          ? 'bg-blue-500 text-white ml-12' 
                          : 'bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-white mr-12'
                      }`}>
                        <div className="text-sm font-medium mb-1">
                          {message.role === 'user' ? 'You' : 'AI Assistant'}
                        </div>
                        {message.parts.map((part, i) => {
                          switch (part.type) {
                            case 'text':
                              return (
                                <div key={`${message.id}-${i}`} className="whitespace-pre-wrap">
                                  {part.text}
                                </div>
                              );
                          }
                        })}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            
            {/* Fixed Chat Input */}
            <div className="absolute bottom-0 left-0 right-0 bg-white dark:bg-gray-900 border-t border-gray-200 dark:border-gray-700 p-6">
              <div className="max-w-2xl mx-auto">
                <form onSubmit={handleSubmit}>
                  <div className="relative flex items-end bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-2xl shadow-lg hover:shadow-xl transition-shadow duration-200">
                    <textarea
                      className="flex-1 px-6 py-4 bg-transparent text-lg placeholder-zinc-500 dark:placeholder-zinc-400 focus:outline-none resize-none min-h-[56px] max-h-32 overflow-y-auto"
                      value={input}
                      placeholder="Describe the React component you want to create, or use the wizard..."
                      ref={inputRef}
                      onChange={e => {
                        const v = e.currentTarget.value;
                        setInput(v);
                        updateKeySuggestions(v);
                      }}
                      onKeyDown={e => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault();
                          handleSubmit(e);
                        }
                      }}
                      rows={1}
                      style={{
                        height: 'auto',
                        minHeight: '56px',
                      }}
                      onInput={e => {
                        const target = e.target as HTMLTextAreaElement;
                        target.style.height = 'auto';
                        target.style.height = Math.min(target.scrollHeight, 128) + 'px';
                      }}
                    />
                    {keySuggestions.length > 0 && (
                      <div className="absolute left-3 right-16 bottom-[56px] bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-xl shadow-md p-2 max-h-40 overflow-y-auto">
                        <div className="text-xs text-zinc-500 dark:text-zinc-400 px-2 pb-1">Key suggestions</div>
                        <div className="flex flex-wrap gap-2 px-2 pb-1">
                          {keySuggestions.map(k => (
                            <button
                              key={k}
                              type="button"
                              onClick={() => insertKeyIntoPrompt(k)}
                              className="text-xs px-2 py-1 rounded bg-zinc-100 dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200 hover:bg-zinc-200 dark:hover:bg-zinc-700 border border-zinc-200 dark:border-zinc-700"
                            >
                              {k}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                    <button
                      type="submit"
                      disabled={!input.trim()}
                      className="mr-2 mb-2 p-3 bg-blue-500 hover:bg-blue-600 disabled:bg-zinc-300 dark:disabled:bg-zinc-600 text-white rounded-xl transition-colors duration-200 disabled:cursor-not-allowed"
                    >
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="m22 2-7 20-4-9-9-4Z"/>
                        <path d="M22 2 11 13"/>
                      </svg>
                    </button>
                  </div>
                </form>
              </div>
            </div>
          </div>

          {/* Preview Section */}
          <div className="w-1/2 h-full border-l border-gray-200 dark:border-gray-700">
            <ComponentPreview componentCode={currentComponent} />
          </div>
        </div>
      </div>

      {/* Natural Language Bridge Modal */}
      {showWizard && (
        <NaturalLanguageBridge
          onPromptGenerated={handleWizardPrompt}
          onClose={() => setShowWizard(false)}
        />
      )}
    </div>
  );
}
