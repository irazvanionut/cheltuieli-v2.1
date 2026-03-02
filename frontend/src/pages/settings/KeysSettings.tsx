import React, { useState, useRef, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Eye, EyeOff, Copy, Check, Save, X, KeyRound, Lock, RefreshCw, AlertTriangle, CheckCircle, List, ChevronDown, Wifi, WifiOff, Bot, Send, XCircle, Phone, Terminal, Play, Pause } from 'lucide-react';
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
  usage?: boolean;     // show SerpAPI usage widget
  geoUsage?: boolean;  // show Google Maps geocoding call counter
}

// ─── Config ───────────────────────────────────────────────────────────────────

const KEY_SECTIONS: KeySection[] = [
  {
    title: 'SerpAPI — Google Reviews',
    description: 'Până la 3 chei disponibile (250 apeluri/lună fiecare). Modul de rotație se configurează mai jos.',
    usage: true,
    fields: [
      {
        cheie: 'serpapi_api_key',
        label: 'Cheie 1',
        description: 'Prima cheie SerpAPI (250 apeluri/lună)',
        sensitive: true,
      },
      {
        cheie: 'serpapi_api_key_2',
        label: 'Cheie 2',
        description: 'A doua cheie SerpAPI (250 apeluri/lună)',
        sensitive: true,
      },
      {
        cheie: 'serpapi_api_key_3',
        label: 'Cheie 3',
        description: 'A treia cheie SerpAPI (250 apeluri/lună)',
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
    title: 'Bearer Token — ERP Pontaj',
    description: 'Token JWT pentru API-ul de pontaj și furnizori (10.170.4.128).',
    fields: [
      {
        cheie: 'bearer',
        label: 'Bearer Token',
        description: 'Token JWT pentru autentificare la API-ul de pontaj',
        sensitive: true,
      },
    ],
  },
  {
    title: 'Bearer Token — ERP Prod',
    description: 'Token JWT pentru API-ul ERP Prod — clienți (10.170.4.101:5020).',
    fields: [
      {
        cheie: 'erp_prod_bearer_token',
        label: 'Bearer Token',
        description: 'Token JWT pentru autentificare la ERP Prod (clienți)',
        sensitive: true,
      },
    ],
  },
  {
    title: 'Traccar GPS',
    description: 'Credențiale pentru serverul Traccar (auto-login în pagina Navigație GPS).',
    fields: [
      {
        cheie: 'traccar_url',
        label: 'URL Traccar',
        description: 'Ex: http://10.170.4.x:30003',
        sensitive: false,
      },
      {
        cheie: 'traccar_email',
        label: 'Email admin',
        description: 'Emailul contului admin Traccar',
        sensitive: false,
      },
      {
        cheie: 'traccar_password',
        label: 'Parolă admin',
        description: 'Parola contului admin Traccar',
        sensitive: true,
      },
    ],
  },
  {
    title: 'Google Maps Geocoding',
    description: 'API key pentru geocodarea adreselor românești (primar). Nominatim (OpenStreetMap) este fallback-ul gratuit când cheia nu e configurată.',
    geoUsage: true,
    fields: [
      {
        cheie: 'google_maps_api_key',
        label: 'API Key',
        description: 'Cheie Google Maps Platform — Geocoding API + Directions API + Maps JavaScript API. Activează toate trei în Google Cloud Console ($200 credit gratuit/lună)',
        sensitive: true,
      },
    ],
  },
  {
    title: 'RouteXL',
    description: 'Optimizare rute TSP (Travelling Salesman Problem) pentru livrări. Gratuit pana la 10 adrese/request.',
    fields: [
      {
        cheie: 'routexl_api_key',
        label: 'API Key RouteXL',
        description: 'Obtine cheie de la routexl.com/api. Folosit pentru optimizare rute avansata.',
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
  const [noCache, setNoCache] = useState(true);
  const [maxCalls, setMaxCalls] = useState(50);
  const [keyMode, setKeyMode] = useState<'all' | 'key1' | 'key2' | 'key3'>('all');
  const [confirm, setConfirm] = useState<'fresh' | 'resume' | null>(null);
  const [tokenCopied, setTokenCopied] = useState(false);
  // isStarting: rămâne true câteva secunde după start ca să activeze polling-ul
  // chiar dacă primul răspuns de status sosește înainte ca task-ul să seteze running=true
  const [isStarting, setIsStarting] = useState(false);

  // Token state (salvat în DB — persistent)
  const { data: tokenState, refetch: refetchToken } = useQuery({
    queryKey: ['refetch-token'],
    queryFn: () => api.getRefetchToken(),
    staleTime: 10_000,
  });

  // Status task background (polling cât timp rulează)
  const { data: status, refetch: refetchStatus } = useQuery({
    queryKey: ['refetch-status'],
    queryFn: () => api.getRefetchStatus(),
    refetchInterval: (q) => (q.state.data?.running || isStarting ? 2000 : false),
    staleTime: 0,
  });

  // Când task-ul se termină, reîncarcă token-ul
  const prevRunning = useRef(false);
  useEffect(() => {
    if (status?.running) {
      setIsStarting(false); // running confirmat — isStarting nu mai e necesar
    }
    if (prevRunning.current && status && !status.running) {
      setIsStarting(false);
      refetchToken();
      qc.invalidateQueries({ queryKey: ['google-reviews-summary'] });
    }
    prevRunning.current = status?.running ?? false;
  }, [status?.running]);

  const clearTokenMutation = useMutation({
    mutationFn: () => api.clearRefetchToken(),
    onSuccess: () => { refetchToken(); toast.success('Token șters'); },
    onError: () => toast.error('Eroare la ștergere token'),
  });

  const startMutation = useMutation({
    mutationFn: (resumeFromToken: boolean) => api.startRefetch({
      date: useDate ? dateVal : '',
      max_calls: maxCalls,
      key_mode: keyMode,
      use_date: useDate,
      no_cache: noCache,
      resume_from_token: resumeFromToken,
    }),
    onSuccess: () => {
      setConfirm(null);
      setIsStarting(true);
      refetchStatus();
      refetchToken();
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.detail || 'Eroare la pornire refetch');
      setConfirm(null);
    },
  });

  const stopMutation = useMutation({
    mutationFn: () => api.stopRefetch(),
    onSuccess: () => { refetchStatus(); refetchToken(); toast.success('Refetch oprit'); },
  });

  const maxDate = new Date().toISOString().split('T')[0];
  const inputCls = 'px-2.5 py-1.5 text-xs rounded-lg border border-amber-300 dark:border-amber-700 bg-white dark:bg-stone-800 text-stone-800 dark:text-stone-200 focus:outline-none focus:ring-2 focus:ring-amber-400';

  const hasToken = tokenState?.has_token ?? false;
  const isExhausted = tokenState?.exhausted ?? false;
  const isRunning = status?.running ?? false;

  const fmtDate = (iso: string | null) => {
    if (!iso) return '';
    try { return new Date(iso).toLocaleString('ro-RO', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }); }
    catch { return iso; }
  };

  const copyToken = async () => {
    if (!tokenState?.token) return;
    await navigator.clipboard.writeText(tokenState.token);
    setTokenCopied(true);
    setTimeout(() => setTokenCopied(false), 2000);
  };

  return (
    <div className="mx-4 mb-3 p-3 rounded-lg border border-amber-200 dark:border-amber-800/50 bg-amber-50 dark:bg-amber-900/10">
      <div className="flex items-center gap-1.5 text-xs font-semibold text-amber-700 dark:text-amber-400 mb-2">
        <RefreshCw className="w-3.5 h-3.5" />
        Re-fetch de la dată
      </div>

      {/* Progress bar cât rulează */}
      {isRunning && status && (
        <div className="mb-2 p-2 rounded-lg bg-blue-50 dark:bg-blue-900/10 border border-blue-200 dark:border-blue-800/50 text-xs">
          <div className="flex items-center justify-between mb-1">
            <span className="text-blue-700 dark:text-blue-400 font-medium flex items-center gap-1.5">
              <RefreshCw className="w-3 h-3 animate-spin" />
              Se procesează…
            </span>
            <button
              onClick={() => stopMutation.mutate()}
              disabled={stopMutation.isPending}
              className="text-red-500 hover:text-red-700 dark:hover:text-red-400 text-[10px] font-medium"
            >
              Stop
            </button>
          </div>
          <div className="w-full bg-blue-200 dark:bg-blue-900/30 rounded-full h-1.5 mb-1 overflow-hidden">
            <div
              className="h-full bg-blue-500 rounded-full transition-all duration-500"
              style={{ width: status.max_calls > 0 ? `${Math.min(100, (status.pages_fetched / status.max_calls) * 100)}%` : '0%' }}
            />
          </div>
          <div className="text-blue-600 dark:text-blue-400 text-[10px]">
            Pagini: <strong>{status.pages_fetched}</strong> / {status.max_calls} ·
            Adăugate: <strong>{status.inserted}</strong> ·
            Existente: {status.skipped}
            {status.started_at && <span className="text-stone-400 ml-1">· pornit {fmtDate(status.started_at)}</span>}
          </div>
        </div>
      )}

      {/* Rezultat ultima rulare (dacă nu rulează) */}
      {!isRunning && status?.finished_at && (
        <div className="mb-2 p-2 rounded-lg bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800/50 text-xs text-emerald-700 dark:text-emerald-400 flex items-start gap-2">
          <CheckCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
          <span>
            Adăugat <strong>{status.inserted}</strong> · Existente <strong>{status.skipped}</strong> · Pagini <strong>{status.pages_fetched}</strong>
            {Object.keys(status.calls_per_key || {}).length > 0 && (
              <> · {Object.entries(status.calls_per_key).map(([k, v]) => `K${k}: ${v}`).join(', ')}</>
            )}
            {status.stop_reason && <> · <span className="text-stone-400">Stop: {status.stop_reason}</span></>}
            {status.has_next_token && !status.exhausted && <span className="ml-1 text-blue-500"> · Token salvat</span>}
            {status.exhausted && <span className="ml-1 text-stone-400"> · Toate paginile epuizate</span>}
          </span>
        </div>
      )}

      {/* Token banner */}
      {hasToken && (
        <div className={`mb-2 rounded-lg border text-xs ${
          isExhausted
            ? 'bg-stone-50 dark:bg-stone-800/50 border-stone-200 dark:border-stone-700'
            : 'bg-blue-50 dark:bg-blue-900/10 border-blue-200 dark:border-blue-800/50'
        }`}>
          <div className="flex items-center justify-between gap-2 px-2 py-1.5">
            <span className={`font-medium ${isExhausted ? 'text-stone-500 dark:text-stone-400' : 'text-blue-700 dark:text-blue-400'}`}>
              {isExhausted ? 'Nu mai există pagini noi' : 'Token salvat'}
            </span>
            <div className="flex items-center gap-1">
              {tokenState?.saved_at && (
                <span className="text-stone-400 dark:text-stone-500 text-[10px]">{fmtDate(tokenState.saved_at)}</span>
              )}
              {!isExhausted && tokenState?.token && (
                <button onClick={copyToken} className="p-1 rounded text-stone-400 hover:text-stone-600 dark:hover:text-stone-300" title="Copiază token">
                  {tokenCopied ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />}
                </button>
              )}
              <button
                onClick={() => clearTokenMutation.mutate()}
                disabled={clearTokenMutation.isPending}
                className="p-1 rounded text-stone-400 hover:text-red-500 dark:hover:text-red-400"
                title="Șterge token"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          </div>
          {!isExhausted && tokenState?.token && (
            <div className="px-2 pb-1.5 font-mono text-[10px] text-stone-500 dark:text-stone-400 break-all select-all cursor-text leading-relaxed">
              {tokenState.token}
            </div>
          )}
        </div>
      )}

      {/* Formular (ascuns cât rulează sau confirmare activă) */}
      {!isRunning && confirm === null && (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <label className="flex items-center gap-1.5 text-xs text-amber-700 dark:text-amber-400 cursor-pointer select-none whitespace-nowrap">
              <input type="checkbox" checked={useDate} onChange={(e) => setUseDate(e.target.checked)} className="rounded" />
              Oprire la dată
            </label>
            <input
              type="date" value={dateVal} max={maxDate} disabled={!useDate}
              onChange={(e) => setDateVal(e.target.value)}
              className={`flex-1 ${inputCls} disabled:opacity-40`}
            />
            <input
              type="number" value={maxCalls} min={1}
              onChange={(e) => setMaxCalls(Math.max(1, parseInt(e.target.value) || 1))}
              className={`w-20 ${inputCls}`}
              title="Nr. apeluri (50/oră throughput SerpAPI)"
            />
          </div>
          <div className="flex items-center gap-2">
            <select value={keyMode} onChange={(e) => setKeyMode(e.target.value as any)} className={`flex-1 ${inputCls}`}>
              <option value="all">Toate cheile (rotație)</option>
              <option value="key1">Cheie 1</option>
              <option value="key2">Cheie 2</option>
              <option value="key3">Cheie 3</option>
            </select>
            <label className="flex items-center gap-1.5 text-xs text-amber-700 dark:text-amber-400 cursor-pointer select-none whitespace-nowrap">
              <input type="checkbox" checked={noCache} onChange={(e) => setNoCache(e.target.checked)} className="rounded" />
              {noCache
                ? <span title="Date proaspete — consumă 1 credit/apel">Date noi <span className="text-amber-500">(credit)</span></span>
                : <span title="Cache SerpAPI — gratuit">Din cache <span className="text-emerald-600 dark:text-emerald-400">(gratuit)</span></span>
              }
            </label>
          </div>
          <div className="flex items-center gap-2">
            {hasToken && !isExhausted && (
              <button
                onClick={() => setConfirm('resume')}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-blue-600 hover:bg-blue-700 text-white transition-colors"
              >
                <RefreshCw className="w-3 h-3" /> Resume
              </button>
            )}
            <button
              onClick={() => (!useDate || dateVal) ? setConfirm('fresh') : undefined}
              disabled={useDate && !dateVal}
              className="px-3 py-1.5 text-xs font-medium rounded-lg bg-amber-600 hover:bg-amber-700 text-white disabled:opacity-40 transition-colors"
            >
              {hasToken ? 'De la zero' : 'Execută'}
            </button>
          </div>
        </div>
      )}

      {/* Confirmare */}
      {!isRunning && confirm !== null && (
        <div className="space-y-2">
          <div className="flex items-start gap-1.5 text-xs text-amber-700 dark:text-amber-400">
            <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
            <span>
              {confirm === 'resume'
                ? <>Resume de la token-ul salvat, </>
                : useDate
                  ? <>Fetch din <strong>{dateVal}</strong>, </>
                  : <>Fetch fără limită de dată, </>
              }
              max <strong>{maxCalls}</strong> apeluri,{' '}
              {keyMode === 'all' ? 'toate cheile' : `cheie ${keyMode.replace('key', '')}`}.
              {confirm === 'fresh' && hasToken && <> Token-ul existent va fi <strong>șters</strong>.</>}
              {' '}Task-ul rulează în background — poți închide pagina.
            </span>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => startMutation.mutate(confirm === 'resume')}
              disabled={startMutation.isPending}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-amber-600 hover:bg-amber-700 text-white disabled:opacity-50 transition-colors"
            >
              {startMutation.isPending
                ? <><RefreshCw className="w-3 h-3 animate-spin" /> Se pornește...</>
                : <><Check className="w-3 h-3" /> Confirmă</>
              }
            </button>
            <button onClick={() => setConfirm(null)} className="px-3 py-1.5 text-xs rounded-lg text-stone-500 hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors">
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
        <div className="flex gap-2 flex-wrap">
          <AccountKeyCard label="Cheie 1" data={(data as any)?.key1 ?? null} />
          <AccountKeyCard label="Cheie 2" data={(data as any)?.key2 ?? null} />
          <AccountKeyCard label="Cheie 3" data={(data as any)?.key3 ?? null} />
        </div>
      )}
    </div>
  );
};

// ─── SerpAPI Rotation Config ──────────────────────────────────────────────────

const SerpApiUsage: React.FC<{ settings: Setting[] }> = ({ settings }) => {
  const qc = useQueryClient();
  const rotationMode = getSetting(settings, 'serpapi_rotation_mode') || 'day_split';
  const forceKey = getSetting(settings, 'serpapi_force_key') || '';

  const saveMutation = useMutation({
    mutationFn: ({ cheie, valoare }: { cheie: string; valoare: string }) =>
      api.upsertSetting(cheie, valoare),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['settings-all'] }),
    onError: () => toast.error('Eroare la salvare'),
  });

  const key1ok = !!getSetting(settings, 'serpapi_api_key');
  const key2ok = !!getSetting(settings, 'serpapi_api_key_2');
  const key3ok = !!getSetting(settings, 'serpapi_api_key_3');

  const forceOptions = [
    { value: '', label: 'Rotație normală', desc: 'se aplică modul de rotație selectat mai jos' },
    ...(key1ok ? [{ value: '1', label: 'Cheie 1', desc: 'folosește exclusiv cheia 1 (indiferent de rotație)' }] : []),
    ...(key2ok ? [{ value: '2', label: 'Cheie 2', desc: 'folosește exclusiv cheia 2 (indiferent de rotație)' }] : []),
    ...(key3ok ? [{ value: '3', label: 'Cheie 3', desc: 'folosește exclusiv cheia 3 (indiferent de rotație)' }] : []),
  ];

  return (
    <div className="mx-4 mb-3 p-3 rounded-lg bg-stone-50 dark:bg-stone-800/50 border border-stone-200 dark:border-stone-700 space-y-3">
      {/* Force key override */}
      <div>
        <div className="text-xs font-medium text-stone-600 dark:text-stone-400 mb-1.5">Folosește numai cheia</div>
        <div className="flex gap-1.5 flex-wrap">
          {forceOptions.map((opt) => (
            <button
              key={opt.value}
              onClick={() => saveMutation.mutate({ cheie: 'serpapi_force_key', valoare: opt.value })}
              title={opt.desc}
              className={`px-2.5 py-1 text-xs rounded-lg font-medium transition-colors ${
                forceKey === opt.value
                  ? opt.value === ''
                    ? 'bg-stone-800 dark:bg-stone-200 text-white dark:text-stone-900'
                    : 'bg-amber-500 text-white'
                  : 'bg-stone-200 dark:bg-stone-700 text-stone-600 dark:text-stone-300 hover:bg-stone-300 dark:hover:bg-stone-600'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
        {forceKey !== '' && (
          <p className="text-[10px] text-amber-600 dark:text-amber-400 mt-1">
            ⚠ Rotația este ignorată — toate refresh-urile automate folosesc numai Cheia {forceKey}.
          </p>
        )}
      </div>

      {/* Rotation mode (dimmed when force key is active) */}
      <div className={forceKey !== '' ? 'opacity-40 pointer-events-none' : ''}>
        <div className="text-xs font-medium text-stone-600 dark:text-stone-400 mb-1.5">Mod rotație chei</div>
        <div className="flex gap-2">
          {[
            { value: 'day_split', label: 'Pe zi', desc: 'distribuie cheile pe zilele lunii' },
            { value: 'round_robin', label: 'Round-robin', desc: 'ciclu consecutiv la fiecare refresh' },
          ].map((opt) => (
            <button
              key={opt.value}
              onClick={() => saveMutation.mutate({ cheie: 'serpapi_rotation_mode', valoare: opt.value })}
              title={opt.desc}
              className={`px-2.5 py-1 text-xs rounded-lg font-medium transition-colors ${
                rotationMode === opt.value
                  ? 'bg-stone-800 dark:bg-stone-200 text-white dark:text-stone-900'
                  : 'bg-stone-200 dark:bg-stone-700 text-stone-600 dark:text-stone-300 hover:bg-stone-300 dark:hover:bg-stone-600'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
        <p className="text-[10px] text-stone-400 mt-1">
          {rotationMode === 'round_robin'
            ? 'Cheile configurate sunt folosite pe rând la fiecare refresh automat.'
            : 'Cheile sunt distribuite pe zilele lunii (cheie 1 → ziua 1, 4, 7…).'}
        </p>
      </div>
    </div>
  );
};

// ─── Google Maps geocoding usage widget ───────────────────────────────────────

const GeoUsageWidget: React.FC<{ settings: Setting[] }> = ({ settings }) => {
  const qc = useQueryClient();
  const disabled  = getSetting(settings, 'google_maps_disabled') === 'true';
  const geoCalls  = parseInt(getSetting(settings, 'google_maps_geocoding_calls')  || '0', 10);
  const dirCalls  = parseInt(getSetting(settings, 'google_maps_directions_calls') || '0', 10);
  const jsCalls   = parseInt(getSetting(settings, 'google_maps_js_calls')         || '0', 10);
  const geoMonth  = getSetting(settings, 'google_maps_geocoding_month')  || '—';
  const dirMonth  = getSetting(settings, 'google_maps_directions_month') || '—';
  const jsMonth   = getSetting(settings, 'google_maps_js_month')         || '—';
  const geoCost   = (geoCalls * 0.005).toFixed(3);   // $5/1000
  const dirCost   = (dirCalls * 0.01).toFixed(3);    // $10/1000
  const jsCost    = (jsCalls  * 0.007).toFixed(3);   // $7/1000 Dynamic Maps

  const toggleMutation = useMutation({
    mutationFn: () => api.upsertSetting('google_maps_disabled', disabled ? 'false' : 'true'),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['settings-all'] });
      toast.success(disabled ? 'Google Maps API activat' : 'Google Maps API dezactivat');
    },
    onError: () => toast.error('Eroare la salvare'),
  });
  const resetGeo = useMutation({
    mutationFn: () => api.upsertSetting('google_maps_geocoding_calls', '0'),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['settings-all'] }); toast.success('Counter geocodare resetat'); },
  });
  const resetDir = useMutation({
    mutationFn: () => api.upsertSetting('google_maps_directions_calls', '0'),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['settings-all'] }); toast.success('Counter directions resetat'); },
  });
  const resetJs = useMutation({
    mutationFn: () => api.upsertSetting('google_maps_js_calls', '0'),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['settings-all'] }); toast.success('Counter Maps JS resetat'); },
  });

  const Row = ({ label, calls, cost, month, onReset, pending }: {
    label: string; calls: number; cost: string; month: string;
    onReset: () => void; pending: boolean;
  }) => (
    <div className="flex items-center justify-between gap-3 py-1.5 border-b border-blue-100 dark:border-blue-900/30 last:border-0">
      <div className="min-w-0">
        <span className="text-xs font-medium text-stone-700 dark:text-stone-300">{label}</span>
        <span className="text-[10px] text-stone-400 ml-1.5">{month}</span>
      </div>
      <div className="flex items-center gap-3 shrink-0">
        <span className="font-mono font-bold text-blue-800 dark:text-blue-200 text-sm">{calls.toLocaleString()}</span>
        <span className="text-[10px] text-stone-400 font-mono">≈ ${cost}</span>
        <button
          onClick={onReset}
          disabled={pending || calls === 0}
          className="text-[10px] text-stone-400 hover:text-red-500 dark:hover:text-red-400 disabled:opacity-40 transition-colors"
          title="Resetează"
        >Reset</button>
      </div>
    </div>
  );

  return (
    <div className="mx-4 mb-3 space-y-2">
      {/* Toggle dezactivare */}
      <div className={`flex items-center justify-between p-3 rounded-lg border ${
        disabled
          ? 'bg-red-50 dark:bg-red-900/10 border-red-200 dark:border-red-800/50'
          : 'bg-emerald-50 dark:bg-emerald-900/10 border-emerald-200 dark:border-emerald-800/50'
      }`}>
        <div>
          <p className={`text-xs font-semibold ${disabled ? 'text-red-700 dark:text-red-400' : 'text-emerald-700 dark:text-emerald-400'}`}>
            Google Maps API — {disabled ? 'DEZACTIVAT' : 'ACTIV'}
          </p>
          <p className="text-[10px] text-stone-400 mt-0.5">
            {disabled
              ? 'Toate apelurile Google (Geocoding, Directions, Maps JS) sunt blocate. Geocodarea folosește doar Nominatim.'
              : 'Geocoding, Directions și Maps JS sunt activate. Dezactivează pentru a opri complet costurile Google.'}
          </p>
        </div>
        <button
          onClick={() => toggleMutation.mutate()}
          disabled={toggleMutation.isPending}
          className={`ml-4 shrink-0 px-3 py-1.5 text-xs font-medium rounded-lg transition-colors disabled:opacity-50 ${
            disabled
              ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
              : 'bg-red-600 hover:bg-red-700 text-white'
          }`}
        >
          {toggleMutation.isPending ? '...' : disabled ? 'Activează' : 'Dezactivează'}
        </button>
      </div>

      {/* Contoare apeluri */}
      <div className={`p-3 rounded-lg bg-blue-50 dark:bg-blue-900/10 border border-blue-200 dark:border-blue-800/50 ${disabled ? 'opacity-50' : ''}`}>
        <p className="text-xs font-semibold text-blue-700 dark:text-blue-400 mb-2">Apeluri API luna curentă</p>
        <Row label="Geocoding"   calls={geoCalls} cost={geoCost} month={geoMonth} onReset={() => resetGeo.mutate()} pending={resetGeo.isPending} />
        <Row label="Directions"  calls={dirCalls} cost={dirCost} month={dirMonth} onReset={() => resetDir.mutate()} pending={resetDir.isPending} />
        <Row label="Maps JS"     calls={jsCalls}  cost={jsCost}  month={jsMonth}  onReset={() => resetJs.mutate()}  pending={resetJs.isPending}  />
        <p className="text-[10px] text-stone-400 mt-2">
          Geocoding $5/1000 · Directions $10/1000 · Maps JS $7/1000 · Credit gratuit $200/lună Google Cloud
        </p>
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


// ─── AMI (Asterisk Manager Interface) widget ──────────────────────────────────

const AMI_MANAGER_CONF = `# /etc/asterisk/manager.conf

[general]
enabled = yes
port = 5038
bindaddr = 0.0.0.0

[admin]
secret = <parola_ta>
permit = 0.0.0.0/0.0.0.0   ; sau IP specific: 10.170.7.x/255.255.255.0
read = agent,call,user
write = agent,call

# Reîncarcă fără restart Asterisk:
# asterisk -rx "manager reload"`;

const FAIL2BAN_CONF = `# /etc/fail2ban/jail.local
[DEFAULT]
ignoreip = 127.0.0.1/8 ::1 <IP_SERVER_APP>

# Apoi:
# systemctl reload fail2ban

# Sau unban manual:
# fail2ban-client set recidive unbanip <IP>`;

const AmiConfigWidget: React.FC = () => {
  const qc = useQueryClient();
  const [amiHost, setAmiHost] = useState('');
  const [amiPort, setAmiPort] = useState('');
  const [amiUser, setAmiUser] = useState('');
  const [amiPass, setAmiPass] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [showConf, setShowConf] = useState(false);

  const { data: settings = [] } = useQuery({
    queryKey: ['settings-all'],
    queryFn: () => api.getSettings(),
  });

  useEffect(() => {
    const get = (k: string) => settings.find((s) => s.cheie === k)?.valoare ?? '';
    if (!amiHost) setAmiHost(get('ami_host'));
    if (!amiPort) setAmiPort(get('ami_port'));
    if (!amiUser) setAmiUser(get('ami_user'));
    if (!amiPass) setAmiPass(get('ami_pass'));
  }, [settings]);

  const saveMutation = useMutation({
    mutationFn: ({ cheie, valoare }: { cheie: string; valoare: string }) =>
      api.upsertSetting(cheie, valoare),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['settings-all'] }),
  });

  const handleSave = async () => {
    try {
      await Promise.all([
        saveMutation.mutateAsync({ cheie: 'ami_host', valoare: amiHost }),
        saveMutation.mutateAsync({ cheie: 'ami_port', valoare: amiPort }),
        saveMutation.mutateAsync({ cheie: 'ami_user', valoare: amiUser }),
        saveMutation.mutateAsync({ cheie: 'ami_pass', valoare: amiPass }),
      ]);
      toast.success('Configurare AMI salvată');
    } catch {
      toast.error('Eroare la salvare');
    }
  };

  const inputCls = 'w-full px-3 py-2 text-xs rounded-lg border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-800 text-stone-900 dark:text-stone-100 focus:outline-none focus:ring-2 focus:ring-red-500 font-mono';
  const labelCls = 'block text-xs font-medium text-stone-500 dark:text-stone-400 mb-1';

  return (
    <div className="bg-white dark:bg-stone-900 rounded-xl border border-stone-200 dark:border-stone-800 overflow-hidden">
      <div className="px-4 py-3 border-b border-stone-100 dark:border-stone-800 bg-stone-50 dark:bg-stone-800/50 flex items-center gap-2">
        <Phone className="w-4 h-4 text-stone-500" />
        <div>
          <h3 className="text-sm font-semibold text-stone-800 dark:text-stone-200">Asterisk AMI</h3>
          <p className="text-xs text-stone-400 mt-0.5">Conexiune la Asterisk Manager Interface pentru monitorizare apeluri</p>
        </div>
      </div>

      <div className="px-4 py-4 space-y-3">
        <div className="grid grid-cols-3 gap-3">
          <div className="col-span-2">
            <label className={labelCls}>Host / IP Asterisk</label>
            <input value={amiHost} onChange={(e) => setAmiHost(e.target.value)} placeholder="10.170.7.32" className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Port</label>
            <input value={amiPort} onChange={(e) => setAmiPort(e.target.value)} placeholder="5038" className={inputCls} />
          </div>
        </div>
        <div>
          <label className={labelCls}>Utilizator AMI</label>
          <input value={amiUser} onChange={(e) => setAmiUser(e.target.value)} placeholder="admin" className={inputCls} />
        </div>
        <div>
          <label className={labelCls}>Parolă AMI</label>
          <div className="relative">
            <input
              type={showPass ? 'text' : 'password'}
              value={amiPass}
              onChange={(e) => setAmiPass(e.target.value)}
              placeholder="••••••••"
              className={`${inputCls} pr-8`}
            />
            <button type="button" onClick={() => setShowPass((v) => !v)}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-600 dark:hover:text-stone-200"
            >
              {showPass ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
            </button>
          </div>
        </div>

        <div className="pt-1 pb-2 border-b border-stone-100 dark:border-stone-800">
          <button
            onClick={handleSave}
            disabled={saveMutation.isPending}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-red-600 text-white hover:bg-red-700 disabled:opacity-50 transition-colors"
          >
            <Save className="w-3.5 h-3.5" />
            {saveMutation.isPending ? 'Se salvează...' : 'Salvează'}
          </button>
        </div>

        {/* Asterisk config hint */}
        <div>
          <button
            onClick={() => setShowConf((v) => !v)}
            className="flex items-center gap-1.5 text-xs font-semibold text-stone-500 dark:text-stone-400 hover:text-stone-700 dark:hover:text-stone-200 transition-colors"
          >
            <Terminal className="w-3.5 h-3.5" />
            Configurare Asterisk &amp; fail2ban
            <ChevronDown className={`w-3.5 h-3.5 transition-transform ${showConf ? 'rotate-180' : ''}`} />
          </button>

          {showConf && (
            <div className="mt-3 space-y-3">
              <div>
                <p className="text-[11px] font-medium text-stone-500 dark:text-stone-400 mb-1.5">
                  Pe serverul Asterisk — <code className="bg-stone-100 dark:bg-stone-800 px-1 rounded">cat /etc/asterisk/manager.conf</code>
                </p>
                <pre className="text-[11px] leading-relaxed font-mono bg-stone-900 dark:bg-stone-950 text-emerald-400 rounded-lg p-3 overflow-x-auto whitespace-pre select-all">
                  {AMI_MANAGER_CONF}
                </pre>
              </div>
              <div>
                <p className="text-[11px] font-medium text-stone-500 dark:text-stone-400 mb-1.5">
                  Whitelist IP în fail2ban (dacă serverul app e blocat de <code className="bg-stone-100 dark:bg-stone-800 px-1 rounded">recidive</code>)
                </p>
                <pre className="text-[11px] leading-relaxed font-mono bg-stone-900 dark:bg-stone-950 text-emerald-400 rounded-lg p-3 overflow-x-auto whitespace-pre select-all">
                  {FAIL2BAN_CONF}
                </pre>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};


// ─── Main page ────────────────────────────────────────────────────────────────

// ─── Order Lines Backfill Widget ──────────────────────────────────────────────

const OrderLinesBackfillWidget: React.FC = () => {
  const queryClient = useQueryClient();
  const { data, refetch } = useQuery({
    queryKey: ['backfill-status'],
    queryFn: () => api.getBackfillStatus(),
    refetchInterval: (query) => (query.state.data?.running ? 2000 : 15000),
    staleTime: 0,
  });

  const startMutation = useMutation({
    mutationFn: () => api.startBackfill(),
    onSuccess: (res) => {
      const msg = res.status === 'started' ? 'Backfill pornit' : res.status === 'resumed' ? 'Backfill reluat' : 'Deja în curs';
      toast.success(msg);
      queryClient.invalidateQueries({ queryKey: ['backfill-status'] });
    },
    onError: (e: any) => toast.error(e.response?.data?.detail || 'Eroare la pornire'),
  });

  const pauseMutation = useMutation({
    mutationFn: () => api.pauseBackfill(),
    onSuccess: (res) => {
      toast.success(res.paused ? 'Backfill pausat' : 'Backfill reluat');
      queryClient.invalidateQueries({ queryKey: ['backfill-status'] });
    },
    onError: (e: any) => toast.error(e.response?.data?.detail || 'Eroare'),
  });

  const pct = data && data.total > 0 ? Math.min(Math.round((data.done / data.total) * 100), 100) : 0;
  const remaining = data ? Math.max(data.total - data.done - data.errors, 0) : 0;
  const dbPct = data && data.total_in_db > 0
    ? Math.min(Math.round((data.synced_in_db / data.total_in_db) * 100), 100)
    : 0;

  return (
    <div className="bg-white dark:bg-stone-900 rounded-xl border border-stone-200 dark:border-stone-800 overflow-hidden">
      <div className="px-4 py-3 border-b border-stone-100 dark:border-stone-800 bg-stone-50 dark:bg-stone-800/50 flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-stone-800 dark:text-stone-200">Backfill Linii Comenzi</h3>
          <p className="text-xs text-stone-400 mt-0.5">Fetch detalii produse per comandă (via Rfc/Next). Pornire manuală.</p>
        </div>
        <button onClick={() => refetch()} className="text-stone-400 hover:text-stone-600 transition-colors">
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>
      <div className="px-4 py-4 space-y-3">
        {data ? (
          <>
            {/* DB-level progress */}
            {data.total_in_db > 0 && (
              <div className="bg-stone-50 dark:bg-stone-800/50 rounded-lg px-3 py-2.5 space-y-1.5">
                <div className="flex items-center justify-between text-xs text-stone-500 dark:text-stone-400">
                  <span>Total sincronizate în DB</span>
                  <span className="font-semibold text-stone-700 dark:text-stone-200">
                    {data.synced_in_db.toLocaleString('ro-RO')} / {data.total_in_db.toLocaleString('ro-RO')} ({dbPct}%)
                  </span>
                </div>
                <div className="w-full bg-stone-200 dark:bg-stone-700 rounded-full h-1.5">
                  <div className="bg-emerald-500 h-1.5 rounded-full transition-all duration-500" style={{ width: `${dbPct}%` }} />
                </div>
              </div>
            )}

            {/* Status + butoane */}
            <div className="flex items-center gap-2">
              {data.running && !data.paused && (
                <span className="flex items-center gap-1.5 text-xs font-medium text-blue-600 dark:text-blue-400">
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />Rulează…
                </span>
              )}
              {data.running && data.paused && (
                <span className="flex items-center gap-1.5 text-xs font-medium text-amber-600 dark:text-amber-400">
                  <Pause className="w-3.5 h-3.5" />Pausat
                </span>
              )}
              {!data.running && (data.done > 0 || data.errors > 0) && (
                <span className="flex items-center gap-1.5 text-xs font-medium text-emerald-600 dark:text-emerald-400">
                  <CheckCircle className="w-3.5 h-3.5" />Sesiune finalizată
                </span>
              )}
              {!data.running && data.done === 0 && data.errors === 0 && (
                <span className="text-xs text-stone-400">Inactiv</span>
              )}

              <div className="ml-auto flex gap-2">
                {/* Buton Start (când nu rulează) sau Resume (când e pausat) */}
                {(!data.running || data.paused) && (
                  <button
                    onClick={() => startMutation.mutate()}
                    disabled={startMutation.isPending}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-medium transition-colors"
                  >
                    <Play className="w-3.5 h-3.5" />
                    {data.paused ? 'Reia' : 'Pornește'}
                  </button>
                )}
                {/* Buton Pause (când rulează și nu e pausat) */}
                {data.running && !data.paused && (
                  <button
                    onClick={() => pauseMutation.mutate()}
                    disabled={pauseMutation.isPending}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-white text-xs font-medium transition-colors"
                  >
                    <Pause className="w-3.5 h-3.5" />Pauză
                  </button>
                )}
              </div>
            </div>

            {/* Progres sesiune curentă */}
            {(data.running || data.done > 0 || data.errors > 0) && (
              <>
                <div className="w-full bg-stone-100 dark:bg-stone-800 rounded-full h-2">
                  <div
                    className="bg-blue-500 h-2 rounded-full transition-all duration-500"
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div>
                    <p className="text-xs text-stone-400">Procesate</p>
                    <p className="text-sm font-semibold text-blue-600">{data.done.toLocaleString('ro-RO')}</p>
                  </div>
                  <div>
                    <p className="text-xs text-stone-400">Erori</p>
                    <p className="text-sm font-semibold text-red-500">{data.errors.toLocaleString('ro-RO')}</p>
                  </div>
                  <div>
                    <p className="text-xs text-stone-400">Rămase</p>
                    <p className="text-sm font-semibold text-stone-600 dark:text-stone-400">{remaining > 0 ? remaining.toLocaleString('ro-RO') : '—'}</p>
                  </div>
                </div>
                <div className="flex items-center justify-between text-xs text-stone-400">
                  <span>{pct}% din {data.total.toLocaleString('ro-RO')} în sesiune</span>
                  {data.running && data.current_number != null && (
                    <span className="font-mono text-stone-500 dark:text-stone-400">
                      cmd #{data.current_number.toLocaleString('ro-RO')}
                    </span>
                  )}
                </div>
              </>
            )}
            {data.finished_at && !data.running && (
              <p className="text-xs text-stone-400">Finalizat la: {new Date(data.finished_at).toLocaleString('ro-RO')}</p>
            )}
          </>
        ) : (
          <p className="text-xs text-stone-400">Se încarcă…</p>
        )}
      </div>
    </div>
  );
};


// ─── Orders Sync Widget ───────────────────────────────────────────────────────

const OrdersSyncWidget: React.FC = () => {
  const { data: countData, refetch: refetchCount } = useQuery({
    queryKey: ['orders-count'],
    queryFn: () => api.getOrdersCount(),
    staleTime: 30000,
  });

  const incrementalMutation = useMutation({
    mutationFn: () => api.syncOrdersIncremental(),
    onSuccess: (res) => {
      toast.success(`Sync incremental: +${res.added} comenzi noi`);
      refetchCount();
    },
    onError: (e: any) => toast.error(e.response?.data?.detail || 'Eroare sync incremental'),
  });

  const yesterdayMutation = useMutation({
    mutationFn: () => api.syncOrdersYesterday(),
    onSuccess: (res) => {
      toast.success(`Sync ieri: șters ${res.deleted}, adăugat ${res.added} comenzi`);
      refetchCount();
    },
    onError: (e: any) => toast.error(e.response?.data?.detail || 'Eroare sync ieri'),
  });

  const isPending = incrementalMutation.isPending || yesterdayMutation.isPending;

  return (
    <div className="bg-white dark:bg-stone-900 rounded-xl border border-stone-200 dark:border-stone-800 overflow-hidden">
      <div className="px-4 py-3 border-b border-stone-100 dark:border-stone-800 bg-stone-50 dark:bg-stone-800/50">
        <h3 className="text-sm font-semibold text-stone-800 dark:text-stone-200">Sync Comenzi (OrderProjection)</h3>
        <p className="text-xs text-stone-400 mt-0.5">
          Import istoric comenzi din ERP în tabela locală. Automat: 11:00–23:00 orar + 07:00 re-sync ieri.
        </p>
      </div>
      <div className="px-4 py-4 space-y-3">
        <div className="flex items-center justify-between text-sm">
          <span className="text-stone-500">Comenzi în DB local</span>
          <span className="font-mono font-semibold text-stone-900 dark:text-stone-100">
            {countData ? countData.total.toLocaleString('ro-RO') : '—'}
          </span>
        </div>
        {countData?.latest_number && (
          <div className="flex items-center justify-between text-sm">
            <span className="text-stone-500">Ultima comandă</span>
            <span className="font-mono text-stone-600 dark:text-stone-400">
              #{countData.latest_number}
              {countData.latest_date && ` · ${countData.latest_date.slice(0, 10)}`}
            </span>
          </div>
        )}
        <div className="flex gap-2 pt-1">
          <button
            onClick={() => incrementalMutation.mutate()}
            disabled={isPending}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-medium transition-colors"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${incrementalMutation.isPending ? 'animate-spin' : ''}`} />
            {incrementalMutation.isPending ? 'Se sincronizează...' : 'Sync incremental'}
          </button>
          <button
            onClick={() => yesterdayMutation.mutate()}
            disabled={isPending}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-stone-200 dark:border-stone-700 hover:bg-stone-50 dark:hover:bg-stone-800 disabled:opacity-50 text-stone-700 dark:text-stone-300 text-xs font-medium transition-colors"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${yesterdayMutation.isPending ? 'animate-spin' : ''}`} />
            {yesterdayMutation.isPending ? 'Se sincronizează...' : 'Re-sync ieri'}
          </button>
        </div>
        <p className="text-[11px] text-stone-400">
          <strong>Sync incremental</strong>: adaugă comenzile noi, se oprește la prima găsită în DB.<br />
          <strong>Re-sync ieri</strong>: șterge și re-importă toate comenzile de ieri.
        </p>
      </div>
    </div>
  );
};

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
              <SerpApiUsage settings={settings} />
              <RefetchWidget />
              <SerpLog />
            </div>
          )}

          {section.geoUsage && (
            <div className="pt-3">
              <GeoUsageWidget settings={settings} />
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
      <AmiConfigWidget />
      <OrdersSyncWidget />
      <OrderLinesBackfillWidget />
    </div>
  );
};
