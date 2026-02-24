import React, { useState, useRef, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Eye, EyeOff, Copy, Check, Save, X, KeyRound, RotateCcw, TrendingUp, Lock, RefreshCw, AlertTriangle, CheckCircle, List, ChevronDown, Wifi, WifiOff, Bot, Send, XCircle } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '@/services/api';
import type { Setting } from '@/types';

const KEYS_PASSWORD = '2910';

// ─── Password Gate ────────────────────────────────────────────────────────────

const PasswordGate: React.FC<{ onUnlock: () => void }> = ({ onUnlock }) => {
  const [value, setValue] = useState('');
  const [error, setError] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const submit = () => {
    if (value === KEYS_PASSWORD) {
      onUnlock();
    } else {
      setError(true);
      setValue('');
      setTimeout(() => setError(false), 1200);
      inputRef.current?.focus();
    }
  };

  return (
    <div className="max-w-sm mx-auto mt-16">
      <div className="bg-white dark:bg-stone-900 rounded-2xl border border-stone-200 dark:border-stone-800 p-8 text-center shadow-sm">
        <div className="w-14 h-14 rounded-2xl bg-stone-100 dark:bg-stone-800 flex items-center justify-center mx-auto mb-5">
          <Lock className="w-7 h-7 text-stone-500 dark:text-stone-400" />
        </div>
        <h2 className="text-lg font-semibold text-stone-900 dark:text-stone-100 mb-1">Secțiune protejată</h2>
        <p className="text-sm text-stone-400 mb-6">Introdu parola pentru a accesa cheile API</p>

        <input
          ref={inputRef}
          type="password"
          value={value}
          onChange={(e) => { setValue(e.target.value); setError(false); }}
          onKeyDown={(e) => e.key === 'Enter' && submit()}
          placeholder="Parolă"
          className={`w-full px-4 py-2.5 text-center text-lg font-mono rounded-xl border transition-all outline-none
            ${error
              ? 'border-red-400 bg-red-50 dark:bg-red-900/20 dark:border-red-700 animate-shake'
              : 'border-stone-300 dark:border-stone-600 bg-white dark:bg-stone-800 focus:ring-2 focus:ring-red-500 focus:border-transparent'
            }
            text-stone-900 dark:text-stone-100`}
          maxLength={20}
        />
        {error && (
          <p className="text-xs text-red-500 mt-2">Parolă incorectă</p>
        )}

        <button
          onClick={submit}
          className="mt-4 w-full py-2.5 rounded-xl bg-red-600 hover:bg-red-700 text-white text-sm font-medium transition-colors"
        >
          Deblochează
        </button>
      </div>
    </div>
  );
};

// ─── Types ────────────────────────────────────────────────────────────────────

interface KeyField {
  cheie: string;
  label: string;
  description: string;
  sensitive: boolean;
  type?: 'text' | 'url';
}

interface KeySection {
  title: string;
  description: string;
  fields: KeyField[];
  usage?: boolean; // show SerpAPI usage widget
}

// ─── Config ───────────────────────────────────────────────────────────────────

const KEY_SECTIONS: KeySection[] = [
  {
    title: 'SerpAPI — Google Reviews',
    description: 'Două chei disponibile (250 apeluri/lună fiecare). Zile impare → Cheie 1 | Zile pare → Cheie 2.',
    usage: true,
    fields: [
      {
        cheie: 'serpapi_api_key',
        label: 'Cheie 1 (zile impare: 1, 3, 5…)',
        description: 'Folosită în zilele 1, 3, 5, 7… ale lunii',
        sensitive: true,
      },
      {
        cheie: 'serpapi_api_key_2',
        label: 'Cheie 2 (zile pare: 2, 4, 6…)',
        description: 'Folosită în zilele 2, 4, 6, 8… ale lunii',
        sensitive: true,
      },
      {
        cheie: 'serpapi_data_id',
        label: 'Google Maps Data ID',
        description: 'Identificatorul locației (ex: 0x40b1f7...)',
        sensitive: false,
      },
    ],
  },
  {
    title: 'Home Assistant',
    description: 'Conectare la instanța locală Home Assistant pentru automatizări.',
    fields: [
      {
        cheie: 'hass_url',
        label: 'URL',
        description: 'Adresa serverului (ex: http://192.168.1.x:8123)',
        sensitive: false,
        type: 'url',
      },
      {
        cheie: 'hass_token',
        label: 'Long-Lived Access Token',
        description: 'Token generat din profilul Home Assistant',
        sensitive: true,
      },
    ],
  },
  {
    title: 'Bearer Token — Pontaj',
    description: 'Token JWT folosit pentru API-ul legacy de pontaj (stocat în fișierul .set).',
    fields: [
      {
        cheie: 'bearer',
        label: 'Bearer Token',
        description: 'Token JWT pentru autentificare la API-ul de pontaj',
        sensitive: true,
      },
    ],
  },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function maskValue(val: string): string {
  if (!val) return '';
  if (val.length <= 8) return '•'.repeat(val.length);
  return val.slice(0, 6) + '•'.repeat(Math.min(val.length - 10, 24)) + val.slice(-4);
}

function getSetting(settings: Setting[], cheie: string): string {
  return settings.find((s) => s.cheie === cheie)?.valoare ?? '';
}

// ─── SerpAPI Log ──────────────────────────────────────────────────────────────

const SOURCE_LABELS: Record<string, { label: string; cls: string }> = {
  scheduler: { label: 'auto',    cls: 'bg-stone-100 dark:bg-stone-800 text-stone-500 dark:text-stone-400' },
  manual:    { label: 'manual',  cls: 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400' },
  refetch:   { label: 'refetch', cls: 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400' },
};

const SerpLog: React.FC = () => {
  const [expanded, setExpanded] = useState(false);

  const { data: entries = [], isLoading, refetch } = useQuery({
    queryKey: ['serp-log'],
    queryFn: () => api.getSerpLog(100),
    refetchInterval: expanded ? 30_000 : false,
    enabled: expanded,
  });

  const fmt = (iso: string) => {
    try {
      const d = new Date(iso);
      return d.toLocaleString('ro-RO', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' });
    } catch { return iso; }
  };

  return (
    <div className="mx-4 mb-3">
      <button
        onClick={() => setExpanded((e) => !e)}
        className="flex items-center justify-between w-full text-xs font-semibold text-stone-600 dark:text-stone-400 hover:text-stone-800 dark:hover:text-stone-200 transition-colors"
      >
        <span className="flex items-center gap-1.5">
          <List className="w-3.5 h-3.5" />
          Log apeluri SerpAPI
          {expanded && entries.length > 0 && (
            <span className="font-normal text-stone-400">({entries.length} intrări)</span>
          )}
        </span>
        <ChevronDown className={`w-3.5 h-3.5 transition-transform ${expanded ? 'rotate-180' : ''}`} />
      </button>

      {expanded && (
        <div className="mt-2">
          <div className="flex justify-end mb-1">
            <button
              onClick={() => refetch()}
              className="p-1 rounded text-stone-400 hover:text-stone-600 dark:hover:text-stone-300 transition-colors"
              title="Reîncarcă"
            >
              <RefreshCw className="w-3 h-3" />
            </button>
          </div>

          {isLoading ? (
            <p className="text-xs text-stone-400 py-2">Se încarcă...</p>
          ) : entries.length === 0 ? (
            <p className="text-xs text-stone-400 italic py-2">Niciun apel înregistrat încă.</p>
          ) : (
            <div className="rounded-lg border border-stone-200 dark:border-stone-700 overflow-hidden">
              <div className="overflow-x-auto max-h-64 overflow-y-auto">
                <table className="w-full text-xs">
                  <thead className="bg-stone-50 dark:bg-stone-800/70 sticky top-0">
                    <tr>
                      <th className="px-2 py-1.5 text-left font-medium text-stone-500 whitespace-nowrap">Timestamp</th>
                      <th className="px-2 py-1.5 text-left font-medium text-stone-500">Cheie</th>
                      <th className="px-2 py-1.5 text-left font-medium text-stone-500">Sursă</th>
                      <th className="px-2 py-1.5 text-left font-medium text-stone-500">Pag.</th>
                      <th className="px-2 py-1.5 text-left font-medium text-stone-500">Status</th>
                      <th className="px-2 py-1.5 text-left font-medium text-stone-500">ms</th>
                      <th className="px-2 py-1.5 text-left font-medium text-stone-500">URL</th>
                      <th className="px-2 py-1.5 text-left font-medium text-stone-500">Eroare</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-100 dark:divide-stone-800">
                    {entries.map((e, i) => {
                      const src = SOURCE_LABELS[e.source] ?? { label: e.source, cls: 'bg-stone-100 text-stone-500' };
                      const isOk = e.status === 'ok';
                      return (
                        <tr key={i} className="bg-white dark:bg-stone-900 hover:bg-stone-50 dark:hover:bg-stone-800/50">
                          <td className="px-2 py-1.5 font-mono text-stone-500 whitespace-nowrap">{fmt(e.ts)}</td>
                          <td className="px-2 py-1.5">
                            <span className={`px-1.5 py-0.5 rounded font-mono font-semibold ${
                              e.key === 1
                                ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400'
                                : 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400'
                            }`}>K{e.key}</span>
                          </td>
                          <td className="px-2 py-1.5">
                            <span className={`px-1.5 py-0.5 rounded ${src.cls}`}>{src.label}</span>
                          </td>
                          <td className="px-2 py-1.5 font-mono text-stone-500 text-center">{e.page}</td>
                          <td className="px-2 py-1.5">
                            <span className={`font-semibold ${isOk ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500'}`}>
                              {isOk ? '✓' : '✗'} {e.status_code || ''}
                            </span>
                          </td>
                          <td className="px-2 py-1.5 font-mono text-stone-400">{e.ms}</td>
                          <td className="px-2 py-1.5 max-w-[220px]">
                            {e.url ? (
                              <span
                                className="font-mono text-[10px] text-stone-400 truncate block cursor-help"
                                title={e.url}
                              >
                                {(() => {
                                  try {
                                    const u = new URL(e.url);
                                    const token = u.searchParams.get('next_page_token');
                                    if (token) return `…?next_page_token=${token.slice(0, 16)}…`;
                                    return u.pathname + '?' + u.searchParams.get('engine');
                                  } catch { return e.url.slice(0, 40); }
                                })()}
                              </span>
                            ) : '—'}
                          </td>
                          <td className="px-2 py-1.5 text-red-500 max-w-[160px] truncate" title={e.error}>{e.error || '—'}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

// ─── Refetch from date widget ────────────────────────────────────────────────

const RefetchWidget: React.FC = () => {
  const qc = useQueryClient();
  const [dateVal, setDateVal] = useState('');
  const [useDate, setUseDate] = useState(true);
  const [maxCalls, setMaxCalls] = useState(10);
  const [keyMode, setKeyMode] = useState<'alternate' | 'key1' | 'key2'>('alternate');
  const [confirm, setConfirm] = useState(false);
  const [result, setResult] = useState<{
    inserted: number; skipped: number; pages_fetched: number;
    calls_per_key: Record<string, number>; from_date: string; stop_reason?: string;
  } | null>(null);

  const mutation = useMutation({
    mutationFn: () => api.refetchReviewsFromDate(useDate ? dateVal : '', maxCalls, keyMode, useDate),
    onSuccess: (res) => {
      setResult(res);
      setConfirm(false);
      qc.invalidateQueries({ queryKey: ['settings-all'] });
      qc.invalidateQueries({ queryKey: ['google-reviews-summary'] });
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.detail || 'Eroare la re-fetch');
      setConfirm(false);
    },
  });

  const maxDate = new Date().toISOString().split('T')[0];
  const inputCls = 'px-2.5 py-1.5 text-xs rounded-lg border border-amber-300 dark:border-amber-700 bg-white dark:bg-stone-800 text-stone-800 dark:text-stone-200 focus:outline-none focus:ring-2 focus:ring-amber-400';

  return (
    <div className="mx-4 mb-3 p-3 rounded-lg border border-amber-200 dark:border-amber-800/50 bg-amber-50 dark:bg-amber-900/10">
      <div className="flex items-center gap-1.5 text-xs font-semibold text-amber-700 dark:text-amber-400 mb-2">
        <RefreshCw className="w-3.5 h-3.5" />
        Re-fetch de la dată
      </div>

      {result && !mutation.isPending && (
        <div className="mb-2 p-2 rounded-lg bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800/50 text-xs text-emerald-700 dark:text-emerald-400 flex items-start gap-2">
          <CheckCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
          <span>
            Adăugat <strong>{result.inserted}</strong> · Existente <strong>{result.skipped}</strong> · Pagini <strong>{result.pages_fetched}</strong>
            {Object.keys(result.calls_per_key).length > 0 && (
              <> · Apeluri: {Object.entries(result.calls_per_key).map(([k, v]) => `cheie ${k}: ${v}`).join(', ')}</>
            )}
            {result.stop_reason && (
              <> · <span className="text-stone-400">Stop: {result.stop_reason}</span></>
            )}
          </span>
        </div>
      )}

      {!confirm ? (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <label className="flex items-center gap-1.5 text-xs text-amber-700 dark:text-amber-400 cursor-pointer select-none whitespace-nowrap">
              <input
                type="checkbox"
                checked={useDate}
                onChange={(e) => { setUseDate(e.target.checked); setResult(null); }}
                className="rounded"
              />
              Oprire la dată
            </label>
            <input
              type="date"
              value={dateVal}
              max={maxDate}
              disabled={!useDate}
              onChange={(e) => { setDateVal(e.target.value); setResult(null); }}
              className={`flex-1 ${inputCls} disabled:opacity-40`}
            />
            <input
              type="number"
              value={maxCalls}
              min={1}
              onChange={(e) => setMaxCalls(Math.max(1, parseInt(e.target.value) || 1))}
              className={`w-20 ${inputCls}`}
              title="Număr maxim de apeluri API"
            />
          </div>
          <div className="flex items-center gap-2">
            <select
              value={keyMode}
              onChange={(e) => setKeyMode(e.target.value as 'alternate' | 'key1' | 'key2')}
              className={`flex-1 ${inputCls}`}
            >
              <option value="alternate">Alternare (Cheie 1 + 2)</option>
              <option value="key1">Cheie 1</option>
              <option value="key2">Cheie 2</option>
            </select>
            <button
              onClick={() => (!useDate || dateVal) && setConfirm(true)}
              disabled={useDate && !dateVal}
              className="px-3 py-1.5 text-xs font-medium rounded-lg bg-amber-600 hover:bg-amber-700 text-white disabled:opacity-40 transition-colors whitespace-nowrap"
            >
              Execută
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          <div className="flex items-start gap-1.5 text-xs text-amber-700 dark:text-amber-400">
            <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
            <span>
              {useDate
                ? <>Se vor fetcha review-uri din <strong>{dateVal}</strong> până azi, </>
                : <>Se vor fetcha review-uri fără limită de dată, </>
              }
              max <strong>{maxCalls}</strong> apeluri, {keyMode === 'alternate' ? 'alternând cheile' : `cheie ${keyMode === 'key1' ? '1' : '2'}`}.
              Review-urile existente sunt păstrate. Confirmă?
            </span>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => mutation.mutate()}
              disabled={mutation.isPending}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-amber-600 hover:bg-amber-700 text-white disabled:opacity-50 transition-colors"
            >
              {mutation.isPending
                ? <><RefreshCw className="w-3 h-3 animate-spin" /> Se procesează...</>
                : <><Check className="w-3 h-3" /> Confirmă</>
              }
            </button>
            <button
              onClick={() => setConfirm(false)}
              disabled={mutation.isPending}
              className="px-3 py-1.5 text-xs rounded-lg text-stone-500 hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors"
            >
              Anulează
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

// ─── SerpAPI Account Info ─────────────────────────────────────────────────────

type AccountData = {
  plan_name: string; account_status: string; searches_per_month: number;
  plan_searches_left: number; extra_credits: number; total_searches_left: number;
  this_month_usage: number; this_hour_searches: number; last_hour_searches: number;
  account_rate_limit_per_hour: number; error?: string;
} | null;

const AccountKeyCard: React.FC<{ label: string; data: AccountData }> = ({ label, data }) => {
  if (!data) return (
    <div className="flex-1 rounded-lg border border-stone-200 dark:border-stone-700 px-3 py-2.5 text-xs text-stone-400 italic">
      {label} — neconfigurat
    </div>
  );

  if (data.error) return (
    <div className="flex-1 rounded-lg border border-red-200 dark:border-red-800/50 px-3 py-2.5 text-xs text-red-500">
      <WifiOff className="w-3.5 h-3.5 inline mr-1" />{label} — eroare: {data.error}
    </div>
  );

  const pct = Math.min((data.this_month_usage / data.searches_per_month) * 100, 100);
  const barColor = pct >= 90 ? 'bg-red-500' : pct >= 70 ? 'bg-amber-500' : 'bg-emerald-500';
  const isActive = data.account_status === 'Active';

  return (
    <div className="flex-1 rounded-lg border border-stone-200 dark:border-stone-700 bg-stone-50 dark:bg-stone-800/40 px-3 py-2.5 space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-stone-700 dark:text-stone-200">{label}</span>
        <span className={`flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded-full ${
          isActive
            ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400'
            : 'bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400'
        }`}>
          {isActive ? <Wifi className="w-2.5 h-2.5" /> : <WifiOff className="w-2.5 h-2.5" />}
          {data.account_status}
        </span>
      </div>

      <div className="text-[10px] text-stone-500 dark:text-stone-400">{data.plan_name}</div>

      <div>
        <div className="flex justify-between text-[10px] text-stone-500 mb-0.5">
          <span>Utilizat luna aceasta</span>
          <span className="font-mono">{data.this_month_usage} / {data.searches_per_month}</span>
        </div>
        <div className="h-1.5 bg-stone-200 dark:bg-stone-700 rounded-full overflow-hidden">
          <div className={`h-full rounded-full ${barColor}`} style={{ width: `${pct}%` }} />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-[10px]">
        <span className="text-stone-400">Rămase total</span>
        <span className="font-mono text-stone-600 dark:text-stone-300 text-right">{data.total_searches_left}</span>
        <span className="text-stone-400">Credit extra</span>
        <span className="font-mono text-stone-600 dark:text-stone-300 text-right">{data.extra_credits}</span>
        <span className="text-stone-400">Ora aceasta</span>
        <span className="font-mono text-stone-600 dark:text-stone-300 text-right">{data.this_hour_searches} / {data.account_rate_limit_per_hour}</span>
        <span className="text-stone-400">Ora trecută</span>
        <span className="font-mono text-stone-600 dark:text-stone-300 text-right">{data.last_hour_searches}</span>
      </div>
    </div>
  );
};

const SerpApiAccountInfo: React.FC = () => {
  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ['serpapi-account'],
    queryFn: () => api.getSerpApiAccount(false),
    staleTime: 5 * 60 * 1000,
  });

  const refreshMutation = useMutation({
    mutationFn: () => api.getSerpApiAccount(true),
    onSuccess: () => { refetch(); toast.success('Info cont actualizat'); },
    onError: () => toast.error('Eroare la refresh'),
  });

  const fmtDate = (iso: string | null) => {
    if (!iso) return null;
    try { return new Date(iso).toLocaleString('ro-RO', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }); }
    catch { return iso; }
  };

  return (
    <div className="mx-4 mb-3">
      <div className="flex items-center justify-between mb-2">
        <div className="text-xs font-semibold text-stone-600 dark:text-stone-400 flex items-center gap-1.5">
          <Wifi className="w-3.5 h-3.5" />
          Status cont SerpAPI
          {data?.fetched_at && (
            <span className="font-normal text-stone-400">· actualizat {fmtDate(data.fetched_at)}</span>
          )}
        </div>
        <button
          onClick={() => refreshMutation.mutate()}
          disabled={refreshMutation.isPending || isFetching}
          className="p-1 rounded text-stone-400 hover:text-stone-600 dark:hover:text-stone-300 transition-colors disabled:opacity-40"
          title="Actualizează acum"
        >
          <RefreshCw className={`w-3 h-3 ${(refreshMutation.isPending || isFetching) ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {isLoading ? (
        <p className="text-xs text-stone-400 py-1">Se încarcă...</p>
      ) : (
        <div className="flex gap-2">
          <AccountKeyCard label="Cheie 1" data={data?.key1 ?? null} />
          <AccountKeyCard label="Cheie 2" data={data?.key2 ?? null} />
        </div>
      )}
    </div>
  );
};

// ─── SerpAPI Usage Widget ─────────────────────────────────────────────────────

const SerpApiUsage: React.FC<{ settings: Setting[] }> = ({ settings }) => {
  const qc = useQueryClient();
  const count1 = parseInt(getSetting(settings, 'serpapi_calls_1') || '0', 10);
  const count2 = parseInt(getSetting(settings, 'serpapi_calls_2') || '0', 10);
  const month = getSetting(settings, 'serpapi_calls_month') || '—';
  const LIMIT = 250;

  const resetMutation = useMutation({
    mutationFn: () => api.resetSerpApiCounters(),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['settings-all'] });
      toast.success(`Contoare resetate pentru ${res.month}`);
    },
    onError: () => toast.error('Eroare la resetare'),
  });

  const bar = (count: number) => Math.min((count / LIMIT) * 100, 100);
  const color = (count: number) =>
    count >= LIMIT ? 'bg-red-500' : count >= LIMIT * 0.8 ? 'bg-amber-500' : 'bg-emerald-500';

  return (
    <div className="mx-4 mb-3 p-3 rounded-lg bg-stone-50 dark:bg-stone-800/50 border border-stone-200 dark:border-stone-700">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-1.5 text-xs font-medium text-stone-600 dark:text-stone-400">
          <TrendingUp className="w-3.5 h-3.5" />
          Apeluri luna aceasta
          <span className="text-stone-400 font-normal">({month})</span>
        </div>
        <button
          onClick={() => resetMutation.mutate()}
          disabled={resetMutation.isPending}
          className="flex items-center gap-1 text-xs text-stone-400 hover:text-red-500 transition-colors"
          title="Resetează contoarele"
        >
          <RotateCcw className="w-3 h-3" />
          Reset
        </button>
      </div>

      <div className="space-y-2">
        {[
          { label: 'Cheie 1 (zile impare)', count: count1 },
          { label: 'Cheie 2 (zile pare)', count: count2 },
        ].map(({ label, count }) => (
              <div key={label}>
                <div className="flex justify-between text-xs text-stone-500 dark:text-stone-400 mb-0.5">
                  <span>{label}</span>
                  <span className="font-mono">
                    <span className={count >= LIMIT ? 'text-red-500 font-semibold' : ''}>{count}</span>
                    <span className="text-stone-400"> / {LIMIT}</span>
                  </span>
                </div>
                <div className="h-1.5 bg-stone-200 dark:bg-stone-700 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${color(count)}`}
                    style={{ width: `${bar(count)}%` }}
                  />
                </div>
              </div>
            ))}
      </div>
    </div>
  );
};

// ─── Single field row ─────────────────────────────────────────────────────────

interface FieldRowProps {
  field: KeyField;
  value: string;
}

const FieldRow: React.FC<FieldRowProps> = ({ field, value }) => {
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [revealed, setRevealed] = useState(false);
  const [copied, setCopied] = useState(false);

  const isConfigured = value.trim().length > 0;

  const mutation = useMutation({
    mutationFn: async (newVal: string) => {
      if (field.cheie === 'bearer') {
        return api.updateBearerToken(newVal);
      }
      return api.updateSetting(field.cheie, newVal);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['settings-all'] });
      qc.invalidateQueries({ queryKey: ['bearer-token'] });
      toast.success(`${field.label} salvat`);
      setEditing(false);
      setRevealed(false);
    },
    onError: () => toast.error('Eroare la salvare'),
  });

  const startEdit = () => {
    setDraft(value);
    setEditing(true);
    setRevealed(true);
  };

  const cancelEdit = () => {
    setEditing(false);
    setRevealed(false);
    setDraft('');
  };

  const copy = async () => {
    if (!value) return;
    await navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="py-3 border-b border-stone-100 dark:border-stone-800 last:border-0">
      <div className="flex items-start justify-between gap-3 mb-1">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-stone-800 dark:text-stone-200">
              {field.label}
            </span>
            <span
              className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${
                isConfigured
                  ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400'
                  : 'bg-stone-100 dark:bg-stone-800 text-stone-400'
              }`}
            >
              {isConfigured ? 'configurat' : 'neconfigurat'}
            </span>
          </div>
          <p className="text-xs text-stone-400 mt-0.5">{field.description}</p>
        </div>

        {!editing && (
          <div className="flex items-center gap-1 shrink-0">
            {isConfigured && field.sensitive && (
              <button
                onClick={() => setRevealed((r) => !r)}
                className="p-1.5 rounded-lg text-stone-400 hover:text-stone-600 dark:hover:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors"
                title={revealed ? 'Ascunde' : 'Arată'}
              >
                {revealed ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
              </button>
            )}
            {isConfigured && (
              <button
                onClick={copy}
                className="p-1.5 rounded-lg text-stone-400 hover:text-stone-600 dark:hover:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors"
                title="Copiază"
              >
                {copied ? (
                  <Check className="w-3.5 h-3.5 text-emerald-500" />
                ) : (
                  <Copy className="w-3.5 h-3.5" />
                )}
              </button>
            )}
            <button
              onClick={startEdit}
              className="px-2.5 py-1 text-xs rounded-lg bg-stone-100 dark:bg-stone-800 text-stone-600 dark:text-stone-400 hover:bg-red-50 dark:hover:bg-red-900/20 hover:text-red-600 dark:hover:text-red-400 transition-colors"
            >
              {isConfigured ? 'Editează' : 'Configurează'}
            </button>
          </div>
        )}
      </div>

      {!editing && isConfigured && (
        <div className="mt-1.5 px-3 py-2 bg-stone-50 dark:bg-stone-800/50 rounded-lg font-mono text-xs text-stone-600 dark:text-stone-400 break-all select-all">
          {field.sensitive && !revealed ? maskValue(value) : value}
        </div>
      )}

      {editing && (
        <div className="mt-2 space-y-2">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={field.sensitive && draft.length > 80 ? 3 : 1}
            className="w-full px-3 py-2 text-xs font-mono rounded-lg border border-stone-300 dark:border-stone-600 bg-white dark:bg-stone-800 text-stone-900 dark:text-stone-100 focus:outline-none focus:ring-2 focus:ring-red-500 resize-none"
            placeholder={`Introdu ${field.label}...`}
            autoFocus
          />
          <div className="flex items-center gap-2">
            <button
              onClick={() => mutation.mutate(draft)}
              disabled={mutation.isPending}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-red-600 text-white hover:bg-red-700 disabled:opacity-50 transition-colors"
            >
              <Save className="w-3.5 h-3.5" />
              {mutation.isPending ? 'Se salvează...' : 'Salvează'}
            </button>
            <button
              onClick={cancelEdit}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg text-stone-600 dark:text-stone-400 hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors"
            >
              <X className="w-3.5 h-3.5" />
              Anulează
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

// ─── Ollama config widget ──────────────────────────────────────────────────────

const OllamaConfigWidget: React.FC = () => {
  const qc = useQueryClient();
  const [ollamaHost, setOllamaHost] = useState('');
  const [embeddingModel, setEmbeddingModel] = useState('');
  const [chatModel, setChatModel] = useState('');

  const { data: settings = [] } = useQuery({
    queryKey: ['settings-all'],
    queryFn: () => api.getSettings(),
  });

  useEffect(() => {
    const host = settings.find((s) => s.cheie === 'ollama_host');
    const emb  = settings.find((s) => s.cheie === 'ollama_embedding_model');
    const chat = settings.find((s) => s.cheie === 'ollama_chat_model');
    if (host?.valoare && !ollamaHost)       setOllamaHost(host.valoare);
    if (emb?.valoare  && !embeddingModel)   setEmbeddingModel(emb.valoare);
    if (chat?.valoare && !chatModel)        setChatModel(chat.valoare);
  }, [settings]);

  const mutation = useMutation({
    mutationFn: ({ cheie, valoare }: { cheie: string; valoare: string }) =>
      api.upsertSetting(cheie, valoare),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['settings-all'] }),
  });

  const handleSave = async () => {
    try {
      await Promise.all([
        mutation.mutateAsync({ cheie: 'ollama_host',            valoare: ollamaHost }),
        mutation.mutateAsync({ cheie: 'ollama_embedding_model', valoare: embeddingModel }),
        mutation.mutateAsync({ cheie: 'ollama_chat_model',      valoare: chatModel }),
      ]);
      toast.success('Setări Ollama salvate');
    } catch {
      toast.error('Eroare la salvare');
    }
  };

  const inputCls = 'w-full px-3 py-2 text-xs rounded-lg border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-800 text-stone-900 dark:text-stone-100 focus:outline-none focus:ring-2 focus:ring-red-500';
  const labelCls = 'block text-xs font-medium text-stone-500 dark:text-stone-400 mb-1';

  return (
    <div className="bg-white dark:bg-stone-900 rounded-xl border border-stone-200 dark:border-stone-800 overflow-hidden">
      <div className="px-4 py-3 border-b border-stone-100 dark:border-stone-800 bg-stone-50 dark:bg-stone-800/50 flex items-center gap-2">
        <Bot className="w-4 h-4 text-stone-500" />
        <div>
          <h3 className="text-sm font-semibold text-stone-800 dark:text-stone-200">Conexiune AI (Ollama)</h3>
          <p className="text-xs text-stone-400 mt-0.5">Host și modele pentru autocomplete semantic și chat</p>
        </div>
      </div>
      <div className="px-4 py-4 space-y-3">
        <div>
          <label className={labelCls}>Ollama Host URL</label>
          <input value={ollamaHost} onChange={(e) => setOllamaHost(e.target.value)} placeholder="http://localhost:11434" className={inputCls} />
        </div>
        <div>
          <label className={labelCls}>Model Embeddings</label>
          <input value={embeddingModel} onChange={(e) => setEmbeddingModel(e.target.value)} placeholder="mxbai-embed-large" className={inputCls} />
        </div>
        <div>
          <label className={labelCls}>Model Chat (opțional)</label>
          <input value={chatModel} onChange={(e) => setChatModel(e.target.value)} placeholder="llama3.2:3b" className={inputCls} />
        </div>
        <div className="pt-1">
          <button
            onClick={handleSave}
            disabled={mutation.isPending}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-red-600 text-white hover:bg-red-700 disabled:opacity-50 transition-colors"
          >
            <Save className="w-3.5 h-3.5" />
            {mutation.isPending ? 'Se salvează...' : 'Salvează'}
          </button>
        </div>
      </div>
    </div>
  );
};


// ─── SMS Gateway widget ────────────────────────────────────────────────────────

const SmsGatewayWidget: React.FC = () => {
  const qc = useQueryClient();
  const [dinstarIp,   setDinstarIp]   = useState('');
  const [dinstarUser, setDinstarUser] = useState('');
  const [dinstarPass, setDinstarPass] = useState('');
  const [showPass,    setShowPass]    = useState(false);
  const [testPhone,   setTestPhone]   = useState('');
  const [testResult,  setTestResult]  = useState<{ ok: boolean; msg: string } | null>(null);

  const { data: settings = [] } = useQuery({
    queryKey: ['settings-all'],
    queryFn: () => api.getSettings(),
  });

  useEffect(() => {
    const ip   = settings.find((s) => s.cheie === 'dinstar_ip');
    const user = settings.find((s) => s.cheie === 'dinstar_user');
    const pass = settings.find((s) => s.cheie === 'dinstar_pass');
    if (ip?.valoare   && !dinstarIp)   setDinstarIp(ip.valoare);
    if (user?.valoare && !dinstarUser) setDinstarUser(user.valoare);
    if (pass?.valoare && !dinstarPass) setDinstarPass(pass.valoare);
  }, [settings]);

  const saveMutation = useMutation({
    mutationFn: ({ cheie, valoare }: { cheie: string; valoare: string }) =>
      api.upsertSetting(cheie, valoare),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['settings-all'] }),
  });

  const testMutation = useMutation({
    mutationFn: () => api.sendSms(testPhone, 'Test SMS din Cheltuieli App'),
    onSuccess: (res) => {
      if (res.ok) setTestResult({ ok: true,  msg: `SMS acceptat pentru ${testPhone}` });
      else        setTestResult({ ok: false, msg: res.error || 'Gateway a refuzat mesajul' });
    },
    onError: (err: any) => {
      setTestResult({ ok: false, msg: err.response?.data?.detail || 'Eroare de rețea' });
    },
  });

  const handleSave = async () => {
    try {
      await Promise.all([
        saveMutation.mutateAsync({ cheie: 'dinstar_ip',   valoare: dinstarIp   }),
        saveMutation.mutateAsync({ cheie: 'dinstar_user', valoare: dinstarUser }),
        saveMutation.mutateAsync({ cheie: 'dinstar_pass', valoare: dinstarPass }),
      ]);
      toast.success('Gateway SMS salvat');
    } catch {
      toast.error('Eroare la salvare');
    }
  };

  const isConfigured = !!(dinstarIp && dinstarUser && dinstarPass);
  const inputCls = 'w-full px-3 py-2 text-xs rounded-lg border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-800 text-stone-900 dark:text-stone-100 focus:outline-none focus:ring-2 focus:ring-red-500';
  const labelCls = 'block text-xs font-medium text-stone-500 dark:text-stone-400 mb-1';

  return (
    <div className="bg-white dark:bg-stone-900 rounded-xl border border-stone-200 dark:border-stone-800 overflow-hidden">
      <div className="px-4 py-3 border-b border-stone-100 dark:border-stone-800 bg-stone-50 dark:bg-stone-800/50 flex items-center gap-2">
        <Send className="w-4 h-4 text-stone-500" />
        <div>
          <h3 className="text-sm font-semibold text-stone-800 dark:text-stone-200">SMS Gateway (Dinstar)</h3>
          <p className="text-xs text-stone-400 mt-0.5">Configurare conexiune și test trimitere</p>
        </div>
      </div>
      <div className="px-4 py-4 space-y-3">
        <div>
          <label className={labelCls}>IP / Host gateway</label>
          <input value={dinstarIp} onChange={(e) => setDinstarIp(e.target.value)} placeholder="192.168.1.100" className={inputCls} />
        </div>
        <div>
          <label className={labelCls}>Utilizator</label>
          <input value={dinstarUser} onChange={(e) => setDinstarUser(e.target.value)} placeholder="admin" className={inputCls} />
        </div>
        <div>
          <label className={labelCls}>Parolă</label>
          <div className="relative">
            <input
              type={showPass ? 'text' : 'password'}
              value={dinstarPass}
              onChange={(e) => setDinstarPass(e.target.value)}
              placeholder="••••••••"
              className={`${inputCls} pr-8`}
            />
            <button type="button" onClick={() => setShowPass(v => !v)}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-600 dark:hover:text-stone-200"
            >
              {showPass ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
            </button>
          </div>
        </div>
        <div className="pt-1 pb-4 border-b border-stone-100 dark:border-stone-800">
          <button
            onClick={handleSave}
            disabled={saveMutation.isPending}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-red-600 text-white hover:bg-red-700 disabled:opacity-50 transition-colors"
          >
            <Save className="w-3.5 h-3.5" />
            {saveMutation.isPending ? 'Se salvează...' : 'Salvează'}
          </button>
        </div>

        <div className="flex items-center gap-1.5 pt-1 text-xs font-semibold text-stone-500 dark:text-stone-400 uppercase tracking-wide">
          <Send className="w-3.5 h-3.5" />
          Test trimitere
        </div>
        <div className="flex gap-2 items-end">
          <div className="flex-1">
            <label className={labelCls}>Număr de test</label>
            <input
              type="tel"
              value={testPhone}
              onChange={(e) => { setTestPhone(e.target.value); setTestResult(null); }}
              placeholder="07xxxxxxxxx"
              className={`${inputCls} font-mono`}
            />
          </div>
          <button
            onClick={() => testMutation.mutate()}
            disabled={!testPhone.trim() || !isConfigured || testMutation.isPending}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-stone-700 text-white hover:bg-stone-800 disabled:opacity-40 transition-colors whitespace-nowrap"
          >
            <Send className="w-3 h-3" />
            {testMutation.isPending ? 'Se trimite...' : 'Trimite test'}
          </button>
        </div>
        {!isConfigured && (
          <p className="text-xs text-amber-600 dark:text-amber-400">Salvează mai întâi configurarea gateway-ului.</p>
        )}
        {testResult && (
          <div className={`flex items-center gap-2 text-xs rounded-lg px-3 py-2 ${
            testResult.ok
              ? 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400'
              : 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400'
          }`}>
            {testResult.ok ? <CheckCircle className="w-3.5 h-3.5 shrink-0" /> : <XCircle className="w-3.5 h-3.5 shrink-0" />}
            {testResult.msg}
          </div>
        )}
      </div>
    </div>
  );
};


// ─── Main page ────────────────────────────────────────────────────────────────

export const KeysSettings: React.FC = () => {
  const [unlocked, setUnlocked] = useState(false);

  if (!unlocked) {
    return <PasswordGate onUnlock={() => setUnlocked(true)} />;
  }

  return <KeysContent />;
};

const KeysContent: React.FC = () => {
  const { data: settings = [], isLoading: loadingSettings } = useQuery({
    queryKey: ['settings-all'],
    queryFn: () => api.getSettings(),
  });

  const { data: bearerData, isLoading: loadingBearer } = useQuery({
    queryKey: ['bearer-token'],
    queryFn: () => api.getBearerToken(),
  });

  if (loadingSettings || loadingBearer) {
    return (
      <div className="flex items-center justify-center py-16 text-stone-400 text-sm">
        Se încarcă...
      </div>
    );
  }

  const getValue = (cheie: string): string => {
    if (cheie === 'bearer') return bearerData?.value ?? '';
    return getSetting(settings, cheie);
  };

  return (
    <div className="max-w-2xl space-y-8">
      <div>
        <div className="flex items-center gap-2 mb-1">
          <KeyRound className="w-5 h-5 text-stone-500" />
          <h2 className="text-xl font-bold text-stone-900 dark:text-stone-100">Keys</h2>
        </div>
        <p className="text-sm text-stone-500">
          Toate cheile API și tokenurile folosite de aplicație. Valorile sensibile sunt mascate implicit.
        </p>
      </div>

      {KEY_SECTIONS.map((section) => (
        <div
          key={section.title}
          className="bg-white dark:bg-stone-900 rounded-xl border border-stone-200 dark:border-stone-800 overflow-hidden"
        >
          <div className="px-4 py-3 border-b border-stone-100 dark:border-stone-800 bg-stone-50 dark:bg-stone-800/50">
            <h3 className="text-sm font-semibold text-stone-800 dark:text-stone-200">{section.title}</h3>
            <p className="text-xs text-stone-400 mt-0.5">{section.description}</p>
          </div>

          {section.usage && (
            <div className="pt-3">
              <SerpApiAccountInfo />
              <RefetchWidget />
              <SerpLog />
            </div>
          )}

          <div className="px-4">
            {section.fields.map((field) => (
              <FieldRow
                key={field.cheie}
                field={field}
                value={getValue(field.cheie)}
              />
            ))}
          </div>
        </div>
      ))}

      <OllamaConfigWidget />
      <SmsGatewayWidget />
    </div>
  );
};
