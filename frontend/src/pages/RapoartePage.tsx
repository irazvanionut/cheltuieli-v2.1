import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Calendar, Download, Filter, BarChart3, TrendingUp, DollarSign,
  Wallet, CreditCard, ArrowRightLeft, ArrowRight
} from 'lucide-react';
import { toast } from 'react-hot-toast';

import { useAppStore } from '@/hooks/useAppStore';
import api from '@/services/api';
import { Card, Button, Input, Spinner, Badge } from '@/components/ui';
import type { Alimentare, Transfer } from '@/types';

const CURRENCY_LABELS: Record<string, string> = { RON: 'lei', EUR: '€', USD: '$' };
const getCurrencyLabel = (moneda: string) => CURRENCY_LABELS[moneda] || moneda;

export const RapoartePage: React.FC = () => {
  const { exercitiu } = useAppStore();
  const [filters, setFilters] = useState({
    data_start: '',
    data_end: '',
    portofel_id: '',
    categorie_id: ''
  });
  const [showFilters, setShowFilters] = useState(false);

  // Fetch rapoarte zilnice
  const { data: rapoarte = [], isLoading, refetch } = useQuery({
    queryKey: ['rapoarte', filters],
    queryFn: () => api.getRapoarteZilnice({
      data_start: filters.data_start || undefined,
      data_end: filters.data_end || undefined,
      portofel_id: filters.portofel_id ? Number(filters.portofel_id) : undefined,
      categorie_id: filters.categorie_id ? Number(filters.categorie_id) : undefined,
    }),
    retry: 1,
    onError: (error) => {
      console.error('Error fetching rapoarte:', error);
      toast.error('Eroare la încărcarea rapoartelor');
    },
  });

  // Fetch solduri portofele
  const { data: solduri = [] } = useQuery({
    queryKey: ['solduri-portofele', filters],
    queryFn: () => api.getSolduriPortofele({
      data: filters.data_start || undefined,
    }),
    retry: 1,
    onError: (error) => {
      console.error('Error fetching solduri portofele:', error);
      toast.error('Eroare la încărcarea soldurilor portofelelor');
    },
  });

  // Fetch sumar categorii
  const { data: sumarCategorii = [] } = useQuery({
    queryKey: ['sumar-categorii', filters],
    queryFn: () => api.getSumarCategorii({
      data_start: filters.data_start || undefined,
      data_end: filters.data_end || undefined,
    }),
    retry: 1,
    onError: (error) => {
      console.error('Error fetching sumar categorii:', error);
      toast.error('Eroare la încărcarea sumarului pe categorii');
    },
  });

  // Fetch alimentari for current exercitiu
  const { data: alimentari = [] } = useQuery({
    queryKey: ['alimentari-raport', exercitiu?.id],
    queryFn: () => api.getAlimentari(exercitiu?.id),
  });

  // Fetch transferuri for current exercitiu
  const { data: transferuri = [] } = useQuery({
    queryKey: ['transferuri-raport', exercitiu?.id],
    queryFn: () => api.getTransferuri(exercitiu?.id),
  });

  // Fetch reference data
  const { data: portofele = [] } = useQuery({
    queryKey: ['portofele'],
    queryFn: () => api.getPortofele(),
  });

  const { data: categorii = [] } = useQuery({
    queryKey: ['categorii'],
    queryFn: () => api.getCategorii(),
  });

  const handleExport = async (format: 'csv' | 'excel') => {
    try {
      const blob = await api.exportRapoarte({
        format,
        ...filters
      });

      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `raport_${new Date().toISOString().split('T')[0]}.${format}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);

      toast.success(`Raport exportat ca ${format.toUpperCase()}`);
    } catch (error) {
      toast.error('Eroare la export');
    }
  };

  // Calculations with defensive programming
  const totalCheltuieli = Array.isArray(rapoarte) ? rapoarte.reduce((sum: number, r: any) => sum + (Number(r.total_cheltuieli) || 0), 0) : 0;
  const totalIncasari = Array.isArray(rapoarte) ? rapoarte.reduce((sum: number, r: any) => sum + (Number(r.total_incasari) || 0), 0) : 0;
  const totalAlimentariSum = Array.isArray(alimentari) ? alimentari.reduce((sum: number, a: Alimentare) => sum + (Number(a.suma) || 0), 0) : 0;
  const totalNeplatit = Array.isArray(rapoarte) ? rapoarte.reduce((sum: number, r: any) => sum + (Number(r.total_neplatit) || 0), 0) : 0;
  const totalSolduri = Array.isArray(solduri) ? solduri.reduce((sum: number, s: any) => sum + (Number(s.sold_total) || 0), 0) : 0;
  const totalTransferuri = Array.isArray(transferuri) ? transferuri.reduce((sum: number, t: Transfer) => sum + (Number(t.suma) || 0), 0) : 0;

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <Spinner size="lg" />
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-stone-900 dark:text-stone-100">
            Rapoarte
          </h1>
          <p className="text-sm text-stone-500 mt-1">
            Analiza si vizualizarea datelor financiare
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="secondary"
            onClick={() => refetch()}
            icon={<BarChart3 className="w-4 h-4" />}
          >
            Reimprospatare
          </Button>
          <Button
            variant="secondary"
            onClick={() => setShowFilters(!showFilters)}
            icon={<Filter className="w-4 h-4" />}
          >
            Filtre
          </Button>
        </div>
      </div>

      {/* Filters */}
      {showFilters && (
        <Card className="mb-6">
          <div className="grid grid-cols-4 gap-4">
            <div>
              <label className="block text-sm font-medium text-stone-700 dark:text-stone-300 mb-1">
                Data start
              </label>
              <Input
                type="date"
                value={filters.data_start}
                onChange={(e) => setFilters({ ...filters, data_start: e.target.value })}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-stone-700 dark:text-stone-300 mb-1">
                Data end
              </label>
              <Input
                type="date"
                value={filters.data_end}
                onChange={(e) => setFilters({ ...filters, data_end: e.target.value })}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-stone-700 dark:text-stone-300 mb-1">
                Portofel
              </label>
              <select
                value={filters.portofel_id}
                onChange={(e) => setFilters({ ...filters, portofel_id: e.target.value })}
                className="w-full px-4 py-2 rounded-lg border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-900 text-stone-900 dark:text-stone-100"
              >
                <option value="">Toate portofelele</option>
                {portofele.map(p => (
                  <option key={p.id} value={p.id.toString()}>{p.nume}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-stone-700 dark:text-stone-300 mb-1">
                Categorie
              </label>
              <select
                value={filters.categorie_id}
                onChange={(e) => setFilters({ ...filters, categorie_id: e.target.value })}
                className="w-full px-4 py-2 rounded-lg border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-900 text-stone-900 dark:text-stone-100"
              >
                <option value="">Toate categoriile</option>
                {categorii.map(c => (
                  <option key={c.id} value={c.id.toString()}>{c.nume}</option>
                ))}
              </select>
            </div>
          </div>
        </Card>
      )}

      {/* Summary Cards */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <Card>
          <div className="flex items-center gap-3">
            <div className="p-2 bg-red-100 dark:bg-red-900/20 rounded-lg">
              <DollarSign className="w-5 h-5 text-red-600 dark:text-red-400" />
            </div>
            <div>
              <div className="text-sm text-stone-500">Total Cheltuieli</div>
              <div className="text-lg font-bold text-red-600 dark:text-red-400">
                {typeof totalCheltuieli === 'number' ? totalCheltuieli.toFixed(2) : '0.00'} lei
              </div>
            </div>
          </div>
        </Card>

        <Card>
          <div className="flex items-center gap-3">
            <div className="p-2 bg-green-100 dark:bg-green-900/20 rounded-lg">
              <TrendingUp className="w-5 h-5 text-green-600 dark:text-green-400" />
            </div>
            <div>
              <div className="text-sm text-stone-500">Total Incasari</div>
              <div className="text-lg font-bold text-green-600 dark:text-green-400">
                {typeof totalIncasari === 'number' ? totalIncasari.toFixed(2) : '0.00'} lei
              </div>
            </div>
          </div>
        </Card>

        <Card>
          <div className="flex items-center gap-3">
            <div className="p-2 bg-orange-100 dark:bg-orange-900/20 rounded-lg">
              <CreditCard className="w-5 h-5 text-orange-600 dark:text-orange-400" />
            </div>
            <div>
              <div className="text-sm text-stone-500">Sold Total Portofele</div>
              <div className="text-lg font-bold text-orange-600 dark:text-orange-400">
                {typeof totalSolduri === 'number' ? totalSolduri.toFixed(2) : '0.00'} lei
              </div>
            </div>
          </div>
        </Card>
      </div>

      {/* Secondary stats row */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <Card>
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-100 dark:bg-blue-900/20 rounded-lg">
              <Wallet className="w-5 h-5 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <div className="text-sm text-stone-500">Total Alimentari</div>
              <div className="text-lg font-bold text-blue-600 dark:text-blue-400">
                {typeof totalAlimentariSum === 'number' ? totalAlimentariSum.toFixed(2) : '0.00'} lei
              </div>
            </div>
          </div>
        </Card>

        <Card>
          <div className="flex items-center gap-3">
            <div className="p-2 bg-purple-100 dark:bg-purple-900/20 rounded-lg">
              <ArrowRightLeft className="w-5 h-5 text-purple-600 dark:text-purple-400" />
            </div>
            <div>
              <div className="text-sm text-stone-500">Total Transferuri</div>
              <div className="text-lg font-bold text-purple-600 dark:text-purple-400">
                {typeof totalTransferuri === 'number' ? totalTransferuri.toFixed(2) : '0.00'} lei
              </div>
            </div>
          </div>
        </Card>

        <Card>
          <div className="flex items-center gap-3">
            <div className="p-2 bg-yellow-100 dark:bg-yellow-900/20 rounded-lg">
              <DollarSign className="w-5 h-5 text-yellow-600 dark:text-yellow-400" />
            </div>
            <div>
              <div className="text-sm text-stone-500">Total Neplatit</div>
              <div className="text-lg font-bold text-yellow-600 dark:text-yellow-400">
                {typeof totalNeplatit === 'number' ? totalNeplatit.toFixed(2) : '0.00'} lei
              </div>
            </div>
          </div>
        </Card>
      </div>

      {/* Export buttons */}
      <Card className="mb-6">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-semibold text-stone-900 dark:text-stone-100">Export Rapoarte</h3>
            <p className="text-sm text-stone-500">Descarca rapoartele in format CSV sau Excel</p>
          </div>
          <div className="flex gap-2">
            <Button
              variant="secondary"
              onClick={() => handleExport('csv')}
              icon={<Download className="w-4 h-4" />}
            >
              Export CSV
            </Button>
            <Button
              variant="secondary"
              onClick={() => handleExport('excel')}
              icon={<Download className="w-4 h-4" />}
            >
              Export Excel
            </Button>
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-2 gap-6">
        {/* Daily Reports */}
        <Card>
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-stone-900 dark:text-stone-100">Raport Zilnic</h2>
            <Badge variant="gray">{rapoarte.length} zile</Badge>
          </div>

          {rapoarte.length === 0 ? (
            <div className="text-center py-8 text-stone-500">
              <Calendar className="w-12 h-12 mx-auto mb-2 opacity-50" />
              <p>Nu exista date pentru perioada selectata</p>
            </div>
          ) : (
            <div className="space-y-3 max-h-96 overflow-y-auto">
              {rapoarte.map((raport: any) => (
                <div key={raport.data} className="border-b border-stone-100 dark:border-stone-800 pb-3 last:border-b-0">
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-medium text-stone-900 dark:text-stone-100">
                      {new Date(raport.data).toLocaleDateString('ro-RO')}
                    </span>
                    <Badge
                      variant={raport.inchis ? 'green' : 'yellow'}
                    >
                      {raport.inchis ? 'Inchis' : 'Deschis'}
                    </Badge>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div>
                      <span className="text-stone-500">Cheltuieli:</span>
                      <span className="ml-2 font-medium text-red-600">
                        {raport.total_cheltuieli?.toFixed(2) || 0} lei
                      </span>
                    </div>
                    <div>
                      <span className="text-stone-500">Incasari:</span>
                      <span className="ml-2 font-medium text-green-600">
                        {raport.total_incasari?.toFixed(2) || 0} lei
                      </span>
                    </div>
                    <div>
                      <span className="text-stone-500">Alimentari:</span>
                      <span className="ml-2 font-medium text-blue-600">
                        {raport.total_alimentari?.toFixed(2) || 0} lei
                      </span>
                    </div>
                    <div>
                      <span className="text-stone-500">Neplatit:</span>
                      <span className="ml-2 font-medium text-orange-600">
                        {raport.total_neplatit?.toFixed(2) || 0} lei
                      </span>
                    </div>
                  </div>
                  <div className="mt-2 text-sm text-stone-500">
                    {raport.nr_cheltuieli || 0} cheltuieli &bull; {raport.nr_incasari || 0} incasari
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* Wallet Balances */}
        <Card>
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-stone-900 dark:text-stone-100">Solduri Portofele</h2>
            <Badge variant="gray">{solduri.length} portofele</Badge>
          </div>

          {solduri.length === 0 ? (
            <div className="text-center py-8 text-stone-500">
              <Wallet className="w-12 h-12 mx-auto mb-2 opacity-50" />
              <p>Nu exista date despre solduri</p>
            </div>
          ) : (
            <div className="space-y-3 max-h-96 overflow-y-auto">
              {solduri.map((sold: any) => (
                <div key={sold.portofel_id} className="flex items-center justify-between p-3 bg-stone-50 dark:bg-stone-800/50 rounded-lg">
                  <div>
                    <div className="font-medium text-stone-900 dark:text-stone-100">
                      {sold.portofel_nume}
                    </div>
                    <div className="text-sm text-stone-500">
                      Zi: {sold.sold_zi_curenta?.toFixed(2) || 0} lei
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-bold text-stone-900 dark:text-stone-100">
                      {sold.sold_total?.toFixed(2) || 0} lei
                    </div>
                    <div className="text-sm text-stone-500">Total</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      {/* Alimentari & Transferuri Section */}
      <div className="grid grid-cols-2 gap-6 mt-6">
        {/* Alimentari */}
        <Card>
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-stone-900 dark:text-stone-100">Alimentari Zi</h2>
            <Badge variant="blue">{alimentari.length} alimentari</Badge>
          </div>

          {alimentari.length === 0 ? (
            <div className="text-center py-8 text-stone-500">
              <Wallet className="w-12 h-12 mx-auto mb-2 opacity-50" />
              <p>Nu exista alimentari pentru aceasta zi</p>
            </div>
          ) : (
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {alimentari.map((item: Alimentare) => (
                <div key={item.id} className="flex items-center justify-between p-3 bg-blue-50 dark:bg-blue-900/10 rounded-lg">
                  <div>
                    <div className="font-medium text-stone-900 dark:text-stone-100">
                      {item.portofel_nume || `Portofel #${item.portofel_id}`}
                    </div>
                    {item.comentarii && (
                      <div className="text-sm text-stone-500">{item.comentarii}</div>
                    )}
                  </div>
                  <div className="text-right">
                    <div className="font-bold text-blue-600 dark:text-blue-400">
                      +{item.suma} {getCurrencyLabel(item.moneda || 'RON')}
                    </div>
                    <div className="text-xs text-stone-500">
                      {new Date(item.created_at).toLocaleTimeString('ro-RO', { hour: '2-digit', minute: '2-digit' })}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* Transferuri */}
        <Card>
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-stone-900 dark:text-stone-100">Transferuri Zi</h2>
            <Badge variant="green">{transferuri.length} transferuri</Badge>
          </div>

          {transferuri.length === 0 ? (
            <div className="text-center py-8 text-stone-500">
              <ArrowRightLeft className="w-12 h-12 mx-auto mb-2 opacity-50" />
              <p>Nu exista transferuri pentru aceasta zi</p>
            </div>
          ) : (
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {transferuri.map((item: Transfer) => (
                <div key={item.id} className="flex items-center justify-between p-3 bg-green-50 dark:bg-green-900/10 rounded-lg">
                  <div>
                    <div className="flex items-center gap-2 font-medium text-stone-900 dark:text-stone-100">
                      <span>{item.portofel_sursa_nume || `#${item.portofel_sursa_id}`}</span>
                      <ArrowRight className="w-3 h-3 text-stone-400" />
                      <span>{item.portofel_dest_nume || `#${item.portofel_dest_id}`}</span>
                    </div>
                    {item.comentarii && (
                      <div className="text-sm text-stone-500">{item.comentarii}</div>
                    )}
                  </div>
                  <div className="text-right">
                    <div className="font-bold text-green-600 dark:text-green-400">
                      {item.suma} {getCurrencyLabel(item.moneda || 'RON')}
                    </div>
                    <div className="text-xs text-stone-500">
                      {new Date(item.created_at).toLocaleTimeString('ro-RO', { hour: '2-digit', minute: '2-digit' })}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      {/* Categories Summary */}
      {sumarCategorii.length > 0 && (
        <Card className="mt-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-stone-900 dark:text-stone-100">Sumar pe Categorii</h2>
            <Badge variant="gray">{sumarCategorii.length} categorii</Badge>
          </div>

          <div className="grid grid-cols-4 gap-4">
            {sumarCategorii.map((cat: any) => (
              <div key={cat.categorie_id} className="p-3 border border-stone-200 dark:border-stone-700 rounded-lg">
                <div className="flex items-center gap-2 mb-2">
                  <div
                    className="w-3 h-3 rounded-full"
                    style={{ backgroundColor: cat.culoare || '#6B7280' }}
                  />
                  <span className="font-medium text-stone-900 dark:text-stone-100">
                    {cat.categorie_nume}
                  </span>
                </div>
                <div className="text-sm space-y-1">
                  <div className="flex justify-between">
                    <span className="text-stone-500">Cheltuieli:</span>
                    <span className="font-medium text-red-600">
                      {cat.total_cheltuieli?.toFixed(2) || 0} lei
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-stone-500">Incasari:</span>
                    <span className="font-medium text-green-600">
                      {cat.total_incasari?.toFixed(2) || 0} lei
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-stone-500">Tranzactii:</span>
                    <span className="font-medium">{cat.nr_tranzactii || 0}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
};
