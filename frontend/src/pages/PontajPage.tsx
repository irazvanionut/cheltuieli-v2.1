import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Clock, RefreshCw, AlertTriangle, Users, Filter } from 'lucide-react';
import { clsx } from 'clsx';
import api from '@/services/api';
import type { PontajEmployee } from '@/types';

const STORAGE_KEY = 'pontaj-filters';

function loadFilters(): { positions: string[]; timeThreshold: number } {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        positions: Array.isArray(parsed.positions) ? parsed.positions : [],
        timeThreshold: typeof parsed.timeThreshold === 'number' ? parsed.timeThreshold : 10,
      };
    }
  } catch {}
  return { positions: [], timeThreshold: 10 };
}

function saveFilters(positions: string[], timeThreshold: number) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ positions, timeThreshold }));
}

export const PontajPage: React.FC = () => {
  const saved = loadFilters();
  const [selectedPositions, setSelectedPositions] = useState<Set<string>>(new Set(saved.positions));
  const [timeThreshold, setTimeThreshold] = useState(saved.timeThreshold);

  // Persist whenever filters change
  useEffect(() => {
    saveFilters(Array.from(selectedPositions), timeThreshold);
  }, [selectedPositions, timeThreshold]);

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ['pontaj'],
    queryFn: () => api.getPontaj(),
    refetchInterval: 60000,
  });

  const togglePosition = useCallback((pos: string) => {
    setSelectedPositions((prev) => {
      const next = new Set(prev);
      if (next.has(pos)) {
        next.delete(pos);
      } else {
        next.add(pos);
      }
      return next;
    });
  }, []);

  const selectAll = useCallback(() => {
    if (data?.positions) {
      setSelectedPositions(new Set(data.positions));
    }
  }, [data?.positions]);

  const clearAll = useCallback(() => {
    setSelectedPositions(new Set());
  }, []);

  const filteredEmployees = useMemo(() => {
    if (!data?.employees) return [];

    return data.employees.filter((emp: PontajEmployee) => {
      if (selectedPositions.size > 0 && !selectedPositions.has(emp.position)) {
        return false;
      }
      if (emp.clocked_in_at) {
        const hour = parseInt(emp.clocked_in_at.split(':')[0], 10);
        if (!isNaN(hour) && hour < timeThreshold) {
          return false;
        }
      }
      return true;
    });
  }, [data?.employees, selectedPositions, timeThreshold]);

  const hours = Array.from({ length: 19 }, (_, i) => i + 5);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-stone-900 dark:text-stone-100">
            Prezenta Azi
          </h1>
          <p className="text-sm text-stone-500 mt-1">
            Colegi pontati astazi &mdash; {new Date().toLocaleDateString('ro-RO', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
          </p>
        </div>
        <button
          onClick={() => refetch()}
          disabled={isFetching}
          className={clsx(
            'flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors',
            'bg-stone-100 hover:bg-stone-200 dark:bg-stone-800 dark:hover:bg-stone-700',
            'text-stone-700 dark:text-stone-300',
            isFetching && 'opacity-50 cursor-not-allowed'
          )}
        >
          <RefreshCw className={clsx('w-4 h-4', isFetching && 'animate-spin')} />
          Refresh
        </button>
      </div>

      {/* Status bar */}
      {data && (
        <div className="flex items-center gap-4 text-sm">
          {data.last_updated && (
            <span className="text-stone-500">
              Ultima actualizare: {new Date(data.last_updated).toLocaleTimeString('ro-RO')}
            </span>
          )}
          {data.error && (
            <span className="flex items-center gap-1.5 text-amber-600 dark:text-amber-400">
              <AlertTriangle className="w-4 h-4" />
              {data.error}
            </span>
          )}
        </div>
      )}

      {/* Filters */}
      <div className="bg-white dark:bg-stone-900 rounded-xl border border-stone-200 dark:border-stone-800 p-4 space-y-4">
        <div className="flex items-center gap-2 text-sm font-medium text-stone-700 dark:text-stone-300">
          <Filter className="w-4 h-4" />
          Filtre
        </div>

        {/* Time threshold */}
        <div className="flex items-center gap-3">
          <label className="text-sm text-stone-600 dark:text-stone-400 whitespace-nowrap">
            Pontati dupa ora:
          </label>
          <select
            value={timeThreshold}
            onChange={(e) => setTimeThreshold(parseInt(e.target.value, 10))}
            className="px-3 py-1.5 rounded-lg border border-stone-300 dark:border-stone-600 bg-white dark:bg-stone-800 text-sm text-stone-900 dark:text-stone-100"
          >
            {hours.map((h) => (
              <option key={h} value={h}>
                {String(h).padStart(2, '0')}:00
              </option>
            ))}
          </select>
        </div>

        {/* Position filters */}
        {data?.positions && data.positions.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <span className="text-sm text-stone-600 dark:text-stone-400">Pozitii:</span>
              <button
                onClick={selectAll}
                className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
              >
                Toate
              </button>
              <button
                onClick={clearAll}
                className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
              >
                Niciuna
              </button>
            </div>
            <div className="flex flex-wrap gap-2">
              {data.positions.map((pos) => (
                <button
                  key={pos}
                  onClick={() => togglePosition(pos)}
                  className={clsx(
                    'px-3 py-1.5 rounded-lg text-sm font-medium transition-colors border',
                    selectedPositions.has(pos)
                      ? 'bg-red-50 border-red-300 text-red-700 dark:bg-red-900/20 dark:border-red-700 dark:text-red-400'
                      : 'bg-stone-50 border-stone-200 text-stone-600 dark:bg-stone-800 dark:border-stone-700 dark:text-stone-400 hover:bg-stone-100 dark:hover:bg-stone-700'
                  )}
                >
                  {pos}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Employee count */}
      <div className="flex items-center gap-2 text-sm text-stone-500">
        <Users className="w-4 h-4" />
        {filteredEmployees.length} colegi
        {data?.employees && filteredEmployees.length !== data.employees.length && (
          <span> din {data.employees.length} total</span>
        )}
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <RefreshCw className="w-6 h-6 animate-spin text-stone-400" />
        </div>
      ) : (
        <div className="bg-white dark:bg-stone-900 rounded-xl border border-stone-200 dark:border-stone-800 overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-stone-200 dark:border-stone-800">
                <th className="text-left px-4 py-3 text-sm font-semibold text-stone-600 dark:text-stone-400">
                  Nume
                </th>
                <th className="text-left px-4 py-3 text-sm font-semibold text-stone-600 dark:text-stone-400">
                  Pozitie
                </th>
                <th className="text-left px-4 py-3 text-sm font-semibold text-stone-600 dark:text-stone-400">
                  <span className="flex items-center gap-1.5">
                    <Clock className="w-4 h-4" />
                    Ora Pontare
                  </span>
                </th>
              </tr>
            </thead>
            <tbody>
              {filteredEmployees.length === 0 ? (
                <tr>
                  <td colSpan={3} className="px-4 py-8 text-center text-sm text-stone-500">
                    Nici un coleg gasit
                  </td>
                </tr>
              ) : (
                filteredEmployees.map((emp: PontajEmployee, idx: number) => (
                  <tr
                    key={`${emp.name}-${idx}`}
                    className="border-b border-stone-100 dark:border-stone-800/50 last:border-0 hover:bg-stone-50 dark:hover:bg-stone-800/30"
                  >
                    <td className="px-4 py-3 text-sm font-medium text-stone-900 dark:text-stone-100">
                      {emp.name}
                    </td>
                    <td className="px-4 py-3 text-sm text-stone-600 dark:text-stone-400">
                      {emp.position || '-'}
                    </td>
                    <td className="px-4 py-3 text-sm font-mono text-stone-700 dark:text-stone-300">
                      {emp.clocked_in_at}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
