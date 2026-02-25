import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { RefreshCw, Trash2, ScrollText, ChevronDown, ChevronRight } from 'lucide-react';
import toast from 'react-hot-toast';
import { clsx } from 'clsx';
import api from '@/services/api';
import type { SysLogEntry } from '@/types';

const NIVEL_BADGE: Record<string, string> = {
  ERROR: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  WARN:  'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
  INFO:  'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
};

function formatTs(ts: string): string {
  try {
    return new Date(ts).toLocaleString('ro-RO', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    });
  } catch {
    return ts;
  }
}

export const LogSettings: React.FC = () => {
  const qc = useQueryClient();
  const [sursa, setSursa] = useState('');
  const [nivel, setNivel] = useState('');
  const [expanded, setExpanded] = useState<Set<number>>(new Set());

  const { data: logs = [], isFetching, refetch } = useQuery<SysLogEntry[]>({
    queryKey: ['sys-log', sursa, nivel],
    queryFn: () => api.getSysLog({ sursa: sursa || undefined, nivel: nivel || undefined }),
    refetchInterval: 30_000,
  });

  const deleteMutation = useMutation({
    mutationFn: () => api.deleteOldSysLog(),
    onSuccess: (data) => {
      toast.success(`${data.deleted} înregistrări șterse`);
      qc.invalidateQueries({ queryKey: ['sys-log'] });
    },
    onError: () => toast.error('Eroare la ștergere'),
  });

  const toggleExpand = (id: number) => {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <ScrollText className="w-6 h-6 text-stone-500" />
          <div>
            <h1 className="text-xl font-bold text-stone-900 dark:text-stone-100">Log Sistem</h1>
            <p className="text-sm text-stone-500">Erori și evenimente din background loops</p>
          </div>
          {logs.length > 0 && (
            <span className="ml-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400">
              {logs.length}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => refetch()}
            disabled={isFetching}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg border border-stone-200 dark:border-stone-700 hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors disabled:opacity-50"
          >
            <RefreshCw className={clsx('w-4 h-4', isFetching && 'animate-spin')} />
            Refresh
          </button>
          <button
            onClick={() => deleteMutation.mutate()}
            disabled={deleteMutation.isPending}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg border border-red-200 text-red-600 hover:bg-red-50 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-900/20 transition-colors disabled:opacity-50"
          >
            <Trash2 className="w-4 h-4" />
            Șterge vechi (&gt;30 zile)
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <label className="text-sm text-stone-500">Sursă:</label>
          <select
            value={sursa}
            onChange={e => setSursa(e.target.value)}
            className="text-sm border border-stone-200 dark:border-stone-700 rounded-lg px-2 py-1.5 bg-white dark:bg-stone-900 text-stone-900 dark:text-stone-100"
          >
            <option value="">Toate</option>
            <option value="ami">ami</option>
            <option value="erp">erp</option>
            <option value="sistem">sistem</option>
          </select>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-sm text-stone-500">Nivel:</label>
          <select
            value={nivel}
            onChange={e => setNivel(e.target.value)}
            className="text-sm border border-stone-200 dark:border-stone-700 rounded-lg px-2 py-1.5 bg-white dark:bg-stone-900 text-stone-900 dark:text-stone-100"
          >
            <option value="">Toate</option>
            <option value="ERROR">ERROR</option>
            <option value="WARN">WARN</option>
            <option value="INFO">INFO</option>
          </select>
        </div>
      </div>

      {/* Table */}
      {logs.length === 0 ? (
        <div className="text-center py-16 text-stone-400 dark:text-stone-600">
          <ScrollText className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p className="text-lg font-medium">Nicio eroare înregistrată</p>
          <p className="text-sm mt-1">Sistemul funcționează fără probleme</p>
        </div>
      ) : (
        <div className="bg-white dark:bg-stone-900 rounded-xl border border-stone-200 dark:border-stone-800 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-stone-100 dark:border-stone-800 bg-stone-50 dark:bg-stone-950">
                <th className="text-left px-4 py-2.5 text-xs font-semibold uppercase tracking-wider text-stone-500 w-44">Timp</th>
                <th className="text-left px-3 py-2.5 text-xs font-semibold uppercase tracking-wider text-stone-500 w-20">Nivel</th>
                <th className="text-left px-3 py-2.5 text-xs font-semibold uppercase tracking-wider text-stone-500 w-20">Sursă</th>
                <th className="text-left px-3 py-2.5 text-xs font-semibold uppercase tracking-wider text-stone-500">Mesaj</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100 dark:divide-stone-800">
              {logs.map(entry => {
                const isExpanded = expanded.has(entry.id);
                return (
                  <React.Fragment key={entry.id}>
                    <tr
                      className={clsx(
                        'hover:bg-stone-50 dark:hover:bg-stone-800/50 transition-colors',
                        entry.detalii && 'cursor-pointer'
                      )}
                      onClick={() => entry.detalii && toggleExpand(entry.id)}
                    >
                      <td className="px-4 py-2.5 text-stone-500 whitespace-nowrap font-mono text-xs">
                        {formatTs(entry.ts)}
                      </td>
                      <td className="px-3 py-2.5">
                        <span className={clsx(
                          'inline-block px-2 py-0.5 rounded text-xs font-semibold',
                          NIVEL_BADGE[entry.nivel] ?? 'bg-stone-100 text-stone-600'
                        )}>
                          {entry.nivel}
                        </span>
                      </td>
                      <td className="px-3 py-2.5">
                        <span className="inline-block px-2 py-0.5 rounded text-xs bg-stone-100 text-stone-600 dark:bg-stone-800 dark:text-stone-400 font-mono">
                          {entry.sursa}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-stone-800 dark:text-stone-200">
                        <div className="flex items-center gap-1">
                          {entry.detalii && (
                            isExpanded
                              ? <ChevronDown className="w-3.5 h-3.5 text-stone-400 shrink-0" />
                              : <ChevronRight className="w-3.5 h-3.5 text-stone-400 shrink-0" />
                          )}
                          {entry.mesaj}
                        </div>
                      </td>
                    </tr>
                    {isExpanded && entry.detalii && (
                      <tr className="bg-stone-50 dark:bg-stone-900/50">
                        <td colSpan={4} className="px-4 py-3">
                          <pre className="text-xs text-stone-600 dark:text-stone-400 whitespace-pre-wrap font-mono bg-stone-100 dark:bg-stone-800 rounded p-3 overflow-auto max-h-48">
                            {entry.detalii}
                          </pre>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
