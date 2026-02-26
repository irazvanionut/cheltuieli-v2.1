import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { Plus, Trash2, Play, CheckCircle, AlertCircle, Edit2, X, Save, Cpu } from 'lucide-react';
import api from '@/services/api';
import { format } from 'date-fns';
import { ro } from 'date-fns/locale';

interface Site {
  id: number;
  nume: string;
  url: string;
  scraper_key: string;
  activ: boolean;
  last_scraped_at: string | null;
  scrape_error: string | null;
  product_count: number;
}

interface NewSiteForm {
  nume: string;
  url: string;
  scraper_key: string;
  activ: boolean;
}

const DEFAULT_FORM: NewSiteForm = {
  nume: '',
  url: '',
  scraper_key: 'margineni',
  activ: true,
};

export const CompetitoriSettings: React.FC = () => {
  const qc = useQueryClient();
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState<NewSiteForm>(DEFAULT_FORM);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState<Partial<Site>>({});
  const [scrapingId, setScrapingId] = useState<number | null>(null);
  const [embeddingId, setEmbeddingId] = useState<number | null>(null);

  const { data: sites = [], isLoading } = useQuery<Site[]>({
    queryKey: ['competitori-sites'],
    queryFn: () => api.competitoriListSites(),
  });

  const { data: scrapersData } = useQuery<{ scrapers: string[] }>({
    queryKey: ['competitori-scrapers'],
    queryFn: () => api.competitoriListScrapers(),
  });
  const scrapers = scrapersData?.scrapers || [];

  const addMutation = useMutation({
    mutationFn: (data: NewSiteForm) => api.competitoriAddSite(data),
    onSuccess: () => {
      toast.success('Site adăugat');
      qc.invalidateQueries({ queryKey: ['competitori-sites'] });
      setShowAdd(false);
      setForm(DEFAULT_FORM);
    },
    onError: () => toast.error('Eroare la adăugare'),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<Site> }) =>
      api.competitoriUpdateSite(id, data),
    onSuccess: () => {
      toast.success('Site actualizat');
      qc.invalidateQueries({ queryKey: ['competitori-sites'] });
      setEditingId(null);
    },
    onError: () => toast.error('Eroare la actualizare'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => api.competitoriDeleteSite(id),
    onSuccess: () => {
      toast.success('Site șters');
      qc.invalidateQueries({ queryKey: ['competitori-sites'] });
    },
    onError: () => toast.error('Eroare la ștergere'),
  });

  const handleScrape = async (site: Site) => {
    setScrapingId(site.id);
    try {
      const result = await api.competitoriScrapeSite(site.id);
      toast.success(`Scrape complet: ${result.products} produse, ${result.changes} modificări`);
      qc.invalidateQueries({ queryKey: ['competitori-sites'] });
      qc.invalidateQueries({ queryKey: ['competitori-compare'] });
      qc.invalidateQueries({ queryKey: ['competitori-changes'] });
    } catch (e: any) {
      toast.error(`Eroare scrape: ${e?.response?.data?.detail || e.message}`);
    } finally {
      setScrapingId(null);
    }
  };

  const handleEmbed = async (site: Site) => {
    setEmbeddingId(site.id);
    try {
      const result = await api.competitoriEmbedSite(site.id);
      toast.success(`Embeddings generate: ${result.embedded}/${result.total} produse`);
      qc.invalidateQueries({ queryKey: ['competitori-sites'] });
    } catch (e: any) {
      toast.error(`Eroare embed: ${e?.response?.data?.detail || e.message}`);
    } finally {
      setEmbeddingId(null);
    }
  };

  const startEdit = (site: Site) => {
    setEditingId(site.id);
    setEditForm({ ...site });
  };

  const fmtDate = (iso: string | null) => {
    if (!iso) return 'Niciodată';
    try {
      return format(new Date(iso), 'dd MMM yyyy HH:mm', { locale: ro });
    } catch {
      return iso;
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-stone-900 dark:text-stone-100">
            Site-uri Competitori
          </h1>
          <p className="text-stone-500 mt-1 text-sm">
            Gestionați site-urile monitorizate și declanșați scraping-ul manual.
          </p>
        </div>
        <button
          onClick={() => setShowAdd(true)}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-red-600 text-white text-sm font-medium hover:bg-red-700"
        >
          <Plus className="w-4 h-4" />
          Adaugă site
        </button>
      </div>

      {/* Add form */}
      {showAdd && (
        <div className="bg-white dark:bg-stone-900 rounded-xl border border-stone-200 dark:border-stone-800 p-5 space-y-4">
          <h2 className="font-semibold text-stone-800 dark:text-stone-200">Site nou</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-stone-500 mb-1">Nume</label>
              <input
                type="text"
                value={form.nume}
                onChange={(e) => setForm({ ...form, nume: e.target.value })}
                placeholder="Restaurant Exemplu"
                className="w-full px-3 py-2 text-sm bg-stone-50 dark:bg-stone-800 border border-stone-200 dark:border-stone-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-stone-500 mb-1">URL meniu</label>
              <input
                type="url"
                value={form.url}
                onChange={(e) => setForm({ ...form, url: e.target.value })}
                placeholder="https://exemplu.ro/meniu"
                className="w-full px-3 py-2 text-sm bg-stone-50 dark:bg-stone-800 border border-stone-200 dark:border-stone-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-stone-500 mb-1">Scraper</label>
              <select
                value={form.scraper_key}
                onChange={(e) => setForm({ ...form, scraper_key: e.target.value })}
                className="w-full px-3 py-2 text-sm bg-stone-50 dark:bg-stone-800 border border-stone-200 dark:border-stone-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500"
              >
                {scrapers.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex items-center gap-2 pt-5">
              <input
                type="checkbox"
                id="activ-new"
                checked={form.activ}
                onChange={(e) => setForm({ ...form, activ: e.target.checked })}
                className="rounded"
              />
              <label htmlFor="activ-new" className="text-sm text-stone-600 dark:text-stone-400">
                Activ
              </label>
            </div>
          </div>
          <div className="flex gap-3 pt-2">
            <button
              onClick={() => addMutation.mutate(form)}
              disabled={!form.nume || !form.url || addMutation.isPending}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-red-600 text-white text-sm font-medium hover:bg-red-700 disabled:opacity-50"
            >
              <Save className="w-4 h-4" />
              Salvează
            </button>
            <button
              onClick={() => {
                setShowAdd(false);
                setForm(DEFAULT_FORM);
              }}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-stone-100 dark:bg-stone-800 text-stone-600 dark:text-stone-400 text-sm hover:bg-stone-200 dark:hover:bg-stone-700"
            >
              <X className="w-4 h-4" />
              Anulează
            </button>
          </div>
        </div>
      )}

      {/* Sites table */}
      <div className="bg-white dark:bg-stone-900 rounded-xl border border-stone-200 dark:border-stone-800 overflow-hidden">
        {isLoading ? (
          <div className="text-center py-12 text-stone-400">Se încarcă...</div>
        ) : sites.length === 0 ? (
          <div className="text-center py-12 text-stone-400">Niciun site configurat.</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-stone-100 dark:border-stone-800 bg-stone-50 dark:bg-stone-800/50">
                <th className="text-left px-4 py-3 font-medium text-stone-500">Nume</th>
                <th className="text-left px-4 py-3 font-medium text-stone-500 hidden md:table-cell">
                  URL
                </th>
                <th className="text-left px-4 py-3 font-medium text-stone-500">Scraper</th>
                <th className="text-left px-4 py-3 font-medium text-stone-500 hidden lg:table-cell">
                  Ultima scrape
                </th>
                <th className="text-center px-4 py-3 font-medium text-stone-500">Activ</th>
                <th className="text-right px-4 py-3 font-medium text-stone-500">Acțiuni</th>
              </tr>
            </thead>
            <tbody>
              {sites.map((site) =>
                editingId === site.id ? (
                  <tr
                    key={site.id}
                    className="border-b border-stone-100 dark:border-stone-800 bg-red-50 dark:bg-red-950/10"
                  >
                    <td className="px-4 py-2">
                      <input
                        type="text"
                        value={editForm.nume || ''}
                        onChange={(e) => setEditForm({ ...editForm, nume: e.target.value })}
                        className="w-full px-2 py-1 text-sm bg-white dark:bg-stone-800 border border-stone-200 dark:border-stone-700 rounded"
                      />
                    </td>
                    <td className="px-4 py-2 hidden md:table-cell">
                      <input
                        type="url"
                        value={editForm.url || ''}
                        onChange={(e) => setEditForm({ ...editForm, url: e.target.value })}
                        className="w-full px-2 py-1 text-sm bg-white dark:bg-stone-800 border border-stone-200 dark:border-stone-700 rounded"
                      />
                    </td>
                    <td className="px-4 py-2">
                      <select
                        value={editForm.scraper_key || ''}
                        onChange={(e) => setEditForm({ ...editForm, scraper_key: e.target.value })}
                        className="w-full px-2 py-1 text-sm bg-white dark:bg-stone-800 border border-stone-200 dark:border-stone-700 rounded"
                      >
                        {scrapers.map((s) => (
                          <option key={s} value={s}>
                            {s}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-4 py-2 hidden lg:table-cell text-stone-400 text-xs">
                      {fmtDate(site.last_scraped_at)}
                    </td>
                    <td className="px-4 py-2 text-center">
                      <input
                        type="checkbox"
                        checked={editForm.activ ?? true}
                        onChange={(e) => setEditForm({ ...editForm, activ: e.target.checked })}
                      />
                    </td>
                    <td className="px-4 py-2 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() =>
                            updateMutation.mutate({ id: site.id, data: editForm })
                          }
                          className="p-1.5 rounded text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-900/20"
                          title="Salvează"
                        >
                          <Save className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => setEditingId(null)}
                          className="p-1.5 rounded text-stone-400 hover:bg-stone-100 dark:hover:bg-stone-800"
                          title="Anulează"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ) : (
                  <tr
                    key={site.id}
                    className="border-b border-stone-50 dark:border-stone-800/50 hover:bg-stone-50 dark:hover:bg-stone-800/30"
                  >
                    <td className="px-4 py-3">
                      <div className="font-medium text-stone-800 dark:text-stone-200">
                        {site.nume}
                      </div>
                      {site.scrape_error && (
                        <div className="flex items-center gap-1 text-xs text-red-500 mt-0.5">
                          <AlertCircle className="w-3 h-3" />
                          {site.scrape_error.slice(0, 60)}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 hidden md:table-cell">
                      <a
                        href={site.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-600 dark:text-blue-400 hover:underline truncate block max-w-xs"
                      >
                        {site.url}
                      </a>
                    </td>
                    <td className="px-4 py-3">
                      <span className="px-2 py-0.5 rounded-full bg-stone-100 dark:bg-stone-800 text-stone-600 dark:text-stone-400 text-xs font-mono">
                        {site.scraper_key}
                      </span>
                    </td>
                    <td className="px-4 py-3 hidden lg:table-cell text-xs text-stone-400">
                      {site.last_scraped_at ? (
                        <span className="flex items-center gap-1">
                          <CheckCircle className="w-3 h-3 text-emerald-500" />
                          {fmtDate(site.last_scraped_at)}
                        </span>
                      ) : (
                        'Niciodată'
                      )}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span
                        className={`inline-block w-2 h-2 rounded-full ${
                          site.activ ? 'bg-emerald-500' : 'bg-stone-300 dark:bg-stone-600'
                        }`}
                      />
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        {site.product_count > 0 && (
                          <span className="mr-1 text-xs text-stone-400 dark:text-stone-500 tabular-nums">
                            {site.product_count} prod.
                          </span>
                        )}
                        <button
                          onClick={() => handleScrape(site)}
                          disabled={scrapingId === site.id || embeddingId === site.id}
                          className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-100 dark:hover:bg-emerald-900/40 disabled:opacity-50"
                          title="Scrape acum"
                        >
                          <Play className="w-3.5 h-3.5" />
                          {scrapingId === site.id ? 'Se scrape...' : 'Scrape'}
                        </button>
                        {site.product_count > 0 && (
                          <button
                            onClick={() => handleEmbed(site)}
                            disabled={embeddingId === site.id || scrapingId === site.id}
                            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-violet-50 dark:bg-violet-900/20 text-violet-700 dark:text-violet-400 hover:bg-violet-100 dark:hover:bg-violet-900/40 disabled:opacity-50"
                            title="Generează embeddings Ollama pentru produse"
                          >
                            <Cpu className="w-3.5 h-3.5" />
                            {embeddingId === site.id ? 'Embed...' : 'Embed'}
                          </button>
                        )}
                        <button
                          onClick={() => startEdit(site)}
                          className="p-1.5 rounded text-stone-400 hover:bg-stone-100 dark:hover:bg-stone-800"
                          title="Editează"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => {
                            if (confirm(`Ștergi site-ul „${site.nume}"?`)) {
                              deleteMutation.mutate(site.id);
                            }
                          }}
                          className="p-1.5 rounded text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20"
                          title="Șterge"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              )}
            </tbody>
          </table>
        )}
      </div>

      <div className="text-sm text-stone-400 dark:text-stone-500 bg-stone-50 dark:bg-stone-900 rounded-lg p-4 border border-stone-200 dark:border-stone-800">
        <p className="font-medium text-stone-500 dark:text-stone-400 mb-1">Scraper-e disponibile</p>
        <ul className="list-disc list-inside space-y-1">
          <li>
            <code className="font-mono text-xs">margineni</code> — restaurantmargineni.ro
            (WooCommerce)
          </li>
          <li>
            <code className="font-mono text-xs">lanuci</code> — lanuci.ro (Wix online ordering)
          </li>
        </ul>
        <p className="mt-2 text-xs">
          Scraping-ul automat rulează zilnic la 03:00. Apăsați „Scrape acum" pentru actualizare
          imediată.
        </p>
      </div>
    </div>
  );
};
