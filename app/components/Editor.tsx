'use client';

import { useChat } from '@ai-sdk/react';
import { useState, useEffect, useRef } from 'react';
import ComponentPreview from './ComponentPreview';
import { LocalizationDB } from '../lib/database';
import { SessionManager, ComponentManager } from '../lib/database';
import type { ComponentRecord, ComponentVersion } from '../lib/database';
import { TranslationKeyParser } from '../lib/translations';

// Helper functions for localStorage - Safe for SSR
const saveCurrentComponent = (code: string) => {
  // Only access localStorage in browser environment
  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem('currentComponent', code);
    } catch (e) {
      console.warn('Failed to save current component to localStorage:', e);
    }
  }
};

const loadCurrentComponent = (): string => {
  // Only access localStorage in browser environment
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

export default function Editor() {
  const [input, setInput] = useState('');
  const { messages, sendMessage } = useChat();
  const [currentComponent, setCurrentComponent] = useState<string>('');
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
    
    // New UIMessage shape: parts: [{ type: 'text', text: string }, ...]
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
    // Common ChatMessage shape: content: string
    if (typeof msgObj.content === 'string') return msgObj.content;
    // Sometimes content can be an array
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

  // Best-effort JSON object parser that tolerates minor formatting issues often
  // produced by LLMs (e.g., extra commentary, trailing commas, jsonc fences).
  const parseJsonObjectLoose = (raw: string): Record<string, unknown> | null => {
    const tryParse = (s: string) => {
      try { return JSON.parse(s); } catch { return null; }
    };
    // Fast path
    let obj = tryParse(raw);
    if (obj && typeof obj === 'object') return obj;
    // Remove code fences or language hints
    let s = raw
      .replace(/^```[a-zA-Z]*\n/, '')
      .replace(/```\s*$/, '');
    // Strip single-line comments // and /* */ blocks (jsonc)
    s = s.replace(/\/\*[^*]*\*+(?:[^/*][^*]*\*+)*\//g, '').replace(/(^|\n)\s*\/\/.*(?=\n|$)/g, '$1');
    // Remove trailing commas
    s = s.replace(/,(\s*[}\]])/g, '$1');
    obj = tryParse(s);
    if (obj && typeof obj === 'object') return obj;
    // As last resort, try to extract the first {...} block
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

      sendMessage({ 
        text: `${input}` 
      });
      setInput('');
    }
  };

  const loadHistory = async () => {
    try {
      // Load using the active session (for initialization) then also attempt to
      // load all existing components regardless of session so older ones show up.
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
        // Get the last code block (most recent component)
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

      // Look for TRANSLATIONS JSON block fenced by ```json (or jsonc/js/ts) or a TRANSLATIONS: {...}
      try {
        // Prefer explicit json code fence variants
        const jsonBlockRegex = /```(?:jsonc?|js|ts)\n([\s\S]*?)\n```/g;
        const jsonMatches = [...text.matchAll(jsonBlockRegex)];
        let translationsRaw = '';
        if (jsonMatches.length > 0) {
          translationsRaw = jsonMatches[jsonMatches.length - 1][1];
        } else {
          // Fallback: find TRANSLATIONS:\s*{...}
          const transRegex = /TRANSLATIONS\s*:\s*(\{[\s\S]*?\})/;
          const m = text.match(transRegex);
          if (m) translationsRaw = m[1];
        }

        if (translationsRaw && translationsRaw !== lastProcessedTranslationsRef.current) {
          const parsed = parseJsonObjectLoose(translationsRaw);
          // Expect shape { "key": "English text", ... }
          if (parsed && typeof parsed === 'object') {
            // Convert unknown values to strings
            const translationsRecord: Record<string, string> = {};
            for (const [key, value] of Object.entries(parsed)) {
              translationsRecord[key] = typeof value === 'string' ? value : String(value || '');
            }
            console.log('[Editor] Queuing TRANSLATIONS block for processing after component render:', Object.keys(translationsRecord));
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

      // Persist component to DB with session + create version + extract translations from code
      (async () => {
        try {
          const codeToSave = (() => {
            // Prefer last parsed code block over state (state may lag one tick)
            const codeBlockRegex2 = /```(?:tsx?|jsx?|react)?\n([\s\S]*?)\n```/g;
            const all = [...text.matchAll(codeBlockRegex2)];
            if (all.length > 0) return all[all.length - 1][1];
            return currentComponent;
          })();
          if (!codeToSave) return;
          
          console.log('[Editor] Parsing component code for translation keys...');
          
          // Extract translation keys from component code using t() calls
          const extractedTranslations = TranslationKeyParser.parseTranslationKeys(codeToSave);
          console.log('[Editor] Extracted translations from code:', extractedTranslations);
          
          // Queue extracted translations for processing after component render
          if (Object.keys(extractedTranslations).length > 0) {
            console.log('[Editor] Queuing extracted translations for processing after component render:', Object.keys(extractedTranslations));
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
          console.log('[Editor] Component saved successfully');
        } catch (err) {
          console.warn('Failed to persist component:', err);
        }
      })();
    }
  }, [messages, componentManager, currentComponent, loadHistory, sessionManager]);

  // Initial load of component history
  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  // Load current component from localStorage on client side only
  useEffect(() => {
    const savedComponent = loadCurrentComponent();
    if (savedComponent) {
      setCurrentComponent(savedComponent);
    }
  }, []);

  // Listen for component render success and process queued translations
  useEffect(() => {
    const handleComponentRendered = async (event: MessageEvent) => {
      if (event.data?.type === 'COMPONENT_RENDERED_SUCCESS') {
        // Check if we have pending translations to process
        if (processingTranslationsRef.current) {
          console.log('[Editor] Already processing translations, skipping...');
          return;
        }
        
        const { translationsFromBlocks, extractedFromCode } = pendingTranslations;
        
        if (!translationsFromBlocks && !extractedFromCode) {
          console.log('[Editor] No pending translations to process');
          return;
        }
        
        console.log('[Editor] Component rendered successfully, processing queued translations...');
        processingTranslationsRef.current = true;
        
        try {          
          await sessionManager.getOrCreateActiveSession();
          
          // Process TRANSLATIONS blocks first
          if (translationsFromBlocks) {
            console.log('[Editor] Processing TRANSLATIONS block:', Object.keys(translationsFromBlocks));
            await db.upsertTranslations(translationsFromBlocks);
          }
          
          // Process extracted translations from code
          if (extractedFromCode) {
            console.log('[Editor] Processing extracted translations:', Object.keys(extractedFromCode));
            await db.upsertTranslations(extractedFromCode);
            
            // Only translate keys specific to this component
            const keysToTranslate = Object.keys(extractedFromCode);
            
            if (keysToTranslate.length > 0) {
              console.log(`[Editor] Translating ${keysToTranslate.length} keys for current component:`, keysToTranslate);
              
              const supportedLocales = ['es', 'fr', 'de', 'ja', 'zh'];
              const allEntries = await db.getAll();
              
              for (const locale of supportedLocales) {
                const current = await db.getTranslations(locale);
                const toTranslate: Record<string, string> = {};
                
                // Only translate keys from the current component that are missing
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
                
                console.log(`[Editor] Translating ${keys.length} ${locale} keys for current component`);
                
                const res = await fetch('/api/translate', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ locale, entries: toTranslate })
                });
                
                if (!res.ok) {
                  console.warn(`[Editor] Translation API failed for ${locale}:`, res.status);
                  continue;
                }
                
                const json = await res.json();
                const translated = (json?.translations || {}) as Record<string, string>;
                
                // Update translations in database
                for (const [key, value] of Object.entries(translated)) {
                  const rec = allEntries.find(e => e.key === key);
                  if (rec) {
                    await db.update(rec.id, locale, String(value || ''));
                  }
                }
                
                console.log(`[Editor] Successfully translated ${Object.keys(translated).length} ${locale} keys for current component`);
              }
            }
          }
          
          // Clear the queue after successful processing
          setPendingTranslations({
            translationsFromBlocks: null,
            extractedFromCode: null,
            componentCode: null
          });
          
          // Notify listeners that translations were updated
          try { 
            window.postMessage({ type: 'LOCALIZATIONS_UPDATED', timestamp: Date.now() }, '*'); 
          } catch {}
          
          console.log('[Editor] Successfully processed all queued translations');
          
        } catch (error) {
          console.error('[Editor] Failed to process queued translations:', error);
        } finally {
          processingTranslationsRef.current = false;
        }
      } else if (event.data?.type === 'COMPONENT_RENDERED_ERROR') {
        // Clear pending translations if component failed to render
        console.log('[Editor] Component render failed, clearing pending translations');
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

  // Add clear component function
  const clearCurrentComponent = () => {
    console.log('[Editor] Clearing current component');
    setCurrentComponent('');
    saveCurrentComponent('');
  };

  // Load translation keys once for prompt assist
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

  const handleSelectComponent = async (id: string) => {
    const rec = await componentManager.getComponent(id);
    if (rec) {
      console.log('[Editor] Loading component from history:', rec.name);
      setCurrentComponent(rec.code);
      saveCurrentComponent(rec.code);
    }
  };

  const toggleVersions = async (id: string) => {
    if (expandedId === id) {
      setExpandedId(null);
      return;
    }
    setExpandedId(id);
    if (!versions[id]) {
      const list = await componentManager.listComponentVersions(id);
      setVersions(prev => ({ ...prev, [id]: list }));
    }
  };

  return (
    <div className="flex h-full">
      {/* Chat Section */}
      <div className="w-1/2 flex flex-col relative">
        {/* Scrollable Messages Area */}
        <div className="flex-1 overflow-y-auto p-6 pb-32">
          <div className="max-w-2xl mx-auto">
            <div className="mb-8">
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
                React Component Creator
              </h1>
              <p className="text-gray-600 dark:text-gray-400">
                Describe the React component you want to create, and I&apos;ll build it for you with a live preview. (Beta - may take a tries to get a successful preview.)
              </p>
            </div>
            
            {messages.length === 0 && (
              <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-6 mb-6">
                <h3 className="font-semibold text-gray-900 dark:text-white mb-3">Try these examples:</h3>
                <div className="space-y-2 text-sm text-gray-600 dark:text-gray-400">
                  <div>• &quot;Create a modern button component with hover effects&quot;</div>
                  <div>• &quot;Build a user profile card with avatar and social links&quot;</div>
                  <div>• &quot;Make a responsive navigation menu&quot;</div>
                  <div>• &quot;Design a pricing card component&quot;</div>
                </div>
              </div>
            )}

            {/* Component History */}
            <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-4 mb-6 border border-gray-200 dark:border-gray-700">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-semibold text-gray-900 dark:text-white">Component History</h3>
                <div className="flex items-center gap-2">
                  <input
                    value={historyQuery}
                    onChange={(e) => setHistoryQuery(e.currentTarget.value)}
                    placeholder="Search by name..."
                    className="text-sm px-2 py-1 rounded bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 text-gray-700 dark:text-gray-200"
                  />
                  <button
                    onClick={clearCurrentComponent}
                    className="text-sm px-2 py-1 rounded bg-red-100 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30"
                    title="Clear current component"
                  >
                    Clear
                  </button>
                  <button
                    onClick={loadHistory}
                    className="text-sm px-2 py-1 rounded bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-600"
                  >
                    Refresh
                  </button>
                </div>
              </div>
              {history.length === 0 ? (
                <div className="text-sm text-gray-600 dark:text-gray-400">No components saved yet.</div>
              ) : (
                <ul className="space-y-2">
                  {history
                    .filter(h => !historyQuery || (h.name || '').toLowerCase().includes(historyQuery.toLowerCase()))
                    .map(item => (
                    <li key={item.id} className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded p-3">
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="text-sm font-medium text-gray-900 dark:text-white truncate max-w-xs">{item.name || 'Untitled Component'}</div>
                          <div className="text-xs text-gray-500 dark:text-gray-400">{item.updated_at || item.created_at}</div>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => handleSelectComponent(item.id)}
                            className="text-xs px-2 py-1 rounded bg-blue-600 text-white hover:bg-blue-700"
                          >
                            Load
                          </button>
                          <button
                            onClick={() => toggleVersions(item.id)}
                            className="text-xs px-2 py-1 rounded bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 border border-gray-200 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-600"
                          >
                            {expandedId === item.id ? 'Hide Versions' : 'Versions'}
                          </button>
                        </div>
                      </div>
                      {expandedId === item.id && (
                        <div className="mt-3 border-t border-gray-200 dark:border-gray-700 pt-2">
                          {(versions[item.id] || []).length === 0 ? (
                            <div className="text-xs text-gray-500 dark:text-gray-400">No versions yet.</div>
                          ) : (
                            <ul className="space-y-1">
                              {(versions[item.id] || []).map(v => (
                                <li key={v.id} className="flex items-center justify-between">
                                  <div className="text-xs text-gray-500 dark:text-gray-400">{v.created_at}</div>
                                  <button
                                    onClick={() => {
                                      console.log('[Editor] Loading component version:', v.created_at);
                                      setCurrentComponent(v.code);
                                      saveCurrentComponent(v.code);
                                    }}
                                    className="text-xs px-2 py-1 rounded bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 border border-gray-200 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-600"
                                  >
                                    Load Version
                                  </button>
                                </li>
                              ))}
                            </ul>
                          )}
                        </div>
                      )}
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
                  placeholder="Describe the React component you want to create..."
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
                  <svg
                    width="20"
                    height="20"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
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
      <div className="w-1/2 border-l border-gray-200 dark:border-gray-700">
        <ComponentPreview componentCode={currentComponent} />
      </div>
    </div>
  );
}