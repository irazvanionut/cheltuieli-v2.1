import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  TrendingUp,
  TrendingDown,
  Minus,
  Phone,
  Clock,
  Users,
  BarChart3,
  AlertTriangle,
  RefreshCw,
  ChevronDown,
  ChevronRight,
} from 'lucide-react';
import { clsx } from 'clsx';

import api from '@/services/api';
import { Card, Badge, Spinner, Button, EmptyState } from '@/components/ui';

const formatDuration = (seconds: number): string => {
  if (seconds <= 0) return '-';
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
};

const TREND_ICON: Record<string, React.ElementType> = {
  crestere: TrendingUp,
  scadere: TrendingDown,
  stabil: Minus,
};

const TREND_COLOR: Record<string, string> = {
  crestere: 'text-emerald-600 dark:text-emerald-400',
  scadere: 'text-red-600 dark:text-red-400',
  stabil: 'text-stone-500',
};

// ============================================
// COLLAPSIBLE SECTION
// ============================================
const Section: React.FC<{ title: string; icon: React.ElementType; children: React.ReactNode; defaultOpen?: boolean; badge?: string | number; description?: string }> = ({
  title, icon: Icon, children, defaultOpen = false, badge, description,
}) => {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <Card padding="none">
      <button onClick={() => setOpen(!open)} className="w-full flex items-center gap-3 px-4 py-3 hover:bg-stone-50 dark:hover:bg-stone-800/50 transition-colors">
        {open ? <ChevronDown className="w-4 h-4 text-stone-400" /> : <ChevronRight className="w-4 h-4 text-stone-400" />}
        <Icon className="w-4 h-4 text-stone-500" />
        <span className="text-sm font-semibold text-stone-900 dark:text-stone-100 flex-1 text-left">{title}</span>
        {badge != null && <Badge variant="gray">{badge}</Badge>}
      </button>
      {open && (
        <div className="border-t border-stone-200 dark:border-stone-800">
          {description && (
            <div className="px-4 py-2 text-xs text-stone-500 bg-stone-50 dark:bg-stone-800/30 border-b border-stone-100 dark:border-stone-800">
              {description}
            </div>
          )}
          {children}
        </div>
      )}
    </Card>
  );
};

// ============================================
// MAIN PAGE
// ============================================
export const ApeluriTrendPage: React.FC = () => {
  const [days, setDays] = useState<number | undefined>(90);

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ['apeluri-trend', days],
    queryFn: () => api.getApeluriTrend(days),
    staleTime: 5 * 60 * 1000,
    refetchOnMount: 'always' as const,
  });

  if (isLoading) {
    return (
      <div>
        <h1 className="text-2xl font-bold text-stone-900 dark:text-stone-100 mb-6 flex items-center gap-2">
          <TrendingUp className="w-7 h-7 text-red-500" />
          Statistici & Trend Apeluri
        </h1>
        <Card className="p-8"><div className="flex justify-center"><Spinner size="lg" /></div></Card>
      </div>
    );
  }

  if (!data || data.error) {
    return (
      <div>
        <h1 className="text-2xl font-bold text-stone-900 dark:text-stone-100 mb-6 flex items-center gap-2">
          <TrendingUp className="w-7 h-7 text-red-500" />
          Statistici & Trend Apeluri
        </h1>
        <Card><EmptyState icon={<Phone className="w-12 h-12" />} title="Nu exista date" description={data?.error || 'Master.csv nu a fost gasit.'} /></Card>
      </div>
    );
  }

  const s = data;
  const maxWeeklyTotal = Math.max(...(s.weekly || []).map((w: any) => w.total), 1);

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-stone-900 dark:text-stone-100 flex items-center gap-2">
            <TrendingUp className="w-7 h-7 text-red-500" />
            Statistici & Trend Apeluri
          </h1>
          <p className="text-stone-500 mt-1">
            {s.period.from} — {s.period.to} ({s.period.total_days} zile)
          </p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={days || ''}
            onChange={(e) => setDays(e.target.value ? Number(e.target.value) : undefined)}
            className="px-3 py-2 rounded-lg border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-900 text-sm"
          >
            <option value="30">Ultimele 30 zile</option>
            <option value="90">Ultimele 90 zile</option>
            <option value="180">Ultimele 6 luni</option>
            <option value="365">Ultimul an</option>
            <option value="">Tot istoricul</option>
          </select>
          <Button variant="secondary" onClick={() => refetch()} icon={<RefreshCw className={clsx('w-4 h-4', isFetching && 'animate-spin')} />}>
            Actualizeaza
          </Button>
        </div>
      </div>

      <div className="space-y-4">
        {/* KPI */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <Card className="p-4 text-center">
            <div className="text-2xl font-bold text-stone-900 dark:text-stone-100">{s.basic.total.toLocaleString()}</div>
            <div className="text-xs text-stone-500">Total apeluri</div>
            <div className="text-[10px] text-stone-400 mt-0.5">Apeluri intrate in coada „comenzi" in perioada selectata</div>
          </Card>
          <Card className="p-4 text-center">
            <div className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">{s.basic.answer_rate}%</div>
            <div className="text-xs text-stone-500">Rata raspuns ({s.basic.answered.toLocaleString()})</div>
            <div className="text-[10px] text-stone-400 mt-0.5">Procentul apelurilor preluate de un agent din totalul apelurilor</div>
          </Card>
          <Card className="p-4 text-center">
            <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">{s.basic.unique_numbers.toLocaleString()}</div>
            <div className="text-xs text-stone-500">Numere unice</div>
            <div className="text-[10px] text-stone-400 mt-0.5">Cate numere de telefon distincte au sunat in aceasta perioada</div>
          </Card>
          <Card className="p-4 text-center">
            <div className="text-2xl font-bold text-stone-900 dark:text-stone-100">{formatDuration(s.wait_time.avg)}</div>
            <div className="text-xs text-stone-500">Asteptare sistem*</div>
            <div className="text-[10px] text-stone-400 mt-0.5">*include IVR, nu doar coada</div>
          </Card>
          <Card className="p-4 text-center">
            <div className="text-2xl font-bold text-stone-900 dark:text-stone-100">{formatDuration(s.call_duration.avg)}</div>
            <div className="text-xs text-stone-500">Durata medie conv.</div>
            <div className="text-[10px] text-stone-400 mt-0.5">Timpul mediu de convorbire efectiva cu agentul (billsec)</div>
          </Card>
        </div>

        {/* Wait time stats */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card className="p-4 border-l-4 border-l-amber-400">
            <h4 className="text-sm font-semibold text-stone-900 dark:text-stone-100 mb-3 flex items-center gap-2">
              <Clock className="w-4 h-4 text-amber-500" />
              Timp in sistem pana la raspuns (CDR)
            </h4>
            <div className="text-[11px] text-amber-600 dark:text-amber-400 mb-3 p-2 rounded bg-amber-50 dark:bg-amber-900/20">
              <strong>Atentie:</strong> CDR-ul nu poate distinge intre timpul petrecut in IVR/robot si timpul in coada.
              Aceasta valoare (duration - billsec) include si IVR. Pentru timp exact in coada pana la agent, vezi pagina „Apeluri Azi" (sursa: queue_log).
            </div>
            <div className="space-y-1.5">
              {([
                ['Medie', s.wait_time.avg],
                ['Mediana (P50)', s.wait_time.p50],
                ['P75 (75% sub)', s.wait_time.p75],
                ['P90 (90% sub)', s.wait_time.p90],
                ['Max', s.wait_time.max],
              ] as [string, number][]).map(([label, val]) => (
                <div key={label} className="flex justify-between text-sm">
                  <span className="text-stone-500">{label}</span>
                  <span className="font-mono text-stone-900 dark:text-stone-100">{formatDuration(val)}</span>
                </div>
              ))}
            </div>
          </Card>
          <Card className="p-4">
            <h4 className="text-sm font-semibold text-stone-900 dark:text-stone-100 mb-3 flex items-center gap-2">
              <Phone className="w-4 h-4 text-stone-500" />
              Durata convorbire (billsec)
            </h4>
            <p className="text-[11px] text-stone-400 mb-3">Cat a durat convorbirea efectiva cu agentul, pentru apelurile raspunse. P90 = 90% din convorbiri au durat mai putin de aceasta valoare.</p>
            <div className="space-y-1.5">
              {([
                ['Medie', s.call_duration.avg],
                ['Mediana (P50)', s.call_duration.p50],
                ['P75 (75% sub)', s.call_duration.p75],
                ['P90 (90% sub)', s.call_duration.p90],
                ['Max', s.call_duration.max],
              ] as [string, number][]).map(([label, val]) => (
                <div key={label} className="flex justify-between text-sm">
                  <span className="text-stone-500">{label}</span>
                  <span className="font-mono text-stone-900 dark:text-stone-100">{formatDuration(val)}</span>
                </div>
              ))}
            </div>
          </Card>
        </div>

        {/* Frequency buckets */}
        <Card className="p-4">
          <h4 className="text-sm font-semibold text-stone-900 dark:text-stone-100 mb-3 flex items-center gap-2">
            <Users className="w-4 h-4 text-stone-500" />
            Frecventa apeluri per numar
          </h4>
          <p className="text-[11px] text-stone-400 mb-3">Cate numere de telefon au sunat o singura data, de 2-5 ori, de 6-10 ori, sau peste 10 ori in perioada selectata. Numerele cu {'>'}10 apeluri sunt clienti fideli sau furnizori frecventi.</p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {([
              ['1 apel', s.frequency_buckets.single, 'gray'],
              ['2-5 apeluri', s.frequency_buckets.from_2_to_5, 'blue'],
              ['6-10 apeluri', s.frequency_buckets.from_6_to_10, 'green'],
              ['>10 apeluri', s.frequency_buckets.over_10, 'red'],
            ] as [string, number, string][]).map(([label, count, variant]) => (
              <div key={label} className="text-center p-3 rounded-lg bg-stone-50 dark:bg-stone-800/50">
                <div className="text-xl font-bold text-stone-900 dark:text-stone-100">{count}</div>
                <div className="text-xs text-stone-500">{label}</div>
              </div>
            ))}
          </div>
        </Card>

        {/* Weekly trend chart */}
        {s.weekly && s.weekly.length > 0 && (
          <Card padding="none">
            <div className="px-4 pt-4 pb-2">
              <h4 className="text-sm font-semibold text-stone-900 dark:text-stone-100 flex items-center gap-2">
                <BarChart3 className="w-4 h-4 text-stone-500" />
                Trend saptamanal
              </h4>
              <p className="text-[10px] text-stone-400 mt-1">Numarul de apeluri pe saptamana. Verde = raspunse de agent, rosu = nepreluate/abandonate. Arata daca volumul de apeluri creste sau scade in timp.</p>
            </div>
            <div className="px-4 pb-3">
              <div className="flex items-end gap-px" style={{ height: '100px' }}>
                {s.weekly.map((w: any) => {
                  const barH = Math.max((w.total / maxWeeklyTotal) * 80, 2);
                  const answeredPct = w.total > 0 ? (w.answered / w.total) : 1;
                  return (
                    <div key={w.week} className="flex-1 flex flex-col items-center justify-end h-full" title={`${w.week}: ${w.total} apeluri, ${w.answer_rate}% raspuns`}>
                      <div className="w-full flex flex-col">
                        {(1 - answeredPct) > 0 && (
                          <div className="w-full bg-red-400 dark:bg-red-500" style={{ height: `${barH * (1 - answeredPct)}px` }} />
                        )}
                        <div className="w-full bg-emerald-400 dark:bg-emerald-500" style={{ height: `${barH * answeredPct}px` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="flex justify-between text-[9px] text-stone-400 mt-1">
                <span>{s.weekly[0]?.week}</span>
                <span>{s.weekly[s.weekly.length - 1]?.week}</span>
              </div>
            </div>
          </Card>
        )}

        {/* Wait time evolution */}
        {s.wait_evolution && s.wait_evolution.length > 0 && (
          <Card padding="none">
            <div className="px-4 pt-4 pb-2">
              <h4 className="text-sm font-semibold text-stone-900 dark:text-stone-100 flex items-center gap-2">
                <Clock className="w-4 h-4 text-stone-500" />
                Evolutie timp in sistem (saptamanal)
              </h4>
              <p className="text-[10px] text-stone-400 mt-1">Include IVR — nu reflecta doar timpul in coada pana la agent</p>
            </div>
            <div className="px-4 pb-3">
              {(() => {
                const maxWait = Math.max(...s.wait_evolution.map((w: any) => w.p90), 1);
                return (
                  <div className="flex items-end gap-px" style={{ height: '80px' }}>
                    {s.wait_evolution.map((w: any) => {
                      const avgH = Math.max((w.avg / maxWait) * 70, 1);
                      const p90H = Math.max((w.p90 / maxWait) * 70, 1);
                      return (
                        <div key={w.week} className="flex-1 flex flex-col items-center justify-end h-full" title={`${w.week}: avg=${formatDuration(w.avg)}, median=${formatDuration(w.median)}, p90=${formatDuration(w.p90)}`}>
                          <div className="w-full relative">
                            <div className="w-full bg-stone-200 dark:bg-stone-700 rounded-t" style={{ height: `${p90H}px` }} />
                            <div className="w-full bg-blue-400 dark:bg-blue-500 absolute bottom-0 rounded-t" style={{ height: `${avgH}px` }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              })()}
              <div className="flex justify-between text-[9px] text-stone-400 mt-1">
                <span>{s.wait_evolution[0]?.week}</span>
                <span>{s.wait_evolution[s.wait_evolution.length - 1]?.week}</span>
              </div>
              <div className="flex items-center gap-4 mt-1 text-xs text-stone-500">
                <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded bg-blue-400" /> Medie</span>
                <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded bg-stone-200 dark:bg-stone-700" /> P90</span>
              </div>
            </div>
          </Card>
        )}

        {/* Top 20 numbers */}
        <Section title="Top 20 numere" icon={Phone} badge={20} defaultOpen
          description="Cele mai active 20 de numere de telefon dupa numarul total de apeluri in perioada selectata. Include durata totala si medie a convorbirilor cu agentul, si intervalul de activitate (primul si ultimul apel)."
        >
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-stone-50 dark:bg-stone-800/50">
                <tr>
                  <th className="px-3 py-2 text-left text-xs font-semibold text-stone-500 uppercase">#</th>
                  <th className="px-3 py-2 text-left text-xs font-semibold text-stone-500 uppercase">Numar</th>
                  <th className="px-3 py-2 text-right text-xs font-semibold text-stone-500 uppercase">Apeluri</th>
                  <th className="px-3 py-2 text-right text-xs font-semibold text-stone-500 uppercase">Durata tot.</th>
                  <th className="px-3 py-2 text-right text-xs font-semibold text-stone-500 uppercase">Durata medie</th>
                  <th className="px-3 py-2 text-right text-xs font-semibold text-stone-500 uppercase">Astept. sistem*</th>
                  <th className="px-3 py-2 text-left text-xs font-semibold text-stone-500 uppercase">Perioada</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100 dark:divide-stone-800">
                {s.top20.map((n: any, i: number) => (
                  <tr key={n.src} className="hover:bg-stone-50 dark:hover:bg-stone-800/50">
                    <td className="px-3 py-1.5 text-sm text-stone-400">{i + 1}</td>
                    <td className="px-3 py-1.5 text-sm font-mono text-stone-900 dark:text-stone-100">{n.src}</td>
                    <td className="px-3 py-1.5 text-sm text-right font-mono font-semibold text-stone-900 dark:text-stone-100">{n.count}</td>
                    <td className="px-3 py-1.5 text-sm text-right font-mono text-stone-600 dark:text-stone-400">{formatDuration(n.total_duration)}</td>
                    <td className="px-3 py-1.5 text-sm text-right font-mono text-stone-600 dark:text-stone-400">{formatDuration(n.avg_duration)}</td>
                    <td className="px-3 py-1.5 text-sm text-right font-mono text-stone-600 dark:text-stone-400">{formatDuration(n.avg_wait)}</td>
                    <td className="px-3 py-1.5 text-xs text-stone-500">{n.first_call} — {n.last_call}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>

        {/* Top callers vs general wait */}
        <Section title="Top 10 clienti: timp sistem vs. media generala" icon={Clock} badge={`media: ${formatDuration(s.general_avg_wait)}`}
          description="Compara timpul mediu in sistem al celor mai activi 10 clienti cu media generala. Daca un client frecvent are un timp mult mai mare decat media, inseamna ca asteapta mai mult decat restul — posibil semn de nemultumire."
        >
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-stone-50 dark:bg-stone-800/50">
                <tr>
                  <th className="px-3 py-2 text-left text-xs font-semibold text-stone-500 uppercase">Numar</th>
                  <th className="px-3 py-2 text-right text-xs font-semibold text-stone-500 uppercase">Apeluri</th>
                  <th className="px-3 py-2 text-right text-xs font-semibold text-stone-500 uppercase">Timp sistem*</th>
                  <th className="px-3 py-2 text-right text-xs font-semibold text-stone-500 uppercase">Dif. vs. general</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100 dark:divide-stone-800">
                {s.top_callers_wait.map((n: any) => (
                  <tr key={n.src} className="hover:bg-stone-50 dark:hover:bg-stone-800/50">
                    <td className="px-3 py-1.5 text-sm font-mono text-stone-900 dark:text-stone-100">{n.src}</td>
                    <td className="px-3 py-1.5 text-sm text-right font-mono text-stone-600 dark:text-stone-400">{n.count}</td>
                    <td className="px-3 py-1.5 text-sm text-right font-mono text-stone-900 dark:text-stone-100">{formatDuration(n.avg_wait)}</td>
                    <td className={clsx('px-3 py-1.5 text-sm text-right font-mono', n.diff_vs_general > 5 ? 'text-red-600 dark:text-red-400' : n.diff_vs_general < -5 ? 'text-emerald-600 dark:text-emerald-400' : 'text-stone-500')}>
                      {n.diff_vs_general > 0 ? '+' : ''}{formatDuration(n.diff_vs_general)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>

        {/* Hourly distribution */}
        <Section title="Distributie pe ore" icon={BarChart3}
          description="Cate apeluri au intrat pe fiecare interval orar, cate au fost raspunse, si ce procent reprezinta. Ajuta la identificarea orelor de varf si a intervalelor cu rata mica de raspuns (posibil subacoperire de personal)."
        >
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-stone-50 dark:bg-stone-800/50">
                <tr>
                  <th className="px-3 py-2 text-left text-xs font-semibold text-stone-500 uppercase">Ora</th>
                  <th className="px-3 py-2 text-right text-xs font-semibold text-stone-500 uppercase">Total</th>
                  <th className="px-3 py-2 text-right text-xs font-semibold text-stone-500 uppercase">Raspunse</th>
                  <th className="px-3 py-2 text-right text-xs font-semibold text-stone-500 uppercase">Rata</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100 dark:divide-stone-800">
                {s.hourly.map((h: any) => (
                  <tr key={h.hour} className="hover:bg-stone-50 dark:hover:bg-stone-800/50">
                    <td className="px-3 py-1.5 text-sm font-mono text-stone-900 dark:text-stone-100">{h.label}</td>
                    <td className="px-3 py-1.5 text-sm text-right font-mono text-stone-700 dark:text-stone-300">{h.total}</td>
                    <td className="px-3 py-1.5 text-sm text-right font-mono text-emerald-600 dark:text-emerald-400">{h.answered}</td>
                    <td className="px-3 py-1.5 text-sm text-right font-mono">{h.answer_rate}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>

        {/* Trends: growing numbers */}
        <Section title="Numere in crestere" icon={TrendingUp} badge={s.trends.crestere.length}
          description="Numere de telefon care suna din ce in ce mai des de la o saptamana la alta (trend crescator). Doar numerele cu minim 5 apeluri in total sunt analizate. Cresterea se calculeaza prin regresie liniara pe apelurile saptamanale — daca panta depaseste +8% din medie, numarul e in crestere. Exemplu: un numar cu 3 apeluri/sapt. acum 2 luni si 8 apeluri/sapt. acum = trend de crestere."
        >
          {s.trends.crestere.length === 0 ? (
            <div className="p-4 text-sm text-stone-500">Nu au fost identificate numere cu trend de crestere.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-stone-50 dark:bg-stone-800/50">
                  <tr>
                    <th className="px-3 py-2 text-left text-xs font-semibold text-stone-500 uppercase">Numar</th>
                    <th className="px-3 py-2 text-right text-xs font-semibold text-stone-500 uppercase">Apeluri</th>
                    <th className="px-3 py-2 text-right text-xs font-semibold text-stone-500 uppercase">Astept. sistem*</th>
                    <th className="px-3 py-2 text-center text-xs font-semibold text-stone-500 uppercase">Trend</th>
                    <th className="px-3 py-2 text-left text-xs font-semibold text-stone-500 uppercase">Perioada</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100 dark:divide-stone-800">
                  {s.trends.crestere.map((n: any) => {
                    const TIcon = TREND_ICON[n.trend] || Minus;
                    return (
                      <tr key={n.src} className="hover:bg-stone-50 dark:hover:bg-stone-800/50">
                        <td className="px-3 py-1.5 text-sm font-mono text-stone-900 dark:text-stone-100">{n.src}</td>
                        <td className="px-3 py-1.5 text-sm text-right font-mono text-stone-700 dark:text-stone-300">{n.total_calls}</td>
                        <td className="px-3 py-1.5 text-sm text-right font-mono text-stone-600 dark:text-stone-400">{formatDuration(n.avg_wait)}</td>
                        <td className="px-3 py-1.5 text-center"><TIcon className={clsx('w-4 h-4 inline', TREND_COLOR[n.trend])} /></td>
                        <td className="px-3 py-1.5 text-xs text-stone-500">{n.first_call} — {n.last_call}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Section>

        {/* Trends: declining numbers */}
        <Section title="Numere in scadere" icon={TrendingDown} badge={s.trends.scadere.length}
          description="Numere de telefon care suna din ce in ce mai rar (trend descrescator). Calculat la fel ca cele in crestere, dar cu panta sub -8% din medie. Poate indica clienti care se indeparteaza sau furnizori cu care colaborarea scade. Exemplu: un numar care suna de 10 ori/sapt. in prima luna si doar 2 ori/sapt. in ultima luna."
        >
          {s.trends.scadere.length === 0 ? (
            <div className="p-4 text-sm text-stone-500">Nu au fost identificate numere cu trend de scadere.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-stone-50 dark:bg-stone-800/50">
                  <tr>
                    <th className="px-3 py-2 text-left text-xs font-semibold text-stone-500 uppercase">Numar</th>
                    <th className="px-3 py-2 text-right text-xs font-semibold text-stone-500 uppercase">Apeluri</th>
                    <th className="px-3 py-2 text-right text-xs font-semibold text-stone-500 uppercase">Astept. sistem*</th>
                    <th className="px-3 py-2 text-center text-xs font-semibold text-stone-500 uppercase">Trend</th>
                    <th className="px-3 py-2 text-left text-xs font-semibold text-stone-500 uppercase">Perioada</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100 dark:divide-stone-800">
                  {s.trends.scadere.map((n: any) => {
                    const TIcon = TREND_ICON[n.trend] || Minus;
                    return (
                      <tr key={n.src} className="hover:bg-stone-50 dark:hover:bg-stone-800/50">
                        <td className="px-3 py-1.5 text-sm font-mono text-stone-900 dark:text-stone-100">{n.src}</td>
                        <td className="px-3 py-1.5 text-sm text-right font-mono text-stone-700 dark:text-stone-300">{n.total_calls}</td>
                        <td className="px-3 py-1.5 text-sm text-right font-mono text-stone-600 dark:text-stone-400">{formatDuration(n.avg_wait)}</td>
                        <td className="px-3 py-1.5 text-center"><TIcon className={clsx('w-4 h-4 inline', TREND_COLOR[n.trend])} /></td>
                        <td className="px-3 py-1.5 text-xs text-stone-500">{n.first_call} — {n.last_call}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Section>

        {/* Churn risk */}
        <Section title="Risc pierdere clienti (churn)" icon={AlertTriangle} badge={s.trends.churn.length}
          description={'Numere care sunau frecvent in prima jumatate a perioadei (minim 3 apeluri) dar nu au mai sunat deloc in ultimele 4 saptamani. Poate insemna ca un client fidel a renuntat, a trecut la concurenta, sau pur si simplu nu mai are nevoie. „Apeluri inainte" = cate apeluri avea in prima parte, „Apeluri recent" = cate in ultimele 4 saptamani (0 = complet inactiv).'}
        >
          {s.trends.churn.length === 0 ? (
            <div className="p-4 text-sm text-stone-500">Nu au fost identificate numere cu risc de pierdere.</div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-stone-50 dark:bg-stone-800/50">
                    <tr>
                      <th className="px-3 py-2 text-left text-xs font-semibold text-stone-500 uppercase">Numar</th>
                      <th className="px-3 py-2 text-right text-xs font-semibold text-stone-500 uppercase">Apeluri inainte</th>
                      <th className="px-3 py-2 text-right text-xs font-semibold text-stone-500 uppercase">Apeluri recent</th>
                      <th className="px-3 py-2 text-right text-xs font-semibold text-stone-500 uppercase">Total apeluri</th>
                      <th className="px-3 py-2 text-right text-xs font-semibold text-stone-500 uppercase">Astept. sistem*</th>
                      <th className="px-3 py-2 text-left text-xs font-semibold text-stone-500 uppercase">Ultima activ.</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-100 dark:divide-stone-800">
                    {s.trends.churn.map((n: any) => (
                      <tr key={n.src} className="hover:bg-stone-50 dark:hover:bg-stone-800/50">
                        <td className="px-3 py-1.5 text-sm font-mono text-stone-900 dark:text-stone-100">{n.src}</td>
                        <td className="px-3 py-1.5 text-sm text-right font-mono text-stone-700 dark:text-stone-300">{n.old_calls}</td>
                        <td className="px-3 py-1.5 text-sm text-right font-mono text-red-600 dark:text-red-400">0</td>
                        <td className="px-3 py-1.5 text-sm text-right font-mono text-stone-600 dark:text-stone-400">{n.total_calls}</td>
                        <td className="px-3 py-1.5 text-sm text-right font-mono text-stone-600 dark:text-stone-400">{formatDuration(n.avg_wait)}</td>
                        <td className="px-3 py-1.5 text-xs text-stone-500">{n.last_call}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </Section>

        {/* Limitations */}
        <Card className="p-4 border-l-4 border-l-amber-400">
          <h4 className="text-sm font-semibold text-stone-700 dark:text-stone-300 mb-2">Limitari analiza & note</h4>
          <ul className="text-xs text-stone-500 space-y-1.5 list-disc list-inside">
            <li>
              <strong>* Timp sistem (CDR)</strong> = duration - billsec. CDR-ul Asterisk nu distinge intre IVR/robot si coada.
              Aceasta valoare include tot timpul pana la raspuns (inclusiv mesaje automate).
              <strong> Pentru timp real in coada pana la agent, vezi pagina „Apeluri Azi"</strong> (sursa: queue_log).
            </li>
            <li><strong>Trenduri</strong> = regresie liniara pe apeluri saptamanale (min. 5 apeluri, prag +/-8%)</li>
            <li><strong>Churn</strong> = numere active in prima jumatate a perioadei dar absente in ultimele 4 saptamani</li>
            <li>Datele provin din CDR Master.csv (sincronizat zilnic la 09:00)</li>
          </ul>
        </Card>
      </div>
    </div>
  );
};
