import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { RefreshCw, Search, Building2, AlertCircle } from 'lucide-react';
import api from '@/services/api';

type Vendor = {
  name: string; businessPartnerType_: number; vatCode?: string; taxCode?: string;
  taxNumbers?: string; phoneNumber?: string; emailAddress?: string; addressText?: string;
  roleNames?: string; contactPersons?: string; createdAt_?: string; id: string;
};

function shouldAutoRefresh(): number | false {
  const h = new Date().getHours();
  return h >= 10 && h < 22 ? 30 * 60 * 1000 : false;
}

export const FurnizoriSettings: React.FC = () => {
  const [search, setSearch] = useState('');

  const { data, isLoading, isError, error, refetch, isFetching, dataUpdatedAt } = useQuery({
    queryKey: ['furnizori'],
    queryFn: () => api.getFurnizori(),
    refetchInterval: shouldAutoRefresh,
    staleTime: 25 * 60 * 1000,
  });

  const vendors: Vendor[] = data?.vendors ?? [];

  const filtered = search.trim()
    ? vendors.filter((v) => {
        const q = search.toLowerCase();
        return (
          v.name?.toLowerCase().includes(q) ||
          v.vatCode?.toLowerCase().includes(q) ||
          v.taxCode?.toLowerCase().includes(q) ||
          v.phoneNumber?.includes(q) ||
          v.emailAddress?.toLowerCase().includes(q) ||
          v.contactPersons?.toLowerCase().includes(q)
        );
      })
    : vendors;

  const fmtDate = (iso?: string) => {
    if (!iso) return '—';
    try { return new Date(iso).toLocaleDateString('ro-RO'); } catch { return iso; }
  };

  const lastUpdate = dataUpdatedAt
    ? new Date(dataUpdatedAt).toLocaleTimeString('ro-RO', { hour: '2-digit', minute: '2-digit' })
    : null;

  return (
    <div className="max-w-5xl space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Building2 className="w-5 h-5 text-stone-500" />
            <h2 className="text-xl font-bold text-stone-900 dark:text-stone-100">Furnizori ERP</h2>
          </div>
          <p className="text-sm text-stone-500">
            Listă furnizori din sistemul ERP · auto-refresh la 30 min (10:00–22:00)
            {lastUpdate && <span className="ml-1 text-stone-400">· actualizat {lastUpdate}</span>}
          </p>
        </div>
        <button
          onClick={() => refetch()}
          disabled={isFetching}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg bg-stone-100 dark:bg-stone-800 text-stone-600 dark:text-stone-400 hover:bg-red-50 dark:hover:bg-red-900/20 hover:text-red-600 dark:hover:text-red-400 disabled:opacity-40 transition-colors"
        >
          <RefreshCw className={`w-4 h-4 ${isFetching ? 'animate-spin' : ''}`} />
          {isFetching ? 'Se încarcă...' : 'Refresh'}
        </button>
      </div>

      {/* Error */}
      {isError && (
        <div className="flex items-start gap-2 p-3 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-sm text-red-700 dark:text-red-400">
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
          <span>{(error as any)?.response?.data?.detail || 'Eroare la conectarea la ERP'}</span>
        </div>
      )}

      {/* Stats + Search */}
      {!isError && (
        <div className="flex items-center gap-3">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Caută după nume, CUI, telefon..."
              className="w-full pl-9 pr-3 py-2 text-sm rounded-xl border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-900 text-stone-900 dark:text-stone-100 focus:outline-none focus:ring-2 focus:ring-red-500"
            />
          </div>
          {data && (
            <span className="text-sm text-stone-400">
              {filtered.length !== vendors.length
                ? `${filtered.length} din ${vendors.length} furnizori`
                : `${vendors.length} furnizori`}
            </span>
          )}
        </div>
      )}

      {/* Table */}
      {isLoading ? (
        <div className="flex items-center justify-center py-16 text-stone-400 text-sm">
          <RefreshCw className="w-4 h-4 animate-spin mr-2" /> Se încarcă furnizori...
        </div>
      ) : !isError && (
        <div className="bg-white dark:bg-stone-900 rounded-xl border border-stone-200 dark:border-stone-800 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-stone-50 dark:bg-stone-800/70 border-b border-stone-200 dark:border-stone-700">
                <tr>
                  <th className="px-4 py-2.5 text-left text-xs font-semibold text-stone-500 uppercase tracking-wide whitespace-nowrap">Nume</th>
                  <th className="px-4 py-2.5 text-left text-xs font-semibold text-stone-500 uppercase tracking-wide whitespace-nowrap">CUI</th>
                  <th className="px-4 py-2.5 text-left text-xs font-semibold text-stone-500 uppercase tracking-wide whitespace-nowrap">Reg. Com.</th>
                  <th className="px-4 py-2.5 text-left text-xs font-semibold text-stone-500 uppercase tracking-wide whitespace-nowrap">Telefon</th>
                  <th className="px-4 py-2.5 text-left text-xs font-semibold text-stone-500 uppercase tracking-wide whitespace-nowrap">Email</th>
                  <th className="px-4 py-2.5 text-left text-xs font-semibold text-stone-500 uppercase tracking-wide whitespace-nowrap">Contact</th>
                  <th className="px-4 py-2.5 text-left text-xs font-semibold text-stone-500 uppercase tracking-wide whitespace-nowrap">Adăugat</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100 dark:divide-stone-800">
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center text-stone-400 text-sm">
                      {search ? 'Niciun furnizor găsit pentru căutarea curentă.' : 'Niciun furnizor disponibil.'}
                    </td>
                  </tr>
                ) : (
                  filtered.map((v) => (
                    <tr key={v.id} className="hover:bg-stone-50 dark:hover:bg-stone-800/40 transition-colors">
                      <td className="px-4 py-2.5 font-medium text-stone-900 dark:text-stone-100 whitespace-nowrap max-w-[200px] truncate" title={v.name}>
                        {v.name}
                      </td>
                      <td className="px-4 py-2.5 font-mono text-xs text-stone-600 dark:text-stone-400 whitespace-nowrap">
                        {v.vatCode || '—'}
                      </td>
                      <td className="px-4 py-2.5 font-mono text-xs text-stone-600 dark:text-stone-400 whitespace-nowrap">
                        {v.taxCode || '—'}
                      </td>
                      <td className="px-4 py-2.5 text-stone-600 dark:text-stone-400 whitespace-nowrap">
                        {v.phoneNumber || '—'}
                      </td>
                      <td className="px-4 py-2.5 text-stone-600 dark:text-stone-400 max-w-[160px] truncate" title={v.emailAddress}>
                        {v.emailAddress || '—'}
                      </td>
                      <td className="px-4 py-2.5 text-stone-600 dark:text-stone-400 max-w-[140px] truncate" title={v.contactPersons}>
                        {v.contactPersons || '—'}
                      </td>
                      <td className="px-4 py-2.5 text-stone-400 whitespace-nowrap text-xs">
                        {fmtDate(v.createdAt_)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
