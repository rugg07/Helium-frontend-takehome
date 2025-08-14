'use client';

import { useState, useEffect } from 'react';
import { ComponentSuggestionEngine, ComponentSuggestion } from '../lib/suggestions';
import { LocalizationDB, ComponentManager } from '../lib/database';

interface SuggestionSidebarProps {
  onSuggestionSelect: (suggestion: ComponentSuggestion) => void;
  className?: string;
}

export default function SuggestionSidebar({ onSuggestionSelect, className = '' }: SuggestionSidebarProps) {
  const [suggestions, setSuggestions] = useState<ComponentSuggestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [selectedDifficulty, setSelectedDifficulty] = useState<string>('all');
  const [hiddenSuggestions, setHiddenSuggestions] = useState<Set<string>>(new Set());

  const suggestionEngine = ComponentSuggestionEngine.getInstance();
  const db = LocalizationDB.getInstance();
  const componentManager = ComponentManager.getInstance();

  const loadSuggestions = async () => {
    try {
      setLoading(true);
      
      // Get existing components for pattern analysis
      const components = await componentManager.listComponents('*');
      const patterns = suggestionEngine.analyzeComponentPatterns(components);
      
      // Get translation keys for gap analysis
      const translations = await db.getAll();
      const translationKeys = translations.map(t => t.key);
      const gaps = suggestionEngine.analyzeTranslationGaps(translationKeys);
      
      // Generate suggestions
      const projectPhase = components.length < 3 ? 'initial' : 'development';
      const generatedSuggestions = suggestionEngine.generateSuggestions(patterns, gaps, projectPhase);
      
      // Add quick start suggestions if no components exist
      if (components.length === 0) {
        const quickStart = suggestionEngine.getQuickStartSuggestions();
        generatedSuggestions.unshift(...quickStart);
      }

      setSuggestions(generatedSuggestions);
    } catch (error) {
      console.error('Failed to load suggestions:', error);
      // Fallback to quick start suggestions
      setSuggestions(suggestionEngine.getQuickStartSuggestions());
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSuggestions();
    // Load hidden suggestions from localStorage
    const hidden = localStorage.getItem('hiddenSuggestions');
    if (hidden) {
      setHiddenSuggestions(new Set(JSON.parse(hidden)));
    }
  }, []); // Empty dependency array - run only once on mount

  const filteredSuggestions = suggestions.filter(suggestion => {
    if (hiddenSuggestions.has(suggestion.id)) return false;
    if (selectedCategory !== 'all' && suggestion.category !== selectedCategory) return false;
    if (selectedDifficulty !== 'all' && suggestion.difficulty !== selectedDifficulty) return false;
    return true;
  });

  const categories = ['all', ...Array.from(new Set(suggestions.map(s => s.category)))];
  const difficulties = ['all', 'easy', 'medium', 'hard'];

  const handleSuggestionClick = (suggestion: ComponentSuggestion) => {
    onSuggestionSelect(suggestion);
  };

  const hideSuggestion = (suggestionId: string, event: React.MouseEvent) => {
    event.stopPropagation();
    const newHidden = new Set(hiddenSuggestions);
    newHidden.add(suggestionId);
    setHiddenSuggestions(newHidden);
    localStorage.setItem('hiddenSuggestions', JSON.stringify([...newHidden]));
  };

  const resetHiddenSuggestions = () => {
    setHiddenSuggestions(new Set());
    localStorage.removeItem('hiddenSuggestions');
  };

  const getDifficultyColor = (difficulty: string) => {
    switch (difficulty) {
      case 'easy': return 'bg-green-100 text-green-800';
      case 'medium': return 'bg-yellow-100 text-yellow-800';
      case 'hard': return 'bg-red-100 text-red-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getCategoryIcon = (category: string) => {
    switch (category) {
      case 'navigation': return '🧭';
      case 'forms': return '📝';
      case 'display': return '📊';
      case 'layout': return '📐';
      case 'interactive': return '🎯';
      case 'data': return '📈';
      default: return '🔧';
    }
  };

  if (loading) {
    return (
      <div className={`bg-white dark:bg-gray-900 border-r border-gray-200 dark:border-gray-700 ${className}`}>
        <div className="p-4">
          <div className="animate-pulse">
            <div className="h-6 bg-gray-200 dark:bg-gray-700 rounded mb-4"></div>
            <div className="space-y-3">
              {[1, 2, 3].map(i => (
                <div key={i} className="h-20 bg-gray-200 dark:bg-gray-700 rounded"></div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`grid grid-rows-[auto_1fr] h-screen-responsive overflow-hidden bg-white dark:bg-gray-900 border-r border-gray-200 dark:border-gray-700 ${className}`}>
      {/* Header */}
      <div className="row-start-1 p-3 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
            💡 Suggestions
          </h2>
          <button
            onClick={loadSuggestions}
            className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
            title="Refresh suggestions"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          </button>
        </div>

        {/* Filters */}
        <div className="space-y-2">
          <div>
            <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
              Category
            </label>
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="w-full text-xs px-2 py-1 border border-gray-200 dark:border-gray-600 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
            >
              {categories.map(cat => (
                <option key={cat} value={cat}>
                  {cat === 'all' ? 'All Categories' : cat.charAt(0).toUpperCase() + cat.slice(1)}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
              Difficulty
            </label>
            <select
              value={selectedDifficulty}
              onChange={(e) => setSelectedDifficulty(e.target.value)}
              className="w-full text-xs px-2 py-1 border border-gray-200 dark:border-gray-600 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
            >
              {difficulties.map(diff => (
                <option key={diff} value={diff}>
                  {diff === 'all' ? 'All Levels' : diff.charAt(0).toUpperCase() + diff.slice(1)}
                </option>
              ))}
            </select>
          </div>
        </div>

        {hiddenSuggestions.size > 0 && (
          <button
            onClick={resetHiddenSuggestions}
            className="mt-3 text-xs text-blue-600 dark:text-blue-400 hover:underline"
          >
            Show {hiddenSuggestions.size} hidden suggestion{hiddenSuggestions.size !== 1 ? 's' : ''}
          </button>
        )}
      </div>

      {/* Suggestions List */}
      <div className="row-start-2 overflow-y-auto min-h-0 scroll-smooth scrollbar-thin">
        {filteredSuggestions.length === 0 ? (
          <div className="p-4 text-center text-gray-500 dark:text-gray-400">
            <div className="text-2xl mb-2">🎯</div>
            <p className="text-sm">No suggestions match your filters.</p>
            <p className="text-xs mt-1">Try adjusting the category or difficulty filters.</p>
          </div>
        ) : (
          <div className="p-1 space-y-1">
            {filteredSuggestions.map((suggestion) => (
              <div
                key={suggestion.id}
                className="group relative bg-gray-50 dark:bg-gray-800 rounded-lg p-2.5 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors border border-transparent hover:border-blue-200 dark:hover:border-blue-800"
                onClick={() => handleSuggestionClick(suggestion)}
              >
                {/* Hide button */}
                <button
                  onClick={(e) => hideSuggestion(suggestion.id, e)}
                  className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-all"
                  title="Hide this suggestion"
                >
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>

                {/* Header */}
                <div className="flex items-start justify-between mb-2 pr-6">
                  <div className="flex items-center space-x-2">
                    <span className="text-lg">{getCategoryIcon(suggestion.category)}</span>
                    <h3 className="font-medium text-sm text-gray-900 dark:text-white line-clamp-1">
                      {suggestion.title}
                    </h3>
                  </div>
                </div>

                {/* Description */}
                <p className="text-xs text-gray-600 dark:text-gray-400 mb-3 line-clamp-2">
                  {suggestion.description}
                </p>

                {/* Meta information */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${getDifficultyColor(suggestion.difficulty)}`}>
                      {suggestion.difficulty}
                    </span>
                    <span className="text-xs text-gray-500 dark:text-gray-400">
                      ⏱️ {suggestion.estimatedTime}
                    </span>
                  </div>
                </div>

                {/* Reason */}
                <div className="mt-2 pt-2 border-t border-gray-200 dark:border-gray-600">
                  <p className="text-xs text-gray-500 dark:text-gray-400 italic">
                    {suggestion.reason}
                  </p>
                </div>

                {/* Tags */}
                {suggestion.tags.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {suggestion.tags.slice(0, 3).map((tag, index) => (
                      <span
                        key={index}
                        className="inline-flex items-center px-1.5 py-0.5 rounded text-xs bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-300"
                      >
                        {tag}
                      </span>
                    ))}
                    {suggestion.tags.length > 3 && (
                      <span className="text-xs text-gray-400">+{suggestion.tags.length - 3}</span>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
