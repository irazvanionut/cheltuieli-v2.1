import React from 'react';
import { Routes, Route, Link, useLocation } from 'react-router-dom';
import { clsx } from 'clsx';
import {
  Wallet,
  FolderTree,
  Layers,
  BookOpen,
  Users,
  Bot,
  Palette,
  ChevronRight,
  ArrowLeft,
} from 'lucide-react';

// Import setting pages
import { PortofeleSettings } from './settings/PortofeleSettings';
import { CategoriiSettings } from './settings/CategoriiSettings';
import { GrupeSettings } from './settings/GrupeSettings';
import { NomenclatorSettings } from './settings/NomenclatorSettings';
import { UsersSettings } from './settings/UsersSettings';
import { OllamaSettings } from './settings/OllamaSettings';
import { UISettings } from './settings/UISettings';

const settingsMenu = [
  { path: '/settings/portofele', name: 'Portofele', icon: Wallet, description: 'Gestionare conturi numerar' },
  { path: '/settings/categorii', name: 'Categorii', icon: FolderTree, description: 'Categorii principale cheltuieli' },
  { path: '/settings/grupe', name: 'Grupe', icon: Layers, description: 'Subgrupări pentru categorii' },
  { path: '/settings/nomenclator', name: 'Nomenclator', icon: BookOpen, description: 'Furnizori, servicii, denumiri' },
  { path: '/settings/users', name: 'Utilizatori', icon: Users, description: 'Conturi și permisiuni' },
  { path: '/settings/ollama', name: 'Conexiune AI', icon: Bot, description: 'Configurare autocomplete AI' },
  { path: '/settings/ui', name: 'Interfață', icon: Palette, description: 'Temă și preferințe vizuale' },
];

// Index page - shows all settings options
const SettingsIndex: React.FC = () => {
  return (
    <div className="max-w-4xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-stone-900 dark:text-stone-100">⚙️ Setări</h1>
        <p className="text-stone-500 mt-1">Configurează aplicația după nevoile tale</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {settingsMenu.map((item) => (
          <Link
            key={item.path}
            to={item.path}
            className="flex items-center gap-4 p-4 bg-white dark:bg-stone-900 rounded-xl border border-stone-200 dark:border-stone-800 hover:border-red-300 dark:hover:border-red-700 hover:shadow-md transition-all group"
          >
            <div className="p-3 bg-stone-100 dark:bg-stone-800 rounded-xl group-hover:bg-red-100 dark:group-hover:bg-red-900/30 transition-colors">
              <item.icon className="w-6 h-6 text-stone-600 dark:text-stone-400 group-hover:text-red-600 dark:group-hover:text-red-400" />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="font-semibold text-stone-900 dark:text-stone-100">{item.name}</h3>
              <p className="text-sm text-stone-500 truncate">{item.description}</p>
            </div>
            <ChevronRight className="w-5 h-5 text-stone-400 group-hover:text-red-500 group-hover:translate-x-1 transition-all" />
          </Link>
        ))}
      </div>
    </div>
  );
};

// Sidebar for sub-pages
const SettingsSidebar: React.FC = () => {
  const location = useLocation();

  return (
    <div className="hidden lg:block w-56 shrink-0">
      <div className="sticky top-6">
        <Link
          to="/settings"
          className="flex items-center gap-2 text-sm text-stone-500 hover:text-stone-700 dark:hover:text-stone-300 mb-4"
        >
          <ArrowLeft className="w-4 h-4" />
          Înapoi la setări
        </Link>
        
        <nav className="space-y-1 bg-white dark:bg-stone-900 rounded-xl border border-stone-200 dark:border-stone-800 p-2">
          {settingsMenu.map((item) => {
            const isActive = location.pathname === item.path;
            return (
              <Link
                key={item.path}
                to={item.path}
                className={clsx(
                  'flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors',
                  isActive
                    ? 'bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-400 font-medium'
                    : 'text-stone-600 hover:bg-stone-100 dark:text-stone-400 dark:hover:bg-stone-800'
                )}
              >
                <item.icon className="w-4 h-4" />
                {item.name}
              </Link>
            );
          })}
        </nav>
      </div>
    </div>
  );
};

// Main settings page with routing
export const SettingsPage: React.FC = () => {
  const location = useLocation();
  const isIndex = location.pathname === '/settings';

  return (
    <div className="flex gap-8">
      {!isIndex && <SettingsSidebar />}
      <div className="flex-1 min-w-0">
        <Routes>
          <Route index element={<SettingsIndex />} />
          <Route path="portofele" element={<PortofeleSettings />} />
          <Route path="categorii" element={<CategoriiSettings />} />
          <Route path="grupe" element={<GrupeSettings />} />
          <Route path="nomenclator" element={<NomenclatorSettings />} />
          <Route path="users" element={<UsersSettings />} />
          <Route path="ollama" element={<OllamaSettings />} />
          <Route path="ui" element={<UISettings />} />
        </Routes>
      </div>
    </div>
  );
};
