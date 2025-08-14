'use client';

import { useState } from 'react';

interface RequirementStep {
  id: string;
  question: string;
  type: 'select' | 'multiselect' | 'text' | 'range';
  options?: Array<{ value: string; label: string; description?: string }>;
  placeholder?: string;
  min?: number;
  max?: number;
}

interface ComponentWizardProps {
  onPromptGenerated: (prompt: string) => void;
  onClose: () => void;
}

export default function NaturalLanguageBridge({ onPromptGenerated, onClose }: ComponentWizardProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const [responses, setResponses] = useState<Record<string, unknown>>({});
  const [generatedPrompt, setGeneratedPrompt] = useState<string>('');

  const steps: RequirementStep[] = [
    {
      id: 'componentType',
      question: 'What type of component do you want to create?',
      type: 'select',
      options: [
        { value: 'button', label: 'Button', description: 'Interactive element for actions' },
        { value: 'card', label: 'Card', description: 'Container for displaying information' },
        { value: 'form', label: 'Form', description: 'Data input interface' },
        { value: 'navigation', label: 'Navigation', description: 'Menu or navigation element' },
        { value: 'modal', label: 'Modal/Dialog', description: 'Overlay for focused content' },
        { value: 'list', label: 'List/Table', description: 'Display structured data' },
        { value: 'layout', label: 'Layout', description: 'Structural component' },
        { value: 'custom', label: 'Custom/Other', description: 'Something else' }
      ]
    },
    {
      id: 'purpose',
      question: 'What will this component be used for?',
      type: 'text',
      placeholder: 'e.g., "Allow users to submit contact forms", "Display product information", "Navigate between pages"'
    },
    {
      id: 'visualStyle',
      question: 'What visual style are you looking for?',
      type: 'multiselect',
      options: [
        { value: 'modern', label: 'Modern', description: 'Clean, contemporary design' },
        { value: 'minimal', label: 'Minimal', description: 'Simple, uncluttered appearance' },
        { value: 'colorful', label: 'Colorful', description: 'Vibrant colors and gradients' },
        { value: 'professional', label: 'Professional', description: 'Business-appropriate styling' },
        { value: 'playful', label: 'Playful', description: 'Fun, creative appearance' },
        { value: 'elegant', label: 'Elegant', description: 'Sophisticated and refined' }
      ]
    },
    {
      id: 'interactions',
      question: 'What interactions should it have?',
      type: 'multiselect',
      options: [
        { value: 'hover', label: 'Hover Effects', description: 'Changes on mouse over' },
        { value: 'click', label: 'Click Actions', description: 'Responds to clicks' },
        { value: 'animation', label: 'Animations', description: 'Smooth transitions and movement' },
        { value: 'keyboard', label: 'Keyboard Navigation', description: 'Accessible via keyboard' },
        { value: 'drag', label: 'Drag & Drop', description: 'Can be dragged or receive drops' },
        { value: 'touch', label: 'Touch Gestures', description: 'Mobile-friendly interactions' }
      ]
    },
    {
      id: 'complexity',
      question: 'How complex should this component be?',
      type: 'range',
      min: 1,
      max: 5
    },
    {
      id: 'specificFeatures',
      question: 'Any specific features or requirements?',
      type: 'text',
      placeholder: 'e.g., "Include icons", "Support multiple sizes", "Work on mobile", "Have loading states"'
    }
  ];

  const handleStepResponse = (value: unknown) => {
    const step = steps[currentStep];
    setResponses(prev => ({ ...prev, [step.id]: value }));

    if (currentStep < steps.length - 1) {
      setCurrentStep(currentStep + 1);
    } else {
      // Generate the final prompt
      generateTechnicalPrompt({ ...responses, [step.id]: value });
    }
  };

  const generateTechnicalPrompt = (allResponses: Record<string, unknown>) => {
    let prompt = '';

    // Start with component type and purpose
    const componentType = allResponses.componentType;
    const purpose = allResponses.purpose;
    
    prompt += `Create a ${componentType} component that ${purpose}. `;

    // Add visual style requirements
    const visualStyles = Array.isArray(allResponses.visualStyle) ? allResponses.visualStyle : [];
    if (visualStyles.length > 0) {
      prompt += `The design should be ${visualStyles.join(', ')}. `;
    }

    // Add interaction requirements
    const interactions = Array.isArray(allResponses.interactions) ? allResponses.interactions : [];
    if (interactions.length > 0) {
      prompt += `Include these interactions: ${interactions.map((i: unknown) => {
        const option = steps.find(s => s.id === 'interactions')?.options?.find(o => o.value === i);
        return option?.description || String(i);
      }).join(', ')}. `;
    }

    // Add complexity guidance
    const complexity = allResponses.complexity;
    if (complexity) {
      const complexityMap = {
        1: 'Keep it very simple with basic functionality.',
        2: 'Make it simple but polished.',
        3: 'Include moderate complexity with good UX.',
        4: 'Add advanced features and sophisticated interactions.',
        5: 'Make it highly complex with many advanced features.'
      };
      prompt += complexityMap[complexity as keyof typeof complexityMap] + ' ';
    }

    // Add specific features
    const specificFeatures = typeof allResponses.specificFeatures === 'string' ? allResponses.specificFeatures : '';
    if (specificFeatures.trim()) {
      prompt += `Additional requirements: ${specificFeatures}. `;
    }

    // Add technical specifications
    prompt += `
    
Technical requirements:
- Use React with TypeScript
- Use Tailwind CSS for styling
- Make it responsive and accessible
- Include proper hover states and transitions
- Add translation support using t() function for all visible text
- Follow modern React patterns and best practices
- Include proper error handling where applicable`;

    setGeneratedPrompt(prompt);
  };

  const goBack = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  };

  const usePrompt = () => {
    onPromptGenerated(generatedPrompt);
    onClose();
  };

  const restart = () => {
    setCurrentStep(0);
    setResponses({});
    setGeneratedPrompt('');
  };

  if (generatedPrompt) {
    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
        <div className="bg-white dark:bg-gray-900 rounded-lg shadow-xl max-w-md sm:max-w-lg w-full max-h-[85vh] overflow-y-auto">
          <div className="p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
                🎯 Generated Technical Prompt
              </h2>
              <button
                onClick={onClose}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-4 mb-6">
              <div className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap">
                {generatedPrompt}
              </div>
            </div>

            <div className="flex space-x-3">
              <button
                onClick={usePrompt}
                className="flex-1 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors font-medium"
              >
                Use This Prompt
              </button>
              <button
                onClick={restart}
                className="px-4 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
              >
                Start Over
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const currentStepData = steps[currentStep];
  const progress = ((currentStep + 1) / steps.length) * 100;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-900 rounded-lg shadow-xl max-w-md sm:max-w-lg w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
              🧙‍♂️ Component Wizard
            </h2>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Progress bar */}
          <div className="mb-6">
            <div className="flex justify-between text-sm text-gray-600 dark:text-gray-400 mb-2">
              <span>Step {currentStep + 1} of {steps.length}</span>
              <span>{Math.round(progress)}%</span>
            </div>
            <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
              <div
                className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>

          {/* Question */}
          <div className="mb-6">
            <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-4">
              {currentStepData.question}
            </h3>

            {/* Input based on type */}
            {currentStepData.type === 'select' && (
              <div className="space-y-2">
                {currentStepData.options?.map((option) => (
                  <button
                    key={option.value}
                    onClick={() => handleStepResponse(option.value)}
                    className="w-full text-left p-3 border border-gray-200 dark:border-gray-600 rounded-lg hover:border-blue-500 dark:hover:border-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors"
                  >
                    <div className="font-medium text-gray-900 dark:text-white">
                      {option.label}
                    </div>
                    {option.description && (
                      <div className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                        {option.description}
                      </div>
                    )}
                  </button>
                ))}
              </div>
            )}

            {currentStepData.type === 'multiselect' && (
              <MultiSelectInput
                options={currentStepData.options || []}
                onSubmit={handleStepResponse}
                selectedValues={Array.isArray(responses[currentStepData.id]) ? responses[currentStepData.id] as string[] : []}
              />
            )}

            {currentStepData.type === 'text' && (
              <TextInput
                placeholder={currentStepData.placeholder}
                onSubmit={handleStepResponse}
                initialValue={typeof responses[currentStepData.id] === 'string' ? responses[currentStepData.id] as string : ''}
              />
            )}

            {currentStepData.type === 'range' && (
              <RangeInput
                min={currentStepData.min || 1}
                max={currentStepData.max || 5}
                onSubmit={handleStepResponse}
                initialValue={typeof responses[currentStepData.id] === 'number' ? responses[currentStepData.id] as number : 3}
              />
            )}
          </div>

          {/* Navigation */}
          <div className="flex justify-between">
            <button
              onClick={goBack}
              disabled={currentStep === 0}
              className="px-4 py-2 text-gray-600 dark:text-gray-400 disabled:opacity-50 hover:text-gray-800 dark:hover:text-gray-200 transition-colors disabled:cursor-not-allowed"
            >
              ← Back
            </button>
            <span className="text-sm text-gray-500 dark:text-gray-400">
              {currentStep < steps.length - 1 ? 'Select an option to continue' : 'Complete the final step'}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

// Helper components for different input types
function MultiSelectInput({ 
  options, 
  onSubmit, 
  selectedValues 
}: { 
  options: Array<{value: string; label: string; description?: string}>; 
  onSubmit: (values: string[]) => void;
  selectedValues: string[];
}) {
  const [selected, setSelected] = useState<string[]>(selectedValues);

  const toggleOption = (value: string) => {
    setSelected(prev => 
      prev.includes(value) 
        ? prev.filter(v => v !== value)
        : [...prev, value]
    );
  };

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        {options.map((option) => (
          <button
            key={option.value}
            onClick={() => toggleOption(option.value)}
            className={`w-full text-left p-3 border rounded-lg transition-colors ${
              selected.includes(option.value)
                ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                : 'border-gray-200 dark:border-gray-600 hover:border-blue-300 dark:hover:border-blue-500'
            }`}
          >
            <div className="flex items-center justify-between">
              <div>
                <div className="font-medium text-gray-900 dark:text-white">
                  {option.label}
                </div>
                {option.description && (
                  <div className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                    {option.description}
                  </div>
                )}
              </div>
              {selected.includes(option.value) && (
                <svg className="w-5 h-5 text-blue-600" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
              )}
            </div>
          </button>
        ))}
      </div>
      
      <button
        onClick={() => onSubmit(selected)}
        className="w-full bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors font-medium"
        disabled={selected.length === 0}
      >
        Continue ({selected.length} selected)
      </button>
    </div>
  );
}

function TextInput({ 
  placeholder, 
  onSubmit, 
  initialValue 
}: { 
  placeholder?: string; 
  onSubmit: (value: string) => void;
  initialValue: string;
}) {
  const [value, setValue] = useState(initialValue);

  const handleSubmit = () => {
    if (value.trim()) {
      onSubmit(value.trim());
    }
  };

  return (
    <div className="space-y-4">
      <textarea
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={placeholder}
        rows={3}
        className="w-full px-3 py-2 border border-gray-200 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-800 dark:text-white"
        onKeyDown={(e) => {
          if (e.key === 'Enter' && e.ctrlKey) {
            handleSubmit();
          }
        }}
      />
      <button
        onClick={handleSubmit}
        disabled={!value.trim()}
        className="w-full bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed"
      >
        Continue
      </button>
    </div>
  );
}

function RangeInput({ 
  min, 
  max, 
  onSubmit, 
  initialValue 
}: { 
  min: number; 
  max: number; 
  onSubmit: (value: number) => void;
  initialValue: number;
}) {
  const [value, setValue] = useState(initialValue);

  const labels = {
    1: 'Very Simple',
    2: 'Simple',
    3: 'Moderate',
    4: 'Complex',
    5: 'Very Complex'
  };

  return (
    <div className="space-y-4">
      <div className="px-2">
        <input
          type="range"
          min={min}
          max={max}
          value={value}
          onChange={(e) => setValue(parseInt(e.target.value))}
          className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer dark:bg-gray-700"
        />
        <div className="flex justify-between text-sm text-gray-600 dark:text-gray-400 mt-2">
          <span>Simple</span>
          <span className="font-medium text-gray-900 dark:text-white">
            {labels[value as keyof typeof labels]}
          </span>
          <span>Complex</span>
        </div>
      </div>
      
      <button
        onClick={() => onSubmit(value)}
        className="w-full bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors font-medium"
      >
        Continue
      </button>
    </div>
  );
}
