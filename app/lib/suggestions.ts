// Component Suggestion Engine
// Analyzes existing components and project patterns to suggest what to build next

export interface ComponentSuggestion {
  id: string;
  title: string;
  description: string;
  category: 'navigation' | 'forms' | 'display' | 'layout' | 'interactive' | 'data';
  difficulty: 'easy' | 'medium' | 'hard';
  estimatedTime: string;
  tags: string[];
  reason: string;
  prompt: string;
  previewCode?: string;
  translationKeys: string[];
}

export interface ComponentPattern {
  type: string;
  frequency: number;
  lastUsed: string;
  variations: string[];
}

export class ComponentSuggestionEngine {
  private static instance: ComponentSuggestionEngine;

  static getInstance(): ComponentSuggestionEngine {
    if (!ComponentSuggestionEngine.instance) {
      ComponentSuggestionEngine.instance = new ComponentSuggestionEngine();
    }
    return ComponentSuggestionEngine.instance;
  }

  // Analyze existing components to understand current patterns
  analyzeComponentPatterns(components: Array<{ name: string; code: string }>): ComponentPattern[] {
    const patterns: Map<string, ComponentPattern> = new Map();

    components.forEach(component => {
      const type = this.extractComponentType(component.code);
      const existing = patterns.get(type) || {
        type,
        frequency: 0,
        lastUsed: component.name,
        variations: []
      };

      existing.frequency += 1;
      existing.lastUsed = component.name;
      if (!existing.variations.includes(component.name)) {
        existing.variations.push(component.name);
      }

      patterns.set(type, existing);
    });

    return Array.from(patterns.values());
  }

  // Extract component type from code analysis
  private extractComponentType(code: string): string {
    const codeLines = code.toLowerCase();
    
    if (codeLines.includes('nav') || codeLines.includes('menu') || codeLines.includes('breadcrumb')) {
      return 'navigation';
    }
    if (codeLines.includes('form') || codeLines.includes('input') || codeLines.includes('button')) {
      return 'forms';
    }
    if (codeLines.includes('card') || codeLines.includes('list') || codeLines.includes('table')) {
      return 'display';
    }
    if (codeLines.includes('grid') || codeLines.includes('layout') || codeLines.includes('container')) {
      return 'layout';
    }
    if (codeLines.includes('modal') || codeLines.includes('dropdown') || codeLines.includes('tooltip')) {
      return 'interactive';
    }
    if (codeLines.includes('chart') || codeLines.includes('data') || codeLines.includes('analytics')) {
      return 'data';
    }

    return 'display'; // default
  }

  // Analyze translation keys to identify missing UI components
  analyzeTranslationGaps(translationKeys: string[]): string[] {
    const gaps: string[] = [];
    const keysByComponent = this.groupTranslationsByComponent(translationKeys);

    // Common UI patterns that should have corresponding components
    const expectedComponents = [
      'header', 'footer', 'sidebar', 'breadcrumb', 'pagination',
      'searchbar', 'filter', 'sort', 'calendar', 'datepicker',
      'profile', 'avatar', 'notification', 'alert', 'toast',
      'stepper', 'progress', 'tabs', 'accordion', 'carousel'
    ];

    expectedComponents.forEach(component => {
      if (!keysByComponent.has(component)) {
        gaps.push(component);
      }
    });

    return gaps;
  }

  private groupTranslationsByComponent(keys: string[]): Map<string, string[]> {
    const groups = new Map<string, string[]>();

    keys.forEach(key => {
      const parts = key.split('.');
      if (parts.length >= 2 && parts[0] === 'component') {
        const componentName = parts[1];
        const existing = groups.get(componentName) || [];
        existing.push(key);
        groups.set(componentName, existing);
      }
    });

    return groups;
  }

  // Generate intelligent suggestions based on analysis
  generateSuggestions(
    existingPatterns: ComponentPattern[], 
    translationGaps: string[],
    projectPhase: 'initial' | 'development' | 'polish' = 'development'
  ): ComponentSuggestion[] {
    const suggestions: ComponentSuggestion[] = [];

    // Base component library suggestions
    const baseComponents = this.getBaseComponentSuggestions(projectPhase);
    suggestions.push(...baseComponents);

    // Gap-based suggestions
    const gapSuggestions = this.generateGapBasedSuggestions(translationGaps);
    suggestions.push(...gapSuggestions);

    // Pattern-based evolution suggestions
    const evolutionSuggestions = this.generateEvolutionSuggestions(existingPatterns);
    suggestions.push(...evolutionSuggestions);

    // Remove duplicates and limit to top suggestions
    const uniqueSuggestions = this.deduplicateAndRank(suggestions);
    return uniqueSuggestions.slice(0, 10);
  }

  private getBaseComponentSuggestions(phase: string): ComponentSuggestion[] {
    const baseComponents: ComponentSuggestion[] = [
      {
        id: 'modern-button',
        title: 'Modern Button Component',
        description: 'A versatile button with multiple variants, sizes, and states',
        category: 'forms',
        difficulty: 'easy',
        estimatedTime: '15-20 minutes',
        tags: ['button', 'interactive', 'forms'],
        reason: 'Buttons are fundamental UI elements used throughout applications',
        prompt: 'Create a modern button component with variants (primary, secondary, ghost), sizes (small, medium, large), and states (default, hover, disabled, loading). Include icons support and make it fully accessible.',
        translationKeys: ['component.button.text', 'component.button.loading'],
        previewCode: `<button className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors">
  {t('component.button.text', 'Click me')}
</button>`
      },
      {
        id: 'user-profile-card',
        title: 'User Profile Card',
        description: 'A card component displaying user information with avatar and details',
        category: 'display',
        difficulty: 'medium',
        estimatedTime: '25-30 minutes',
        tags: ['card', 'user', 'profile', 'avatar'],
        reason: 'User profiles are common in most applications for displaying user information',
        prompt: 'Create a user profile card component with avatar, name, role, contact information, and action buttons. Make it responsive and include hover effects.',
        translationKeys: ['component.userProfileCard.title', 'component.userProfileCard.role', 'component.userProfileCard.email'],
        previewCode: `<div className="bg-white rounded-lg shadow-md p-6">
  <div className="flex items-center space-x-4">
    <img className="w-12 h-12 rounded-full" src="/avatar.jpg" alt="User" />
    <div>
      <h3 className="font-semibold">{t('component.userProfileCard.title', 'John Doe')}</h3>
      <p className="text-gray-600">{t('component.userProfileCard.role', 'Developer')}</p>
    </div>
  </div>
</div>`
      },
      {
        id: 'navigation-breadcrumb',
        title: 'Breadcrumb Navigation',
        description: 'A breadcrumb component for showing current page location',
        category: 'navigation',
        difficulty: 'easy',
        estimatedTime: '15-20 minutes',
        tags: ['navigation', 'breadcrumb', 'location'],
        reason: 'Breadcrumbs help users understand their location within the application',
        prompt: 'Create a breadcrumb navigation component that shows the current page path with clickable segments and proper separators.',
        translationKeys: ['component.breadcrumb.home', 'component.breadcrumb.separator'],
        previewCode: `<nav className="flex" aria-label="Breadcrumb">
  <ol className="flex items-center space-x-2">
    <li><a href="/" className="text-blue-600 hover:underline">{t('component.breadcrumb.home', 'Home')}</a></li>
    <li className="text-gray-500">/</li>
    <li className="text-gray-900">Current Page</li>
  </ol>
</nav>`
      }
    ];

    if (phase === 'initial') {
      return baseComponents.filter(c => c.difficulty === 'easy');
    }

    return baseComponents;
  }

  private generateGapBasedSuggestions(gaps: string[]): ComponentSuggestion[] {
    const gapSuggestions: ComponentSuggestion[] = [];

    gaps.forEach(gap => {
      const suggestion = this.createSuggestionForGap(gap);
      if (suggestion) {
        gapSuggestions.push(suggestion);
      }
    });

    return gapSuggestions;
  }

  private createSuggestionForGap(gap: string): ComponentSuggestion | null {
    const suggestionMap: Record<string, Partial<ComponentSuggestion>> = {
      'header': {
        title: 'Application Header',
        description: 'A responsive header with logo, navigation, and user menu',
        category: 'navigation',
        difficulty: 'medium',
        estimatedTime: '30-40 minutes',
        prompt: 'Create a responsive application header with logo, main navigation menu, user avatar dropdown, and mobile hamburger menu.',
        translationKeys: ['component.header.logo', 'component.header.menu']
      },
      'footer': {
        title: 'Application Footer',
        description: 'A footer with links, social media, and copyright information',
        category: 'navigation',
        difficulty: 'easy',
        estimatedTime: '20-25 minutes',
        prompt: 'Create an application footer with company links, social media icons, and copyright information.',
        translationKeys: ['component.footer.copyright', 'component.footer.links']
      },
      'searchbar': {
        title: 'Search Bar Component',
        description: 'A search input with suggestions and autocomplete',
        category: 'forms',
        difficulty: 'medium',
        estimatedTime: '35-45 minutes',
        prompt: 'Create a search bar component with real-time suggestions, autocomplete, and keyboard navigation.',
        translationKeys: ['component.searchbar.placeholder', 'component.searchbar.noResults']
      }
    };

    const baseInfo = suggestionMap[gap];
    if (!baseInfo) return null;

    return {
      id: `gap-${gap}`,
      tags: [gap, 'missing'],
      reason: `No existing components found for ${gap} - this appears to be a gap in your component library`,
      previewCode: `// ${baseInfo.title} component will be generated here`,
      ...baseInfo
    } as ComponentSuggestion;
  }

  private generateEvolutionSuggestions(patterns: ComponentPattern[]): ComponentSuggestion[] {
    const suggestions: ComponentSuggestion[] = [];

    patterns.forEach(pattern => {
      if (pattern.frequency >= 2) {
        // Suggest variations or enhanced versions
        const evolutionSuggestion = this.createEvolutionSuggestion(pattern);
        if (evolutionSuggestion) {
          suggestions.push(evolutionSuggestion);
        }
      }
    });

    return suggestions;
  }

  private createEvolutionSuggestion(pattern: ComponentPattern): ComponentSuggestion | null {
    const evolutionMap: Record<string, Partial<ComponentSuggestion>> = {
      'forms': {
        title: 'Advanced Form Builder',
        description: 'A dynamic form component with validation and field types',
        difficulty: 'hard',
        estimatedTime: '60-90 minutes',
        prompt: 'Create an advanced form builder component with dynamic fields, validation, file uploads, and multi-step support.'
      },
      'display': {
        title: 'Data Visualization Card',
        description: 'An enhanced card component with charts and metrics',
        difficulty: 'medium',
        estimatedTime: '40-50 minutes',
        prompt: 'Create a data visualization card component with charts, metrics, and interactive elements.'
      }
    };

    const baseInfo = evolutionMap[pattern.type];
    if (!baseInfo) return null;

    return {
      id: `evolution-${pattern.type}`,
      category: pattern.type as ComponentSuggestion['category'],
      tags: [pattern.type, 'evolution', 'advanced'],
      reason: `You have ${pattern.frequency} ${pattern.type} components. Consider building an advanced version to enhance your component library.`,
      translationKeys: [`component.advanced${pattern.type}.title`],
      previewCode: `// Advanced ${pattern.type} component`,
      ...baseInfo
    } as ComponentSuggestion;
  }

  private deduplicateAndRank(suggestions: ComponentSuggestion[]): ComponentSuggestion[] {
    // Remove duplicates by ID
    const unique = suggestions.filter((suggestion, index, array) => 
      array.findIndex(s => s.id === suggestion.id) === index
    );

    // Rank by priority: easy tasks first, then medium, then hard
    const difficultyOrder = { easy: 1, medium: 2, hard: 3 };
    
    return unique.sort((a, b) => {
      // Primary sort: difficulty
      const diffA = difficultyOrder[a.difficulty];
      const diffB = difficultyOrder[b.difficulty];
      if (diffA !== diffB) return diffA - diffB;
      
      // Secondary sort: category preference
      const categoryOrder = { forms: 1, navigation: 2, display: 3, interactive: 4, layout: 5, data: 6 };
      const catA = categoryOrder[a.category] || 99;
      const catB = categoryOrder[b.category] || 99;
      return catA - catB;
    });
  }

  // Get suggestions for specific scenarios
  getQuickStartSuggestions(): ComponentSuggestion[] {
    return [
      {
        id: 'quick-button',
        title: 'Simple Button',
        description: 'A basic button to get started',
        category: 'forms',
        difficulty: 'easy',
        estimatedTime: '10 minutes',
        tags: ['button', 'quick'],
        reason: 'Perfect starting point for any UI library',
        prompt: 'Create a simple, modern button with hover effects',
        translationKeys: ['component.button.text'],
        previewCode: '<button className="px-4 py-2 bg-blue-600 text-white rounded">Button</button>'
      },
      {
        id: 'quick-card',
        title: 'Content Card',
        description: 'A basic card for displaying content',
        category: 'display',
        difficulty: 'easy',
        estimatedTime: '15 minutes',
        tags: ['card', 'content', 'quick'],
        reason: 'Cards are versatile components used everywhere',
        prompt: 'Create a simple content card with title, description, and optional image',
        translationKeys: ['component.card.title', 'component.card.description'],
        previewCode: '<div className="bg-white rounded-lg shadow-md p-6"><h3>Title</h3><p>Description</p></div>'
      }
    ];
  }
}
