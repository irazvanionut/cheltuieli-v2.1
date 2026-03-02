import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { format, subDays } from 'date-fns';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts';
import { ShoppingCart, Truck, UtensilsCrossed, Package, TrendingUp, BarChartHorizontal, Calendar, RefreshCw, ChefHat } from 'lucide-react';
import api from '@/services/api';

const TODAY    = format(new Date(), 'yyyy-MM-dd');
const WEEK_AGO = format(subDays(new Date(), 7), 'yyyy-MM-dd');

function StatCard({ label, value, sub, icon: Icon, color }: {
  label: string; value: string | number; sub?: string;
  icon: React.ElementType; color: string;
}) {
  return (
    <div className="bg-white dark:bg-stone-900 rounded-2xl border border-stone-200 dark:border-stone-800 p-5 flex gap-4 items-start">
      <div className={`w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 ${color}`}>
        <Icon className="w-5 h-5 text-white" />
      </div>
      <div>
        <p className="text-xs text-stone-500 dark:text-stone-400 uppercase tracking-wide">{label}</p>
        <p className="text-2xl font-bold text-stone-900 dark:text-stone-100 mt-0.5">{value}</p>
        {sub && <p className="text-xs text-stone-400 dark:text-stone-500 mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

const fmt = (v: number) => v.toLocaleString('ro-RO', { maximumFractionDigits: 0 });

const CustomTooltipDinein = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-700 rounded-xl p-3 shadow-lg text-xs">
      <p className="font-semibold text-stone-700 dark:text-stone-300 mb-1">Ora {label}:00</p>
      <p className="text-violet-600 dark:text-violet-400">{payload[0]?.value} dine-in</p>
    </div>
  );
};

const CustomTooltipLivrare = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  const livrare  = payload.find((p: any) => p.dataKey === 'livrare')?.value ?? 0;
  const ridicare = payload.find((p: any) => p.dataKey === 'ridicare')?.value ?? 0;
  return (
    <div className="bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-700 rounded-xl p-3 shadow-lg text-xs">
      <p className="font-semibold text-stone-700 dark:text-stone-300 mb-1">Ora {label}:00</p>
      <p className="text-blue-600 dark:text-blue-400">{livrare} livrări</p>
      <p className="text-orange-500 dark:text-orange-400">{ridicare} ridicări</p>
      <p className="text-stone-500 mt-0.5">Total: {livrare + ridicare}</p>
    </div>
  );
};

const CustomTooltipDineinVal = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-700 rounded-xl p-3 shadow-lg text-xs">
      <p className="font-semibold text-stone-700 dark:text-stone-300 mb-1">Ora {label}:00</p>
      <p className="text-violet-600 dark:text-violet-400">{fmt(payload[0]?.value ?? 0)} RON dine-in</p>
    </div>
  );
};

const CustomTooltipLivrareVal = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  const livrare  = payload.find((p: any) => p.dataKey === 'livrare')?.value ?? 0;
  const ridicare = payload.find((p: any) => p.dataKey === 'ridicare')?.value ?? 0;
  return (
    <div className="bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-700 rounded-xl p-3 shadow-lg text-xs">
      <p className="font-semibold text-stone-700 dark:text-stone-300 mb-1">Ora {label}:00</p>
      <p className="text-blue-600 dark:text-blue-400">{fmt(livrare)} RON livrări</p>
      <p className="text-orange-500 dark:text-orange-400">{fmt(ridicare)} RON ridicări</p>
      <p className="text-stone-500 mt-0.5">Total: {fmt(livrare + ridicare)} RON</p>
    </div>
  );
};

export const AnalizaComenziPage: React.FC = () => {
  const [dataStart, setDataStart] = useState(WEEK_AGO);
  const [dataEnd,   setDataEnd]   = useState(TODAY);
  const [queryParams, setQueryParams] = useState({ data_start: WEEK_AGO, data_end: TODAY });

  const { data, isFetching, error } = useQuery({
    queryKey: ['analiza-comenzi', queryParams.data_start, queryParams.data_end],
    queryFn: () => api.getAnalizaComenzi(queryParams.data_start, queryParams.data_end),
    staleTime: 60000,
  });

  const { data: produse } = useQuery({
    queryKey: ['top-produse', queryParams.data_start, queryParams.data_end],
    queryFn: () => api.getTopProduse(queryParams.data_start, queryParams.data_end, 30),
    staleTime: 60000,
  });

  const handleSearch = () => setQueryParams({ data_start: dataStart, data_end: dataEnd });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-purple-600 flex items-center justify-center">
          <BarChartHorizontal className="w-5 h-5 text-white" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-stone-900 dark:text-stone-100">Analiză Comenzi</h1>
          <p className="text-xs text-stone-500">Statistici din DB local · comenzi ERP</p>
        </div>
      </div>

      {/* Date filter */}
      <div className="bg-white dark:bg-stone-900 rounded-2xl border border-stone-200 dark:border-stone-800 p-4">
        <div className="flex flex-wrap gap-3 items-end">
          <div>
            <label className="block text-xs text-stone-500 mb-1">De la</label>
            <input type="date" value={dataStart} onChange={e => setDataStart(e.target.value)}
              className="px-3 py-2 rounded-lg border border-stone-200 dark:border-stone-700 bg-stone-50 dark:bg-stone-800 text-sm text-stone-900 dark:text-stone-100 focus:outline-none focus:ring-2 focus:ring-purple-500" />
          </div>
          <div>
            <label className="block text-xs text-stone-500 mb-1">Până la</label>
            <input type="date" value={dataEnd} onChange={e => setDataEnd(e.target.value)}
              className="px-3 py-2 rounded-lg border border-stone-200 dark:border-stone-700 bg-stone-50 dark:bg-stone-800 text-sm text-stone-900 dark:text-stone-100 focus:outline-none focus:ring-2 focus:ring-purple-500" />
          </div>
          <button onClick={handleSearch} disabled={isFetching}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white text-sm font-medium transition-colors">
            {isFetching
              ? <><RefreshCw className="w-4 h-4 animate-spin" />Se încarcă...</>
              : <><Calendar className="w-4 h-4" />Aplică</>}
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-xl p-4 text-sm text-red-700 dark:text-red-400">
          Eroare la încărcarea datelor.
        </div>
      )}

      {data && (
        <>
          {data.db_count === 0 && (
            <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-xl p-4 text-sm text-amber-700 dark:text-amber-400">
              Tabela locală este goală — rulează sync-ul din <strong>Setări → Keys → Sync Comenzi</strong>.
            </div>
          )}
          {data.db_count > 0 && (
            <p className="text-xs text-stone-400 -mt-2">
              Sursă: DB local · {data.db_count.toLocaleString('ro-RO')} comenzi totale sincronizate
            </p>
          )}

          {/* Stats */}
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
            <StatCard label="Total" value={data.total} icon={ShoppingCart} color="bg-indigo-500" />
            <StatCard
              label="Dine-in"
              value={data.dinein}
              sub={data.total ? `${Math.round((data.dinein / data.total) * 100)}%` : '0%'}
              icon={UtensilsCrossed} color="bg-violet-500"
            />
            <StatCard
              label="Livrare"
              value={data.livrare}
              sub={data.total ? `${Math.round((data.livrare / data.total) * 100)}%` : '0%'}
              icon={Truck} color="bg-blue-500"
            />
            <StatCard
              label="Ridicare"
              value={data.ridicare}
              sub={data.total ? `${Math.round((data.ridicare / data.total) * 100)}%` : '0%'}
              icon={Package} color="bg-orange-500"
            />
            <StatCard
              label="Valoare totală"
              value={`${data.valoare_totala.toLocaleString('ro-RO')} RON`}
              sub={`medie ${data.valoare_medie.toLocaleString('ro-RO')} RON`}
              icon={TrendingUp} color="bg-emerald-500"
            />
          </div>

          {/* Charts */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Dine-in by hour */}
            <div className="bg-white dark:bg-stone-900 rounded-2xl border border-stone-200 dark:border-stone-800 p-5">
              <div className="flex items-center gap-2 mb-4">
                <UtensilsCrossed className="w-4 h-4 text-violet-500" />
                <h3 className="text-sm font-semibold text-stone-900 dark:text-stone-100">Dine-in pe ore</h3>
                <span className="ml-auto text-xs text-stone-400 font-mono">{data.dinein} total</span>
              </div>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={data.by_hour_dinein} margin={{ top: 0, right: 0, bottom: 0, left: -20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e7e5e4" />
                  <XAxis dataKey="ora" tick={{ fontSize: 10 }} tickFormatter={h => `${h}`} />
                  <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
                  <Tooltip content={<CustomTooltipDinein />} />
                  <Bar dataKey="count" fill="#8b5cf6" radius={[3, 3, 0, 0]} name="Dine-in" />
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* Livrare + Ridicare by hour */}
            <div className="bg-white dark:bg-stone-900 rounded-2xl border border-stone-200 dark:border-stone-800 p-5">
              <div className="flex items-center gap-2 mb-4">
                <Truck className="w-4 h-4 text-blue-500" />
                <h3 className="text-sm font-semibold text-stone-900 dark:text-stone-100">Livrare pe ore</h3>
                <span className="ml-auto text-xs text-stone-400 font-mono">
                  {data.livrare} liv · {data.ridicare} rid
                </span>
              </div>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={data.by_hour_livrare} margin={{ top: 0, right: 0, bottom: 0, left: -20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e7e5e4" />
                  <XAxis dataKey="ora" tick={{ fontSize: 10 }} tickFormatter={h => `${h}`} />
                  <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
                  <Tooltip content={<CustomTooltipLivrare />} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Bar dataKey="livrare" fill="#3b82f6" radius={[3, 3, 0, 0]} name="Livrare" />
                  <Bar dataKey="ridicare" fill="#f97316" radius={[3, 3, 0, 0]} name="Ridicare" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Incasari by hour */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Dine-in incasari by hour */}
            <div className="bg-white dark:bg-stone-900 rounded-2xl border border-stone-200 dark:border-stone-800 p-5">
              <div className="flex items-center gap-2 mb-4">
                <UtensilsCrossed className="w-4 h-4 text-violet-500" />
                <h3 className="text-sm font-semibold text-stone-900 dark:text-stone-100">Încasări dine-in pe ore</h3>
                <span className="ml-auto text-xs text-stone-400 font-mono">{data.valoare_totala ? `${Math.round((data.by_hour_dinein_val.reduce((s, h) => s + h.valoare, 0) / data.valoare_totala) * 100)}%` : ''}</span>
              </div>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={data.by_hour_dinein_val} margin={{ top: 0, right: 0, bottom: 0, left: -10 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e7e5e4" />
                  <XAxis dataKey="ora" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 10 }} tickFormatter={v => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : `${v}`} />
                  <Tooltip content={<CustomTooltipDineinVal />} />
                  <Bar dataKey="valoare" fill="#8b5cf6" radius={[3, 3, 0, 0]} name="Dine-in RON" />
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* Livrare + Ridicare incasari by hour */}
            <div className="bg-white dark:bg-stone-900 rounded-2xl border border-stone-200 dark:border-stone-800 p-5">
              <div className="flex items-center gap-2 mb-4">
                <Truck className="w-4 h-4 text-blue-500" />
                <h3 className="text-sm font-semibold text-stone-900 dark:text-stone-100">Încasări livrare pe ore</h3>
              </div>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={data.by_hour_livrare_val} margin={{ top: 0, right: 0, bottom: 0, left: -10 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e7e5e4" />
                  <XAxis dataKey="ora" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 10 }} tickFormatter={v => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : `${v}`} />
                  <Tooltip content={<CustomTooltipLivrareVal />} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Bar dataKey="livrare" fill="#3b82f6" radius={[3, 3, 0, 0]} name="Livrare RON" />
                  <Bar dataKey="ridicare" fill="#f97316" radius={[3, 3, 0, 0]} name="Ridicare RON" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* By date (only for multi-day intervals) */}
          {data.by_date.length > 1 && (
            <div className="bg-white dark:bg-stone-900 rounded-2xl border border-stone-200 dark:border-stone-800 p-5">
              <h3 className="text-sm font-semibold text-stone-900 dark:text-stone-100 mb-4">Comenzi pe zi</h3>
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={data.by_date} margin={{ top: 0, right: 0, bottom: 0, left: -10 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e7e5e4" />
                  <XAxis dataKey="data" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
                  <Tooltip formatter={(v: number, name: string) =>
                    [name === 'count' ? `${v} comenzi` : `${v.toLocaleString('ro-RO')} RON`,
                     name === 'count' ? 'Comenzi' : 'Valoare']} />
                  <Bar dataKey="count" fill="#8b5cf6" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Top Produse */}
          {produse && (
            <div className="bg-white dark:bg-stone-900 rounded-2xl border border-stone-200 dark:border-stone-800 p-5">
              <div className="flex items-center gap-2 mb-1">
                <ChefHat className="w-4 h-4 text-emerald-500" />
                <h3 className="text-sm font-semibold text-stone-900 dark:text-stone-100">Top Produse</h3>
                <span className="ml-auto text-xs text-stone-400 font-mono">
                  {produse.orders_synced.toLocaleString('ro-RO')} / {produse.orders_total.toLocaleString('ro-RO')} comenzi cu linii
                </span>
              </div>
              {produse.coverage_pct < 100 && (
                <p className="text-xs text-amber-600 dark:text-amber-400 mb-3">
                  Acoperire {produse.coverage_pct}% — backfill în curs (Settings → Backfill Linii Comenzi)
                </p>
              )}
              {produse.produse.length === 0 ? (
                <p className="text-sm text-stone-400 py-4 text-center">Niciun produs sincronizat în intervalul selectat.</p>
              ) : (
                <div className="overflow-x-auto mt-3">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-stone-100 dark:border-stone-800 text-left text-stone-400 uppercase tracking-wide">
                        <th className="pb-2 pr-3 font-medium w-8">#</th>
                        <th className="pb-2 pr-3 font-medium">Produs</th>
                        <th className="pb-2 pr-3 font-medium">Grupă</th>
                        <th className="pb-2 pr-3 font-medium text-right">Cantitate</th>
                        <th className="pb-2 pr-3 font-medium text-right">Comenzi</th>
                        <th className="pb-2 font-medium text-right">Valoare RON</th>
                      </tr>
                    </thead>
                    <tbody>
                      {produse.produse.map((p, i) => (
                        <tr key={p.product_name} className="border-b border-stone-50 dark:border-stone-800/50 hover:bg-stone-50 dark:hover:bg-stone-800/30">
                          <td className="py-1.5 pr-3 text-stone-400 font-mono">{i + 1}</td>
                          <td className="py-1.5 pr-3 text-stone-800 dark:text-stone-200 font-medium">{p.product_name}</td>
                          <td className="py-1.5 pr-3 text-stone-400">{p.product_group || '—'}</td>
                          <td className="py-1.5 pr-3 text-right font-mono text-stone-700 dark:text-stone-300">{p.qty_total.toLocaleString('ro-RO')}</td>
                          <td className="py-1.5 pr-3 text-right font-mono text-stone-500">{p.nr_comenzi.toLocaleString('ro-RO')}</td>
                          <td className="py-1.5 text-right font-mono text-emerald-600 dark:text-emerald-400">{p.val_total.toLocaleString('ro-RO')}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {data.total === 0 && data.db_count > 0 && (
            <div className="text-center py-16 text-stone-400">
              <ShoppingCart className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p className="text-sm">Nicio comandă în intervalul selectat.</p>
            </div>
          )}
        </>
      )}
    </div>
  );
};
