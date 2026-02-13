import React, { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import {
  PhoneIncoming,
  ChevronDown,
  ChevronRight,
  Save,
  Calendar,
} from 'lucide-react';
import { clsx } from 'clsx';
import { toast } from 'react-hot-toast';

import api from '@/services/api';
import { Card, Button, Input, Spinner, EmptyState } from '@/components/ui';

const formatDuration = (seconds: number): string => {
  if (seconds <= 0) return '-';
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
};

const STATUS_COLORS: Record<string, string> = {
  COMPLETAT: 'text-emerald-600 dark:text-emerald-400',
  ABANDONAT: 'text-red-600 dark:text-red-400',
  NEPRELUATE: 'text-amber-600 dark:text-amber-400',
  IN_CURS: 'text-blue-600 dark:text-blue-400',
};

export const IstoricApeluriSettings: React.FC = () => {
  const [dataStart, setDataStart] = useState('');
  const [dataEnd, setDataEnd] = useState('');
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const { data: istoric = [], isLoading, refetch } = useQuery({
    queryKey: ['apeluri-istoric', dataStart, dataEnd],
    queryFn: () => api.getApeluriIstoric({
      data_start: dataStart || undefined,
      data_end: dataEnd || undefined,
      limit: 60,
    }),
  });

  const { data: detaliiData, isLoading: isLoadingDetalii } = useQuery({
    queryKey: ['apeluri-istoric-detalii', expandedId],
    queryFn: () => api.getApeluriIstoricDetalii(expandedId!),
    enabled: !!expandedId,
  });

  const saveMutation = useMutation({
    mutationFn: () => api.salveazaApeluriManual(),
    onSuccess: () => {
      toast.success('Datele de azi au fost salvate');
      refetch();
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.detail || 'Eroare la salvare');
    },
  });

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-bold text-stone-900 dark:text-stone-100 flex items-center gap-2">
            <PhoneIncoming className="w-6 h-6 text-red-500" />
            Istoric Apeluri
          </h2>
          <p className="text-sm text-stone-500 mt-1">
            Sumarele zilnice salvate automat la 23:00
          </p>
        </div>
        <Button
          variant="primary"
          size="sm"
          onClick={() => saveMutation.mutate()}
          disabled={saveMutation.isPending}
          icon={<Save className="w-4 h-4" />}
        >
          {saveMutation.isPending ? 'Se salveaza...' : 'Salveaza azi'}
        </Button>
      </div>

      {/* Date filters */}
      <Card className="p-4 mb-4">
        <div className="flex items-center gap-4 flex-wrap">
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-stone-400" />
            <span className="text-sm text-stone-500">De la:</span>
            <Input
              type="date"
              value={dataStart}
              onChange={(e) => setDataStart(e.target.value)}
              className="w-40"
            />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm text-stone-500">Pana la:</span>
            <Input
              type="date"
              value={dataEnd}
              onChange={(e) => setDataEnd(e.target.value)}
              className="w-40"
            />
          </div>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => { setDataStart(''); setDataEnd(''); }}
          >
            Reseteaza
          </Button>
        </div>
      </Card>

      {isLoading ? (
        <Card className="p-8">
          <div className="flex justify-center"><Spinner size="lg" /></div>
        </Card>
      ) : istoric.length === 0 ? (
        <Card>
          <EmptyState
            icon={<PhoneIncoming className="w-12 h-12" />}
            title="Nu exista date salvate"
            description="Datele se salveaza automat la 23:00 sau manual cu butonul de mai sus."
          />
        </Card>
      ) : (
        <Card padding="none">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-stone-50 dark:bg-stone-800/50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-stone-500 uppercase w-8"></th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-stone-500 uppercase">Data</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-stone-500 uppercase">Total</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-stone-500 uppercase">Raspunse</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-stone-500 uppercase">Abandon</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-stone-500 uppercase">Rata rasp.</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-stone-500 uppercase">Rata aband.</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-stone-500 uppercase">ASA</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-stone-500 uppercase">Coada{'>'}30s</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100 dark:divide-stone-800">
                {istoric.map((row: any) => (
                  <React.Fragment key={row.id}>
                    <tr
                      className="hover:bg-stone-50 dark:hover:bg-stone-800/50 cursor-pointer transition-colors"
                      onClick={() => setExpandedId(expandedId === row.id ? null : row.id)}
                    >
                      <td className="px-4 py-2.5">
                        {expandedId === row.id ? (
                          <ChevronDown className="w-4 h-4 text-stone-400" />
                        ) : (
                          <ChevronRight className="w-4 h-4 text-stone-400" />
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-sm font-medium text-stone-900 dark:text-stone-100">
                        {new Date(row.data + 'T00:00:00').toLocaleDateString('ro-RO', { weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric' })}
                      </td>
                      <td className="px-4 py-2.5 text-sm text-right font-mono text-stone-700 dark:text-stone-300">{row.total}</td>
                      <td className="px-4 py-2.5 text-sm text-right font-mono text-emerald-600 dark:text-emerald-400">{row.answered}</td>
                      <td className="px-4 py-2.5 text-sm text-right font-mono text-red-600 dark:text-red-400">{row.abandoned}</td>
                      <td className="px-4 py-2.5 text-sm text-right">
                        <span className={clsx(
                          'font-mono',
                          row.answer_rate >= 90 ? 'text-emerald-600 dark:text-emerald-400' :
                          row.answer_rate >= 70 ? 'text-amber-600 dark:text-amber-400' :
                          'text-red-600 dark:text-red-400'
                        )}>
                          {row.answer_rate}%
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-sm text-right">
                        <span className={clsx(
                          'font-mono',
                          row.abandon_rate <= 10 ? 'text-emerald-600 dark:text-emerald-400' :
                          row.abandon_rate <= 20 ? 'text-amber-600 dark:text-amber-400' :
                          'text-red-600 dark:text-red-400'
                        )}>
                          {row.abandon_rate}%
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-sm text-right">
                        <span className={clsx(
                          'font-mono',
                          row.asa <= 15 ? 'text-emerald-600 dark:text-emerald-400' :
                          row.asa <= 30 ? 'text-amber-600 dark:text-amber-400' :
                          'text-red-600 dark:text-red-400'
                        )}>
                          {formatDuration(row.asa)}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-sm text-right font-mono text-stone-600 dark:text-stone-400">{row.waited_over_30}</td>
                    </tr>

                    {/* Expanded details */}
                    {expandedId === row.id && (
                      <tr>
                        <td colSpan={9} className="bg-stone-50/50 dark:bg-stone-800/30 px-4 py-4">
                          {isLoadingDetalii ? (
                            <div className="flex justify-center py-4"><Spinner /></div>
                          ) : detaliiData ? (
                            <div className="space-y-4">
                              {/* Summary stats */}
                              <div className="grid grid-cols-3 md:grid-cols-6 gap-3">
                                <div className="text-center">
                                  <div className="text-xs text-stone-500">Hold rasp. medie</div>
                                  <div className="font-mono text-sm">{formatDuration(detaliiData.hold_answered_avg)}</div>
                                </div>
                                <div className="text-center">
                                  <div className="text-xs text-stone-500">Hold rasp. P90</div>
                                  <div className="font-mono text-sm">{formatDuration(detaliiData.hold_answered_p90)}</div>
                                </div>
                                <div className="text-center">
                                  <div className="text-xs text-stone-500">Hold aband. medie</div>
                                  <div className="font-mono text-sm">{formatDuration(detaliiData.hold_abandoned_avg)}</div>
                                </div>
                                <div className="text-center">
                                  <div className="text-xs text-stone-500">Durata conv. medie</div>
                                  <div className="font-mono text-sm">{formatDuration(detaliiData.call_duration_avg)}</div>
                                </div>
                                <div className="text-center">
                                  <div className="text-xs text-stone-500">Durata conv. mediana</div>
                                  <div className="font-mono text-sm">{formatDuration(detaliiData.call_duration_median)}</div>
                                </div>
                                <div className="text-center">
                                  <div className="text-xs text-stone-500">Durata conv. P90</div>
                                  <div className="font-mono text-sm">{formatDuration(detaliiData.call_duration_p90)}</div>
                                </div>
                              </div>

                              {/* Hourly chart */}
                              {detaliiData.hourly_data && detaliiData.hourly_data.length > 0 && (
                                <div>
                                  <div className="text-xs font-semibold text-stone-500 mb-2 uppercase">Distributie pe ore</div>
                                  <div className="flex items-end gap-1" style={{ height: '60px' }}>
                                    {detaliiData.hourly_data.map((h: any) => {
                                      const maxH = Math.max(...detaliiData.hourly_data.map((x: any) => x.total), 1);
                                      const barH = Math.max((h.total / maxH) * 50, 2);
                                      return (
                                        <div key={h.hour} className="flex-1 flex flex-col items-center justify-end" title={`${h.label}: ${h.total} apeluri`}>
                                          <div className="w-full rounded-t bg-blue-400 dark:bg-blue-500" style={{ height: `${barH}px` }} />
                                          <span className="text-[8px] text-stone-400 mt-0.5">{h.hour}</span>
                                        </div>
                                      );
                                    })}
                                  </div>
                                </div>
                              )}

                              {/* Call list */}
                              {detaliiData.detalii && detaliiData.detalii.length > 0 && (
                                <div>
                                  <div className="text-xs font-semibold text-stone-500 mb-2 uppercase">
                                    Apeluri individuale ({detaliiData.detalii.length})
                                  </div>
                                  <div className="max-h-64 overflow-y-auto rounded border border-stone-200 dark:border-stone-700">
                                    <table className="w-full text-xs">
                                      <thead className="bg-stone-100 dark:bg-stone-800 sticky top-0">
                                        <tr>
                                          <th className="px-2 py-1.5 text-left text-stone-500">Ora</th>
                                          <th className="px-2 py-1.5 text-left text-stone-500">Telefon</th>
                                          <th className="px-2 py-1.5 text-left text-stone-500">Agent</th>
                                          <th className="px-2 py-1.5 text-left text-stone-500">Status</th>
                                          <th className="px-2 py-1.5 text-right text-stone-500">Coada</th>
                                          <th className="px-2 py-1.5 text-right text-stone-500">Conv.</th>
                                        </tr>
                                      </thead>
                                      <tbody className="divide-y divide-stone-100 dark:divide-stone-800">
                                        {detaliiData.detalii.map((d: any, i: number) => (
                                          <tr key={i} className="hover:bg-stone-50 dark:hover:bg-stone-800/50">
                                            <td className="px-2 py-1 font-mono text-stone-700 dark:text-stone-300">{d.ora}</td>
                                            <td className="px-2 py-1 font-mono text-stone-600 dark:text-stone-400">{d.caller_id || '-'}</td>
                                            <td className="px-2 py-1 text-stone-600 dark:text-stone-400">{d.agent || '-'}</td>
                                            <td className="px-2 py-1">
                                              <span className={STATUS_COLORS[d.status] || 'text-stone-500'}>
                                                {d.status}
                                              </span>
                                            </td>
                                            <td className="px-2 py-1 text-right font-mono text-stone-600 dark:text-stone-400">{formatDuration(d.hold_time)}</td>
                                            <td className="px-2 py-1 text-right font-mono text-stone-600 dark:text-stone-400">{formatDuration(d.call_time)}</td>
                                          </tr>
                                        ))}
                                      </tbody>
                                    </table>
                                  </div>
                                </div>
                              )}
                            </div>
                          ) : null}
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
};
