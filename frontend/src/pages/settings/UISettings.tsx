import React from 'react';
import { Sun, Moon, Monitor, Palette } from 'lucide-react';
import { clsx } from 'clsx';

import { useAppStore } from '@/hooks/useAppStore';
import { Card } from '@/components/ui';
import type { Theme } from '@/types';

const THEME_OPTIONS: { value: Theme; label: string; icon: React.ReactNode; description: string }[] = [
  { 
    value: 'light', 
    label: 'Light', 
    icon: <Sun className="w-5 h-5" />,
    description: 'Tema luminoasă, ideală pentru utilizare în timpul zilei'
  },
  { 
    value: 'dark', 
    label: 'Dark', 
    icon: <Moon className="w-5 h-5" />,
    description: 'Tema întunecată, mai ușor pentru ochi noaptea'
  },
  { 
    value: 'auto', 
    label: 'Automat', 
    icon: <Monitor className="w-5 h-5" />,
    description: 'Urmărește setările sistemului de operare'
  },
];

export const UISettings: React.FC = () => {
  const { theme, setTheme } = useAppStore();

  return (
    <div>
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-xl font-bold text-stone-900 dark:text-stone-100">
          Interfață
        </h1>
        <p className="text-sm text-stone-500 mt-1">
          Personalizează aspectul aplicației
        </p>
      </div>

      {/* Theme Selection */}
      <Card>
        <h3 className="font-semibold text-stone-900 dark:text-stone-100 mb-4 flex items-center gap-2">
          <Palette className="w-5 h-5" />
          Tema culorilor
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {THEME_OPTIONS.map((option) => (
            <button
              key={option.value}
              onClick={() => setTheme(option.value)}
              className={clsx(
                'p-4 rounded-xl border-2 text-left transition-all',
                theme === option.value
                  ? 'border-red-500 bg-red-50 dark:bg-red-900/20'
                  : 'border-stone-200 dark:border-stone-700 hover:border-stone-300 dark:hover:border-stone-600'
              )}
            >
              <div className="flex items-center gap-3 mb-2">
                <div className={clsx(
                  'p-2 rounded-lg',
                  theme === option.value 
                    ? 'bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400'
                    : 'bg-stone-100 dark:bg-stone-800 text-stone-600 dark:text-stone-400'
                )}>
                  {option.icon}
                </div>
                <span className={clsx(
                  'font-medium',
                  theme === option.value
                    ? 'text-red-700 dark:text-red-400'
                    : 'text-stone-900 dark:text-stone-100'
                )}>
                  {option.label}
                </span>
              </div>
              <p className="text-sm text-stone-500">
                {option.description}
              </p>
            </button>
          ))}
        </div>
      </Card>

      {/* Preview */}
      <Card className="mt-6">
        <h3 className="font-semibold text-stone-900 dark:text-stone-100 mb-4">
          Previzualizare
        </h3>
        
        <div className="grid grid-cols-2 gap-4">
          {/* Light preview */}
          <div className="p-4 bg-white border border-stone-200 rounded-lg">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-8 h-8 rounded-lg bg-red-500" />
              <div className="flex-1">
                <div className="h-2 bg-stone-900 rounded w-20 mb-1" />
                <div className="h-2 bg-stone-400 rounded w-12" />
              </div>
            </div>
            <div className="space-y-2">
              <div className="h-2 bg-stone-200 rounded" />
              <div className="h-2 bg-stone-200 rounded w-3/4" />
            </div>
            <p className="text-xs text-stone-500 text-center mt-3">Light Mode</p>
          </div>

          {/* Dark preview */}
          <div className="p-4 bg-stone-900 border border-stone-700 rounded-lg">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-8 h-8 rounded-lg bg-red-500" />
              <div className="flex-1">
                <div className="h-2 bg-stone-100 rounded w-20 mb-1" />
                <div className="h-2 bg-stone-500 rounded w-12" />
              </div>
            </div>
            <div className="space-y-2">
              <div className="h-2 bg-stone-700 rounded" />
              <div className="h-2 bg-stone-700 rounded w-3/4" />
            </div>
            <p className="text-xs text-stone-500 text-center mt-3">Dark Mode</p>
          </div>
        </div>
      </Card>

      {/* Additional info */}
      <div className="mt-6 p-4 bg-stone-50 dark:bg-stone-800/50 rounded-lg">
        <p className="text-sm text-stone-600 dark:text-stone-400">
          <strong>💡 Sfat:</strong> Tema "Automat" va schimba automat între light și dark 
          în funcție de setările sistemului tău de operare. Este ideală dacă ai programat 
          modul întunecat să se activeze seara.
        </p>
      </div>
    </div>
  );
};
