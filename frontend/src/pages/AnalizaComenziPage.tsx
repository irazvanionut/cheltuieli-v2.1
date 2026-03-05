import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { format, subDays } from 'date-fns';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
  ComposedChart, Line, ReferenceLine,
} from 'recharts';
import { ShoppingCart, Truck, UtensilsCrossed, Package, TrendingUp, TrendingDown, BarChartHorizontal, Calendar, RefreshCw, ChefHat, Minus } from 'lucide-react';
import api from '@/services/api';

const TODAY    = format(new Date(), 'yyyy-MM-dd');
const WEEK_AGO = format(subDays(new Date(), 7), 'yyyy-MM-dd');

const DOW_LABELS = ['Lun', 'Mar', 'Mie', 'Joi', 'Vin', 'Sâm', 'Dum'];

// ─── Stat Card ──────────────────────────────────────────────────────────────

function TrendBadge({ pct }: { pct: number | null | undefined }) {
  if (pct == null) return null;
  const isUp = pct > 0;
  const isDown = pct < 0;
  if (!isUp && !isDown) return <span className="text-xs text-stone-400 ml-1">—</span>;
  return (
    <span className={`inline-flex items-center gap-0.5 text-xs font-semibold ml-1 ${isUp ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500 dark:text-red-400'}`}>
      {isUp ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
      {isUp ? '+' : ''}{pct}%
    </span>
  );
}

function StatCard({ label, value, sub, icon: Icon, color, trendPct }: {
  label: string; value: string | number; sub?: string;
  icon: React.ElementType; color: string; trendPct?: number | null;
}) {
  return (
    <div className="bg-white dark:bg-stone-900 rounded-2xl border border-stone-200 dark:border-stone-800 p-5 flex gap-4 items-start">
      <div className={`w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 ${color}`}>
        <Icon className="w-5 h-5 text-white" />
      </div>
      <div>
        <p className="text-xs text-stone-500 dark:text-stone-400 uppercase tracking-wide">{label}</p>
        <p className="text-2xl font-bold text-stone-900 dark:text-stone-100 mt-0.5">
          {value}
          <TrendBadge pct={trendPct} />
        </p>
        {sub && <p className="text-xs text-stone-400 dark:text-stone-500 mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

const fmt = (v: number) => v.toLocaleString('ro-RO', { maximumFractionDigits: 0 });

// ─── Tooltips ────────────────────────────────────────────────────────────────

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

// ─── Heatmap ─────────────────────────────────────────────────────────────────

function HeatmapGrid({ cells }: { cells: { dow: number; hour: number; count: number; intensity: number; dinein: number; livrare: number; ridicare: number }[] }) {
  const [tooltip, setTooltip] = useState<{ dow: number; hour: number; count: number; dinein: number; livrare: number; ridicare: number } | null>(null);

  const cellMap: Record<string, typeof cells[0]> = {};
  for (const c of cells) cellMap[`${c.dow}_${c.hour}`] = c;

  return (
    <div className="overflow-x-auto">
      <div className="min-w-[520px]">
        {/* Header row: zilele */}
        <div className="flex mb-1 ml-8">
          {DOW_LABELS.map(d => (
            <div key={d} className="flex-1 text-center text-xs text-stone-400 font-medium">{d}</div>
          ))}
        </div>

        {/* Rows: orele 0-23 */}
        {Array.from({ length: 24 }, (_, hour) => (
          <div key={hour} className="flex items-center mb-0.5">
            <div className="w-8 text-right pr-1.5 text-xs text-stone-400 font-mono flex-shrink-0">{hour}:00</div>
            {Array.from({ length: 7 }, (_, dow) => {
              const cell = cellMap[`${dow}_${hour}`];
              const intensity = cell?.intensity ?? 0;
              const opacity = intensity === 0 ? 0.06 : 0.1 + intensity * 0.85;
              return (
                <div
                  key={dow}
                  className="flex-1 mx-0.5 h-5 rounded cursor-default relative"
                  style={{ backgroundColor: `rgba(124, 58, 237, ${opacity})` }}
                  onMouseEnter={() => cell && setTooltip(cell)}
                  onMouseLeave={() => setTooltip(null)}
                />
              );
            })}
          </div>
        ))}

        {tooltip && (
          <div className="mt-2 text-xs text-stone-500 dark:text-stone-400 text-center">
            <span className="font-semibold text-stone-700 dark:text-stone-300">
              {DOW_LABELS[tooltip.dow]} {tooltip.hour}:00
            </span>
            {' — '}
            {tooltip.count} comenzi
            {tooltip.count > 0 && (
              <> · {tooltip.dinein} dine-in · {tooltip.livrare} livrări · {tooltip.ridicare} ridicări</>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Product Heatmap ─────────────────────────────────────────────────────────

const HOUR_LABELS = Array.from({ length: 24 }, (_, i) => `${i}`);
const DOW_LABELS_SHORT = ['L', 'Ma', 'Mi', 'J', 'V', 'S', 'D'];
const DOW_LABELS_FULL  = ['Luni', 'Marți', 'Miercuri', 'Joi', 'Vineri', 'Sâmbătă', 'Duminică'];

function ProductHeatmap({
  produse, data, labels, labelsFull, rgbColor, title,
}: {
  produse: string[];
  data: Record<string, number[]>;
  labels: string[];
  labelsFull: string[];
  rgbColor: string;  // e.g. "16,185,129"
  title: string;
}) {
  const [tooltip, setTooltip] = useState<{ prod: string; label: string; qty: number } | null>(null);
  if (!produse.length) return null;

  return (
    <div>
      <p className="text-xs font-semibold text-stone-600 dark:text-stone-400 mb-2">{title}</p>
      <div className="overflow-x-auto">
        <div style={{ minWidth: labels.length * 24 + 180 }}>
          {/* Column headers */}
          <div className="flex mb-1" style={{ marginLeft: 180 }}>
            {labels.map((l, i) => (
              <div key={i} className="text-center text-[9px] text-stone-400 flex-shrink-0" style={{ width: 22 }}>{l}</div>
            ))}
          </div>

          {/* Rows */}
          {produse.map(prod => {
            const row = data[prod] ?? labels.map(() => 0);
            const maxRow = Math.max(...row, 1);
            return (
              <div key={prod} className="flex items-center mb-0.5">
                <div className="pr-2 text-right text-[10px] text-stone-600 dark:text-stone-400 truncate flex-shrink-0" style={{ width: 176 }} title={prod}>
                  {prod}
                </div>
                {row.map((qty, i) => {
                  const opacity = qty === 0 ? 0.05 : 0.1 + (qty / maxRow) * 0.85;
                  return (
                    <div
                      key={i}
                      className="rounded-sm cursor-default flex-shrink-0"
                      style={{ width: 20, height: 18, margin: '0 1px', backgroundColor: `rgba(${rgbColor},${opacity.toFixed(2)})` }}
                      onMouseEnter={() => setTooltip({ prod, label: labelsFull[i], qty })}
                      onMouseLeave={() => setTooltip(null)}
                    />
                  );
                })}
              </div>
            );
          })}

          {/* Tooltip bar */}
          <div className="h-5 mt-1 text-xs text-center text-stone-400">
            {tooltip && (
              <>
                <span className="font-semibold text-stone-700 dark:text-stone-300">{tooltip.prod}</span>
                {' · '}{tooltip.label}{' · '}
                <span className="font-semibold text-stone-700 dark:text-stone-300">{tooltip.qty.toLocaleString('ro-RO')} buc</span>
              </>
            )}
          </div>

          {/* Legend */}
          <div className="flex items-center gap-1.5 justify-end mt-1">
            <span className="text-[10px] text-stone-400">Mai puțin</span>
            {[0.05, 0.2, 0.4, 0.6, 0.8, 0.95].map(op => (
              <div key={op} className="w-3.5 h-3.5 rounded-sm" style={{ backgroundColor: `rgba(${rgbColor},${op})` }} />
            ))}
            <span className="text-[10px] text-stone-400">Mai mult</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Trend icon ───────────────────────────────────────────────────────────────

function TrendIcon({ trend, pct }: { trend: string; pct: number | null }) {
  if (trend === 'new') return <span className="text-xs text-blue-500 font-semibold">NOU</span>;
  if (trend === 'up')   return <span className="inline-flex items-center gap-0.5 text-xs font-semibold text-emerald-600 dark:text-emerald-400"><TrendingUp className="w-3 h-3" />+{pct}%</span>;
  if (trend === 'down') return <span className="inline-flex items-center gap-0.5 text-xs font-semibold text-red-500 dark:text-red-400"><TrendingDown className="w-3 h-3" />{pct}%</span>;
  return <span className="inline-flex items-center gap-0.5 text-xs text-stone-400"><Minus className="w-3 h-3" />{pct != null ? `${pct}%` : '—'}</span>;
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export const AnalizaComenziPage: React.FC = () => {
  const [dataStart, setDataStart] = useState(WEEK_AGO);
  const [dataEnd,   setDataEnd]   = useState(TODAY);
  const [queryParams, setQueryParams] = useState({ data_start: WEEK_AGO, data_end: TODAY });

  const { data, isFetching, error } = useQuery({
    queryKey: ['analiza-comenzi', queryParams.data_start, queryParams.data_end],
    queryFn: () => api.getAnalizaComenzi(queryParams.data_start, queryParams.data_end),
    staleTime: 60000,
  });

  const { data: trends } = useQuery({
    queryKey: ['comenzi-trends', queryParams.data_start, queryParams.data_end],
    queryFn: () => api.getComenziiTrends(queryParams.data_start, queryParams.data_end),
    staleTime: 60000,
  });

  const { data: heatmap } = useQuery({
    queryKey: ['comenzi-heatmap'],
    queryFn: () => api.getComenziiHeatmap(),
    staleTime: 30 * 60 * 1000,
  });

  const { data: produseWithTrends } = useQuery({
    queryKey: ['produse-trends', queryParams.data_start, queryParams.data_end],
    queryFn: () => api.getTopProduseWithTrends(queryParams.data_start, queryParams.data_end, 30),
    staleTime: 60000,
  });

  const { data: produseHeatmap } = useQuery({
    queryKey: ['produse-heatmap', queryParams.data_start, queryParams.data_end],
    queryFn: () => api.getProduseHeatmap(queryParams.data_start, queryParams.data_end, 20),
    staleTime: 60000,
  });

  const handleSearch = () => setQueryParams({ data_start: dataStart, data_end: dataEnd });

  // Build combined by_date data for ComposedChart (historical + projection)
  const byDateCombined: { data: string; count?: number; avg?: number; projected?: number }[] = [];
  if (data?.by_date) {
    const movAvgMap: Record<string, number> = {};
    if (trends?.moving_avg) {
      for (const m of trends.moving_avg) movAvgMap[m.data] = m.avg;
    }
    for (const d of data.by_date) {
      byDateCombined.push({ data: d.data, count: d.count, avg: movAvgMap[d.data] });
    }
    if (trends?.projection) {
      for (const p of trends.projection) {
        byDateCombined.push({ data: p.data, projected: p.projected });
      }
    }
  }

  const todayStr = TODAY;

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
        {trends?.prev_period && (
          <p className="text-xs text-stone-400 mt-2">
            Comparație cu: {trends.prev_period.start} → {trends.prev_period.end}
          </p>
        )}
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

          {/* Stats cu trend */}
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
            <StatCard label="Total" value={data.total} icon={ShoppingCart} color="bg-indigo-500"
              trendPct={trends?.pct.total} />
            <StatCard
              label="Dine-in"
              value={data.dinein}
              sub={data.total ? `${Math.round((data.dinein / data.total) * 100)}%` : '0%'}
              icon={UtensilsCrossed} color="bg-violet-500"
              trendPct={trends?.pct.dinein}
            />
            <StatCard
              label="Livrare"
              value={data.livrare}
              sub={data.total ? `${Math.round((data.livrare / data.total) * 100)}%` : '0%'}
              icon={Truck} color="bg-blue-500"
              trendPct={trends?.pct.livrare}
            />
            <StatCard
              label="Ridicare"
              value={data.ridicare}
              sub={data.total ? `${Math.round((data.ridicare / data.total) * 100)}%` : '0%'}
              icon={Package} color="bg-orange-500"
              trendPct={trends?.pct.ridicare}
            />
            <StatCard
              label="Valoare totală"
              value={`${data.valoare_totala.toLocaleString('ro-RO')} RON`}
              sub={`medie ${data.valoare_medie.toLocaleString('ro-RO')} RON`}
              icon={TrendingUp} color="bg-emerald-500"
              trendPct={trends?.pct.val_total}
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

          {/* By date cu moving average + proiecție */}
          {byDateCombined.length > 1 && (
            <div className="bg-white dark:bg-stone-900 rounded-2xl border border-stone-200 dark:border-stone-800 p-5">
              <div className="flex items-center gap-2 mb-4">
                <h3 className="text-sm font-semibold text-stone-900 dark:text-stone-100">Comenzi pe zi</h3>
                <span className="ml-auto flex items-center gap-3 text-xs text-stone-400">
                  <span className="flex items-center gap-1"><span className="inline-block w-4 h-2 bg-purple-500 rounded-sm" />Comenzi</span>
                  <span className="flex items-center gap-1"><span className="inline-block w-4 h-0.5 bg-amber-500" style={{ borderTop: '2px dashed #f59e0b' }} />Medie mobilă</span>
                  <span className="flex items-center gap-1"><span className="inline-block w-4 h-0.5 bg-emerald-500" style={{ borderTop: '2px dashed #10b981' }} />Proiecție</span>
                </span>
              </div>
              <ResponsiveContainer width="100%" height={200}>
                <ComposedChart data={byDateCombined} margin={{ top: 4, right: 8, bottom: 0, left: -10 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e7e5e4" />
                  <XAxis dataKey="data" tick={{ fontSize: 9 }} />
                  <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
                  <Tooltip
                    formatter={(v: any, name: string) => {
                      if (name === 'count') return [`${v} comenzi`, 'Comenzi'];
                      if (name === 'avg')  return [`${v}`, 'Medie mobilă (3z)'];
                      if (name === 'projected') return [`${v}`, 'Proiecție'];
                      return [v, name];
                    }}
                  />
                  <Bar dataKey="count" fill="#8b5cf6" radius={[3, 3, 0, 0]} name="count" />
                  <Line dataKey="avg" stroke="#f59e0b" dot={false} strokeDasharray="4 2" strokeWidth={2} name="avg" connectNulls />
                  <Line dataKey="projected" stroke="#10b981" dot={false} strokeDasharray="4 2" strokeWidth={2} name="projected" connectNulls />
                  <ReferenceLine x={todayStr} stroke="#94a3b8" strokeDasharray="3 3" label={{ value: 'Azi', fontSize: 10, fill: '#94a3b8' }} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Heatmap săptămânal */}
          {heatmap && heatmap.cells.length > 0 && (
            <div className="bg-white dark:bg-stone-900 rounded-2xl border border-stone-200 dark:border-stone-800 p-5">
              <div className="flex items-center gap-2 mb-4">
                <h3 className="text-sm font-semibold text-stone-900 dark:text-stone-100">Heatmap săptămânal</h3>
                <span className="ml-auto text-xs text-stone-400">
                  ultimele {heatmap.days_window} zile
                  {heatmap.computed_at && ` · calculat ${new Date(heatmap.computed_at).toLocaleDateString('ro-RO')}`}
                </span>
              </div>
              <HeatmapGrid cells={heatmap.cells} />
              <div className="flex items-center gap-2 mt-3 justify-end">
                <span className="text-xs text-stone-400">Mai puțin</span>
                {[0.06, 0.25, 0.45, 0.65, 0.85, 0.95].map(op => (
                  <div key={op} className="w-4 h-4 rounded-sm" style={{ backgroundColor: `rgba(124, 58, 237, ${op})` }} />
                ))}
                <span className="text-xs text-stone-400">Mai mult</span>
              </div>
            </div>
          )}

          {/* Heatmap produse × ore + zile */}
          {produseHeatmap && produseHeatmap.produse.length > 0 && (
            <div className="bg-white dark:bg-stone-900 rounded-2xl border border-stone-200 dark:border-stone-800 p-5 space-y-6">
              <div className="flex items-center gap-2">
                <ChefHat className="w-4 h-4 text-emerald-500" />
                <h3 className="text-sm font-semibold text-stone-900 dark:text-stone-100">Heatmap produse</h3>
                <span className="ml-auto text-xs text-stone-400">top 20 produse · intensitate per rând</span>
              </div>
              <ProductHeatmap
                produse={produseHeatmap.produse}
                data={produseHeatmap.by_hour}
                labels={HOUR_LABELS}
                labelsFull={HOUR_LABELS.map(h => `Ora ${h}:00`)}
                rgbColor="16,185,129"
                title="Pe ore (0–23)"
              />
              <ProductHeatmap
                produse={produseHeatmap.produse}
                data={produseHeatmap.by_dow}
                labels={DOW_LABELS_SHORT}
                labelsFull={DOW_LABELS_FULL}
                rgbColor="245,158,11"
                title="Pe zile ale săptămânii"
              />
            </div>
          )}

          {/* Top Produse cu trend */}
          {produseWithTrends && (
            <div className="bg-white dark:bg-stone-900 rounded-2xl border border-stone-200 dark:border-stone-800 p-5">
              <div className="flex items-center gap-2 mb-1">
                <ChefHat className="w-4 h-4 text-emerald-500" />
                <h3 className="text-sm font-semibold text-stone-900 dark:text-stone-100">Top Produse</h3>
                {produseWithTrends.prev_period && (
                  <span className="ml-auto text-xs text-stone-400 font-mono">
                    vs {produseWithTrends.prev_period.start} → {produseWithTrends.prev_period.end}
                  </span>
                )}
              </div>
              {produseWithTrends.produse.length === 0 ? (
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
                        <th className="pb-2 pr-3 font-medium text-right">Valoare RON</th>
                        <th className="pb-2 font-medium text-right">Trend</th>
                      </tr>
                    </thead>
                    <tbody>
                      {produseWithTrends.produse.map((p, i) => (
                        <tr key={p.product_name} className="border-b border-stone-50 dark:border-stone-800/50 hover:bg-stone-50 dark:hover:bg-stone-800/30">
                          <td className="py-1.5 pr-3 text-stone-400 font-mono">{i + 1}</td>
                          <td className="py-1.5 pr-3 text-stone-800 dark:text-stone-200 font-medium">{p.product_name}</td>
                          <td className="py-1.5 pr-3 text-stone-400">{p.product_group || '—'}</td>
                          <td className="py-1.5 pr-3 text-right font-mono text-stone-700 dark:text-stone-300">{p.qty_total.toLocaleString('ro-RO')}</td>
                          <td className="py-1.5 pr-3 text-right font-mono text-stone-500">{p.nr_comenzi.toLocaleString('ro-RO')}</td>
                          <td className="py-1.5 pr-3 text-right font-mono text-emerald-600 dark:text-emerald-400">{p.val_total.toLocaleString('ro-RO')}</td>
                          <td className="py-1.5 text-right"><TrendIcon trend={p.trend} pct={p.pct_change} /></td>
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
