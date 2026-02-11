import React, { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { clsx } from 'clsx';
import {
  LayoutDashboard,
  Receipt,
  FileText,
  Settings,
  LogOut,
  Menu,
  X,
  Wallet,
  Sun,
  Moon,
  Calendar,
  User,
  ChevronDown,
  ChevronRight,
  Phone,
  Globe,
  PhoneCall,
  PhoneIncoming,
  ShoppingCart,
  TrendingUp,
  MessageSquare,
} from 'lucide-react';
import { useAppStore, useIsAdmin, useIsSef } from '@/hooks/useAppStore';
import { Badge } from '@/components/ui';
import { AIChat } from '@/components/ai/AIChat';
import { format } from 'date-fns';
import { ro } from 'date-fns/locale';

interface LayoutProps {
  children: React.ReactNode;
}

export const Layout: React.FC<LayoutProps> = ({ children }) => {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, exercitiu, theme, setTheme, logout, sidebarOpen, toggleSidebar } = useAppStore();
  const isAdmin = useIsAdmin();
  const isSef = useIsSef();

  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({
    cheltuieli: true,
    apeluri: false,
    online: false,
  });

  const toggleGroup = (key: string) => {
    setExpandedGroups((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const navGroups = [
    {
      key: 'cheltuieli',
      label: 'Cheltuieli V2',
      icon: Wallet,
      items: [
        { name: 'Dashboard', href: '/', icon: LayoutDashboard, show: true },
        { name: 'Cheltuieli', href: '/cheltuieli', icon: Receipt, show: true },
        { name: 'Rapoarte', href: '/rapoarte', icon: FileText, show: isSef },
        { name: 'Setări', href: '/settings', icon: Settings, show: isAdmin },
      ],
    },
    {
      key: 'apeluri',
      label: 'Apeluri',
      icon: Phone,
      items: [
        { name: 'Apeluri primite', href: '/apeluri/primite', icon: PhoneIncoming, show: true },
        { name: 'Apeluri efectuate', href: '/apeluri/efectuate', icon: PhoneCall, show: true },
      ],
    },
    {
      key: 'online',
      label: 'Online',
      icon: Globe,
      items: [
        { name: 'Comenzi', href: '/online/comenzi', icon: ShoppingCart, show: true },
        { name: 'Statistici', href: '/online/statistici', icon: TrendingUp, show: true },
        { name: 'Recenzii', href: '/online/recenzii', icon: MessageSquare, show: true },
      ],
    },
  ];

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const toggleTheme = () => {
    setTheme(theme === 'dark' ? 'light' : 'dark');
  };

  return (
    <div className="min-h-screen bg-stone-50 dark:bg-stone-950">
      {/* Mobile header */}
      <header className="lg:hidden fixed top-0 left-0 right-0 z-40 bg-white dark:bg-stone-900 border-b border-stone-200 dark:border-stone-800">
        <div className="flex items-center justify-between px-4 h-14">
          <button
            onClick={toggleSidebar}
            className="p-2 -ml-2 text-stone-600 dark:text-stone-400"
          >
            {sidebarOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>
          
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-red-600 flex items-center justify-center">
              <Wallet className="w-5 h-5 text-white" />
            </div>
            <span className="font-semibold text-stone-900 dark:text-stone-100">
              La Nuci
            </span>
          </div>

          <button onClick={toggleTheme} className="p-2 -mr-2 text-stone-600 dark:text-stone-400">
            {theme === 'dark' ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
          </button>
        </div>
      </header>

      {/* Sidebar */}
      <aside
        className={clsx(
          'fixed inset-y-0 left-0 z-50 w-64 bg-white dark:bg-stone-900',
          'border-r border-stone-200 dark:border-stone-800',
          'transform transition-transform duration-200 ease-in-out',
          'lg:translate-x-0',
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        {/* Logo */}
        <div className="flex items-center gap-3 px-6 h-16 border-b border-stone-200 dark:border-stone-800">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-red-500 to-red-700 flex items-center justify-center shadow-lg shadow-red-500/20">
            <Wallet className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="font-bold text-stone-900 dark:text-stone-100">La Nuci</h1>
            <p className="text-xs text-stone-500">Management Daily</p>
          </div>
        </div>

        {/* Exercitiu info */}
        {exercitiu && (
          <div className="px-4 py-3 mx-3 mt-4 rounded-lg bg-stone-100 dark:bg-stone-800/50">
            <div className="flex items-center gap-2 text-sm">
              <Calendar className="w-4 h-4 text-stone-500" />
              <span className="text-stone-600 dark:text-stone-400">
                {format(new Date(exercitiu.data), 'dd MMMM yyyy', { locale: ro })}
              </span>
            </div>
            <div className="mt-1">
              {exercitiu.activ ? (
                <Badge variant="green">Deschis</Badge>
              ) : (
                <Badge variant="gray">Închis</Badge>
              )}
            </div>
          </div>
        )}

        {/* Navigation */}
        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          {navGroups.map((group) => {
            const isExpanded = expandedGroups[group.key];
            const visibleItems = group.items.filter((item) => item.show);
            const hasActiveItem = visibleItems.some((item) => location.pathname === item.href);

            return (
              <div key={group.key}>
                {/* Group header */}
                <button
                  onClick={() => toggleGroup(group.key)}
                  className={clsx(
                    'w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-semibold transition-colors',
                    hasActiveItem && !isExpanded
                      ? 'text-red-700 dark:text-red-400'
                      : 'text-stone-500 dark:text-stone-400',
                    'hover:bg-stone-100 dark:hover:bg-stone-800'
                  )}
                >
                  <group.icon className="w-4 h-4" />
                  <span className="flex-1 text-left">{group.label}</span>
                  {isExpanded ? (
                    <ChevronDown className="w-4 h-4 text-stone-400" />
                  ) : (
                    <ChevronRight className="w-4 h-4 text-stone-400" />
                  )}
                </button>

                {/* Group items */}
                {isExpanded && (
                  <div className="ml-3 mt-0.5 space-y-0.5">
                    {visibleItems.map((item) => {
                      const isActive = location.pathname === item.href;
                      return (
                        <Link
                          key={item.name}
                          to={item.href}
                          onClick={() => window.innerWidth < 1024 && toggleSidebar()}
                          className={clsx(
                            'flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors',
                            isActive
                              ? 'bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-400'
                              : 'text-stone-600 hover:bg-stone-100 dark:text-stone-400 dark:hover:bg-stone-800'
                          )}
                        >
                          <item.icon className="w-4 h-4" />
                          {item.name}
                        </Link>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </nav>

        {/* User info & logout */}
        <div className="border-t border-stone-200 dark:border-stone-800 p-4">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-full bg-stone-200 dark:bg-stone-700 flex items-center justify-center">
              <User className="w-5 h-5 text-stone-500 dark:text-stone-400" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-stone-900 dark:text-stone-100 truncate">
                {user?.nume_complet}
              </p>
              <p className="text-xs text-stone-500 capitalize">{user?.rol}</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={toggleTheme}
              className="flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-sm text-stone-600 hover:bg-stone-100 dark:text-stone-400 dark:hover:bg-stone-800"
            >
              {theme === 'dark' ? (
                <>
                  <Sun className="w-4 h-4" /> Light
                </>
              ) : (
                <>
                  <Moon className="w-4 h-4" /> Dark
                </>
              )}
            </button>
            <button
              onClick={handleLogout}
              className="flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-sm text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-900/20"
            >
              <LogOut className="w-4 h-4" /> Ieșire
            </button>
          </div>
          <p className="text-center text-[10px] text-stone-300 dark:text-stone-700 mt-2 select-none">v1.01</p>
        </div>
      </aside>

      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="lg:hidden fixed inset-0 z-40 bg-black/50"
          onClick={toggleSidebar}
        />
      )}

      {/* Main content */}
      <main
        className={clsx(
          'min-h-screen transition-all duration-200',
          'pt-14 lg:pt-0',
          'lg:ml-64'
        )}
       >
         <div className="p-4 lg:p-6">{children}</div>
       </main>

       {/* AI Chat Widget */}
       <AIChat />
     </div>
   );
 };
