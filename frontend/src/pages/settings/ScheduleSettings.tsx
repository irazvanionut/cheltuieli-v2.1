import React from 'react';
import {
  Clock,
  Calendar,
  Phone,
  Star,
  Brain,
  Users,
  RefreshCw,
  Moon,
  Building2,
  BarChart2,
} from 'lucide-react';

interface ScheduleEvent {
  label: string;
  description: string;
  category: 'sistem' | 'serp' | 'ai' | 'pontaj' | 'apeluri' | 'competitori';
  icon: React.ElementType;
}

interface HourSlot {
  hour: number;
  events: ScheduleEvent[];
  pontajInterval?: '15min' | '60min';
}

const CATEGORY_STYLES: Record<ScheduleEvent['category'], { bg: string; text: string; border: string; dot: string }> = {
  sistem: {
    bg: 'bg-red-50 dark:bg-red-900/20',
    text: 'text-red-700 dark:text-red-400',
    border: 'border-red-200 dark:border-red-800',
    dot: 'bg-red-500',
  },
  serp: {
    bg: 'bg-blue-50 dark:bg-blue-900/20',
    text: 'text-blue-700 dark:text-blue-400',
    border: 'border-blue-200 dark:border-blue-800',
    dot: 'bg-blue-500',
  },
  ai: {
    bg: 'bg-purple-50 dark:bg-purple-900/20',
    text: 'text-purple-700 dark:text-purple-400',
    border: 'border-purple-200 dark:border-purple-800',
    dot: 'bg-purple-500',
  },
  pontaj: {
    bg: 'bg-emerald-50 dark:bg-emerald-900/20',
    text: 'text-emerald-700 dark:text-emerald-400',
    border: 'border-emerald-200 dark:border-emerald-800',
    dot: 'bg-emerald-500',
  },
  apeluri: {
    bg: 'bg-amber-50 dark:bg-amber-900/20',
    text: 'text-amber-700 dark:text-amber-400',
    border: 'border-amber-200 dark:border-amber-800',
    dot: 'bg-amber-500',
  },
  competitori: {
    bg: 'bg-teal-50 dark:bg-teal-900/20',
    text: 'text-teal-700 dark:text-teal-400',
    border: 'border-teal-200 dark:border-teal-800',
    dot: 'bg-teal-500',
  },
};

const CATEGORY_LABELS: Record<ScheduleEvent['category'], string> = {
  sistem: 'Sistem',
  serp: 'Date externe (SERP)',
  ai: 'Analiză AI',
  pontaj: 'Pontaj',
  apeluri: 'Apeluri',
  competitori: 'Competitori',
};

// Weekly events: { weekday: 0-6 (0=Mon), hour, event }
interface WeeklyEvent {
  weekday: number;
  hour: number;
  event: ScheduleEvent;
}

const WEEKDAY_NAMES = ['Luni', 'Marți', 'Miercuri', 'Joi', 'Vineri', 'Sâmbătă', 'Duminică'];

const WEEKLY_EVENTS: WeeklyEvent[] = [
  {
    weekday: 0, // Luni
    hour: 3,
    event: {
      label: 'Scrape prețuri competitori',
      description:
        'Preia meniurile și prețurile de pe site-urile competitor configurate. Generează embeddings Ollama și detectează modificări de preț față de săptămâna precedentă.',
      category: 'competitori',
      icon: BarChart2,
    },
  },
];

// Build hour slots 0-23
function buildSlots(): HourSlot[] {
  const slots: HourSlot[] = Array.from({ length: 24 }, (_, h) => ({ hour: h, events: [] }));

  // 07:00 — închidere exercitiu
  slots[7].events.push({
    label: 'Închidere exercitiu',
    description: 'Închide ziua activă și deschide un exercitiu nou pentru ziua curentă.',
    category: 'sistem',
    icon: Calendar,
  });

  // 08:00 — sync cont SerpAPI
  slots[8].events.push({
    label: 'Sync cont SerpAPI',
    description: 'Preia statusul contului SerpAPI (credite rămase, utilizare lunară) pentru fiecare cheie configurată.',
    category: 'serp',
    icon: Star,
  });

  // 12:00 — analiză AI recenzii
  slots[12].events.push({
    label: 'Analiză AI recenzii Google',
    description: 'Rulează analiza AI (sentiment, teme) pe recenziile noi necalculate.',
    category: 'ai',
    icon: Brain,
  });

  // 14:00 — refresh SERP recenzii
  slots[14].events.push({
    label: 'Refresh recenzii Google',
    description: 'Preia recenzii noi de pe Google via SERP API și le salvează în baza de date.',
    category: 'serp',
    icon: Star,
  });

  // 21:00 — refresh + analiză recenzii
  slots[21].events.push({
    label: 'Refresh recenzii Google',
    description: 'Preia recenzii noi de pe Google via SERP API și le salvează în baza de date.',
    category: 'serp',
    icon: Star,
  });
  slots[21].events.push({
    label: 'Analiză AI recenzii Google',
    description: 'Rulează analiza AI (sentiment, teme) pe recenziile noi necalculate.',
    category: 'ai',
    icon: Brain,
  });

  // 23:00 — salvare apeluri
  slots[23].events.push({
    label: 'Salvare apeluri zilnic',
    description: 'Parsează queue_log și salvează statisticile zilei în istoricul apeluri.',
    category: 'apeluri',
    icon: Phone,
  });

  // Pontaj intervals
  for (let h = 5; h < 11; h++) {
    slots[h].pontajInterval = '15min';
  }
  for (let h = 11; h < 23; h++) {
    slots[h].pontajInterval = '60min';
  }

  return slots;
}

const SLOTS = buildSlots();

const FRONTEND_POLLS = [
  {
    label: 'Pontaj',
    interval: 'la fiecare 1 min',
    description: 'Reîncarcă lista angajaților prezenți (badge sidebar + PontajPage).',
    category: 'pontaj' as const,
    icon: Users,
  },
  {
    label: 'Apeluri azi — count',
    interval: 'la fiecare 2 min',
    description: 'Reîncarcă sumar apeluri pentru badge-ul din sidebar și banner-ul de sus.',
    category: 'apeluri' as const,
    icon: Phone,
  },
  {
    label: 'Recenzii Google — sumar',
    interval: 'la fiecare 10 min',
    description: 'Reîncarcă rating mediu și trend pentru banner-ul din header.',
    category: 'serp' as const,
    icon: Star,
  },
  {
    label: 'Furnizori ERP',
    interval: 'la 30 min (10:00–22:00)',
    description: 'Reîncarcă lista furnizori din ERP. Inactiv în afara intervalului 10–22.',
    category: 'serp' as const,
    icon: Building2,
  },
];

export const ScheduleSettings: React.FC = () => {
  const now = new Date();
  const currentHour = now.getHours();
  // 0=Sun in JS Date, convert to 0=Mon
  const currentWeekday = (now.getDay() + 6) % 7;

  return (
    <div className="max-w-3xl space-y-8">
      <div>
        <h2 className="text-xl font-bold text-stone-900 dark:text-stone-100">Programări automate</h2>
        <p className="text-sm text-stone-500 mt-1">
          Toate task-urile care rulează automat în fundal — server-side și frontend polling.
        </p>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-3">
        {(Object.keys(CATEGORY_STYLES) as ScheduleEvent['category'][]).map((cat) => {
          const s = CATEGORY_STYLES[cat];
          return (
            <span
              key={cat}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${s.bg} ${s.text} ${s.border}`}
            >
              <span className={`w-2 h-2 rounded-full ${s.dot}`} />
              {CATEGORY_LABELS[cat]}
            </span>
          );
        })}
      </div>

      {/* 24h Timeline */}
      <div>
        <h3 className="text-sm font-semibold text-stone-700 dark:text-stone-300 uppercase tracking-wide mb-3">
          Timeline 24h (server)
        </h3>
        <div className="bg-white dark:bg-stone-900 rounded-xl border border-stone-200 dark:border-stone-800 overflow-hidden">
          {SLOTS.map((slot) => {
            const isNow = slot.hour === currentHour;
            const hasContent = slot.events.length > 0 || slot.pontajInterval;
            const isSleep = slot.hour >= 23 || slot.hour < 5;

            return (
              <div
                key={slot.hour}
                className={`flex gap-3 px-4 py-2.5 border-b border-stone-100 dark:border-stone-800 last:border-0 transition-colors ${
                  isNow ? 'bg-red-50/60 dark:bg-red-900/10' : hasContent ? '' : 'opacity-50'
                }`}
              >
                {/* Hour */}
                <div className="w-12 shrink-0 flex items-start pt-0.5">
                  <span
                    className={`text-sm font-mono font-semibold tabular-nums ${
                      isNow
                        ? 'text-red-600 dark:text-red-400'
                        : hasContent
                        ? 'text-stone-700 dark:text-stone-300'
                        : 'text-stone-400 dark:text-stone-600'
                    }`}
                  >
                    {String(slot.hour).padStart(2, '0')}:00
                  </span>
                  {isNow && (
                    <span className="ml-1 mt-1.5 w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
                  )}
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0 flex flex-wrap gap-2 items-start py-0.5">
                  {isSleep && slot.hour >= 23 && slot.hour < 24 && (
                    <span className="flex items-center gap-1 text-xs text-stone-400 dark:text-stone-600 italic">
                      <Moon className="w-3 h-3" /> Pontaj inactiv (23:00–05:00)
                    </span>
                  )}

                  {slot.pontajInterval && (
                    <span
                      className={`flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium border ${CATEGORY_STYLES.pontaj.bg} ${CATEGORY_STYLES.pontaj.text} ${CATEGORY_STYLES.pontaj.border}`}
                    >
                      <Users className="w-3 h-3" />
                      Pontaj fetch &mdash;{' '}
                      <span className="font-mono">
                        {slot.pontajInterval === '15min' ? 'la 15 min' : 'la 60 min'}
                      </span>
                    </span>
                  )}

                  {slot.events.map((ev, idx) => {
                    const s = CATEGORY_STYLES[ev.category];
                    const Icon = ev.icon;
                    return (
                      <div
                        key={idx}
                        className={`flex items-start gap-2 px-2.5 py-1 rounded-lg border text-xs ${s.bg} ${s.border}`}
                      >
                        <Icon className={`w-3.5 h-3.5 mt-0.5 shrink-0 ${s.text}`} />
                        <div>
                          <span className={`font-semibold ${s.text}`}>{ev.label}</span>
                          <p className="text-stone-500 dark:text-stone-400 mt-0.5 leading-snug max-w-xs">
                            {ev.description}
                          </p>
                        </div>
                      </div>
                    );
                  })}

                  {!hasContent && !isSleep && (
                    <span className="text-xs text-stone-300 dark:text-stone-700">—</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Weekly schedule */}
      <div>
        <h3 className="text-sm font-semibold text-stone-700 dark:text-stone-300 uppercase tracking-wide mb-3">
          Programări săptămânale (server)
        </h3>
        <div className="bg-white dark:bg-stone-900 rounded-xl border border-stone-200 dark:border-stone-800 overflow-hidden">
          {WEEKDAY_NAMES.map((dayName, wd) => {
            const dayEvents = WEEKLY_EVENTS.filter((e) => e.weekday === wd);
            const isToday = wd === currentWeekday;
            return (
              <div
                key={wd}
                className={`flex gap-3 px-4 py-2.5 border-b border-stone-100 dark:border-stone-800 last:border-0 ${
                  isToday ? 'bg-red-50/60 dark:bg-red-900/10' : dayEvents.length === 0 ? 'opacity-40' : ''
                }`}
              >
                {/* Day label */}
                <div className="w-20 shrink-0 flex items-center gap-1.5">
                  <span
                    className={`text-sm font-semibold ${
                      isToday ? 'text-red-600 dark:text-red-400' : 'text-stone-600 dark:text-stone-400'
                    }`}
                  >
                    {dayName}
                  </span>
                  {isToday && (
                    <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
                  )}
                </div>

                {/* Events */}
                <div className="flex-1 flex flex-wrap gap-2 items-center py-0.5">
                  {dayEvents.length === 0 ? (
                    <span className="text-xs text-stone-300 dark:text-stone-700">—</span>
                  ) : (
                    dayEvents.map((we, idx) => {
                      const s = CATEGORY_STYLES[we.event.category];
                      const Icon = we.event.icon;
                      return (
                        <div
                          key={idx}
                          className={`flex items-start gap-2 px-2.5 py-1 rounded-lg border text-xs ${s.bg} ${s.border}`}
                        >
                          <Icon className={`w-3.5 h-3.5 mt-0.5 shrink-0 ${s.text}`} />
                          <div>
                            <span className={`font-semibold ${s.text}`}>
                              {String(we.hour).padStart(2, '0')}:00 — {we.event.label}
                            </span>
                            <p className="text-stone-500 dark:text-stone-400 mt-0.5 leading-snug max-w-sm">
                              {we.event.description}
                            </p>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Pontaj detail note */}
      <div className="rounded-xl border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-900/20 px-4 py-3 text-sm text-emerald-700 dark:text-emerald-400">
        <div className="flex items-start gap-2">
          <Users className="w-4 h-4 mt-0.5 shrink-0" />
          <div>
            <span className="font-semibold">Pontaj fetch loop:</span>{' '}
            <span>
              05:00–11:00 → la fiecare <strong>15 minute</strong> (program dimineața).{' '}
              11:00–23:00 → la fiecare <strong>60 minute</strong>.{' '}
              23:00–05:00 → <strong>inactiv</strong>, nicio cerere.
            </span>
          </div>
        </div>
      </div>

      {/* Frontend polling */}
      <div>
        <h3 className="text-sm font-semibold text-stone-700 dark:text-stone-300 uppercase tracking-wide mb-3">
          Polling frontend (per sesiune activă)
        </h3>
        <div className="bg-white dark:bg-stone-900 rounded-xl border border-stone-200 dark:border-stone-800 divide-y divide-stone-100 dark:divide-stone-800">
          {FRONTEND_POLLS.map((poll) => {
            const s = CATEGORY_STYLES[poll.category];
            const Icon = poll.icon;
            return (
              <div key={poll.label} className="flex items-center gap-4 px-4 py-3">
                <div className={`p-2 rounded-lg ${s.bg}`}>
                  <Icon className={`w-4 h-4 ${s.text}`} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-stone-900 dark:text-stone-100">{poll.label}</p>
                  <p className="text-xs text-stone-500 mt-0.5">{poll.description}</p>
                </div>
                <span
                  className={`shrink-0 flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-mono font-medium border ${s.bg} ${s.text} ${s.border}`}
                >
                  <RefreshCw className="w-3 h-3" />
                  {poll.interval}
                </span>
              </div>
            );
          })}
        </div>
        <p className="text-xs text-stone-400 mt-2">
          Polling-urile frontend rulează doar cât timp aplicația e deschisă în browser.
        </p>
      </div>

      {/* Current time indicator note */}
      <div className="flex items-center gap-2 text-xs text-stone-400 dark:text-stone-600">
        <Clock className="w-3.5 h-3.5" />
        <span>
          Ora curentă:{' '}
          <span className="font-mono text-red-500">
            {now.toLocaleTimeString('ro-RO', { hour: '2-digit', minute: '2-digit' })}
          </span>
          {' '}— ora activă este marcată în roșu în timeline.
        </span>
      </div>
    </div>
  );
};
