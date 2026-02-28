import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { RefreshCw, Search, Users, AlertCircle, CheckCircle } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '@/services/api';
import type { ErpCustomer } from '@/types';

export const ClientiErpProdSettings: React.FC = () => {
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const debounceRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleSearch = (val: string) => {
    setSearch(val);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setDebouncedSearch(val), 300);
  };

  const { data, isLoading, isError, error, isFetching, dataUpdatedAt } = useQuery({
    queryKey: ['erp-customers', debouncedSearch],
    queryFn: () => api.getErpCustomers({ search: debouncedSearch || undefined, limit: 500 }),
    staleTime: 5 * 60 * 1000,
  });

  const syncMutation = useMutation({
    mutationFn: () => api.syncErpCustomers(),
    onSuccess: (res) => {
      toast.success(`Sincronizare completă: +${res.added} clienți noi din ${res.total_fetched} preluați`);
      qc.invalidateQueries({ queryKey: ['erp-customers'] });
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.detail || 'Eroare la sincronizare');
    },
  });

  const customers: ErpCustomer[] = data?.customers ?? [];
  const total = data?.total ?? 0;

  const lastUpdate = dataUpdatedAt
    ? new Date(dataUpdatedAt).toLocaleTimeString('ro-RO', { hour: '2-digit', minute: '2-digit' })
    : null;

  const fmtDate = (iso?: string | null) => {
    if (!iso) return '—';
    try { return new Date(iso).toLocaleDateString('ro-RO'); } catch { return iso; }
  };

  return (
    <div className="max-w-5xl space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Users className="w-5 h-5 text-stone-500" />
            <h2 className="text-xl font-bold text-stone-900 dark:text-stone-100">Clienți ERP Prod</h2>
          </div>
          <p className="text-sm text-stone-500">
            Clienți din ERP Prod (10.170.4.101:5020) · sincronizare nocturnă 03:00
            {lastUpdate && <span className="ml-1 text-stone-400">· actualizat {lastUpdate}</span>}
          </p>
        </div>
        <button
          onClick={() => syncMutation.mutate()}
          disabled={syncMutation.isPending || isFetching}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg bg-stone-100 dark:bg-stone-800 text-stone-600 dark:text-stone-400 hover:bg-red-50 dark:hover:bg-red-900/20 hover:text-red-600 dark:hover:text-red-400 disabled:opacity-40 transition-colors whitespace-nowrap"
        >
          <RefreshCw className={`w-4 h-4 ${syncMutation.isPending ? 'animate-spin' : ''}`} />
          {syncMutation.isPending ? 'Se sincronizează...' : 'Sincronizează acum'}
        </button>
      </div>

      {/* Sync result */}
      {syncMutation.isSuccess && (
        <div className="flex items-center gap-2 p-3 rounded-xl bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 text-sm text-emerald-700 dark:text-emerald-400">
          <CheckCircle className="w-4 h-4 shrink-0" />
          <span>
            +{syncMutation.data.added} clienți noi adăugați din {syncMutation.data.total_fetched} preluați din ERP
          </span>
        </div>
      )}

      {/* Error */}
      {isError && (
        <div className="flex items-start gap-2 p-3 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-sm text-red-700 dark:text-red-400">
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
          <span>{(error as any)?.response?.data?.detail || 'Eroare la încărcarea clienților'}</span>
        </div>
      )}

      {/* Stats + search */}
      {!isError && (
        <div className="flex items-center gap-3">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => handleSearch(e.target.value)}
              placeholder="Caută după nume, telefon, email..."
              className="w-full pl-9 pr-3 py-2 text-sm rounded-xl border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-900 text-stone-900 dark:text-stone-100 focus:outline-none focus:ring-2 focus:ring-red-500"
            />
          </div>
          {data && (
            <span className="text-sm text-stone-400">
              {debouncedSearch
                ? `${customers.length} din ${total} clienți`
                : `${total} clienți total`}
            </span>
          )}
        </div>
      )}

      {/* Table */}
      {isLoading ? (
        <div className="flex items-center justify-center py-16 text-stone-400 text-sm">
          <RefreshCw className="w-4 h-4 animate-spin mr-2" /> Se încarcă clienții...
        </div>
      ) : !isError && (
        <div className="bg-white dark:bg-stone-900 rounded-xl border border-stone-200 dark:border-stone-800 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-stone-50 dark:bg-stone-800/70 border-b border-stone-200 dark:border-stone-700">
                <tr>
                  <th className="px-4 py-2.5 text-left text-xs font-semibold text-stone-500 uppercase tracking-wide whitespace-nowrap">ID ERP</th>
                  <th className="px-4 py-2.5 text-left text-xs font-semibold text-stone-500 uppercase tracking-wide whitespace-nowrap">Nume</th>
                  <th className="px-4 py-2.5 text-left text-xs font-semibold text-stone-500 uppercase tracking-wide whitespace-nowrap">Tip</th>
                  <th className="px-4 py-2.5 text-left text-xs font-semibold text-stone-500 uppercase tracking-wide whitespace-nowrap">Telefon</th>
                  <th className="px-4 py-2.5 text-left text-xs font-semibold text-stone-500 uppercase tracking-wide whitespace-nowrap">Email</th>
                  <th className="px-4 py-2.5 text-left text-xs font-semibold text-stone-500 uppercase tracking-wide whitespace-nowrap">Adresă</th>
                  <th className="px-4 py-2.5 text-left text-xs font-semibold text-stone-500 uppercase tracking-wide whitespace-nowrap">Sincronizat</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100 dark:divide-stone-800">
                {customers.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center text-stone-400 text-sm">
                      {debouncedSearch
                        ? 'Niciun client găsit pentru căutarea curentă.'
                        : 'Niciun client disponibil. Apasă "Sincronizează acum" pentru a prelua clienții din ERP.'}
                    </td>
                  </tr>
                ) : (
                  customers.map((c) => (
                    <tr key={c.id} className="hover:bg-stone-50 dark:hover:bg-stone-800/40 transition-colors">
                      <td className="px-4 py-2.5 font-mono text-xs text-stone-400 whitespace-nowrap">
                        {c.erp_id}
                      </td>
                      <td className="px-4 py-2.5 font-medium text-stone-900 dark:text-stone-100 max-w-[200px] truncate" title={c.name ?? ''}>
                        {c.name || '—'}
                      </td>
                      <td className="px-4 py-2.5 text-stone-500 dark:text-stone-400 whitespace-nowrap text-xs">
                        {c.type || '—'}
                      </td>
                      <td className="px-4 py-2.5 text-stone-600 dark:text-stone-400 whitespace-nowrap">
                        {c.phone || '—'}
                      </td>
                      <td className="px-4 py-2.5 text-stone-600 dark:text-stone-400 max-w-[160px] truncate" title={c.email ?? ''}>
                        {c.email || '—'}
                      </td>
                      <td className="px-4 py-2.5 text-stone-500 dark:text-stone-400 max-w-[180px] truncate text-xs" title={c.address ?? ''}>
                        {c.address || '—'}
                      </td>
                      <td className="px-4 py-2.5 text-stone-400 whitespace-nowrap text-xs">
                        {fmtDate(c.synced_at)}
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
