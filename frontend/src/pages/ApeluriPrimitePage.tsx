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

interface ApeluriResponse {
  summary: Record<string, number>;
  calls: ApelPrimit[];
  total: number;
  data: string;
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

export const ApeluriPrimitePage: React.FC = () => {
  const [showPhones, setShowPhones] = useState(true);
  const [expandedStatus, setExpandedStatus] = useState<string | null>(null);

  const { data, isLoading, refetch, isFetching } = useQuery<ApeluriResponse>({
    queryKey: ['apeluri-primite'],
    queryFn: () => api.getApeluriPrimite(),
    staleTime: 0,
    refetchOnMount: 'always',
  });

  const toggleStatus = (status: string) => {
    setExpandedStatus(expandedStatus === status ? null : status);
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
            {showPhones ? 'Ascunde nr.' : 'Arată nr.'}
          </Button>
          <Button
            variant="secondary"
            onClick={() => refetch()}
            icon={<RefreshCw className={clsx('w-4 h-4', isFetching && 'animate-spin')} />}
          >
            Actualizează
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
            title="Nu există apeluri"
            description="Nu au fost înregistrate apeluri pentru ziua curentă."
          />
        </Card>
      ) : (
        <div className="space-y-4">
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
                              <th className="px-4 py-2 text-left text-xs font-semibold text-stone-500 uppercase tracking-wider">Coadă</th>
                              <th className="px-4 py-2 text-left text-xs font-semibold text-stone-500 uppercase tracking-wider">Agent</th>
                              <th className="px-4 py-2 text-right text-xs font-semibold text-stone-500 uppercase tracking-wider">
                                <Clock className="w-3.5 h-3.5 inline mr-1" />
                                Așteptare
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
