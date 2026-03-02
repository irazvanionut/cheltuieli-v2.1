import React from 'react';
import {
  LayoutDashboard, Receipt, FileText, Settings, BookUser, Building2,
  PhoneIncoming, PhoneCall, Lightbulb, TrendingUp, Truck, MapPin,
  Navigation, Clock, Star, Zap, BarChart2, BarChartHorizontal,
  ChevronRight, Wallet,
} from 'lucide-react';

interface HubCard {
  title: string;
  description: string;
  icon: React.ElementType;
  href: string;
  color: string;
  bg: string;
  newTab?: boolean;
}

interface HubSection {
  label: string;
  cards: HubCard[];
}

const sections: HubSection[] = [
  {
    label: 'Cheltuieli',
    cards: [
      {
        title: 'Dashboard',
        description: 'Prezentare generală exercițiu curent',
        icon: LayoutDashboard,
        href: '/',
        color: 'text-blue-600 dark:text-blue-400',
        bg: 'bg-blue-50 dark:bg-blue-950/40',
      },
      {
        title: 'Cheltuieli',
        description: 'Înregistrare cheltuieli, alimentări, transferuri',
        icon: Receipt,
        href: '/cheltuieli',
        color: 'text-emerald-600 dark:text-emerald-400',
        bg: 'bg-emerald-50 dark:bg-emerald-950/40',
      },
      {
        title: 'Rapoarte',
        description: 'Rapoarte zilnice, solduri, exporturi CSV/Excel',
        icon: FileText,
        href: '/rapoarte',
        color: 'text-violet-600 dark:text-violet-400',
        bg: 'bg-violet-50 dark:bg-violet-950/40',
      },
      {
        title: 'Setări',
        description: 'Configurare sistem, utilizatori, API keys',
        icon: Settings,
        href: '/settings',
        color: 'text-stone-600 dark:text-stone-400',
        bg: 'bg-stone-100 dark:bg-stone-800/50',
      },
    ],
  },
  {
    label: 'Agenda',
    cards: [
      {
        title: 'Furnizori',
        description: 'Agenda furnizori, contacte, interacțiuni, contracte',
        icon: Building2,
        href: '/agenda',
        color: 'text-amber-600 dark:text-amber-400',
        bg: 'bg-amber-50 dark:bg-amber-950/40',
      },
    ],
  },
  {
    label: 'Apeluri & Comenzi',
    cards: [
      {
        title: 'Apeluri Azi',
        description: 'Apeluri primite și statistici zilnice',
        icon: PhoneIncoming,
        href: '/apeluri/primite',
        color: 'text-green-600 dark:text-green-400',
        bg: 'bg-green-50 dark:bg-green-950/40',
      },
      {
        title: 'Monitor Coadă',
        description: 'Live call queue — apeluri în așteptare',
        icon: PhoneCall,
        href: '/apeluri/lista',
        color: 'text-cyan-600 dark:text-cyan-400',
        bg: 'bg-cyan-50 dark:bg-cyan-950/40',
      },
      {
        title: 'Recomandări Apeluri',
        description: 'Clienți frecvenți, sugestii de apelat',
        icon: Lightbulb,
        href: '/apeluri/recomandari',
        color: 'text-yellow-600 dark:text-yellow-400',
        bg: 'bg-yellow-50 dark:bg-yellow-950/40',
      },
      {
        title: 'Statistici & Trend',
        description: 'Trend apeluri, grafice, analize temporale',
        icon: TrendingUp,
        href: '/apeluri/trend',
        color: 'text-indigo-600 dark:text-indigo-400',
        bg: 'bg-indigo-50 dark:bg-indigo-950/40',
      },
      {
        title: 'Comenzi Azi',
        description: 'Comenzi ERP din ziua curentă cu hartă',
        icon: Truck,
        href: '/apeluri/comenzi',
        color: 'text-orange-600 dark:text-orange-400',
        bg: 'bg-orange-50 dark:bg-orange-950/40',
      },
      {
        title: 'Monitorizare Flotă',
        description: 'Hartă vehicule și navigație',
        icon: MapPin,
        href: '/apeluri/navigatie',
        color: 'text-rose-600 dark:text-rose-400',
        bg: 'bg-rose-50 dark:bg-rose-950/40',
      },
      {
        title: 'Navigație GPS',
        description: 'Hartă GPS live cu comenzi și vehicule',
        icon: Navigation,
        href: '/apeluri/navigatie-gps',
        color: 'text-teal-600 dark:text-teal-400',
        bg: 'bg-teal-50 dark:bg-teal-950/40',
      },
      {
        title: 'Analiză Comenzi',
        description: 'Statistici comenzi ERP pe interval de date',
        icon: BarChartHorizontal,
        href: '/analiza-comenzi',
        color: 'text-purple-600 dark:text-purple-400',
        bg: 'bg-purple-50 dark:bg-purple-950/40',
      },
    ],
  },
  {
    label: 'Pontaj',
    cards: [
      {
        title: 'Prezență Azi',
        description: 'Pontaj angajați, ore intrare/ieșire',
        icon: Clock,
        href: '/pontaj',
        color: 'text-sky-600 dark:text-sky-400',
        bg: 'bg-sky-50 dark:bg-sky-950/40',
      },
    ],
  },
  {
    label: 'Recenzii & Online',
    cards: [
      {
        title: 'Review Google',
        description: 'Monitorizare și analiză recenzii Google',
        icon: Star,
        href: '/online/review-google',
        color: 'text-yellow-500 dark:text-yellow-400',
        bg: 'bg-yellow-50 dark:bg-yellow-950/40',
      },
      {
        title: 'Automatizări',
        description: 'Reguli și automatizări home assistant',
        icon: Zap,
        href: '/automatizari',
        color: 'text-lime-600 dark:text-lime-400',
        bg: 'bg-lime-50 dark:bg-lime-950/40',
      },
    ],
  },
  {
    label: 'Competitori',
    cards: [
      {
        title: 'Comparație Prețuri',
        description: 'Scraping competitori, comparare prețuri produse',
        icon: BarChart2,
        href: '/competitori',
        color: 'text-red-600 dark:text-red-400',
        bg: 'bg-red-50 dark:bg-red-950/40',
      },
    ],
  },
];

export const HubPage: React.FC = () => {
  const handleCardClick = (href: string) => {
    window.open(href, '_blank');
  };

  return (
    <div className="min-h-screen bg-stone-50 dark:bg-stone-950">
      {/* Header */}
      <div className="bg-gradient-to-br from-red-600 to-red-800 text-white py-10 px-6">
        <div className="max-w-6xl mx-auto flex items-center gap-4">
          <div className="w-14 h-14 rounded-2xl bg-white/20 flex items-center justify-center">
            <Wallet className="w-8 h-8 text-white" />
          </div>
          <div>
            <h1 className="text-3xl font-bold tracking-tight">La Nuci</h1>
            <p className="text-red-100 text-base mt-0.5">Management Daily — Hub Funcționalități</p>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-6xl mx-auto px-6 py-8 space-y-10">
        {sections.map((section) => (
          <div key={section.label}>
            <h2 className="text-sm font-semibold uppercase tracking-widest text-stone-400 dark:text-stone-500 mb-4">
              {section.label}
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {section.cards.map((card) => {
                const Icon = card.icon;
                return (
                  <button
                    key={card.href}
                    onClick={() => handleCardClick(card.href)}
                    className="group text-left p-5 rounded-2xl bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 hover:border-stone-300 dark:hover:border-stone-700 shadow-sm hover:shadow-md transition-all duration-150 flex flex-col gap-3"
                  >
                    <div className="flex items-start justify-between">
                      <div className={`w-11 h-11 rounded-xl ${card.bg} flex items-center justify-center`}>
                        <Icon className={`w-6 h-6 ${card.color}`} />
                      </div>
                      <ChevronRight className="w-4 h-4 text-stone-300 dark:text-stone-600 group-hover:text-stone-400 dark:group-hover:text-stone-500 mt-1 transition-colors" />
                    </div>
                    <div>
                      <p className="font-semibold text-stone-900 dark:text-stone-100 text-sm">{card.title}</p>
                      <p className="text-xs text-stone-500 dark:text-stone-400 mt-1 leading-relaxed">{card.description}</p>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      <div className="pb-12" />
    </div>
  );
};
