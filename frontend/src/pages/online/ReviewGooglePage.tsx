import React from 'react';
import { Construction, Star } from 'lucide-react';

export const ReviewGooglePage: React.FC = () => {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] space-y-6">
      <div className="relative">
        <div className="w-24 h-24 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
          <Construction className="w-12 h-12 text-amber-600 dark:text-amber-400 animate-pulse" />
        </div>
        <div className="absolute -top-2 -right-2 w-10 h-10 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
          <Star className="w-6 h-6 text-blue-600 dark:text-blue-400" />
        </div>
      </div>

      <div className="text-center space-y-2">
        <h1 className="text-3xl font-bold text-stone-900 dark:text-stone-100">
          Review Google
        </h1>
        <p className="text-lg text-stone-600 dark:text-stone-400">
          Pagină în lucru
        </p>
      </div>

      <div className="max-w-md text-center space-y-4">
        <div className="p-4 rounded-lg bg-stone-100 dark:bg-stone-800 border border-stone-200 dark:border-stone-700">
          <p className="text-sm text-stone-600 dark:text-stone-400 leading-relaxed">
            Lucrăm la integrarea cu Google Reviews pentru a afișa și gestiona recenziile dvs. Google Business.
          </p>
        </div>

        <div className="flex items-center justify-center gap-2 text-sm text-stone-500 dark:text-stone-500">
          <div className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
          <span>Dezvoltare în progres</span>
        </div>
      </div>
    </div>
  );
};
