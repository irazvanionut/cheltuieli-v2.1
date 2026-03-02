import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  BrainCircuit, RefreshCw, Clock, RotateCcw, AlertCircle,
  Sparkles, FlaskConical, TrendingUp, TrendingDown, Minus,
  CheckCircle2, Settings, ChevronDown, ChevronUp,
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import { format, subDays } from 'date-fns';
import api from '@/services/api';

type ModelType = 'rf' | 'lgb';
const HORIZONS  = [15, 20, 30, 45] as const;
const TABS      = ['Acum', 'Azi', 'Pe oră', 'Deja comandat', 'Testare model'] as const;
type TabType    = typeof TABS[number];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function probColor(p: number) {
  if (p >= 70) return { bar: 'bg-emerald-500', badge: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300' };
  if (p >= 40) return { bar: 'bg-amber-400',   badge: 'bg-amber-100   text-amber-700   dark:bg-amber-900/40   dark:text-amber-300'   };
  return        { bar: 'bg-stone-300',          badge: 'bg-stone-100   text-stone-500   dark:bg-stone-800      dark:text-stone-400'   };
}

function diffBadge(diff: number) {
  if (diff > 0.4)  return { cls: 'text-blue-600 dark:text-blue-400',       icon: TrendingUp,   label: `+${diff}` };
  if (diff < -0.4) return { cls: 'text-red-500  dark:text-red-400',        icon: TrendingDown, label: `${diff}`  };
  return                   { cls: 'text-emerald-600 dark:text-emerald-400', icon: Minus,        label: `${diff >= 0 ? '+' : ''}${diff}` };
}

// ─── Model Toggle ─────────────────────────────────────────────────────────────

const ModelToggle: React.FC<{
  model: ModelType;
  lgbAvailable: boolean;
  onChange: (m: ModelType) => void;
}> = ({ model, lgbAvailable, onChange }) => (
  <div className="flex items-center gap-1 bg-stone-100 dark:bg-stone-800 p-0.5 rounded-lg">
    <button
      onClick={() => onChange('rf')}
      className={`px-3 py-1 rounded-md text-xs font-semibold transition-colors ${
        model === 'rf'
          ? 'bg-fuchsia-600 text-white shadow-sm'
          : 'text-stone-500 dark:text-stone-400 hover:text-stone-700'
      }`}
    >
      RF
    </button>
    <button
      onClick={() => onChange('lgb')}
      disabled={!lgbAvailable}
      title={!lgbAvailable ? 'LightGBM nu este disponibil — rebuild docker' : undefined}
      className={`px-3 py-1 rounded-md text-xs font-semibold transition-colors disabled:opacity-40 ${
        model === 'lgb'
          ? 'bg-fuchsia-600 text-white shadow-sm'
          : 'text-stone-500 dark:text-stone-400 hover:text-stone-700'
      }`}
    >
      LGB
    </button>
  </div>
);

// ─── Settings Panel ───────────────────────────────────────────────────────────

const SettingsPanel: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: ['predictii-setari'],
    queryFn:  () => api.getPredictiiSetari(),
    staleTime: 60_000,
  });

  const [openH,  setOpenH]  = useState<number | null>(null);
  const [closeH, setCloseH] = useState<number | null>(null);

  const open  = openH  ?? data?.open_hour  ?? 10;
  const close = closeH ?? data?.close_hour ?? 23;

  const save = useMutation({
    mutationFn: () => api.savePredictiiSetari({ open_hour: open, close_hour: close }),
    onSuccess: () => {
      toast.success('Program salvat');
      qc.invalidateQueries({ queryKey: ['predictii-ziua'] });
      qc.invalidateQueries({ queryKey: ['predictii-ore'] });
      qc.invalidateQueries({ queryKey: ['predictii-setari'] });
      onClose();
    },
    onError: () => toast.error('Eroare la salvare'),
  });

  return (
    <div className="bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-2xl p-4 space-y-4">
      <p className="text-sm font-semibold text-stone-700 dark:text-stone-300 flex items-center gap-2">
        <Settings className="w-4 h-4" /> Program restaurant
      </p>
      <div className="flex items-center gap-4">
        <div>
          <label className="block text-xs text-stone-500 mb-1">Deschis de la ora</label>
          <input
            type="number" min={0} max={23} value={open}
            onChange={e => setOpenH(parseInt(e.target.value))}
            className="w-20 px-3 py-2 rounded-lg border border-stone-200 dark:border-stone-700 bg-stone-50 dark:bg-stone-800 text-sm text-center"
          />
        </div>
        <div>
          <label className="block text-xs text-stone-500 mb-1">Închis după ora</label>
          <input
            type="number" min={1} max={24} value={close}
            onChange={e => setCloseH(parseInt(e.target.value))}
            className="w-20 px-3 py-2 rounded-lg border border-stone-200 dark:border-stone-700 bg-stone-50 dark:bg-stone-800 text-sm text-center"
          />
        </div>
        <div className="flex gap-2 mt-4">
          <button
            onClick={() => save.mutate()}
            disabled={save.isPending}
            className="px-4 py-2 rounded-lg bg-fuchsia-600 hover:bg-fuchsia-700 text-white text-sm font-medium disabled:opacity-50"
          >
            Salvează
          </button>
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg border border-stone-200 dark:border-stone-700 text-stone-500 text-sm"
          >
            Anulează
          </button>
        </div>
      </div>
    </div>
  );
};

// ─── Tab: Acum ────────────────────────────────────────────────────────────────

const AcumPanel: React.FC<{ model: ModelType }> = ({ model }) => {
  const [horizon, setHorizon] = useState<number>(20);
  const [autoRefresh, setAutoRefresh] = useState(true);

  const { data, isFetching, refetch } = useQuery({
    queryKey:        ['predictii-produse', horizon, model],
    queryFn:         () => api.getPredictiiProduse(horizon, 24, model),
    refetchInterval: autoRefresh ? 60_000 : false,
    staleTime:       30_000,
  });

  const predictions = data?.predictions ?? [];
  const maxProb     = Math.max(...predictions.map(p => p.probability), 1);

  return (
    <div className="space-y-4">
      {/* Controls */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-stone-500 self-center mr-1">Fereastră:</span>
        {HORIZONS.map(h => (
          <button key={h} onClick={() => setHorizon(h)}
            className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors ${
              horizon === h
                ? 'bg-fuchsia-600 text-white shadow-sm'
                : 'bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-700 text-stone-600 dark:text-stone-400 hover:border-fuchsia-400'
            }`}>
            +{h} min
          </button>
        ))}
        <div className="ml-auto flex items-center gap-2">
          <button onClick={() => setAutoRefresh(v => !v)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors border ${
              autoRefresh
                ? 'bg-fuchsia-50 dark:bg-fuchsia-950/30 border-fuchsia-200 dark:border-fuchsia-800 text-fuchsia-700 dark:text-fuchsia-300'
                : 'bg-white dark:bg-stone-900 border-stone-200 dark:border-stone-700 text-stone-500'
            }`}>
            <Clock className="w-3.5 h-3.5" />
            {autoRefresh ? 'Live' : 'Oprit'}
          </button>
          <button onClick={() => refetch()} disabled={isFetching}
            className="p-2 rounded-lg bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-700 text-stone-500 hover:text-stone-700 disabled:opacity-50">
            <RefreshCw className={`w-4 h-4 ${isFetching ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Context bar */}
      {data && !data.error && data.model_count > 0 && (
        <div className="bg-fuchsia-50 dark:bg-fuchsia-950/30 border border-fuchsia-200 dark:border-fuchsia-800 rounded-xl px-4 py-3 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-sm text-fuchsia-700 dark:text-fuchsia-300">
            <Sparkles className="w-4 h-4" />
            <span>Estimare pentru <strong>{data.window_start}</strong> · {data.day_of_week} · {data.season}</span>
          </div>
          <div className="flex items-center gap-3 text-xs text-fuchsia-500">
            <span>{data.model_count} modele</span>
            {data.trained_at && (
              <span className="opacity-70">antrenat {new Date(data.trained_at).toLocaleString('ro-RO', { hour: '2-digit', minute: '2-digit' })}</span>
            )}
          </div>
        </div>
      )}

      {/* Data quality warning */}
      {data && (data.data_quality === 'insuficient' || data.data_quality === 'limitat') && (
        <div className={`border rounded-xl px-4 py-3 flex gap-3 ${
          data.data_quality === 'insuficient'
            ? 'bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-800'
            : 'bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800'
        }`}>
          <AlertCircle className={`w-5 h-5 shrink-0 mt-0.5 ${data.data_quality === 'insuficient' ? 'text-red-500' : 'text-amber-500'}`} />
          <p className={`text-sm ${data.data_quality === 'insuficient' ? 'text-red-700 dark:text-red-300' : 'text-amber-700 dark:text-amber-300'}`}>
            Date {data.data_quality === 'insuficient' ? 'insuficiente' : 'limitate'} — {data.days_of_data} zile ({data.orders_count?.toLocaleString('ro-RO')} comenzi).
            Backfill recomandat din Settings → Keys.
          </p>
        </div>
      )}

      {data?.error && (
        <div className="bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-xl p-4 flex gap-3">
          <AlertCircle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
          <p className="text-sm text-red-700 dark:text-red-400">{data.error}</p>
        </div>
      )}

      {data?.training && (
        <div className="flex items-center gap-3 p-4 bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-xl">
          <RefreshCw className="w-5 h-5 text-blue-500 animate-spin shrink-0" />
          <p className="text-sm font-medium text-blue-700 dark:text-blue-300">Antrenament model în curs…</p>
        </div>
      )}

      {/* Grid */}
      {predictions.length > 0 ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
          {predictions.map((p, i) => {
            const colors  = probColor(p.probability);
            const barW    = maxProb > 0 ? Math.round((p.probability / maxProb) * 100) : 0;
            return (
              <div key={p.product_name} className="bg-white dark:bg-stone-900 rounded-2xl border border-stone-200 dark:border-stone-800 p-4 flex flex-col gap-2.5">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-start gap-2 min-w-0">
                    <span className="text-xs font-mono text-stone-400 mt-0.5 shrink-0">#{i + 1}</span>
                    <p className="text-sm font-semibold text-stone-800 dark:text-stone-100 leading-snug">{p.product_name}</p>
                  </div>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-bold font-mono shrink-0 ${colors.badge}`}>
                    {p.probability}%
                  </span>
                </div>
                <div className="w-full bg-stone-100 dark:bg-stone-800 rounded-full h-1.5">
                  <div className={`${colors.bar} h-1.5 rounded-full transition-all duration-500`} style={{ width: `${barW}%` }} />
                </div>
                {p.predicted_qty > 0 && (
                  <div className="bg-stone-50 dark:bg-stone-800/60 rounded-lg px-3 py-2">
                    <p className="text-[10px] text-stone-400 leading-none mb-0.5">dacă se comandă</p>
                    <p className="text-xl font-bold text-fuchsia-600 dark:text-fuchsia-400">
                      ~{p.predicted_qty} <span className="text-xs font-normal text-stone-400">porții</span>
                    </p>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : !data?.training && !data?.error && data && (
        <div className="text-center py-20 text-stone-400">
          <BrainCircuit className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p className="text-sm">Nicio predicție disponibilă pentru fereastra selectată.</p>
        </div>
      )}

      {predictions.length > 0 && (
        <div className="flex flex-wrap gap-4 text-xs text-stone-400 pt-2 border-t border-stone-100 dark:border-stone-800">
          <div className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-emerald-500 inline-block" /> ≥70% șanse</div>
          <div className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-amber-400 inline-block" /> 40-69%</div>
          <div className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-stone-300 inline-block" /> &lt;40%</div>
        </div>
      )}
    </div>
  );
};

// ─── Tab: Azi ─────────────────────────────────────────────────────────────────

const AziPanel: React.FC<{ model: ModelType }> = ({ model }) => {
  const { data, isFetching, refetch } = useQuery({
    queryKey:        ['predictii-ziua', model],
    queryFn:         () => api.getPredictiiZiua(model),
    refetchInterval: 120_000,
    staleTime:       60_000,
  });

  const products = data?.products ?? [];
  if (!data && isFetching) return (
    <div className="flex items-center justify-center py-20 text-stone-400">
      <RefreshCw className="w-6 h-6 animate-spin mr-2" /> Se calculează…
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-stone-500">
          P(produs apare azi) · program {data?.open_hour}:00–{data?.close_hour}:00 · {data?.data}
        </p>
        <button onClick={() => refetch()} disabled={isFetching}
          className="p-1.5 rounded-lg border border-stone-200 dark:border-stone-700 text-stone-400 hover:text-stone-600 disabled:opacity-50">
          <RefreshCw className={`w-3.5 h-3.5 ${isFetching ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {products.length === 0 && (
        <div className="text-center py-16 text-stone-400">
          <BrainCircuit className="w-10 h-10 mx-auto mb-2 opacity-30" />
          <p className="text-sm">Nicio predicție disponibilă.</p>
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
        {products.map(p => {
          const colors = probColor(p.probabilitate);
          return (
            <div key={p.product} className="bg-white dark:bg-stone-900 rounded-2xl border border-stone-200 dark:border-stone-800 p-3.5 flex flex-col gap-2">
              <p className="text-sm font-semibold text-stone-800 dark:text-stone-100 leading-snug">{p.product}</p>
              <div className="flex items-center justify-between">
                <span className={`text-sm font-bold px-2 py-0.5 rounded-full font-mono ${colors.badge}`}>
                  {p.probabilitate}%
                </span>
                {p.cantitate_deja > 0 && (
                  <span className="flex items-center gap-1 text-[11px] text-emerald-600 dark:text-emerald-400 font-medium">
                    <CheckCircle2 className="w-3 h-3" />
                    {p.cantitate_deja} deja
                  </span>
                )}
              </div>
              <div className="w-full bg-stone-100 dark:bg-stone-800 rounded-full h-1">
                <div className={`${colors.bar} h-1 rounded-full`} style={{ width: `${p.probabilitate}%` }} />
              </div>
              {p.cantitate_estimata > 0 && (
                <div className="bg-stone-50 dark:bg-stone-800/60 rounded-lg px-2.5 py-1.5">
                  <p className="text-[10px] text-stone-400 leading-none mb-0.5">estimat azi</p>
                  <p className="text-lg font-bold text-fuchsia-600 dark:text-fuchsia-400">
                    ~{Math.round(p.cantitate_estimata)} <span className="text-xs font-normal text-stone-400">porții</span>
                  </p>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

// ─── Tab: Pe oră ─────────────────────────────────────────────────────────────

const OrePanel: React.FC<{ model: ModelType }> = ({ model }) => {
  const { data, isFetching, refetch } = useQuery({
    queryKey:        ['predictii-ore', model],
    queryFn:         () => api.getPredictiiOre(model),
    refetchInterval: 300_000,
    staleTime:       120_000,
  });

  const ore        = data?.ore ?? {};
  const oraC       = data?.ora_curenta ?? -1;
  const openH      = data?.open_hour  ?? 10;
  const closeH     = data?.close_hour ?? 23;

  if (!data && isFetching) return (
    <div className="flex items-center justify-center py-20 text-stone-400">
      <RefreshCw className="w-6 h-6 animate-spin mr-2" /> Se calculează…
    </div>
  );

  const hours = Array.from({ length: closeH - openH }, (_, i) => openH + i);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-stone-500">
          Probabilitate comandă pe oră · {data?.data} · program {openH}:00–{closeH}:00
        </p>
        <button onClick={() => refetch()} disabled={isFetching}
          className="p-1.5 rounded-lg border border-stone-200 dark:border-stone-700 text-stone-400 hover:text-stone-600 disabled:opacity-50">
          <RefreshCw className={`w-3.5 h-3.5 ${isFetching ? 'animate-spin' : ''}`} />
        </button>
      </div>

      <div className="overflow-x-auto pb-2">
        <div className="flex gap-3 min-w-max">
          {hours.map(h => {
            const prods    = ore[String(h)] ?? [];
            const isPast   = h < oraC;
            const isCurr   = h === oraC;
            return (
              <div key={h} className={`w-44 shrink-0 transition-opacity ${isPast ? 'opacity-35' : ''}`}>
                <div className={`text-center py-1.5 text-sm font-bold rounded-t-xl ${
                  isCurr
                    ? 'bg-fuchsia-600 text-white'
                    : 'bg-stone-100 dark:bg-stone-800 text-stone-600 dark:text-stone-300'
                }`}>
                  {h}:00{isCurr && ' ←'}
                </div>
                <div className="border border-stone-200 dark:border-stone-700 border-t-0 rounded-b-xl p-2 bg-white dark:bg-stone-900 min-h-[120px]">
                  {prods.length === 0 ? (
                    <p className="text-[10px] text-stone-300 dark:text-stone-600 text-center mt-4">—</p>
                  ) : (
                    <div className="space-y-1">
                      {prods.slice(0, 10).map(p => {
                        const colors = probColor(p.probabilitate);
                        return (
                          <div key={p.product} className="flex items-center justify-between gap-1">
                            <span className="text-[11px] text-stone-700 dark:text-stone-300 truncate max-w-[100px]">{p.product}</span>
                            <span className={`text-[10px] font-bold px-1 py-0.5 rounded font-mono shrink-0 ${colors.badge}`}>
                              {p.probabilitate}%
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="flex flex-wrap gap-4 text-xs text-stone-400 pt-2 border-t border-stone-100 dark:border-stone-800">
        <div className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-emerald-500 inline-block" /> ≥70%</div>
        <div className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-amber-400 inline-block" /> 40-69%</div>
        <div className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-stone-300 inline-block" /> &lt;40%</div>
        <span className="ml-auto">P(comandat în acea oră) = 1 − ∏(1−p per sfert)</span>
      </div>
    </div>
  );
};

// ─── Tab: Deja comandat ───────────────────────────────────────────────────────

const DejaPanel: React.FC = () => {
  const { data, isFetching, refetch } = useQuery({
    queryKey:        ['predictii-deja'],
    queryFn:         () => api.getPredictiiDeja(),
    refetchInterval: 60_000,
    staleTime:       30_000,
  });

  const products = data?.products ?? [];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-stone-500">
          Comenzi de azi · {data?.data}
          {data?.ora && <> · ultima verificare {data.ora}</>}
        </p>
        <button onClick={() => refetch()} disabled={isFetching}
          className="p-1.5 rounded-lg border border-stone-200 dark:border-stone-700 text-stone-400 hover:text-stone-600 disabled:opacity-50">
          <RefreshCw className={`w-3.5 h-3.5 ${isFetching ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {products.length === 0 ? (
        <div className="text-center py-16 text-stone-400">
          <CheckCircle2 className="w-10 h-10 mx-auto mb-2 opacity-30" />
          <p className="text-sm">Nicio comandă înregistrată azi.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {/* Summary */}
          <div className="bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 rounded-xl px-4 py-3">
            <p className="text-sm text-emerald-700 dark:text-emerald-300">
              <strong>{products.length}</strong> produse distincte ·{' '}
              <strong>{products.reduce((s, p) => s + p.cantitate, 0)}</strong> porții totale
            </p>
          </div>
          {/* List */}
          <div className="bg-white dark:bg-stone-900 rounded-2xl border border-stone-200 dark:border-stone-800 overflow-hidden">
            {products.map((p, i) => (
              <div key={p.product} className={`flex items-center justify-between px-4 py-2.5 ${
                i < products.length - 1 ? 'border-b border-stone-50 dark:border-stone-800' : ''
              }`}>
                <div className="flex items-center gap-3 min-w-0">
                  <span className="text-xs font-mono text-stone-300 shrink-0">#{i + 1}</span>
                  <p className="text-sm font-medium text-stone-800 dark:text-stone-200 truncate">{p.product}</p>
                </div>
                <div className="flex items-center gap-4 shrink-0">
                  {p.ultima && (
                    <span className="text-xs text-stone-400">{p.ultima}</span>
                  )}
                  <span className="text-lg font-bold text-emerald-600 dark:text-emerald-400 w-10 text-right">
                    {p.cantitate}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

// ─── Tab: Testare model ───────────────────────────────────────────────────────

const BacktestPanel: React.FC<{ model: ModelType }> = ({ model }) => {
  const yesterday = format(subDays(new Date(), 1), 'yyyy-MM-dd');
  const [date,    setDate]    = useState(yesterday);
  const [time,    setTime]    = useState('19:00');
  const [horizon, setHorizon] = useState(20);
  const [queried, setQueried] = useState<{ dt: string; h: number; m: ModelType } | null>(null);

  const { data, isFetching, error } = useQuery({
    queryKey:  ['backtest', queried?.dt, queried?.h, queried?.m],
    queryFn:   () => api.getBacktest(queried!.dt, queried!.h, 40, queried!.m),
    enabled:   !!queried,
    staleTime: 300_000,
  });

  const handleRun = () => setQueried({ dt: `${date}T${time}`, h: horizon, m: model });

  const results = data?.results ?? [];
  const maxQty  = Math.max(...results.map(r => Math.max(r.actual_qty, r.predicted_qty)), 1);

  return (
    <div className="space-y-5">
      <div className="bg-white dark:bg-stone-900 rounded-2xl border border-stone-200 dark:border-stone-800 p-4">
        <p className="text-xs text-stone-500 mb-3">
          Alege o dată și oră din trecut — modelul va prezice fereastra de 15 min ce urmează,
          iar aplicația va arăta ce s-a comandat efectiv în acea fereastră.
        </p>
        <div className="flex flex-wrap gap-3 items-end">
          <div>
            <label className="block text-xs text-stone-500 mb-1">Data</label>
            <input type="date" value={date} onChange={e => setDate(e.target.value)}
              className="px-3 py-2 rounded-lg border border-stone-200 dark:border-stone-700 bg-stone-50 dark:bg-stone-800 text-sm text-stone-900 dark:text-stone-100 focus:outline-none focus:ring-2 focus:ring-fuchsia-500" />
          </div>
          <div>
            <label className="block text-xs text-stone-500 mb-1">Ora</label>
            <input type="time" value={time} onChange={e => setTime(e.target.value)} step="900"
              className="px-3 py-2 rounded-lg border border-stone-200 dark:border-stone-700 bg-stone-50 dark:bg-stone-800 text-sm text-stone-900 dark:text-stone-100 focus:outline-none focus:ring-2 focus:ring-fuchsia-500" />
          </div>
          <div>
            <label className="block text-xs text-stone-500 mb-1">Fereastră</label>
            <div className="flex gap-1">
              {HORIZONS.map(h => (
                <button key={h} onClick={() => setHorizon(h)}
                  className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                    horizon === h
                      ? 'bg-fuchsia-600 text-white'
                      : 'border border-stone-200 dark:border-stone-700 text-stone-600 dark:text-stone-400 hover:border-fuchsia-400'
                  }`}>
                  +{h}m
                </button>
              ))}
            </div>
          </div>
          <button onClick={handleRun} disabled={isFetching}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-fuchsia-600 hover:bg-fuchsia-700 disabled:opacity-50 text-white text-sm font-medium transition-colors">
            {isFetching
              ? <><RefreshCw className="w-4 h-4 animate-spin" />Se calculează...</>
              : <><FlaskConical className="w-4 h-4" />Rulează ({model.toUpperCase()})</>}
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-xl p-4 text-sm text-red-600 dark:text-red-400">
          Eroare la interogare.
        </div>
      )}

      {data && (
        <>
          <div className="bg-fuchsia-50 dark:bg-fuchsia-950/30 border border-fuchsia-200 dark:border-fuchsia-800 rounded-xl px-4 py-3 flex flex-wrap items-center justify-between gap-3">
            <div className="text-sm text-fuchsia-700 dark:text-fuchsia-300">
              <Sparkles className="w-4 h-4 inline mr-1.5" />
              <strong>{data.window_date}</strong> · {data.window_start}–{data.window_end}
              {' '}· {data.day_of_week} · {data.season} · <span className="font-mono uppercase">{data.model}</span>
            </div>
            <div className="flex gap-4 text-xs text-stone-500 dark:text-stone-400">
              <span><span className="font-semibold text-fuchsia-600">~{data.total_predicted}</span> prezise</span>
              <span><span className="font-semibold text-emerald-600">{data.total_actual}</span> reale</span>
            </div>
          </div>

          {data.no_data && (
            <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-xl p-4 text-sm text-amber-700 dark:text-amber-400">
              Nicio comandă în DB pentru fereastra selectată.
            </div>
          )}

          {results.length > 0 && (
            <div className="bg-white dark:bg-stone-900 rounded-2xl border border-stone-200 dark:border-stone-800 overflow-hidden">
              <div className="px-4 py-3 border-b border-stone-100 dark:border-stone-800 bg-stone-50 dark:bg-stone-800/50">
                <p className="text-sm font-semibold text-stone-700 dark:text-stone-300">
                  Predicție vs Realitate · {results.length} produse
                </p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-stone-100 dark:border-stone-800 text-left text-stone-400 uppercase tracking-wide">
                      <th className="pb-2 pt-3 px-4 font-medium">Produs</th>
                      <th className="pb-2 pt-3 pr-4 font-medium text-center">P%</th>
                      <th className="pb-2 pt-3 pr-4 font-medium"><span className="text-fuchsia-500">Prezis</span></th>
                      <th className="pb-2 pt-3 pr-4 font-medium"><span className="text-emerald-600">Real</span></th>
                      <th className="pb-2 pt-3 pr-4 font-medium text-right">Δ</th>
                    </tr>
                  </thead>
                  <tbody className="px-4">
                    {results.map(r => {
                      const probColors = probColor(r.probability);
                      const { cls, icon: DiffIcon, label } = diffBadge(r.diff);
                      return (
                        <tr key={r.product_name}
                          className={`border-b border-stone-50 dark:border-stone-800/50 hover:bg-stone-50 dark:hover:bg-stone-800/30 ${!r.in_actuals ? 'opacity-50' : ''}`}>
                          <td className="py-2 px-4 text-sm font-medium text-stone-800 dark:text-stone-200">
                            {r.product_name}
                            {!r.in_model && <span className="ml-1.5 text-[10px] bg-amber-100 text-amber-600 px-1 rounded">nou</span>}
                          </td>
                          <td className="py-2 pr-4 text-center">
                            {r.in_model ? (
                              <span className={`text-xs px-2 py-0.5 rounded-full font-mono font-bold ${probColors.badge}`}>{r.probability}%</span>
                            ) : <span className="text-stone-300 dark:text-stone-600">—</span>}
                          </td>
                          <td className="py-2 pr-4">
                            <div className="flex items-center gap-2">
                              <span className="font-mono text-fuchsia-600 dark:text-fuchsia-400 w-8 text-right">
                                {r.predicted_qty > 0 ? `~${r.predicted_qty}` : '—'}
                              </span>
                              <div className="w-16 bg-stone-100 dark:bg-stone-800 rounded-full h-1.5">
                                <div className="bg-fuchsia-400 h-1.5 rounded-full" style={{ width: `${maxQty > 0 ? Math.round(r.predicted_qty / maxQty * 100) : 0}%` }} />
                              </div>
                            </div>
                          </td>
                          <td className="py-2 pr-4">
                            <div className="flex items-center gap-2">
                              <span className="font-mono font-bold text-stone-800 dark:text-stone-200 w-8 text-right">
                                {r.actual_qty > 0 ? r.actual_qty : '—'}
                              </span>
                              <div className="w-16 bg-stone-100 dark:bg-stone-800 rounded-full h-1.5">
                                <div className="bg-emerald-500 h-1.5 rounded-full" style={{ width: `${maxQty > 0 ? Math.round(r.actual_qty / maxQty * 100) : 0}%` }} />
                              </div>
                            </div>
                          </td>
                          <td className="py-2 pr-4 text-right">
                            {r.in_model && r.in_actuals ? (
                              <span className={`inline-flex items-center gap-0.5 font-mono font-bold ${cls}`}>
                                <DiffIcon className="w-3 h-3" />{label}
                              </span>
                            ) : <span className="text-stone-300 dark:text-stone-600">—</span>}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};

// ─── Main page ────────────────────────────────────────────────────────────────

export const PredictiiPage: React.FC = () => {
  const [tab,          setTab]          = useState<TabType>('Acum');
  const [model,        setModel]        = useState<ModelType>('rf');
  const [showSettings, setShowSettings] = useState(false);

  const qc = useQueryClient();

  // Fetch status just to know if lgb is available
  const { data: status } = useQuery({
    queryKey:  ['predictii-status'],
    queryFn:   () => api.getPredictiiStatus(),
    staleTime: 60_000,
  });

  const lgbAvailable = status?.lgb_available ?? false;

  const retrain = useMutation({
    mutationFn: () => api.retrain(),
    onSuccess: () => {
      toast.success('Antrenament pornit în background…');
      // Polling status la 5s până se termină
      const poll = setInterval(() => {
        qc.invalidateQueries({ queryKey: ['predictii-status'] });
      }, 5000);
      setTimeout(() => {
        clearInterval(poll);
        qc.invalidateQueries({ queryKey: ['predictii-produse'] });
        qc.invalidateQueries({ queryKey: ['predictii-ziua'] });
        qc.invalidateQueries({ queryKey: ['predictii-ore'] });
      }, 120_000);
    },
    onError: () => toast.error('Eroare la re-antrenare'),
  });

  const modelToggleTabs: TabType[] = ['Acum', 'Azi', 'Pe oră', 'Testare model'];

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-fuchsia-600 flex items-center justify-center">
            <BrainCircuit className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-stone-900 dark:text-stone-100">Predicții Bucătărie</h1>
            <p className="text-xs text-stone-500">RF + LightGBM · 12 features · sezonalitate + sărbători</p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* Model toggle — only on relevant tabs */}
          {modelToggleTabs.includes(tab) && (
            <ModelToggle model={model} lgbAvailable={lgbAvailable} onChange={setModel} />
          )}

          {/* Settings gear */}
          <button
            onClick={() => setShowSettings(v => !v)}
            className={`p-2 rounded-lg border transition-colors ${
              showSettings
                ? 'bg-fuchsia-50 dark:bg-fuchsia-950/30 border-fuchsia-300 dark:border-fuchsia-700 text-fuchsia-600'
                : 'bg-white dark:bg-stone-900 border-stone-200 dark:border-stone-700 text-stone-500 hover:text-stone-700'
            }`}
            title="Program restaurant"
          >
            <Settings className="w-4 h-4" />
          </button>

          {/* Retrain */}
          <button
            onClick={() => retrain.mutate()}
            disabled={retrain.isPending || status?.training}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-700 text-stone-600 dark:text-stone-400 hover:border-fuchsia-400 transition-colors disabled:opacity-50"
          >
            <RotateCcw className={`w-3.5 h-3.5 ${retrain.isPending ? 'animate-spin' : ''}`} />
            Re-antrenează
          </button>
        </div>
      </div>

      {/* Settings panel */}
      {showSettings && <SettingsPanel onClose={() => setShowSettings(false)} />}

      {/* Model label badge */}
      {modelToggleTabs.includes(tab) && (
        <div className="flex items-center gap-2 text-xs text-stone-400">
          <span>Model activ:</span>
          <span className={`px-2 py-0.5 rounded font-semibold font-mono ${
            model === 'lgb'
              ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300'
              : 'bg-fuchsia-100 text-fuchsia-700 dark:bg-fuchsia-900/40 dark:text-fuchsia-300'
          }`}>
            {model === 'rf' ? 'Random Forest' : 'LightGBM'}
          </span>
          {model === 'lgb' && !lgbAvailable && (
            <span className="text-amber-500">⚠ LGB indisponibil — folosind RF ca fallback</span>
          )}
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 bg-stone-100 dark:bg-stone-800 p-1 rounded-xl w-fit overflow-x-auto">
        {TABS.map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${
              tab === t
                ? 'bg-white dark:bg-stone-900 text-stone-900 dark:text-stone-100 shadow-sm'
                : 'text-stone-500 dark:text-stone-400 hover:text-stone-700'
            }`}>
            {t === 'Testare model' && <FlaskConical className="w-3.5 h-3.5 inline mr-1.5" />}
            {t}
          </button>
        ))}
      </div>

      {/* Content */}
      {tab === 'Acum'           && <AcumPanel model={model} />}
      {tab === 'Azi'            && <AziPanel  model={model} />}
      {tab === 'Pe oră'         && <OrePanel  model={model} />}
      {tab === 'Deja comandat'  && <DejaPanel />}
      {tab === 'Testare model'  && <BacktestPanel model={model} />}
    </div>
  );
};
