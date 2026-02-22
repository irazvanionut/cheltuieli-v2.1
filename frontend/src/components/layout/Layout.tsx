import React, { useState, useEffect, useMemo } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
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
  TrendingDown,
  Minus,
  Clock,
  Lightbulb,
  Star,
  Zap,
  BookUser,
  Building2,
} from 'lucide-react';
import { useAppStore, useIsAdmin, useIsSef } from '@/hooks/useAppStore';
import api from '@/services/api';
import type { PontajEmployee } from '@/types';
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

  const isOnApeluri = location.pathname.startsWith('/apeluri');
  const isOnPontaj = location.pathname.startsWith('/pontaj');

  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({
    cheltuieli: true,
    agenda: true,
    apeluri: true,
    pontaj: true,
    automatizari: true,
    recenzii: true,
    online: false,
  });

  // Banner apeluri ratate - dismissed per sesiune
  const [bannerDismissed, setBannerDismissed] = useState(false);

  // Ticker pentru elapsed time (actualizare la 30s)
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(interval);
  }, []);

  // Auto-expand groups when navigating there
  useEffect(() => {
    if (isOnApeluri && !expandedGroups.apeluri) {
      setExpandedGroups(prev => ({ ...prev, apeluri: true }));
    }
    if (isOnPontaj && !expandedGroups.pontaj) {
      setExpandedGroups(prev => ({ ...prev, pontaj: true }));
    }
  }, [isOnApeluri, isOnPontaj]);

  // Fetch call count for sidebar badge + banner
  const { data: apeluriData } = useQuery({
    queryKey: ['apeluri-primite-count'],
    queryFn: () => api.getApeluriPrimite(),
    staleTime: 60000,
    refetchInterval: 180000,
  });

  // Fetch Google Reviews summary for top banner
  const { data: reviewsSummary } = useQuery({
    queryKey: ['google-reviews-summary'],
    queryFn: () => api.getGoogleReviewsSummary(),
    staleTime: 300_000,
    refetchInterval: 600_000,
  });

  // Fetch pontaj data for sidebar badge (uses same react-query cache as PontajPage)
  const { data: pontajData } = useQuery({
    queryKey: ['pontaj'],
    queryFn: () => api.getPontaj(),
    refetchInterval: 60000,
  });

  // Track filter changes from PontajPage via localStorage
  const [pontajFilterVer, setPontajFilterVer] = useState(0);
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === 'pontaj-filters') setPontajFilterVer(v => v + 1);
    };
    window.addEventListener('storage', onStorage);
    // Also poll for same-tab changes (storage event only fires cross-tab)
    const interval = setInterval(() => setPontajFilterVer(v => v + 1), 2000);
    return () => {
      window.removeEventListener('storage', onStorage);
      clearInterval(interval);
    };
  }, []);

  const pontajFilteredCount = useMemo(() => {
    if (!pontajData?.employees) return 0;
    try {
      const raw = localStorage.getItem('pontaj-filters');
      if (!raw) return pontajData.employees.length;
      const { positions, timeThreshold } = JSON.parse(raw) as { positions: string[]; timeThreshold: number };
      const posSet = new Set(positions);
      return pontajData.employees.filter((emp: PontajEmployee) => {
        if (posSet.size > 0 && !posSet.has(emp.position)) return false;
        if (emp.clocked_in_at) {
          const hour = parseInt(emp.clocked_in_at.split(':')[0], 10);
          if (!isNaN(hour) && hour < (timeThreshold ?? 10)) return false;
        }
        return true;
      }).length;
    } catch {
      return pontajData.employees.length;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pontajData?.employees, pontajFilterVer]);

  const ALWAYS_EXPANDED = new Set(['automatizari']);
  const toggleGroup = (key: string) => {
    if (ALWAYS_EXPANDED.has(key)) return;
    setExpandedGroups((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const navGroups = [
    {
      key: 'cheltuieli',
      label: 'Cheltuieli V2',
      icon: Wallet,
      items: [
        { name: 'Dashboard', href: '/', icon: LayoutDashboard, show: true, badge: null, badgeApeluri: null },
        { name: 'Cheltuieli', href: '/cheltuieli', icon: Receipt, show: true, badge: null, badgeApeluri: null },
        { name: 'Rapoarte', href: '/rapoarte', icon: FileText, show: isSef, badge: null, badgeApeluri: null },
        { name: 'Setări', href: '/settings', icon: Settings, show: isAdmin, badge: null, badgeApeluri: null },
      ],
    },
    {
      key: 'agenda',
      label: 'Agenda',
      icon: BookUser,
      items: [
        { name: 'Furnizori', href: '/agenda', icon: Building2, show: true, badge: null, badgeApeluri: null },
      ],
    },
    {
      key: 'apeluri',
      label: 'Apeluri',
      icon: Phone,
      items: [
        { name: 'Apeluri Azi', href: '/apeluri/primite', icon: PhoneIncoming, show: true, badge: null, badgeApeluri: apeluriData?.summary || null },
        { name: 'Recomandari Apeluri', href: '/apeluri/recomandari', icon: Lightbulb, show: true, badge: null, badgeApeluri: null },
        { name: 'Statistici & Trend', href: '/apeluri/trend', icon: TrendingUp, show: true, badge: null, badgeApeluri: null },
      ],
    },
    {
      key: 'pontaj',
      label: 'Pontaj',
      icon: Clock,
      items: [
        { name: 'Prezenta Azi', href: '/pontaj', icon: Clock, show: true, badge: pontajFilteredCount, badgeApeluri: null },
      ],
    },
    {
      key: 'recenzii',
      label: 'Recenzii',
      icon: Star,
      items: [
        { name: 'Review Google', href: '/online/review-google', icon: Star, show: true, badge: null, badgeApeluri: null },
      ],
    },
    {
      key: 'automatizari',
      label: 'Automatizări',
      icon: Zap,
      items: [
        { name: 'Automatizări', href: '/automatizari', icon: Zap, show: true, badge: null, badgeApeluri: null },
        { name: 'Scene', href: '/automatizari/scene', icon: Lightbulb, show: true, badge: null, badgeApeluri: null },
      ],
    },
    {
      key: 'online',
      label: 'Online',
      icon: Globe,
      items: [
        { name: 'Comenzi', href: '/online/comenzi', icon: ShoppingCart, show: true, badge: null, badgeApeluri: null },
        { name: 'Statistici', href: '/online/statistici', icon: TrendingUp, show: true, badge: null, badgeApeluri: null },
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
          'flex flex-col',
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
            if (visibleItems.length === 0) return null;
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
                  {!ALWAYS_EXPANDED.has(group.key) && (
                    isExpanded
                      ? <ChevronDown className="w-4 h-4 text-stone-400" />
                      : <ChevronRight className="w-4 h-4 text-stone-400" />
                  )}
                </button>

                {/* Group items */}
                {isExpanded && (
                  <div className="ml-3 mt-0.5 space-y-0.5">
                    {visibleItems.map((item) => {
                      const isActive = item.href === '/'
                        ? location.pathname === item.href
                        : location.pathname.startsWith(item.href);
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
                          <span className="flex-1">{item.name}</span>
                          {item.badge != null && item.badge > 0 && (
                            <span className="text-xs bg-stone-200 dark:bg-stone-700 text-stone-600 dark:text-stone-300 px-1.5 py-0.5 rounded-full font-mono">
                              {item.badge}
                            </span>
                          )}
                          {item.badgeApeluri && (
                            <span className="flex items-center gap-1">
                              {item.badgeApeluri.COMPLETAT > 0 && (
                                <span className="text-xs bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 px-1.5 py-0.5 rounded-full font-mono">
                                  {item.badgeApeluri.COMPLETAT}
                                </span>
                              )}
                              {(item.badgeApeluri.ABANDONAT > 0 || item.badgeApeluri.NEPRELUATE > 0) && (
                                <span className="text-xs bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 px-1.5 py-0.5 rounded-full font-mono">
                                  {(item.badgeApeluri.ABANDONAT || 0) + (item.badgeApeluri.NEPRELUATE || 0)}
                                </span>
                              )}
                            </span>
                          )}
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
          <p className="text-center text-[10px] text-stone-300 dark:text-stone-700 mt-2 select-none">v2.0</p>
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
         {/* Bannere sticky */}
        <div className="sticky top-14 lg:top-0 z-30">

         {/* Banner rating Google */}
         {reviewsSummary?.count_overall != null && reviewsSummary.count_overall > 0 && (() => {
           const t = reviewsSummary.trend_30d;
           const bannerCls = t !== null && t < 0
             ? 'bg-red-50 dark:bg-red-950/30 border-b border-red-200 dark:border-red-900/40 hover:bg-red-100 dark:hover:bg-red-950/50'
             : t !== null && t > 0
             ? 'bg-emerald-50 dark:bg-emerald-950/30 border-b border-emerald-200 dark:border-emerald-900/40 hover:bg-emerald-100 dark:hover:bg-emerald-950/50'
             : 'bg-amber-50 dark:bg-amber-950/30 border-b border-amber-200 dark:border-amber-900/40 hover:bg-amber-100 dark:hover:bg-amber-950/50';
           return (
           <Link
             to="/online/review-google"
             className={`${bannerCls} px-[17px] py-[7px] flex items-center gap-3 flex-wrap text-[13px] text-stone-700 dark:text-stone-300 transition-colors`}
           >
             <Star className="w-[15px] h-[15px] text-amber-500 fill-amber-400 flex-shrink-0" />
             <span className="flex items-center gap-1">
               <span className="text-stone-400">Rating Google:</span>
               <span className="font-bold text-stone-900 dark:text-stone-100">{reviewsSummary.avg_overall}</span>
               <span className="text-stone-400">({reviewsSummary.count_overall})</span>
               {reviewsSummary.avg_today !== null && (
                 <>
                   <span className="text-stone-300 dark:text-stone-600 mx-0.5">·</span>
                   <span className="text-stone-400">azi:</span>
                   <span className="font-semibold text-stone-800 dark:text-stone-200">{reviewsSummary.avg_today}</span>
                   <span className="text-stone-400">({reviewsSummary.count_today})</span>
                 </>
               )}
             </span>

             {reviewsSummary.avg_as_of_60d !== null && reviewsSummary.trend_60d !== null && (
               <>
                 <span className="text-stone-300 dark:text-stone-600">·</span>
                 <span className="flex items-center gap-1">
                   <span className="text-stone-400">vs acum 60 zile ({reviewsSummary.avg_as_of_60d}):</span>
                   {reviewsSummary.trend_60d > 0 ? (
                     <span className="flex items-center gap-0.5 text-emerald-600 dark:text-emerald-400 font-semibold">
                       <TrendingUp className="w-3.5 h-3.5" />+{reviewsSummary.trend_60d}
                     </span>
                   ) : reviewsSummary.trend_60d < 0 ? (
                     <span className="flex items-center gap-0.5 text-red-500 dark:text-red-400 font-semibold">
                       <TrendingDown className="w-3.5 h-3.5" />{reviewsSummary.trend_60d}
                     </span>
                   ) : (
                     <Minus className="w-3.5 h-3.5 text-stone-400" />
                   )}
                 </span>
               </>
             )}

             {reviewsSummary.avg_as_of_30d !== null && reviewsSummary.trend_30d !== null && (
               <>
                 <span className="text-stone-300 dark:text-stone-600">·</span>
                 <span className="flex items-center gap-1">
                   <span className="text-stone-400">vs acum 30 zile ({reviewsSummary.avg_as_of_30d}):</span>
                   {reviewsSummary.trend_30d > 0 ? (
                     <span className="flex items-center gap-0.5 text-emerald-600 dark:text-emerald-400 font-semibold">
                       <TrendingUp className="w-3.5 h-3.5" />+{reviewsSummary.trend_30d}
                     </span>
                   ) : reviewsSummary.trend_30d < 0 ? (
                     <span className="flex items-center gap-0.5 text-red-500 dark:text-red-400 font-semibold">
                       <TrendingDown className="w-3.5 h-3.5" />{reviewsSummary.trend_30d}
                     </span>
                   ) : (
                     <Minus className="w-3.5 h-3.5 text-stone-400" />
                   )}
                 </span>
               </>
             )}
           </Link>
           );
         })()}

         {/* Banner apeluri */}
         {!bannerDismissed && apeluriData?.stats && (apeluriData.total ?? 0) > 0 && (() => {
           const missed = (apeluriData.summary?.ABANDONAT ?? 0) + (apeluriData.summary?.NEPRELUATE ?? 0);
           const hasMissed = missed > 0;
           const stats = apeluriData.stats;
           const fmtSec = (s: number) => s < 60 ? `${s}s` : `${Math.floor(s / 60)}m${s % 60 > 0 ? `${s % 60}s` : ''}`;
           const lastCallOra = apeluriData.calls?.[0]?.ora as string | undefined;
           const fmtElapsed = (ora: string) => {
             const [h, m, s] = ora.split(':').map(Number);
             const callDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), h, m, s);
             const diffMin = Math.floor((now.getTime() - callDate.getTime()) / 60000);
             return `${diffMin}m`;
           };
           return (
             <div className={`px-4 py-1.5 flex items-center justify-between gap-4 border-b transition-colors ${hasMissed ? 'bg-orange-50 dark:bg-orange-950/20 border-orange-200 dark:border-orange-900/30' : 'bg-stone-50 dark:bg-stone-900/50 border-stone-200 dark:border-stone-800'}`}>
               <Link
                 to="/apeluri/primite"
                 className="flex items-center gap-3 text-xs font-medium flex-1 flex-wrap hover:opacity-80 transition-opacity"
               >
                 <span className={`flex items-center gap-1.5 ${hasMissed ? 'text-orange-600 dark:text-orange-400' : 'text-stone-500 dark:text-stone-400'}`}>
                   <PhoneCall className="w-3.5 h-3.5 flex-shrink-0" />
                   <span>Apeluri azi:</span>
                   <span className="font-bold text-stone-800 dark:text-stone-200">{apeluriData.total}</span>
                 </span>
                 {hasMissed && (
                   <span className="flex items-center gap-1 text-orange-600 dark:text-orange-400">
                     <span>ratate:</span>
                     <span className="font-bold">{missed}</span>
                   </span>
                 )}
                 <span className="text-stone-300 dark:text-stone-600">·</span>
                 <span className="flex items-center gap-1 text-stone-500 dark:text-stone-400">
                   <span>răspuns:</span>
                   <span className="font-semibold text-stone-700 dark:text-stone-300">{stats.answer_rate}%</span>
                 </span>
                 <span className="text-stone-300 dark:text-stone-600">·</span>
                 <span className="flex items-center gap-1 text-stone-500 dark:text-stone-400">
                   <span>timp răsp:</span>
                   <span className="font-semibold text-stone-700 dark:text-stone-300">{fmtSec(stats.asa)}</span>
                 </span>
                 <span className="text-stone-300 dark:text-stone-600">·</span>
                 <span className="flex items-center gap-1 text-stone-500 dark:text-stone-400">
                   <span>conv medie:</span>
                   <span className="font-semibold text-stone-700 dark:text-stone-300">{fmtSec(stats.call_duration?.avg ?? 0)}</span>
                 </span>
                 <span className="text-stone-300 dark:text-stone-600">·</span>
                 <span className="flex items-center gap-1 text-stone-500 dark:text-stone-400">
                   <span>așteptat &gt;30s:</span>
                   <span className="font-semibold text-stone-700 dark:text-stone-300">{stats.waited_over_30}</span>
                 </span>
                 {lastCallOra && (
                   <>
                     <span className="text-stone-300 dark:text-stone-600">·</span>
                     <span className="flex items-center gap-1 text-stone-500 dark:text-stone-400">
                       <Clock className="w-3 h-3 flex-shrink-0" />
                       <span>ultim apel:</span>
                       <span className="font-semibold text-stone-700 dark:text-stone-300">{fmtElapsed(lastCallOra)}</span>
                     </span>
                   </>
                 )}
               </Link>
               <button
                 onClick={() => setBannerDismissed(true)}
                 className="text-stone-400 hover:text-stone-600 dark:hover:text-stone-300 transition-colors flex-shrink-0"
                 title="Închide"
               >
                 <X className="w-4 h-4" />
               </button>
             </div>
           );
         })()}

        </div>{/* end sticky banners */}
         <div className="p-4 lg:p-6">{children}</div>
       </main>

       {/* AI Chat Widget */}
       <AIChat />
     </div>
   );
 };
