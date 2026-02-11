import React, { useState, useEffect, useMemo, useRef } from 'react';
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
  ArrowLeftRight,
  Banknote,
} from 'lucide-react';
import { format } from 'date-fns';
import { ro } from 'date-fns/locale';
import { clsx } from 'clsx';
import { toast } from 'react-hot-toast';

import api from '@/services/api';
import { useAppStore, useIsSef } from '@/hooks/useAppStore';
import { Card, Button, Badge, Spinner, Amount, EmptyState, Checkbox, Modal, Input } from '@/components/ui';
import type { Cheltuiala, CheltuialaCreate, AutocompleteResult, RaportZilnic, Nomenclator, Portofel } from '@/types';

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
  const [moneda, setMoneda] = useState('RON');
  const [portofelId, setPortofelId] = useState<number | null>(null);
  const [neplatit, setNeplatit] = useState(false);
  const [comentarii, setComentarii] = useState('');
  const [showSuggestions, setShowSuggestions] = useState(false);
  const autocompleteRef = useRef<HTMLDivElement>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Nomenclator add modal state
  const [showNomModal, setShowNomModal] = useState(false);
  const [nomForm, setNomForm] = useState({ denumire: '', categorie_id: 0, grupa_id: 0, tip_entitate: 'Altele' });
  const [isCreatingNom, setIsCreatingNom] = useState(false);

  // Inline create categorie/grupa state
  const [isAddingCategorie, setIsAddingCategorie] = useState(false);
  const [newCategorieName, setNewCategorieName] = useState('');
  const [isAddingGrupa, setIsAddingGrupa] = useState(false);
  const [newGrupaName, setNewGrupaName] = useState('');

  // Get monede (currencies)
  const { data: monede = [] } = useQuery({
    queryKey: ['monede'],
    queryFn: () => api.getMonede(),
    staleTime: 5 * 60 * 1000,
  });

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

  // Close suggestions on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (autocompleteRef.current && !autocompleteRef.current.contains(e.target as Node)) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

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

  const handleInlineCreateCategorie = async () => {
    if (!newCategorieName.trim()) return;
    try {
      const created = await api.createCategorie({ nume: newCategorieName.trim(), culoare: '#6B7280', afecteaza_sold: true });
      queryClient.invalidateQueries({ queryKey: ['categorii'] });
      setNomForm({ ...nomForm, categorie_id: created.id, grupa_id: 0 });
      setNewCategorieName('');
      setIsAddingCategorie(false);
      toast.success('Categorie creată');
    } catch (err: any) {
      toast.error(err.response?.data?.detail || 'Eroare la creare categorie');
    }
  };

  const handleInlineCreateGrupa = async () => {
    if (!newGrupaName.trim()) return;
    try {
      const created = await api.createGrupa({ nume: newGrupaName.trim(), categorie_id: nomForm.categorie_id || undefined });
      queryClient.invalidateQueries({ queryKey: ['grupe'] });
      setNomForm({ ...nomForm, grupa_id: created.id });
      setNewGrupaName('');
      setIsAddingGrupa(false);
      toast.success('Grupă creată');
    } catch (err: any) {
      toast.error(err.response?.data?.detail || 'Eroare la creare grupă');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!portofelId || !amount) return;

    setIsSubmitting(true);

    try {
      const data: CheltuialaCreate = {
        portofel_id: portofelId,
        suma: parseFloat(amount),
        moneda,
        neplatit,
      };

      if (comentarii.trim()) {
        data.comentarii = comentarii.trim();
      }

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
      setMoneda('RON');
      setNeplatit(false);
      setComentarii('');

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

        <div className="grid grid-cols-1 md:grid-cols-12 gap-x-3 gap-y-2">
          {/* Denumire with autocomplete */}
          <div className="md:col-span-6 relative" ref={autocompleteRef}>
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

          {/* Suma + Moneda */}
          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-stone-700 dark:text-stone-300 mb-1">
              Suma
            </label>
            <div className="flex gap-1">
              <input
                type="number"
                step="0.01"
                min="0"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
                className="flex-1 min-w-0 px-2 py-2 rounded-lg border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-900 text-right font-mono"
                required
              />
              <select
                value={moneda}
                onChange={(e) => setMoneda(e.target.value)}
                className="w-16 px-1 py-2 rounded-lg border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-900 text-xs"
              >
                {monede.length > 0 ? monede.map((m) => (
                  <option key={m.code} value={m.code}>{m.code}</option>
                )) : (
                  <>
                    <option value="RON">RON</option>
                    <option value="EUR">EUR</option>
                    <option value="USD">USD</option>
                  </>
                )}
              </select>
            </div>
          </div>

          {/* Portofel */}
          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-stone-700 dark:text-stone-300 mb-1">
              Portofel
            </label>
            <select
              value={portofelId || ''}
              onChange={(e) => setPortofelId(Number(e.target.value))}
              className="w-full px-2 py-2 rounded-lg border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-900"
            >
              {portofele.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nume}
                </option>
              ))}
            </select>
          </div>

          {/* Adaugă */}
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

          {/* Row 2: Comentarii sub Denumire */}
          <div className="md:col-span-6">
            <input
              type="text"
              value={comentarii}
              onChange={(e) => setComentarii(e.target.value)}
              placeholder="Comentarii (opțional)..."
              className="w-full px-4 py-2 rounded-lg border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-900 text-sm"
            />
          </div>

          {/* Neplatit sub Suma */}
          <div className="md:col-span-2 flex items-center">
            <Checkbox
              checked={neplatit}
              onChange={(e) => setNeplatit(e.target.checked)}
              label="Neplătit"
            />
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
              <div className="flex items-center justify-between mb-1">
                <label className="block text-sm font-medium text-stone-700 dark:text-stone-300">
                  Categorie
                </label>
                <button
                  type="button"
                  onClick={() => { setIsAddingCategorie(!isAddingCategorie); setNewCategorieName(''); }}
                  className="text-xs text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300 font-medium"
                  title="Adaugă categorie nouă"
                >
                  {isAddingCategorie ? '✕' : '+'}
                </button>
              </div>
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
              {isAddingCategorie && (
                <div className="flex gap-1 mt-1">
                  <input
                    type="text"
                    value={newCategorieName}
                    onChange={(e) => setNewCategorieName(e.target.value)}
                    placeholder="Nume categorie..."
                    className="flex-1 px-2 py-1 text-sm rounded border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-900"
                    autoFocus
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleInlineCreateCategorie(); } }}
                  />
                  <button
                    type="button"
                    onClick={handleInlineCreateCategorie}
                    className="px-2 py-1 text-xs font-medium text-white bg-red-600 hover:bg-red-700 rounded"
                  >
                    Salvează
                  </button>
                </div>
              )}
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-sm font-medium text-stone-700 dark:text-stone-300">
                  Grupă
                </label>
                <button
                  type="button"
                  onClick={() => { setIsAddingGrupa(!isAddingGrupa); setNewGrupaName(''); }}
                  className="text-xs text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300 font-medium"
                  title="Adaugă grupă nouă"
                >
                  {isAddingGrupa ? '✕' : '+'}
                </button>
              </div>
              <select
                value={nomForm.grupa_id}
                onChange={(e) => setNomForm({ ...nomForm, grupa_id: Number(e.target.value) })}
                className="w-full px-3 py-2 rounded-lg border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-900"
              >
                <option value="">- Selectează -</option>
                {filteredGrupe.map((g) => (
                  <option key={g.id} value={g.id}>{g.nume}</option>
                ))}
              </select>
              {isAddingGrupa && (
                <div className="flex gap-1 mt-1">
                  <input
                    type="text"
                    value={newGrupaName}
                    onChange={(e) => setNewGrupaName(e.target.value)}
                    placeholder="Nume grupă..."
                    className="flex-1 px-2 py-1 text-sm rounded border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-900"
                    autoFocus
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleInlineCreateGrupa(); } }}
                  />
                  <button
                    type="button"
                    onClick={handleInlineCreateGrupa}
                    className="px-2 py-1 text-xs font-medium text-white bg-red-600 hover:bg-red-700 rounded"
                  >
                    Salvează
                  </button>
                </div>
              )}
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
  const [filter, setFilter] = useState('');

  const filteredCheltuieli = cheltuieli.filter((ch) => {
    if (!filter.trim()) return true;
    const search = filter.toLowerCase();
    return (
      (ch.denumire || '').toLowerCase().includes(search) ||
      (ch.denumire_custom || '').toLowerCase().includes(search) ||
      (ch.categorie_nume || '').toLowerCase().includes(search) ||
      (ch.grupa_nume || '').toLowerCase().includes(search) ||
      (ch.portofel_nume || '').toLowerCase().includes(search) ||
      (ch.sens || '').toLowerCase().includes(search) ||
      (ch.operator_nume || '').toLowerCase().includes(search) ||
      (ch.comentarii || '').toLowerCase().includes(search) ||
      String(ch.suma).includes(search)
    );
  });

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
      {/* Filter input */}
      <div className="px-4 pt-4 pb-2">
        <div className="relative">
          <input
            type="text"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filtrează cheltuieli..."
            className="w-full pl-10 pr-4 py-2 rounded-lg border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-900 text-sm focus:border-red-500 focus:ring-1 focus:ring-red-500 transition-colors"
          />
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400" />
          {filter && (
            <button
              type="button"
              onClick={() => setFilter('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-600"
            >
              <XCircle className="w-4 h-4" />
            </button>
          )}
        </div>
        {filter && (
          <div className="text-xs text-stone-500 mt-1">
            {filteredCheltuieli.length} din {cheltuieli.length} rezultate
          </div>
        )}
      </div>

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
            {filteredCheltuieli.map((ch) => (
              <tr
                key={ch.id}
                className="hover:bg-stone-50 dark:hover:bg-stone-800/50 transition-colors"
              >
<td className="px-4 py-3">
                  <div className="font-medium text-stone-900 dark:text-stone-100">
                    {ch.denumire || ch.denumire_custom}
                  </div>
                  {ch.comentarii && (
                    <div className="text-xs text-stone-500 italic">{ch.comentarii}</div>
                  )}
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
                    currency={CURRENCY_LABELS[ch.moneda] || ch.moneda || 'lei'}
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
  portofele: Portofel[];
  currencyLabels: Record<string, string>;
}

const CURRENCY_LABELS_DEFAULT: Record<string, string> = { RON: 'lei', EUR: '€', USD: '$' };
let CURRENCY_LABELS: Record<string, string> = CURRENCY_LABELS_DEFAULT;

const formatMoneda = (monedaMap: Record<string, number> | undefined) => {
  if (!monedaMap) return [];
  return Object.entries(monedaMap)
    .filter(([, v]) => v > 0)
    .map(([moneda, suma]) => ({
      moneda,
      suma: Number(suma),
      label: CURRENCY_LABELS[moneda] || moneda,
    }));
};

const formatSold = (soldMap: Record<string, number> | undefined) => {
  if (!soldMap || Object.keys(soldMap).length === 0) return '0 lei';
  return Object.entries(soldMap)
    .filter(([, v]) => Number(v) !== 0)
    .map(([moneda, suma]) => `${Number(suma).toLocaleString('ro-RO')} ${CURRENCY_LABELS[moneda] || moneda}`)
    .join(' / ') || '0 lei';
};

const Summary: React.FC<SummaryProps> = ({ raport, isLoading, portofele, currencyLabels }) => {
  const queryClient = useQueryClient();
  // Update module-level CURRENCY_LABELS so formatSold/formatMoneda use it
  CURRENCY_LABELS = { ...CURRENCY_LABELS_DEFAULT, ...currencyLabels };

  // Alimentare modal
  const [showAlimentareModal, setShowAlimentareModal] = useState(false);
  const [aliForm, setAliForm] = useState({ portofel_id: 0, suma: '', moneda: 'RON', comentarii: '' });

  // Transfer modal
  const [showTransferModal, setShowTransferModal] = useState(false);
  const [trfForm, setTrfForm] = useState({ portofel_sursa_id: 0, portofel_dest_id: 0, suma: '', moneda: 'RON', suma_dest: '', moneda_dest: '', comentarii: '' });

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: ['raport'] });
    queryClient.invalidateQueries({ queryKey: ['alimentari'] });
    queryClient.invalidateQueries({ queryKey: ['transferuri'] });
    queryClient.invalidateQueries({ queryKey: ['portofele'] });
    queryClient.invalidateQueries({ queryKey: ['cheltuieli'] });
  };

  const alimentareMutation = useMutation({
    mutationFn: (data: { portofel_id: number; suma: number; moneda?: string; comentarii?: string }) =>
      api.createAlimentare(data),
    onSuccess: () => {
      toast.success('Alimentare adăugată');
      invalidateAll();
      setShowAlimentareModal(false);
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.detail || 'Eroare la alimentare');
    },
  });

  const transferMutation = useMutation({
    mutationFn: (data: { portofel_sursa_id: number; portofel_dest_id: number; suma: number; moneda?: string; suma_dest?: number; moneda_dest?: string; comentarii?: string }) =>
      api.createTransfer(data),
    onSuccess: () => {
      toast.success('Transfer adăugat');
      invalidateAll();
      setShowTransferModal(false);
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.detail || 'Eroare la transfer');
    },
  });

  const openAlimentareModal = () => {
    setAliForm({ portofel_id: portofele[0]?.id || 0, suma: '', moneda: 'RON', comentarii: '' });
    setShowAlimentareModal(true);
  };

  const openTransferModal = () => {
    setTrfForm({
      portofel_sursa_id: portofele[0]?.id || 0,
      portofel_dest_id: portofele[1]?.id || portofele[0]?.id || 0,
      suma: '', moneda: 'RON', suma_dest: '', moneda_dest: '', comentarii: '',
    });
    setShowTransferModal(true);
  };

  const handleAlimentareSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!aliForm.portofel_id || !aliForm.suma) return;
    alimentareMutation.mutate({
      portofel_id: aliForm.portofel_id,
      suma: parseFloat(aliForm.suma),
      moneda: aliForm.moneda,
      comentarii: aliForm.comentarii || undefined,
    });
  };

  const handleTransferSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!trfForm.portofel_sursa_id || !trfForm.portofel_dest_id || !trfForm.suma) return;
    if (trfForm.portofel_sursa_id === trfForm.portofel_dest_id) {
      toast.error('Sursa și destinația nu pot fi identice');
      return;
    }
    const transferData: any = {
      portofel_sursa_id: trfForm.portofel_sursa_id,
      portofel_dest_id: trfForm.portofel_dest_id,
      suma: parseFloat(trfForm.suma),
      moneda: trfForm.moneda,
      comentarii: trfForm.comentarii || undefined,
    };
    if (trfForm.moneda_dest && trfForm.moneda_dest !== trfForm.moneda && trfForm.suma_dest) {
      transferData.suma_dest = parseFloat(trfForm.suma_dest);
      transferData.moneda_dest = trfForm.moneda_dest;
    }
    transferMutation.mutate(transferData);
  };

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
      {raport.total_neplatit && Object.values(raport.total_neplatit).some(v => Number(v) > 0) && (
        <Card className="p-3">
          <div className="flex items-center gap-2 text-sm text-amber-600 dark:text-amber-400">
            <AlertTriangle className="w-4 h-4" />
            <span>De platit: {formatSold(raport.total_neplatit)}</span>
          </div>
        </Card>
      )}

      {/* Portofele */}
      <Card className="p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold text-stone-900 dark:text-stone-100 flex items-center gap-2">
            <Wallet className="w-4 h-4" />
            Solduri Portofele
          </h3>
          <div className="flex gap-1">
            <button
              type="button"
              onClick={openAlimentareModal}
              className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/20 hover:bg-emerald-100 dark:hover:bg-emerald-900/40 rounded-md transition-colors"
              title="Alimentare"
            >
              <Banknote className="w-3.5 h-3.5" />
              Ali
            </button>
            <button
              type="button"
              onClick={openTransferModal}
              className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium text-blue-700 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20 hover:bg-blue-100 dark:hover:bg-blue-900/40 rounded-md transition-colors"
              title="Transfer"
            >
              <ArrowLeftRight className="w-3.5 h-3.5" />
              Transf
            </button>
          </div>
        </div>
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
                    {formatMoneda(p.total_alimentari).map(({ moneda, suma, label }) => (
                      <span key={`ali-${moneda}`} className="text-emerald-600 dark:text-emerald-400">
                        +{suma.toLocaleString('ro-RO')} {label} ali
                      </span>
                    ))}
                    {formatMoneda(p.total_transferuri_in).map(({ moneda, suma, label }) => (
                      <span key={`tin-${moneda}`} className="text-emerald-600 dark:text-emerald-400">
                        +{suma.toLocaleString('ro-RO')} {label} transf
                      </span>
                    ))}
                    {formatMoneda(p.total_cheltuieli).map(({ moneda, suma, label }) => (
                      <span key={`ch-${moneda}`} className="text-red-600 dark:text-red-400">
                        -{suma.toLocaleString('ro-RO')} {label} chelt
                      </span>
                    ))}
                    {formatMoneda(p.total_transferuri_out).map(({ moneda, suma, label }) => (
                      <span key={`tout-${moneda}`} className="text-red-600 dark:text-red-400">
                        -{suma.toLocaleString('ro-RO')} {label} transf
                      </span>
                    ))}
                  </div>
                </div>
                <span className="font-mono font-medium text-stone-900 dark:text-stone-100">
                  {formatSold(p.sold)}
                </span>
              </div>
            </div>
          ))}
          <div className="flex items-center justify-between py-2 mt-2 border-t border-stone-200 dark:border-stone-700">
            <span className="font-semibold text-stone-900 dark:text-stone-100">TOTAL</span>
            <span className="font-mono font-bold text-lg text-stone-900 dark:text-stone-100">
              {formatSold(raport.total_sold)}
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
                {formatSold(cat.total)}
              </span>
            </div>
          ))}
        </div>
      </Card>

      {/* Alimentare Modal */}
      <Modal
        open={showAlimentareModal}
        onClose={() => setShowAlimentareModal(false)}
        title="Alimentare portofel"
        size="md"
        closeOnBackdropClick={false}
      >
        <form onSubmit={handleAlimentareSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-stone-700 dark:text-stone-300 mb-1">Portofel</label>
            <select
              value={aliForm.portofel_id}
              onChange={(e) => setAliForm({ ...aliForm, portofel_id: Number(e.target.value) })}
              className="w-full px-3 py-2 rounded-lg border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-900"
            >
              {portofele.map((p) => (
                <option key={p.id} value={p.id}>{p.nume}</option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-stone-700 dark:text-stone-300 mb-1">Suma</label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={aliForm.suma}
                onChange={(e) => setAliForm({ ...aliForm, suma: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-900 text-right font-mono"
                placeholder="0.00"
                required
                autoFocus
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-stone-700 dark:text-stone-300 mb-1">Moneda</label>
              <select
                value={aliForm.moneda}
                onChange={(e) => setAliForm({ ...aliForm, moneda: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-900"
              >
                {Object.entries(currencyLabels).map(([code, label]) => (
                  <option key={code} value={code}>{code} ({label})</option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-stone-700 dark:text-stone-300 mb-1">Comentarii</label>
            <input
              type="text"
              value={aliForm.comentarii}
              onChange={(e) => setAliForm({ ...aliForm, comentarii: e.target.value })}
              className="w-full px-3 py-2 rounded-lg border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-900"
              placeholder="Opțional..."
            />
          </div>
          <div className="flex gap-3 pt-4">
            <Button type="button" variant="secondary" onClick={() => setShowAlimentareModal(false)} className="flex-1">
              Anulează
            </Button>
            <Button type="submit" variant="primary" className="flex-1" loading={alimentareMutation.isPending}>
              Alimentează
            </Button>
          </div>
        </form>
      </Modal>

      {/* Transfer Modal */}
      <Modal
        open={showTransferModal}
        onClose={() => setShowTransferModal(false)}
        title="Transfer între portofele"
        size="md"
        closeOnBackdropClick={false}
      >
        <form onSubmit={handleTransferSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-stone-700 dark:text-stone-300 mb-1">Din portofel</label>
              <select
                value={trfForm.portofel_sursa_id}
                onChange={(e) => setTrfForm({ ...trfForm, portofel_sursa_id: Number(e.target.value) })}
                className="w-full px-3 py-2 rounded-lg border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-900"
              >
                {portofele.map((p) => (
                  <option key={p.id} value={p.id}>{p.nume}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-stone-700 dark:text-stone-300 mb-1">În portofel</label>
              <select
                value={trfForm.portofel_dest_id}
                onChange={(e) => setTrfForm({ ...trfForm, portofel_dest_id: Number(e.target.value) })}
                className="w-full px-3 py-2 rounded-lg border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-900"
              >
                {portofele.map((p) => (
                  <option key={p.id} value={p.id}>{p.nume}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-stone-700 dark:text-stone-300 mb-1">Suma sursă</label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={trfForm.suma}
                onChange={(e) => setTrfForm({ ...trfForm, suma: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-900 text-right font-mono"
                placeholder="0.00"
                required
                autoFocus
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-stone-700 dark:text-stone-300 mb-1">Moneda sursă</label>
              <select
                value={trfForm.moneda}
                onChange={(e) => setTrfForm({ ...trfForm, moneda: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-900"
              >
                {Object.entries(currencyLabels).map(([code, label]) => (
                  <option key={code} value={code}>{code} ({label})</option>
                ))}
              </select>
            </div>
          </div>
          {/* Destination currency (exchange rate) */}
          <div>
            <label className="flex items-center gap-2 text-sm text-stone-600 dark:text-stone-400 mb-2">
              <input
                type="checkbox"
                checked={!!trfForm.moneda_dest}
                onChange={(e) => setTrfForm({
                  ...trfForm,
                  moneda_dest: e.target.checked ? (trfForm.moneda === 'RON' ? 'EUR' : 'RON') : '',
                  suma_dest: ''
                })}
                className="rounded"
              />
              Schimb valutar (monedă diferită la destinație)
            </label>
            {trfForm.moneda_dest && (
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-stone-700 dark:text-stone-300 mb-1">Suma destinație</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={trfForm.suma_dest}
                    onChange={(e) => setTrfForm({ ...trfForm, suma_dest: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-900 text-right font-mono"
                    placeholder="0.00"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-stone-700 dark:text-stone-300 mb-1">Moneda destinație</label>
                  <select
                    value={trfForm.moneda_dest}
                    onChange={(e) => setTrfForm({ ...trfForm, moneda_dest: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-900"
                  >
                    {Object.entries(currencyLabels)
                      .filter(([code]) => code !== trfForm.moneda)
                      .map(([code, label]) => (
                        <option key={code} value={code}>{code} ({label})</option>
                      ))}
                  </select>
                </div>
              </div>
            )}
          </div>
          <div>
            <label className="block text-sm font-medium text-stone-700 dark:text-stone-300 mb-1">Comentarii</label>
            <input
              type="text"
              value={trfForm.comentarii}
              onChange={(e) => setTrfForm({ ...trfForm, comentarii: e.target.value })}
              className="w-full px-3 py-2 rounded-lg border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-900"
              placeholder="Opțional..."
            />
          </div>
          <div className="flex gap-3 pt-4">
            <Button type="button" variant="secondary" onClick={() => setShowTransferModal(false)} className="flex-1">
              Anulează
            </Button>
            <Button type="submit" variant="primary" className="flex-1" loading={transferMutation.isPending}>
              Transferă
            </Button>
          </div>
        </form>
      </Modal>
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

  // Fetch portofele for sidebar modals
  const { data: portofele = [] } = useQuery({
    queryKey: ['portofele'],
    queryFn: () => api.getPortofele(true),
  });

  // Fetch monede (currencies)
  const { data: monede = [] } = useQuery({
    queryKey: ['monede'],
    queryFn: () => api.getMonede(),
    staleTime: 5 * 60 * 1000,
  });
  const currencyLabels = useMemo(() => {
    const labels: Record<string, string> = { RON: 'lei', EUR: '€', USD: '$' };
    monede.forEach(m => { labels[m.code] = m.label; });
    // Update module-level for formatSold usage in this component
    CURRENCY_LABELS = labels;
    return labels;
  }, [monede]);

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
          <Summary raport={raport} isLoading={isLoadingRaport} portofele={portofele} currencyLabels={currencyLabels} />
        </div>
      </div>
    </div>
  );
};
