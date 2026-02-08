import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Plus,
  Search,
  Receipt,
  Wallet,
  Clock,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  RefreshCw,
} from 'lucide-react';
import { format } from 'date-fns';
import { ro } from 'date-fns/locale';
import { clsx } from 'clsx';
import { toast } from 'react-hot-toast';

import api from '@/services/api';
import { useAppStore, useIsSef } from '@/hooks/useAppStore';
import { Card, Button, Badge, Spinner, Amount, EmptyState, Checkbox, Modal, Input } from '@/components/ui';
import type { Cheltuiala, CheltuialaCreate, AutocompleteResult, RaportZilnic, Nomenclator } from '@/types';

// ============================================
// EXPENSE FORM COMPONENT
// ============================================

interface ExpenseFormProps {
  onSuccess: () => void;
}

const ExpenseForm: React.FC<ExpenseFormProps> = ({ onSuccess }) => {
  const queryClient = useQueryClient();
  const [query, setQuery] = useState('');
  const [selectedItem, setSelectedItem] = useState<AutocompleteResult | null>(null);
  const [amount, setAmount] = useState('');
  const [portofelId, setPortofelId] = useState<number | null>(null);
  const [neplatit, setNeplatit] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Nomenclator add modal state
  const [showNomModal, setShowNomModal] = useState(false);
  const [nomForm, setNomForm] = useState({ denumire: '', categorie_id: 0, grupa_id: 0, tip_entitate: 'Altele' });
  const [isCreatingNom, setIsCreatingNom] = useState(false);

  // Get portofele
  const { data: portofele = [] } = useQuery({
    queryKey: ['portofele'],
    queryFn: () => api.getPortofele(true),
  });

  // Get categorii & grupe for nomenclator modal
  const { data: categorii = [] } = useQuery({
    queryKey: ['categorii'],
    queryFn: () => api.getCategorii(),
  });
  const { data: grupe = [] } = useQuery({
    queryKey: ['grupe'],
    queryFn: () => api.getGrupe(),
  });

  // Autocomplete
  const { data: suggestions = [], isLoading: isSearching } = useQuery({
    queryKey: ['autocomplete', query],
    queryFn: () => api.autocomplete(query, 8),
    enabled: query.length >= 2 && !selectedItem,
    staleTime: 1000,
  });

  // Set default portofel
  useEffect(() => {
    if (portofele.length > 0 && !portofelId) {
      setPortofelId(portofele[0].id);
    }
  }, [portofele, portofelId]);

  const handleSelectSuggestion = (item: AutocompleteResult) => {
    setSelectedItem(item);
    setQuery(item.denumire);
    setShowSuggestions(false);
  };

  const handleClearSelection = () => {
    setSelectedItem(null);
    setQuery('');
  };

  const handleOpenNomModal = () => {
    setShowSuggestions(false);
    setNomForm({ denumire: query.trim(), categorie_id: 0, grupa_id: 0, tip_entitate: 'Altele' });
    setShowNomModal(true);
  };

  const handleCreateNomenclator = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nomForm.denumire.trim()) {
      toast.error('Denumirea este obligatorie');
      return;
    }
    setIsCreatingNom(true);
    try {
      const created: Nomenclator = await api.createNomenclator({
        denumire: nomForm.denumire.trim(),
        categorie_id: nomForm.categorie_id || undefined,
        grupa_id: nomForm.grupa_id || undefined,
        tip_entitate: nomForm.tip_entitate,
      });
      // Auto-select the new item in the expense form
      setSelectedItem({
        id: created.id,
        denumire: created.denumire,
        categorie_id: created.categorie_id,
        categorie_nume: created.categorie_nume,
        grupa_id: created.grupa_id,
        grupa_nume: created.grupa_nume,
        similarity: 1,
      });
      setQuery(created.denumire);
      setShowNomModal(false);
      queryClient.invalidateQueries({ queryKey: ['nomenclator'] });
      toast.success('Denumire adăugată în nomenclator');
    } catch (err: any) {
      toast.error(err.response?.data?.detail || 'Eroare la creare');
    } finally {
      setIsCreatingNom(false);
    }
  };

  const filteredGrupe = nomForm.categorie_id
    ? grupe.filter((g) => g.categorie_id === nomForm.categorie_id)
    : grupe;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!portofelId || !amount) return;

    setIsSubmitting(true);

    try {
      const data: CheltuialaCreate = {
        portofel_id: portofelId,
        suma: parseFloat(amount),
        neplatit,
      };

      if (selectedItem) {
        data.nomenclator_id = selectedItem.id;
      } else if (query.trim()) {
        data.denumire_custom = query.trim();
      } else {
        toast.error('Introduceți denumirea');
        return;
      }

      await api.createCheltuiala(data);
      toast.success('Cheltuială adăugată');
      
      // Reset form
      setQuery('');
      setSelectedItem(null);
      setAmount('');
      setNeplatit(false);
      
      onSuccess();
    } catch (error: any) {
      toast.error(error.response?.data?.detail || 'Eroare la salvare');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Card className="mb-6">
      <form onSubmit={handleSubmit} className="p-4">
        <h2 className="font-semibold text-stone-900 dark:text-stone-100 mb-4 flex items-center gap-2">
          <Plus className="w-5 h-5 text-red-500" />
          Adaugă cheltuială
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
          {/* Denumire with autocomplete */}
          <div className="md:col-span-5 relative">
            <label className="block text-sm font-medium text-stone-700 dark:text-stone-300 mb-1">
              Denumire
            </label>
            <div className="relative">
              <input
                type="text"
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setSelectedItem(null);
                  setShowSuggestions(true);
                }}
                onFocus={() => setShowSuggestions(true)}
                placeholder="Caută sau introdu..."
                className={clsx(
                  'w-full pl-10 pr-4 py-2 rounded-lg border transition-colors',
                  'bg-white dark:bg-stone-900',
                  'border-stone-300 dark:border-stone-700',
                  'focus:border-red-500 focus:ring-1 focus:ring-red-500',
                  selectedItem && 'bg-green-50 dark:bg-green-900/20 border-green-500'
                )}
              />
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400" />
              {selectedItem && (
                <button
                  type="button"
                  onClick={handleClearSelection}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-600"
                >
                  <XCircle className="w-4 h-4" />
                </button>
              )}
            </div>

            {/* Autocomplete dropdown */}
            {showSuggestions && query.length >= 2 && !selectedItem && (
              <div className="absolute z-20 w-full mt-1 bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-700 rounded-lg shadow-lg max-h-64 overflow-auto">
                {isSearching ? (
                  <div className="p-3 text-center">
                    <Spinner size="sm" />
                  </div>
                ) : suggestions.length > 0 ? (
                  suggestions.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => handleSelectSuggestion(item)}
                      className="w-full px-4 py-2 text-left hover:bg-stone-100 dark:hover:bg-stone-800 flex items-center justify-between"
                    >
                      <div>
                        <div className="font-medium text-stone-900 dark:text-stone-100">
                          {item.denumire}
                        </div>
                        <div className="text-xs text-stone-500">
                          {item.categorie_nume} • {item.grupa_nume}
                        </div>
                      </div>
                      <Badge variant="gray" className="text-xs">
                        {Math.round(item.similarity * 100)}%
                      </Badge>
                    </button>
                  ))
                ) : (
                  <div className="p-3 text-sm text-center">
                    <div className="text-stone-500 mb-2">Nu s-au găsit rezultate.</div>
                    <button
                      type="button"
                      onClick={handleOpenNomModal}
                      className="inline-flex items-center gap-1 px-3 py-1.5 text-sm font-medium text-red-600 hover:text-red-700 bg-red-50 hover:bg-red-100 dark:bg-red-900/20 dark:hover:bg-red-900/30 dark:text-red-400 rounded-lg transition-colors"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      Adaugă în nomenclator
                    </button>
                  </div>
                )}
              </div>
            )}

            {selectedItem && (
              <div className="mt-1 text-xs text-green-600 dark:text-green-400 flex items-center gap-1">
                <CheckCircle2 className="w-3 h-3" />
                {selectedItem.categorie_nume} → {selectedItem.grupa_nume}
              </div>
            )}
          </div>

          {/* Suma */}
          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-stone-700 dark:text-stone-300 mb-1">
              Suma
            </label>
            <input
              type="number"
              step="0.01"
              min="0"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.00"
              className="w-full px-4 py-2 rounded-lg border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-900 text-right font-mono"
              required
            />
          </div>

          {/* Portofel */}
          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-stone-700 dark:text-stone-300 mb-1">
              Portofel
            </label>
            <select
              value={portofelId || ''}
              onChange={(e) => setPortofelId(Number(e.target.value))}
              className="w-full px-4 py-2 rounded-lg border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-900"
            >
              {portofele.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nume}
                </option>
              ))}
            </select>
          </div>

          {/* Neplatit checkbox */}
          <div className="md:col-span-1 flex items-end pb-2">
            <Checkbox
              checked={neplatit}
              onChange={(e) => setNeplatit(e.target.checked)}
              label="Neplătit"
            />
          </div>

          {/* Submit */}
          <div className="md:col-span-2 flex items-end">
            <Button
              type="submit"
              variant="primary"
              className="w-full"
              loading={isSubmitting}
              icon={<Plus className="w-4 h-4" />}
            >
              Adaugă
            </Button>
          </div>
        </div>
      </form>

      {/* Nomenclator Add Modal */}
      <Modal
        open={showNomModal}
        onClose={() => setShowNomModal(false)}
        title="Adaugă denumire nouă"
        size="lg"
        closeOnBackdropClick={false}
      >
        <form onSubmit={handleCreateNomenclator} className="space-y-4">
          <Input
            label="Denumire"
            value={nomForm.denumire}
            onChange={(e) => setNomForm({ ...nomForm, denumire: e.target.value })}
            placeholder="ex: Metro, Mega Image, Ion Popescu..."
            required
            autoFocus
          />

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-stone-700 dark:text-stone-300 mb-1">
                Categorie
              </label>
              <select
                value={nomForm.categorie_id}
                onChange={(e) => setNomForm({ ...nomForm, categorie_id: Number(e.target.value), grupa_id: 0 })}
                className="w-full px-3 py-2 rounded-lg border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-900"
              >
                <option value="">- Selectează -</option>
                {categorii.map((cat) => (
                  <option key={cat.id} value={cat.id}>{cat.nume}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-stone-700 dark:text-stone-300 mb-1">
                Grupă
              </label>
              <select
                value={nomForm.grupa_id}
                onChange={(e) => setNomForm({ ...nomForm, grupa_id: Number(e.target.value) })}
                className="w-full px-3 py-2 rounded-lg border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-900"
                disabled={!nomForm.categorie_id}
              >
                <option value="">- Selectează -</option>
                {filteredGrupe.map((g) => (
                  <option key={g.id} value={g.id}>{g.nume}</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-stone-700 dark:text-stone-300 mb-1">
              Tip entitate
            </label>
            <select
              value={nomForm.tip_entitate}
              onChange={(e) => setNomForm({ ...nomForm, tip_entitate: e.target.value })}
              className="w-full px-3 py-2 rounded-lg border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-900"
            >
              <option value="Furnizor">Furnizor</option>
              <option value="Persoana">Persoană</option>
              <option value="Serviciu">Serviciu</option>
              <option value="Altele">Altele</option>
            </select>
          </div>

          <div className="flex gap-3 pt-4">
            <Button type="button" variant="secondary" onClick={() => setShowNomModal(false)} className="flex-1">
              Anulează
            </Button>
            <Button type="submit" variant="primary" className="flex-1" loading={isCreatingNom}>
              Adaugă
            </Button>
          </div>
        </form>
      </Modal>
    </Card>
  );
};

// ============================================
// EXPENSES LIST COMPONENT
// ============================================

interface ExpensesListProps {
  cheltuieli: Cheltuiala[];
  isLoading: boolean;
  onVerify: (id: number) => void;
  onDelete: (id: number) => void;
}

const ExpensesList: React.FC<ExpensesListProps> = ({
  cheltuieli,
  isLoading,
  onVerify,
  onDelete,
}) => {
  const isSef = useIsSef();

  if (isLoading) {
    return (
      <Card className="p-8">
        <div className="flex justify-center">
          <Spinner size="lg" />
        </div>
      </Card>
    );
  }

  if (cheltuieli.length === 0) {
    return (
      <Card>
        <EmptyState
          icon={<Receipt className="w-12 h-12" />}
          title="Nu există cheltuieli"
          description="Adaugă prima cheltuială pentru azi folosind formularul de mai sus."
        />
      </Card>
    );
  }

  return (
    <Card padding="none">
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-stone-50 dark:bg-stone-800/50">
            <tr>
<th className="px-4 py-3 text-left text-xs font-semibold text-stone-500 uppercase tracking-wider">
                Denumire
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-stone-500 uppercase tracking-wider">
                Tip
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-stone-500 uppercase tracking-wider">
                Categorie
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-stone-500 uppercase tracking-wider">
                Portofel
              </th>
              <th className="px-4 py-3 text-right text-xs font-semibold text-stone-500 uppercase tracking-wider">
                Suma
              </th>
              <th className="px-4 py-3 text-center text-xs font-semibold text-stone-500 uppercase tracking-wider">
                Status
              </th>
              {isSef && (
                <th className="px-4 py-3 text-right text-xs font-semibold text-stone-500 uppercase tracking-wider">
                  Acțiuni
                </th>
              )}
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-100 dark:divide-stone-800">
            {cheltuieli.map((ch) => (
              <tr
                key={ch.id}
                className="hover:bg-stone-50 dark:hover:bg-stone-800/50 transition-colors"
              >
<td className="px-4 py-3">
                  <div className="font-medium text-stone-900 dark:text-stone-100">
                    {ch.denumire || ch.denumire_custom}
                  </div>
                  <div className="text-xs text-stone-500">
                    {format(new Date(ch.created_at), 'HH:mm', { locale: ro })}
                    {ch.operator_nume && ` • ${ch.operator_nume}`}
                  </div>
                </td>
                <td className="px-4 py-3">
                  <Badge
                    variant={
                      ch.sens === 'Cheltuiala' 
                        ? 'red'
                        : ch.sens === 'Incasare' 
                        ? 'green'
                        : ch.sens === 'Alimentare'
                        ? 'blue'
                        : 'gray'
                    }
                  >
                    {ch.sens}
                  </Badge>
                </td>
                <td className="px-4 py-3">
                  <Badge
                    variant={
                      ch.categorie_nume === 'Cheltuieli'
                        ? 'red'
                        : ch.categorie_nume === 'Marfă'
                        ? 'blue'
                        : ch.categorie_nume === 'Salarii'
                        ? 'green'
                        : ch.categorie_nume === 'Tips'
                        ? 'yellow'
                        : 'gray'
                    }
                  >
                    {ch.categorie_nume}
                  </Badge>
                  {ch.grupa_nume && (
                    <span className="ml-2 text-xs text-stone-500">{ch.grupa_nume}</span>
                  )}
                </td>
                <td className="px-4 py-3 text-stone-600 dark:text-stone-400">
                  {ch.portofel_nume}
                </td>
<td className="px-4 py-3 text-right">
                  <Amount 
                    value={
                      ch.sens === 'Cheltuiala' 
                        ? -ch.suma 
                        : ch.sens === 'Transfer' 
                        ? 0 
                        : ch.suma
                    } 
                    showSign 
                  />
                  {ch.neplatit && (
                    <div className="text-xs text-amber-500 mt-0.5">Neplătit</div>
                  )}
                </td>
                <td className="px-4 py-3 text-center">
                  {ch.verificat ? (
                    <CheckCircle2 className="w-5 h-5 text-emerald-500 mx-auto" />
                  ) : (
                    <Clock className="w-5 h-5 text-stone-300 mx-auto" />
                  )}
                </td>
                {isSef && (
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-2">
                      {!ch.verificat && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => onVerify(ch.id)}
                          title="Verifică"
                        >
                          <CheckCircle2 className="w-4 h-4" />
                        </Button>
                      )}
                      <Button
                        variant="danger"
                        size="sm"
                        onClick={() => onDelete(ch.id)}
                        title="Șterge"
                      >
                        <XCircle className="w-4 h-4" />
                      </Button>
                    </div>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
};

// ============================================
// SUMMARY SIDEBAR COMPONENT
// ============================================

interface SummaryProps {
  raport: RaportZilnic | undefined;
  isLoading: boolean;
}

const Summary: React.FC<SummaryProps> = ({ raport, isLoading }) => {
  if (isLoading || !raport) {
    return (
      <Card className="p-6">
        <div className="flex justify-center">
          <Spinner />
        </div>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Neplatit warning */}
      {raport.total_neplatit > 0 && (
        <Card className="p-3">
          <div className="flex items-center gap-2 text-sm text-amber-600 dark:text-amber-400">
            <AlertTriangle className="w-4 h-4" />
            <span>De platit: {raport.total_neplatit.toLocaleString('ro-RO')} lei</span>
          </div>
        </Card>
      )}

      {/* Portofele */}
      <Card className="p-4">
        <h3 className="font-semibold text-stone-900 dark:text-stone-100 mb-3 flex items-center gap-2">
          <Wallet className="w-4 h-4" />
          Solduri Portofele
        </h3>
        <div className="space-y-2">
          {raport.portofele.map((p) => (
            <div
              key={p.portofel_id}
              className="py-2"
            >
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-stone-600 dark:text-stone-400">{p.portofel_nume}</span>
                  <div className="flex gap-3 text-xs mt-0.5 flex-wrap">
                    {(p.total_alimentari || 0) > 0 && (
                      <span className="text-emerald-600 dark:text-emerald-400">
                        +{(p.total_alimentari || 0).toLocaleString('ro-RO')} ali
                      </span>
                    )}
                    {(p.total_transferuri_in || 0) > 0 && (
                      <span className="text-emerald-600 dark:text-emerald-400">
                        +{(p.total_transferuri_in || 0).toLocaleString('ro-RO')} transf
                      </span>
                    )}
                    {(p.total_cheltuieli || 0) > 0 && (
                      <span className="text-red-600 dark:text-red-400">
                        -{(p.total_cheltuieli || 0).toLocaleString('ro-RO')} chelt
                      </span>
                    )}
                    {(p.total_transferuri_out || 0) > 0 && (
                      <span className="text-red-600 dark:text-red-400">
                        -{(p.total_transferuri_out || 0).toLocaleString('ro-RO')} transf
                      </span>
                    )}
                  </div>
                </div>
                <span className="font-mono font-medium text-stone-900 dark:text-stone-100">
                  {p.sold.toLocaleString('ro-RO')} lei
                </span>
              </div>
            </div>
          ))}
          <div className="flex items-center justify-between py-2 mt-2 border-t border-stone-200 dark:border-stone-700">
            <span className="font-semibold text-stone-900 dark:text-stone-100">TOTAL</span>
            <span className="font-mono font-bold text-lg text-stone-900 dark:text-stone-100">
              {(raport.total_sold || 0).toLocaleString('ro-RO')} lei
            </span>
          </div>
        </div>
      </Card>

      {/* Categorii */}
      <Card className="p-4">
        <h3 className="font-semibold text-stone-900 dark:text-stone-100 mb-3">
          Pe Categorii
        </h3>
        <div className="space-y-2">
          {raport.categorii.map((cat) => (
            <div
              key={cat.categorie_id}
              className="flex items-center justify-between py-1.5"
            >
              <div className="flex items-center gap-2">
                <div
                  className="w-3 h-3 rounded-full"
                  style={{ backgroundColor: cat.categorie_culoare }}
                />
                <span className="text-stone-600 dark:text-stone-400">
                  {cat.categorie_nume}
                </span>
              </div>
              <span className="font-mono text-stone-900 dark:text-stone-100">
                {cat.total.toLocaleString('ro-RO')} lei
              </span>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
};

// ============================================
// MAIN DASHBOARD PAGE
// ============================================

export const DashboardPage: React.FC = () => {
  const queryClient = useQueryClient();
  const { exercitiu } = useAppStore();

// Fetch cheltuieli - luăm din ultimele 3 zile ca să vedem și alimentările
  const {
    data: cheltuieli = [],
    isLoading: isLoadingCheltuieli,
  } = useQuery({
    queryKey: ['cheltuieli', exercitiu?.id],
    queryFn: () => {
      // Verificăm dacă avem exercițiu, dacă nu, luăm ultimele 3 zile
      if (exercitiu?.id) {
        return api.getCheltuieli({ exercitiu_id: exercitiu.id });
      } else {
        // Încercăm cu dată
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
        return api.getCheltuieli({ data_start: sevenDaysAgo.toISOString().split('T')[0] });
      }
    },
    enabled: true, // Activăm mereu ca să vedem datele
  });

  // Fetch raport
  const { data: raport, isLoading: isLoadingRaport } = useQuery({
    queryKey: ['raport', exercitiu?.id],
    queryFn: () => api.getRaportZilnic({ exercitiu_id: exercitiu?.id }),
    enabled: !!exercitiu?.id,
  });

  // Mutations
  const verifyMutation = useMutation({
    mutationFn: (id: number) => api.verificaCheltuiala(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cheltuieli'] });
      toast.success('Cheltuială verificată');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => api.deleteCheltuiala(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cheltuieli'] });
      queryClient.invalidateQueries({ queryKey: ['raport'] });
      toast.success('Cheltuială ștearsă');
    },
  });

  const handleRefresh = () => {
    queryClient.invalidateQueries({ queryKey: ['cheltuieli'] });
    queryClient.invalidateQueries({ queryKey: ['raport'] });
  };

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-stone-900 dark:text-stone-100">
            Dashboard
          </h1>
          <p className="text-stone-500">
            {exercitiu
              ? format(new Date(exercitiu.data), 'EEEE, dd MMMM yyyy', { locale: ro })
              : 'Se încarcă...'}
          </p>
        </div>
        <Button variant="secondary" onClick={handleRefresh} icon={<RefreshCw className="w-4 h-4" />}>
          Actualizează
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main content */}
        <div className="lg:col-span-2 space-y-6">
          {/* Expense form */}
          <ExpenseForm onSuccess={handleRefresh} />

          {/* Expenses list */}
          <ExpensesList
            cheltuieli={cheltuieli}
            isLoading={isLoadingCheltuieli}
            onVerify={(id) => verifyMutation.mutate(id)}
            onDelete={(id) => deleteMutation.mutate(id)}
          />
        </div>

        {/* Sidebar with summary */}
        <div className="lg:col-span-1">
          <Summary raport={raport} isLoading={isLoadingRaport} />
        </div>
      </div>
    </div>
  );
};
