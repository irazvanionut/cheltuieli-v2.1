import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { clsx } from 'clsx';
import {
  BarChart2,
  TrendingUp,
  TrendingDown,
  Minus,
  Search,
  RefreshCw,
  AlertCircle,
  Clock,
  Filter,
  Sparkles,
  Cpu,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import api from '@/services/api';
import { format } from 'date-fns';
import { ro } from 'date-fns/locale';

type Tab = 'comparatie' | 'modificari';

export const CompetitoriPage: React.FC = () => {
  const [tab, setTab] = useState<Tab>('comparatie');
  const [search, setSearch] = useState('');
  const [catFilter, setCatFilter] = useState('');
  const [aiSummary, setAiSummary] = useState<{
    summary: string;
    uses_vectors: boolean;
    stats: Record<string, any>;
  } | null>(null);
  const [loadingAI, setLoadingAI] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [showAI, setShowAI] = useState(true);

  const {
    data: compareData,
    isLoading: loadingCompare,
    error: errorCompare,
    refetch: refetchCompare,
  } = useQuery({
    queryKey: ['competitori-compare'],
    queryFn: () => api.competitoriCompare(),
    staleTime: 300_000,
  });

  const {
    data: changesData,
    isLoading: loadingChanges,
    refetch: refetchChanges,
  } = useQuery({
    queryKey: ['competitori-changes'],
    queryFn: () => api.competitoriPriceChanges(100),
    staleTime: 300_000,
  });

  const sites = compareData?.sites || [];
  const matched = compareData?.matched || [];
  const siteAId = compareData?.site_a_id;
  const siteBId = compareData?.site_b_id;
  const onlyA = (siteAId ? compareData?.only?.[String(siteAId)] : null) || [];
  const onlyB = (siteBId ? compareData?.only?.[String(siteBId)] : null) || [];

  const siteA = sites.find((s: any) => s.id === siteAId);
  const siteB = sites.find((s: any) => s.id === siteBId);

  // Extract unique categories for filter
  const categories = Array.from(
    new Set([
      ...matched.map((m: any) => m.categorie_a).filter(Boolean),
      ...matched.map((m: any) => m.categorie_b).filter(Boolean),
    ])
  ).sort() as string[];

  const filteredMatched = matched.filter((m: any) => {
    const q = search.toLowerCase();
    const matchName =
      !q ||
      m.denumire_a?.toLowerCase().includes(q) ||
      m.denumire_b?.toLowerCase().includes(q);
    const matchCat =
      !catFilter ||
      m.categorie_a?.toLowerCase().includes(catFilter.toLowerCase()) ||
      m.categorie_b?.toLowerCase().includes(catFilter.toLowerCase());
    return matchName && matchCat;
  });

  const filteredOnlyA = onlyA.filter((p: any) => {
    const q = search.toLowerCase();
    return !q || p.denumire?.toLowerCase().includes(q);
  });

  const filteredOnlyB = onlyB.filter((p: any) => {
    const q = search.toLowerCase();
    return !q || p.denumire?.toLowerCase().includes(q);
  });

  const handleAISummary = async () => {
    setLoadingAI(true);
    setAiError(null);
    setAiSummary(null);
    setShowAI(true);
    try {
      const result = await api.competitoriSummarize(siteAId, siteBId);
      setAiSummary(result);
    } catch (e: any) {
      setAiError(e?.response?.data?.detail || e.message || 'Eroare necunoscută');
    } finally {
      setLoadingAI(false);
    }
  };

  const fmtDate = (iso: string | null) => {
    if (!iso) return 'Niciodată';
    try {
      return format(new Date(iso), 'dd MMM yyyy HH:mm', { locale: ro });
    } catch {
      return iso;
    }
  };

  const DiffBadge = ({ diff }: { diff: number }) => {
    if (diff === 0) return <Minus className="w-4 h-4 text-stone-400" />;
    if (diff > 0)
      return (
        <span className="flex items-center gap-0.5 text-emerald-600 dark:text-emerald-400 font-semibold text-sm">
          <TrendingUp className="w-3.5 h-3.5" />+{diff.toFixed(2)} RON
        </span>
      );
    return (
      <span className="flex items-center gap-0.5 text-red-500 dark:text-red-400 font-semibold text-sm">
        <TrendingDown className="w-3.5 h-3.5" />{diff.toFixed(2)} RON
      </span>
    );
  };

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-stone-900 dark:text-stone-100 flex items-center gap-2">
            <BarChart2 className="w-6 h-6 text-red-500" />
            Comparație Competitori
          </h1>
          <p className="text-stone-500 mt-1 text-sm">
            Monitorizare prețuri din meniurile concurenței
          </p>
        </div>
        <div className="flex items-center gap-2">
          {matched.length > 0 && (
            <button
              onClick={handleAISummary}
              disabled={loadingAI}
              className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm bg-violet-600 text-white hover:bg-violet-700 disabled:opacity-60 disabled:cursor-not-allowed font-medium"
              title="Generează rezumat AI cu Ollama"
            >
              {loadingAI ? (
                <Cpu className="w-4 h-4 animate-spin" />
              ) : (
                <Sparkles className="w-4 h-4" />
              )}
              {loadingAI ? 'Se generează...' : 'Rezumat AI'}
            </button>
          )}
          <button
            onClick={() => {
              refetchCompare();
              refetchChanges();
            }}
            className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm bg-stone-100 dark:bg-stone-800 text-stone-600 dark:text-stone-400 hover:bg-stone-200 dark:hover:bg-stone-700"
          >
            <RefreshCw className="w-4 h-4" />
            Reîncarcă
          </button>
        </div>
      </div>

      {/* Site status chips */}
      {sites.length > 0 && (
        <div className="flex flex-wrap gap-3">
          {sites.map((site: any) => (
            <div
              key={site.id}
              className={clsx(
                'flex items-center gap-2 px-3 py-2 rounded-lg text-sm border',
                site.scrape_error
                  ? 'bg-red-50 dark:bg-red-950/20 border-red-200 dark:border-red-800 text-red-700 dark:text-red-400'
                  : site.last_scraped_at
                  ? 'bg-emerald-50 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-400'
                  : 'bg-stone-50 dark:bg-stone-900 border-stone-200 dark:border-stone-700 text-stone-500'
              )}
            >
              {site.scrape_error ? (
                <AlertCircle className="w-4 h-4" />
              ) : (
                <Clock className="w-4 h-4" />
              )}
              <span className="font-medium">{site.nume}</span>
              <span className="opacity-70 text-xs">
                {site.scrape_error
                  ? `Eroare: ${site.scrape_error.slice(0, 40)}`
                  : `Scraped: ${fmtDate(site.last_scraped_at)}`}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 p-1 bg-stone-100 dark:bg-stone-800 rounded-xl w-fit">
        {(['comparatie', 'modificari'] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={clsx(
              'px-4 py-2 rounded-lg text-sm font-medium transition-colors',
              tab === t
                ? 'bg-white dark:bg-stone-700 text-stone-900 dark:text-stone-100 shadow-sm'
                : 'text-stone-500 hover:text-stone-700 dark:hover:text-stone-300'
            )}
          >
            {t === 'comparatie' ? 'Comparație prețuri' : 'Modificări prețuri'}
          </button>
        ))}
      </div>

      {/* TAB: Comparatie */}
      {tab === 'comparatie' && (
        <div className="space-y-6">
          {/* Filters */}
          <div className="flex flex-wrap gap-3">
            <div className="relative flex-1 min-w-48">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400" />
              <input
                type="text"
                placeholder="Caută produs..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-9 pr-3 py-2 text-sm bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500"
              />
            </div>
            {categories.length > 0 && (
              <div className="relative">
                <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400" />
                <select
                  value={catFilter}
                  onChange={(e) => setCatFilter(e.target.value)}
                  className="pl-9 pr-6 py-2 text-sm bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 appearance-none"
                >
                  <option value="">Toate categoriile</option>
                  {categories.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {/* AI Summary panel */}
          {(aiSummary || aiError || loadingAI) && (
            <div className="bg-violet-50 dark:bg-violet-950/20 border border-violet-200 dark:border-violet-800 rounded-xl overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3 border-b border-violet-100 dark:border-violet-800">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-violet-600 dark:text-violet-400" />
                  <span className="font-semibold text-violet-800 dark:text-violet-200 text-sm">
                    Rezumat AI
                  </span>
                  {aiSummary?.uses_vectors && (
                    <span className="px-1.5 py-0.5 rounded text-xs bg-violet-200 dark:bg-violet-800 text-violet-700 dark:text-violet-300">
                      + embeddings
                    </span>
                  )}
                  {aiSummary && (
                    <span className="text-xs text-violet-500 dark:text-violet-400">
                      {aiSummary.stats.name_a} vs {aiSummary.stats.name_b} ·{' '}
                      {aiSummary.stats.matched} comune ·{' '}
                      <span className="text-red-500">+{aiSummary.stats.more_expensive} mai scumpe</span> ·{' '}
                      <span className="text-emerald-600">{aiSummary.stats.cheaper} mai ieftine</span>
                    </span>
                  )}
                </div>
                <button
                  onClick={() => setShowAI((v) => !v)}
                  className="p-1 rounded text-violet-400 hover:text-violet-600 dark:hover:text-violet-300"
                >
                  {showAI ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                </button>
              </div>

              {showAI && (
                <div className="px-4 py-4">
                  {loadingAI && (
                    <div className="flex items-center gap-3 text-violet-600 dark:text-violet-400 text-sm">
                      <Cpu className="w-5 h-5 animate-spin" />
                      <span>Ollama procesează datele de comparație...</span>
                    </div>
                  )}
                  {aiError && (
                    <div className="flex items-start gap-2 text-red-600 dark:text-red-400 text-sm">
                      <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                      <span>{aiError}</span>
                    </div>
                  )}
                  {aiSummary?.summary && (
                    <div className="text-sm text-stone-700 dark:text-stone-300 whitespace-pre-wrap leading-relaxed">
                      {aiSummary.summary}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {loadingCompare ? (
            <div className="text-center py-12 text-stone-400">Se încarcă datele...</div>
          ) : errorCompare ? (
            <div className="text-center py-12 text-red-500">
              Eroare la încărcarea datelor. Verificați dacă s-a efectuat un scrape.
            </div>
          ) : (
            <>
              {/* Matched pairs */}
              {filteredMatched.length > 0 && (
                <div className="bg-white dark:bg-stone-900 rounded-xl border border-stone-200 dark:border-stone-800 overflow-hidden">
                  <div className="px-4 py-3 border-b border-stone-100 dark:border-stone-800 flex items-center justify-between">
                    <h2 className="font-semibold text-stone-800 dark:text-stone-200">
                      Produse comune ({filteredMatched.length})
                    </h2>
                    <span className="text-xs text-stone-400">
                      Sortate după diferența de preț absolută
                    </span>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-stone-100 dark:border-stone-800 bg-stone-50 dark:bg-stone-800/50">
                          <th className="text-left px-4 py-2.5 font-medium text-stone-500">
                            {siteA?.nume || 'Site A'}
                          </th>
                          <th className="text-right px-4 py-2.5 font-medium text-stone-500 w-24">
                            Preț A
                          </th>
                          <th className="text-left px-4 py-2.5 font-medium text-stone-500">
                            {siteB?.nume || 'Site B'}
                          </th>
                          <th className="text-right px-4 py-2.5 font-medium text-stone-500 w-24">
                            Preț B
                          </th>
                          <th className="text-right px-4 py-2.5 font-medium text-stone-500 w-32">
                            Diferență
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredMatched.map((m: any, idx: number) => (
                          <tr
                            key={idx}
                            className="border-b border-stone-50 dark:border-stone-800/50 hover:bg-stone-50 dark:hover:bg-stone-800/30"
                          >
                            <td className="px-4 py-2.5">
                              <div className="font-medium text-stone-800 dark:text-stone-200">
                                {m.denumire_a}
                              </div>
                              {m.categorie_a && (
                                <div className="text-xs text-stone-400">{m.categorie_a}</div>
                              )}
                            </td>
                            <td className="px-4 py-2.5 text-right font-mono text-stone-700 dark:text-stone-300">
                              {m.pret_a != null ? `${m.pret_a.toFixed(2)} RON` : '—'}
                              {m.unitate_a && (
                                <div className="text-xs text-stone-400">{m.unitate_a}</div>
                              )}
                            </td>
                            <td className="px-4 py-2.5">
                              <div className="font-medium text-stone-800 dark:text-stone-200">
                                {m.denumire_b}
                              </div>
                              {m.categorie_b && (
                                <div className="text-xs text-stone-400">{m.categorie_b}</div>
                              )}
                            </td>
                            <td className="px-4 py-2.5 text-right font-mono text-stone-700 dark:text-stone-300">
                              {m.pret_b != null ? `${m.pret_b.toFixed(2)} RON` : '—'}
                              {m.unitate_b && (
                                <div className="text-xs text-stone-400">{m.unitate_b}</div>
                              )}
                            </td>
                            <td className="px-4 py-2.5 text-right">
                              <DiffBadge diff={m.diff} />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Only in A */}
              {filteredOnlyA.length > 0 && (
                <div className="bg-white dark:bg-stone-900 rounded-xl border border-stone-200 dark:border-stone-800 overflow-hidden">
                  <div className="px-4 py-3 border-b border-stone-100 dark:border-stone-800">
                    <h2 className="font-semibold text-stone-800 dark:text-stone-200">
                      Doar la {siteA?.nume || 'Site A'} ({filteredOnlyA.length})
                    </h2>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-stone-100 dark:border-stone-800 bg-stone-50 dark:bg-stone-800/50">
                          <th className="text-left px-4 py-2.5 font-medium text-stone-500">Produs</th>
                          <th className="text-left px-4 py-2.5 font-medium text-stone-500">Categorie</th>
                          <th className="text-right px-4 py-2.5 font-medium text-stone-500">Preț</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredOnlyA.map((p: any, idx: number) => (
                          <tr
                            key={idx}
                            className="border-b border-stone-50 dark:border-stone-800/50 hover:bg-stone-50 dark:hover:bg-stone-800/30"
                          >
                            <td className="px-4 py-2.5 font-medium text-stone-800 dark:text-stone-200">
                              {p.denumire}
                            </td>
                            <td className="px-4 py-2.5 text-stone-500">{p.categorie || '—'}</td>
                            <td className="px-4 py-2.5 text-right font-mono text-stone-700 dark:text-stone-300">
                              {p.pret != null ? `${Number(p.pret).toFixed(2)} RON` : '—'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Only in B */}
              {filteredOnlyB.length > 0 && (
                <div className="bg-white dark:bg-stone-900 rounded-xl border border-stone-200 dark:border-stone-800 overflow-hidden">
                  <div className="px-4 py-3 border-b border-stone-100 dark:border-stone-800">
                    <h2 className="font-semibold text-stone-800 dark:text-stone-200">
                      Doar la {siteB?.nume || 'Site B'} ({filteredOnlyB.length})
                    </h2>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-stone-100 dark:border-stone-800 bg-stone-50 dark:bg-stone-800/50">
                          <th className="text-left px-4 py-2.5 font-medium text-stone-500">Produs</th>
                          <th className="text-left px-4 py-2.5 font-medium text-stone-500">Categorie</th>
                          <th className="text-right px-4 py-2.5 font-medium text-stone-500">Preț</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredOnlyB.map((p: any, idx: number) => (
                          <tr
                            key={idx}
                            className="border-b border-stone-50 dark:border-stone-800/50 hover:bg-stone-50 dark:hover:bg-stone-800/30"
                          >
                            <td className="px-4 py-2.5 font-medium text-stone-800 dark:text-stone-200">
                              {p.denumire}
                            </td>
                            <td className="px-4 py-2.5 text-stone-500">{p.categorie || '—'}</td>
                            <td className="px-4 py-2.5 text-right font-mono text-stone-700 dark:text-stone-300">
                              {p.pret != null ? `${Number(p.pret).toFixed(2)} RON` : '—'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {!filteredMatched.length && !filteredOnlyA.length && !filteredOnlyB.length && (
                <div className="text-center py-16 text-stone-400">
                  <BarChart2 className="w-12 h-12 mx-auto mb-3 opacity-30" />
                  <p>Nu există date de comparație.</p>
                  <p className="text-sm mt-1">
                    Mergeți la Setări › Competitori și apăsați „Scrape acum".
                  </p>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* TAB: Modificari */}
      {tab === 'modificari' && (
        <div className="bg-white dark:bg-stone-900 rounded-xl border border-stone-200 dark:border-stone-800 overflow-hidden">
          <div className="px-4 py-3 border-b border-stone-100 dark:border-stone-800">
            <h2 className="font-semibold text-stone-800 dark:text-stone-200">
              Istoric modificări prețuri
            </h2>
          </div>
          {loadingChanges ? (
            <div className="text-center py-12 text-stone-400">Se încarcă...</div>
          ) : !changesData?.length ? (
            <div className="text-center py-12 text-stone-400">
              Nicio modificare de preț detectată încă.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-stone-100 dark:border-stone-800 bg-stone-50 dark:bg-stone-800/50">
                    <th className="text-left px-4 py-2.5 font-medium text-stone-500">Data</th>
                    <th className="text-left px-4 py-2.5 font-medium text-stone-500">Site</th>
                    <th className="text-left px-4 py-2.5 font-medium text-stone-500">Produs</th>
                    <th className="text-right px-4 py-2.5 font-medium text-stone-500">Preț vechi</th>
                    <th className="text-right px-4 py-2.5 font-medium text-stone-500">Preț nou</th>
                    <th className="text-right px-4 py-2.5 font-medium text-stone-500">Diferență</th>
                  </tr>
                </thead>
                <tbody>
                  {changesData.map((c: any) => {
                    const diff =
                      c.pret_nou != null && c.pret_vechi != null
                        ? c.pret_nou - c.pret_vechi
                        : null;
                    return (
                      <tr
                        key={c.id}
                        className="border-b border-stone-50 dark:border-stone-800/50 hover:bg-stone-50 dark:hover:bg-stone-800/30"
                      >
                        <td className="px-4 py-2.5 text-stone-500 whitespace-nowrap">
                          {fmtDate(c.changed_at)}
                        </td>
                        <td className="px-4 py-2.5 text-stone-600 dark:text-stone-400">
                          {c.site_nume}
                        </td>
                        <td className="px-4 py-2.5 font-medium text-stone-800 dark:text-stone-200">
                          {c.denumire}
                        </td>
                        <td className="px-4 py-2.5 text-right font-mono text-stone-500">
                          {c.pret_vechi != null ? `${Number(c.pret_vechi).toFixed(2)} RON` : '—'}
                        </td>
                        <td className="px-4 py-2.5 text-right font-mono text-stone-700 dark:text-stone-300">
                          {c.pret_nou != null ? `${Number(c.pret_nou).toFixed(2)} RON` : '—'}
                        </td>
                        <td className="px-4 py-2.5 text-right">
                          {diff != null ? <DiffBadge diff={diff} /> : '—'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
