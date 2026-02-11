import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  PhoneIncoming,
  PhoneOff,
  PhoneMissed,
  Phone,
  Clock,
  ChevronDown,
  ChevronRight,
  RefreshCw,
  Eye,
  EyeOff,
  BarChart3,
  Timer,
  TrendingUp,
  AlertTriangle,
} from 'lucide-react';
import { clsx } from 'clsx';

import api from '@/services/api';
import { Card, Badge, Spinner, Button, EmptyState } from '@/components/ui';

interface ApelPrimit {
  callid: string;
  queue: string;
  caller_id: string;
  agent: string;
  status: string;
  ora: string;
  hold_time: number;
  call_time: number;
}

interface TimeStats {
  avg: number;
  median: number;
  p90: number;
  min: number;
  max: number;
}

interface HourlyData {
  hour: number;
  label: string;
  total: number;
  answered: number;
  abandoned: number;
  answer_rate: number;
  abandon_rate: number;
  asa: number;
}

interface Stats {
  total: number;
  answered: number;
  abandoned: number;
  answer_rate: number;
  abandon_rate: number;
  asa: number;
  hold_answered: TimeStats;
  hold_abandoned: TimeStats;
  call_duration: TimeStats;
  waited_over_30: number;
  hourly: HourlyData[];
}

interface ApeluriResponse {
  summary: Record<string, number>;
  calls: ApelPrimit[];
  total: number;
  data: string;
  stats: Stats;
}

const STATUS_CONFIG: Record<string, { label: string; color: string; badgeVariant: 'green' | 'red' | 'yellow' | 'blue' | 'gray'; icon: React.ElementType }> = {
  COMPLETAT: { label: 'Completat', color: 'text-emerald-600 dark:text-emerald-400', badgeVariant: 'green', icon: PhoneIncoming },
  ABANDONAT: { label: 'Abandonat', color: 'text-red-600 dark:text-red-400', badgeVariant: 'red', icon: PhoneOff },
  NEPRELUATE: { label: 'Nepreluate', color: 'text-amber-600 dark:text-amber-400', badgeVariant: 'yellow', icon: PhoneMissed },
  IN_CURS: { label: 'In curs', color: 'text-blue-600 dark:text-blue-400', badgeVariant: 'blue', icon: Phone },
};

const formatDuration = (seconds: number): string => {
  if (seconds <= 0) return '-';
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
};

// ============================================
// STATS SECTION
// ============================================

const StatsSection: React.FC<{ stats: Stats }> = ({ stats }) => {
  const maxHourlyTotal = Math.max(...stats.hourly.map(h => h.total), 1);

  return (
    <div className="space-y-4">
      {/* KPI row */}
      <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
        <Card className="p-4 text-center">
          <div className="text-2xl font-bold text-stone-900 dark:text-stone-100">{stats.total}</div>
          <div className="text-xs text-stone-500">Total apeluri</div>
        </Card>
        <Card className="p-4 text-center">
          <div className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">{stats.answer_rate}%</div>
          <div className="text-xs text-stone-500">Rata raspuns ({stats.answered})</div>
        </Card>
        <Card className="p-4 text-center">
          <div className="text-2xl font-bold text-red-600 dark:text-red-400">{stats.abandon_rate}%</div>
          <div className="text-xs text-stone-500">Rata abandon ({stats.abandoned})</div>
        </Card>
        <Card className="p-4 text-center">
          <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">{formatDuration(stats.asa)}</div>
          <div className="text-xs text-stone-500">ASA</div>
          <div className="text-[10px] text-stone-400 mt-0.5">Timp mediu de asteptare pana la raspuns</div>
        </Card>
        <Card className="p-4 text-center">
          <div className="text-2xl font-bold text-stone-900 dark:text-stone-100">{formatDuration(stats.call_duration.avg)}</div>
          <div className="text-xs text-stone-500">Durata medie conv.</div>
        </Card>
        <Card className="p-4 text-center">
          <div className="text-2xl font-bold text-amber-600 dark:text-amber-400">{stats.waited_over_30}</div>
          <div className="text-xs text-stone-500">Asteptare {'>'}30s</div>
          <div className="text-[10px] text-stone-400 mt-0.5">{stats.total > 0 ? Math.round(stats.waited_over_30 / stats.total * 100) : 0}% din total</div>
        </Card>
      </div>

      {/* Detailed time stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Hold time - answered */}
        <Card className="p-4">
          <h4 className="text-sm font-semibold text-stone-900 dark:text-stone-100 mb-3 flex items-center gap-2">
            <Timer className="w-4 h-4 text-emerald-500" />
            Asteptare (raspunse)
          </h4>
          <div className="space-y-2">
            {([
              ['Medie', stats.hold_answered.avg],
              ['Mediana', stats.hold_answered.median],
              ['P90 (90% sub)', stats.hold_answered.p90],
              ['Min', stats.hold_answered.min],
              ['Max', stats.hold_answered.max],
            ] as [string, number][]).map(([label, val]) => (
              <div key={label} className="flex justify-between text-sm">
                <span className="text-stone-500">{label}</span>
                <span className="font-mono text-stone-900 dark:text-stone-100">{formatDuration(val)}</span>
              </div>
            ))}
          </div>
        </Card>

        {/* Hold time - abandoned */}
        <Card className="p-4">
          <h4 className="text-sm font-semibold text-stone-900 dark:text-stone-100 mb-3 flex items-center gap-2">
            <Timer className="w-4 h-4 text-red-500" />
            Asteptare (abandonate)
          </h4>
          <div className="space-y-2">
            {([
              ['Medie', stats.hold_abandoned.avg],
              ['Mediana', stats.hold_abandoned.median],
              ['P90 (90% sub)', stats.hold_abandoned.p90],
              ['Min', stats.hold_abandoned.min],
              ['Max', stats.hold_abandoned.max],
            ] as [string, number][]).map(([label, val]) => (
              <div key={label} className="flex justify-between text-sm">
                <span className="text-stone-500">{label}</span>
                <span className="font-mono text-stone-900 dark:text-stone-100">{formatDuration(val)}</span>
              </div>
            ))}
          </div>
        </Card>

        {/* Call duration */}
        <Card className="p-4">
          <h4 className="text-sm font-semibold text-stone-900 dark:text-stone-100 mb-3 flex items-center gap-2">
            <Phone className="w-4 h-4 text-blue-500" />
            Durata convorbire
          </h4>
          <div className="space-y-2">
            {([
              ['Medie', stats.call_duration.avg],
              ['Mediana', stats.call_duration.median],
              ['P90 (90% sub)', stats.call_duration.p90],
              ['Min', stats.call_duration.min],
              ['Max', stats.call_duration.max],
            ] as [string, number][]).map(([label, val]) => (
              <div key={label} className="flex justify-between text-sm">
                <span className="text-stone-500">{label}</span>
                <span className="font-mono text-stone-900 dark:text-stone-100">{formatDuration(val)}</span>
              </div>
            ))}
          </div>
        </Card>
      </div>

      {/* Hourly distribution */}
      <Card padding="none">
        <div className="px-4 pt-4 pb-2">
          <h4 className="text-sm font-semibold text-stone-900 dark:text-stone-100 flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-stone-500" />
            Distributie pe ore
          </h4>
        </div>

        {/* Visual bar chart */}
        <div className="px-4 pb-3">
          <div className="flex items-end gap-1" style={{ height: '120px' }}>
            {stats.hourly.map((h) => {
              const barH = Math.max((h.total / maxHourlyTotal) * 100, 4);
              const answeredH = h.total > 0 ? (h.answered / h.total) * barH : 0;
              const abandonedH = barH - answeredH;
              return (
                <div key={h.hour} className="flex-1 flex flex-col items-center justify-end h-full" title={`${h.label}: ${h.total} apeluri, ${h.answer_rate}% raspuns, ASA ${formatDuration(h.asa)}`}>
                  <div className="text-[9px] text-stone-500 font-mono mb-0.5">{h.total}</div>
                  <div className="w-full flex flex-col">
                    {abandonedH > 0 && (
                      <div className="w-full rounded-t bg-red-400 dark:bg-red-500" style={{ height: `${abandonedH}px` }} />
                    )}
                    {answeredH > 0 && (
                      <div className={clsx('w-full bg-emerald-400 dark:bg-emerald-500', abandonedH <= 0 && 'rounded-t')} style={{ height: `${answeredH}px` }} />
                    )}
                  </div>
                  <span className="text-[9px] text-stone-400 mt-1">{h.hour}</span>
                </div>
              );
            })}
          </div>
          <div className="flex items-center gap-4 mt-2 text-xs text-stone-500">
            <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded bg-emerald-400" /> Raspunse</span>
            <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded bg-red-400" /> Abandonate</span>
          </div>
        </div>

        {/* Hourly table */}
        <div className="overflow-x-auto border-t border-stone-200 dark:border-stone-800">
          <table className="w-full">
            <thead className="bg-stone-50 dark:bg-stone-800/50">
              <tr>
                <th className="px-3 py-2 text-left text-xs font-semibold text-stone-500 uppercase">Ora</th>
                <th className="px-3 py-2 text-right text-xs font-semibold text-stone-500 uppercase">Total</th>
                <th className="px-3 py-2 text-right text-xs font-semibold text-stone-500 uppercase">Raspunse</th>
                <th className="px-3 py-2 text-right text-xs font-semibold text-stone-500 uppercase">Abandon</th>
                <th className="px-3 py-2 text-right text-xs font-semibold text-stone-500 uppercase">Rata rasp.</th>
                <th className="px-3 py-2 text-right text-xs font-semibold text-stone-500 uppercase">ASA</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100 dark:divide-stone-800">
              {stats.hourly.map((h) => (
                <tr key={h.hour} className="hover:bg-stone-50 dark:hover:bg-stone-800/50">
                  <td className="px-3 py-1.5 text-sm font-mono text-stone-900 dark:text-stone-100">{h.label}</td>
                  <td className="px-3 py-1.5 text-sm text-right font-mono text-stone-700 dark:text-stone-300">{h.total}</td>
                  <td className="px-3 py-1.5 text-sm text-right font-mono text-emerald-600 dark:text-emerald-400">{h.answered}</td>
                  <td className="px-3 py-1.5 text-sm text-right font-mono text-red-600 dark:text-red-400">{h.abandoned > 0 ? h.abandoned : '-'}</td>
                  <td className="px-3 py-1.5 text-sm text-right">
                    <span className={clsx(
                      'font-mono',
                      h.answer_rate >= 90 ? 'text-emerald-600 dark:text-emerald-400' :
                      h.answer_rate >= 70 ? 'text-amber-600 dark:text-amber-400' :
                      'text-red-600 dark:text-red-400'
                    )}>
                      {h.answer_rate}%
                    </span>
                  </td>
                  <td className="px-3 py-1.5 text-sm text-right">
                    <span className={clsx(
                      'font-mono',
                      h.asa <= 15 ? 'text-emerald-600 dark:text-emerald-400' :
                      h.asa <= 30 ? 'text-amber-600 dark:text-amber-400' :
                      'text-red-600 dark:text-red-400'
                    )}>
                      {formatDuration(h.asa)}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* ASA insights */}
      {stats.hourly.length > 0 && (() => {
        const worstHours = [...stats.hourly].filter(h => h.asa > 0).sort((a, b) => b.asa - a.asa).slice(0, 3);
        const bestHours = [...stats.hourly].filter(h => h.asa > 0).sort((a, b) => a.asa - b.asa).slice(0, 3);
        const highAbandon = stats.hourly.filter(h => h.abandon_rate > 0 && h.asa > stats.asa);

        return (
          <Card className="p-4">
            <h4 className="text-sm font-semibold text-stone-900 dark:text-stone-100 mb-3 flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-stone-500" />
              Analiza ASA
            </h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
              <div>
                <div className="text-stone-500 mb-1">Cele mai rapide intervale</div>
                {bestHours.map(h => (
                  <div key={h.hour} className="flex justify-between py-0.5">
                    <span className="text-stone-700 dark:text-stone-300">{h.label}</span>
                    <span className="font-mono text-emerald-600 dark:text-emerald-400">{formatDuration(h.asa)}</span>
                  </div>
                ))}
              </div>
              <div>
                <div className="text-stone-500 mb-1">Cele mai lente intervale</div>
                {worstHours.map(h => (
                  <div key={h.hour} className="flex justify-between py-0.5">
                    <span className="text-stone-700 dark:text-stone-300">{h.label}</span>
                    <span className="font-mono text-red-600 dark:text-red-400">{formatDuration(h.asa)}</span>
                  </div>
                ))}
              </div>
            </div>
            {highAbandon.length > 0 && (
              <div className="mt-3 p-2 rounded-lg bg-amber-50 dark:bg-amber-900/20 text-sm flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" />
                <span className="text-amber-700 dark:text-amber-400">
                  Abandon crescut la ore cu ASA mare: {highAbandon.map(h => `${h.label} (ASA ${formatDuration(h.asa)}, abandon ${h.abandon_rate}%)`).join(', ')}
                </span>
              </div>
            )}
          </Card>
        );
      })()}
    </div>
  );
};

// ============================================
// MAIN PAGE
// ============================================

export const ApeluriPrimitePage: React.FC = () => {
  const [showPhones, setShowPhones] = useState(true);
  const [expandedStatus, setExpandedStatus] = useState<string | null>(null);

  const { data, isLoading, refetch, isFetching } = useQuery<ApeluriResponse>({
    queryKey: ['apeluri-primite'],
    queryFn: () => api.getApeluriPrimite(),
    staleTime: 0,
    refetchOnMount: 'always',
    refetchInterval: 60000,
  });

  const toggleStatus = (status: string) => {
    setExpandedStatus(expandedStatus === status ? null : status);
    refetch();
  };

  const callsByStatus = (status: string) => {
    return (data?.calls || []).filter(c => c.status === status);
  };

  const summaryEntries = Object.entries(data?.summary || {}).sort(([a], [b]) => {
    const order = ['COMPLETAT', 'ABANDONAT', 'NEPRELUATE', 'IN_CURS'];
    return order.indexOf(a) - order.indexOf(b);
  });

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-stone-900 dark:text-stone-100 flex items-center gap-2">
            <PhoneIncoming className="w-7 h-7 text-red-500" />
            Apeluri primite
            {data && (
              <Badge variant="gray">{data.total}</Badge>
            )}
          </h1>
          <p className="text-stone-500 mt-1">
            Sumar apeluri din coada Asterisk
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setShowPhones(!showPhones)}
            icon={showPhones ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          >
            {showPhones ? 'Ascunde nr.' : 'Arata nr.'}
          </Button>
          <Button
            variant="secondary"
            onClick={() => refetch()}
            icon={<RefreshCw className={clsx('w-4 h-4', isFetching && 'animate-spin')} />}
          >
            Actualizeaza
          </Button>
        </div>
      </div>

      {isLoading ? (
        <Card className="p-8">
          <div className="flex justify-center">
            <Spinner size="lg" />
          </div>
        </Card>
      ) : !data || data.total === 0 ? (
        <Card>
          <EmptyState
            icon={<PhoneIncoming className="w-12 h-12" />}
            title="Nu exista apeluri"
            description="Nu au fost inregistrate apeluri pentru ziua curenta."
          />
        </Card>
      ) : (
        <div className="space-y-6">
          {/* Summary cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {summaryEntries.map(([status, count]) => {
              const config = STATUS_CONFIG[status] || { label: status, color: 'text-stone-600', badgeVariant: 'gray' as const, icon: Phone };
              const Icon = config.icon;
              return (
                <Card key={status} className="p-4">
                  <div className="flex items-center gap-3">
                    <div className={clsx(
                      'w-10 h-10 rounded-lg flex items-center justify-center',
                      status === 'COMPLETAT' && 'bg-emerald-100 dark:bg-emerald-900/30',
                      status === 'ABANDONAT' && 'bg-red-100 dark:bg-red-900/30',
                      status === 'NEPRELUATE' && 'bg-amber-100 dark:bg-amber-900/30',
                      status === 'IN_CURS' && 'bg-blue-100 dark:bg-blue-900/30',
                    )}>
                      <Icon className={clsx('w-5 h-5', config.color)} />
                    </div>
                    <div>
                      <div className="text-2xl font-bold text-stone-900 dark:text-stone-100">{count}</div>
                      <div className="text-xs text-stone-500">{config.label}</div>
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>

          {/* Statistics */}
          {data.stats && <StatsSection stats={data.stats} />}

          {/* Expandable status sections */}
          <div className="space-y-2">
            {summaryEntries.map(([status, count]) => {
              const config = STATUS_CONFIG[status] || { label: status, color: 'text-stone-600', badgeVariant: 'gray' as const, icon: Phone };
              const isExpanded = expandedStatus === status;
              const calls = callsByStatus(status);

              return (
                <Card key={status} padding="none">
                  {/* Section header */}
                  <button
                    onClick={() => toggleStatus(status)}
                    className="w-full flex items-center justify-between px-4 py-3 hover:bg-stone-50 dark:hover:bg-stone-800/50 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      {isExpanded ? (
                        <ChevronDown className="w-4 h-4 text-stone-400" />
                      ) : (
                        <ChevronRight className="w-4 h-4 text-stone-400" />
                      )}
                      <Badge variant={config.badgeVariant}>{config.label}</Badge>
                      <span className="text-sm text-stone-500">{count} apeluri</span>
                    </div>
                  </button>

                  {/* Expanded call list */}
                  {isExpanded && calls.length > 0 && (
                    <div className="border-t border-stone-200 dark:border-stone-800">
                      <div className="overflow-x-auto">
                        <table className="w-full">
                          <thead className="bg-stone-50 dark:bg-stone-800/50">
                            <tr>
                              <th className="px-4 py-2 text-left text-xs font-semibold text-stone-500 uppercase tracking-wider">Ora</th>
                              {showPhones && (
                                <th className="px-4 py-2 text-left text-xs font-semibold text-stone-500 uppercase tracking-wider">Telefon</th>
                              )}
                              <th className="px-4 py-2 text-left text-xs font-semibold text-stone-500 uppercase tracking-wider">Coada</th>
                              <th className="px-4 py-2 text-left text-xs font-semibold text-stone-500 uppercase tracking-wider">Agent</th>
                              <th className="px-4 py-2 text-right text-xs font-semibold text-stone-500 uppercase tracking-wider">
                                <Clock className="w-3.5 h-3.5 inline mr-1" />
                                Asteptare
                              </th>
                              <th className="px-4 py-2 text-right text-xs font-semibold text-stone-500 uppercase tracking-wider">
                                <Phone className="w-3.5 h-3.5 inline mr-1" />
                                Convorbire
                              </th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-stone-100 dark:divide-stone-800">
                            {calls.map((call) => (
                              <tr key={call.callid} className="hover:bg-stone-50 dark:hover:bg-stone-800/50 transition-colors">
                                <td className="px-4 py-2 text-sm font-mono text-stone-900 dark:text-stone-100">
                                  {call.ora}
                                </td>
                                {showPhones && (
                                  <td className="px-4 py-2 text-sm font-mono text-stone-700 dark:text-stone-300">
                                    {call.caller_id || '-'}
                                  </td>
                                )}
                                <td className="px-4 py-2 text-sm text-stone-600 dark:text-stone-400">
                                  {call.queue}
                                </td>
                                <td className="px-4 py-2 text-sm text-stone-600 dark:text-stone-400">
                                  {call.agent || '-'}
                                </td>
                                <td className="px-4 py-2 text-sm text-right font-mono text-stone-600 dark:text-stone-400">
                                  {formatDuration(call.hold_time)}
                                </td>
                                <td className="px-4 py-2 text-sm text-right font-mono text-stone-600 dark:text-stone-400">
                                  {formatDuration(call.call_time)}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </Card>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
