'use client';

import { useState } from 'react';
import SideNav from './components/SideNav';
import EnhancedEditor from './components/EnhancedEditor';
import LocalizationTable from './components/LocalizationTable';

// Error Boundary Component for LocalizationTable
function LocalizationErrorBoundary({ children }: { children: React.ReactNode }) {
  const [hasError, setHasError] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const handleError = (error: Error) => {
    console.error('[LocalizationErrorBoundary] Caught error:', error);
    setHasError(true);
    setError(error);
  };

  if (hasError) {
    return (
      <div className="p-8 h-full flex items-center justify-center">
        <div className="text-center max-w-md">
          <div className="mb-4 text-6xl">⚠️</div>
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
            Localization Table Error
          </h2>
          <p className="text-gray-600 dark:text-gray-400 mb-6">
            There was an error loading the localization table. This might be due to a database initialization issue.
          </p>
          <div className="space-y-3">
            <button
              onClick={() => {
                setHasError(false);
                setError(null);
                window.location.reload();
              }}
              className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              Reload Page
            </button>
            <button
              onClick={() => {
                setHasError(false);
                setError(null);
              }}
              className="w-full px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors"
            >
              Try Again
            </button>
          </div>
          {error && (
            <details className="mt-4 text-left">
              <summary className="cursor-pointer text-sm text-gray-500">Error Details</summary>
              <pre className="mt-2 text-xs bg-gray-100 p-2 rounded overflow-auto">
                {error.toString()}
              </pre>
            </details>
          )}
        </div>
      </div>
    );
  }

  try {
    return <>{children}</>;
  } catch (error) {
    handleError(error as Error);
    return null;
  }
}

export default function Home() {
  const [currentPage, setCurrentPage] = useState<'editor' | 'localization'>('editor');

  return (
    <div className="flex h-screen">
      <SideNav currentPage={currentPage} onPageChange={setCurrentPage} />
      
      <main className="flex-1 ml-64">
        {currentPage === 'editor' && <EnhancedEditor />}
        {currentPage === 'localization' && (
          <LocalizationErrorBoundary>
            <LocalizationTable />
          </LocalizationErrorBoundary>
        )}
      </main>
    </div>
  );
}
