'use client';

interface SideNavProps {
  currentPage: 'editor' | 'localization';
  onPageChange: (page: 'editor' | 'localization') => void;
}

export default function SideNav({ currentPage, onPageChange }: SideNavProps) {
  return (
    <nav className="w-64 h-screen fixed left-0 top-0 bg-white dark:bg-gray-900 border-r border-gray-200 dark:border-gray-700">
      <div className="h-full flex flex-col p-6">
        {/* Brand */}
        <div className="mb-8">
          <h1 className="text-xl font-semibold text-gray-900 dark:text-white">Component Creator</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Build React components with AI</p>
        </div>
        
        {/* Navigation */}
        <nav className="flex-1">
          <div className="space-y-2">
            <button
              onClick={() => onPageChange('editor')}
              className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left transition-colors ${
                currentPage === 'editor'
                  ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400'
                  : 'text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800'
              }`}
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
              </svg>
              <span className="font-medium">Editor</span>
            </button>
            
            <button
              onClick={() => onPageChange('localization')}
              className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left transition-colors ${
                currentPage === 'localization'
                  ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400'
                  : 'text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800'
              }`}
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5h12M9 3v2m1.048 9.5A18.022 18.022 0 016.412 9m6.088 9h7M11 21l5-10 5 10M12.751 5C11.783 10.77 8.07 15.61 3 18.129" />
              </svg>
              <span className="font-medium">Localization</span>
            </button>
          </div>
        </nav>
      </div>
    </nav>
  );
}