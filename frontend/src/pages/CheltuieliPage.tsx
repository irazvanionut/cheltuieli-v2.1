import React, { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Plus, Edit2, Check, X, DollarSign, Filter, Search, RefreshCw,
  EyeOff, CheckCircle, ArrowRightLeft, Wallet, ArrowRight, Lock
} from 'lucide-react';
import { toast } from 'react-hot-toast';

import { useAppStore } from '@/hooks/useAppStore';
import api from '@/services/api';
import { Card, Button, Input, Modal, Spinner, EmptyState } from '@/components/ui';
import type { Cheltuiala, CheltuialaCreate, AutocompleteResult, Alimentare, Transfer } from '@/types';

const CURRENCY_LABELS_DEFAULT: Record<string, string> = { RON: 'lei', EUR: '€', USD: '$' };
const getCurrencyLabel = (moneda: string, labels?: Record<string, string>) => (labels || CURRENCY_LABELS_DEFAULT)[moneda] || moneda;

type TabType = 'cheltuieli' | 'alimentari' | 'transferuri';

export const CheltuieliPage: React.FC = () => {
  const queryClient = useQueryClient();
  const { user, exercitiu } = useAppStore();
  const [activeTab, setActiveTab] = useState<TabType>('cheltuieli');

  // ============================
  // CHELTUIELI STATE
  // ============================
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<Cheltuiala | null>(null);
  const [showFilters, setShowFilters] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [filters, setFilters] = useState({
    portofel_id: '',
    categorie_id: '',
    verificat: '',
    neplatit: '',
    data_start: '',
    data_end: ''
  });
  const [formData, setFormData] = useState<CheltuialaCreate>({
    portofel_id: 0,
    nomenclator_id: undefined,
    denumire_custom: '',
    categorie_id: undefined,
    grupa_id: undefined,
    suma: 0,
    moneda: 'RON',
    sens: 'Cheltuiala',
    neplatit: false,
    comentarii: ''
  });
  const [autocompleteResults, setAutocompleteResults] = useState<AutocompleteResult[]>([]);
  const [showAutocomplete, setShowAutocomplete] = useState(false);

  // ============================
  // ALIMENTARI STATE
  // ============================
  const [isAlimentareModalOpen, setIsAlimentareModalOpen] = useState(false);
  const [editingAlimentare, setEditingAlimentare] = useState<Alimentare | null>(null);
  const [alimentareForm, setAlimentareForm] = useState({
    portofel_id: 0,
    suma: 0,
    moneda: 'RON',
    comentarii: ''
  });

  // ============================
  // TRANSFERURI STATE
  // ============================
  const [isTransferModalOpen, setIsTransferModalOpen] = useState(false);
  const [editingTransfer, setEditingTransfer] = useState<Transfer | null>(null);
  const [transferForm, setTransferForm] = useState({
    portofel_sursa_id: 0,
    portofel_dest_id: 0,
    suma: 0,
    moneda: 'RON',
    suma_dest: 0,
    moneda_dest: '',
    comentarii: ''
  });

  // ============================
  // QUERIES
  // ============================

  const hasDateFilter = filters.data_start || filters.data_end;

  const { data: cheltuieli = [], isLoading, refetch } = useQuery({
    queryKey: ['cheltuieli', filters, exercitiu?.id],
    queryFn: () => {
      const params: Record<string, any> = {};
      if (hasDateFilter) {
        if (filters.data_start) params.data_start = filters.data_start;
        if (filters.data_end) params.data_end = filters.data_end;
      } else {
        params.exercitiu_id = exercitiu?.id;
      }
      if (filters.portofel_id) params.portofel_id = filters.portofel_id;
      if (filters.categorie_id) params.categorie_id = filters.categorie_id;
      if (filters.verificat) params.verificat = filters.verificat;
      if (filters.neplatit) params.neplatit = filters.neplatit;
      return api.getCheltuieli(params);
    },
  });

  const { data: alimentari = [], isLoading: isLoadingAlimentari, refetch: refetchAlimentari } = useQuery({
    queryKey: ['alimentari', filters.data_start, filters.data_end, exercitiu?.id],
    queryFn: () => hasDateFilter
      ? api.getAlimentari({ data_start: filters.data_start || undefined, data_end: filters.data_end || undefined })
      : api.getAlimentari({ exercitiu_id: exercitiu?.id }),
  });

  const { data: transferuri = [], isLoading: isLoadingTransferuri, refetch: refetchTransferuri } = useQuery({
    queryKey: ['transferuri', filters.data_start, filters.data_end, exercitiu?.id],
    queryFn: () => hasDateFilter
      ? api.getTransferuri({ data_start: filters.data_start || undefined, data_end: filters.data_end || undefined })
      : api.getTransferuri({ exercitiu_id: exercitiu?.id }),
  });

  const { data: portofele = [] } = useQuery({
    queryKey: ['portofele'],
    queryFn: () => api.getPortofele(),
  });

  const { data: categorii = [] } = useQuery({
    queryKey: ['categorii'],
    queryFn: () => api.getCategorii(),
  });

  const { data: grupe = [] } = useQuery({
    queryKey: ['grupe'],
    queryFn: () => api.getGrupe(),
  });

  const { data: monede = [] } = useQuery({
    queryKey: ['monede'],
    queryFn: () => api.getMonede(),
    staleTime: 5 * 60 * 1000,
  });
  const CURRENCY_LABELS = useMemo(() => {
    const labels: Record<string, string> = { ...CURRENCY_LABELS_DEFAULT };
    monede.forEach(m => { labels[m.code] = m.label; });
    return labels;
  }, [monede]);

  // ============================
  // CHELTUIELI MUTATIONS
  // ============================

  const createMutation = useMutation({
    mutationFn: (data: CheltuialaCreate) => api.createCheltuiala(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cheltuieli'] });
      toast.success('Cheltuiala adaugata cu succes');
      closeModal();
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.detail || 'Eroare la adaugare');
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<Cheltuiala> }) =>
      api.updateCheltuiala(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cheltuieli'] });
      toast.success('Cheltuiala actualizata');
      closeModal();
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.detail || 'Eroare la actualizare');
    },
  });

  const verifyMutation = useMutation({
    mutationFn: (id: number) => api.verificaCheltuiala(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cheltuieli'] });
      toast.success('Cheltuiala verificata');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => api.deleteCheltuiala(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cheltuieli'] });
      toast.success('Cheltuiala stearsa');
    },
  });

  // ============================
  // ALIMENTARI MUTATIONS
  // ============================

  const createAlimentareMutation = useMutation({
    mutationFn: (data: { portofel_id: number; suma: number; moneda: string; comentarii?: string }) =>
      api.createAlimentare(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['alimentari'] });
      queryClient.invalidateQueries({ queryKey: ['portofele'] });
      toast.success('Alimentare adaugata cu succes');
      setIsAlimentareModalOpen(false);
      resetAlimentareForm();
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.detail || 'Eroare la alimentare');
    },
  });

  const updateAlimentareMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<Alimentare> }) =>
      api.updateAlimentare(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['alimentari'] });
      queryClient.invalidateQueries({ queryKey: ['portofele'] });
      toast.success('Alimentare actualizata');
      setIsAlimentareModalOpen(false);
      resetAlimentareForm();
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.detail || 'Eroare la actualizare');
    },
  });

  const deleteAlimentareMutation = useMutation({
    mutationFn: (id: number) => api.deleteAlimentare(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['alimentari'] });
      queryClient.invalidateQueries({ queryKey: ['portofele'] });
      toast.success('Alimentare stearsa');
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.detail || 'Eroare la stergere');
    },
  });

  // ============================
  // TRANSFERURI MUTATIONS
  // ============================

  const createTransferMutation = useMutation({
    mutationFn: (data: { portofel_sursa_id: number; portofel_dest_id: number; suma: number; moneda: string; suma_dest?: number; moneda_dest?: string; comentarii?: string }) =>
      api.createTransfer(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['transferuri'] });
      queryClient.invalidateQueries({ queryKey: ['portofele'] });
      toast.success('Transfer efectuat cu succes');
      setIsTransferModalOpen(false);
      resetTransferForm();
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.detail || 'Eroare la transfer');
    },
  });

  const updateTransferMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<Transfer> }) =>
      api.updateTransfer(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['transferuri'] });
      queryClient.invalidateQueries({ queryKey: ['portofele'] });
      toast.success('Transfer actualizat');
      setIsTransferModalOpen(false);
      resetTransferForm();
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.detail || 'Eroare la actualizare');
    },
  });

  const deleteTransferMutation = useMutation({
    mutationFn: (id: number) => api.deleteTransfer(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['transferuri'] });
      queryClient.invalidateQueries({ queryKey: ['portofele'] });
      toast.success('Transfer sters');
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.detail || 'Eroare la stergere');
    },
  });

  // ============================
  // CHELTUIELI HANDLERS
  // ============================

  const handleSearch = async (query: string) => {
    if (!query.trim()) {
      setAutocompleteResults([]);
      setShowAutocomplete(false);
      return;
    }
    try {
      const results = await api.autocompleteNomenclator(query);
      setAutocompleteResults(results);
      setShowAutocomplete(true);
    } catch (error) {
      console.error('Autocomplete error:', error);
    }
  };

  const selectAutocomplete = (result: AutocompleteResult) => {
    setFormData({
      ...formData,
      nomenclator_id: result.id,
      denumire_custom: '',
      categorie_id: result.categorie_id,
      grupa_id: result.grupa_id
    });
    setAutocompleteResults([]);
    setShowAutocomplete(false);
    setSearchQuery(result.denumire);
  };

  const openModal = (item?: Cheltuiala) => {
    if (item) {
      setEditingItem(item);
      setFormData({
        portofel_id: item.portofel_id,
        nomenclator_id: item.nomenclator_id,
        denumire_custom: item.denumire_custom || '',
        categorie_id: item.categorie_id,
        grupa_id: item.grupa_id,
        suma: item.suma,
        moneda: item.moneda || 'RON',
        sens: item.sens,
        neplatit: item.neplatit,
        comentarii: item.comentarii || ''
      });
      setSearchQuery(item.denumire || '');
    } else {
      setEditingItem(null);
      setFormData({
        portofel_id: portofele[0]?.id || 0,
        nomenclator_id: undefined,
        denumire_custom: '',
        categorie_id: undefined,
        grupa_id: undefined,
        suma: 0,
        moneda: 'RON',
        sens: 'Cheltuiala',
        neplatit: false,
        comentarii: ''
      });
      setSearchQuery('');
    }
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setEditingItem(null);
    setAutocompleteResults([]);
    setShowAutocomplete(false);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.portofel_id) {
      toast.error('Selecteaza un portofel');
      return;
    }
    if (!formData.nomenclator_id && !(formData.denumire_custom || '').trim()) {
      toast.error('Adauga o denumire sau selecteaza din nomenclator');
      return;
    }
    if (formData.suma <= 0) {
      toast.error('Suma trebuie sa fie pozitiva');
      return;
    }

    if (editingItem) {
      updateMutation.mutate({ id: editingItem.id, data: formData as Partial<Cheltuiala> });
    } else {
      createMutation.mutate(formData);
    }
  };

  // ============================
  // ALIMENTARI HANDLERS
  // ============================

  const resetAlimentareForm = () => {
    setAlimentareForm({ portofel_id: portofele[0]?.id || 0, suma: 0, moneda: 'RON', comentarii: '' });
    setEditingAlimentare(null);
  };

  const openAlimentareModal = (item?: Alimentare) => {
    if (item) {
      setEditingAlimentare(item);
      setAlimentareForm({
        portofel_id: item.portofel_id,
        suma: item.suma,
        moneda: item.moneda || 'RON',
        comentarii: item.comentarii || ''
      });
    } else {
      resetAlimentareForm();
    }
    setIsAlimentareModalOpen(true);
  };

  const handleAlimentareSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!alimentareForm.portofel_id) {
      toast.error('Selecteaza un portofel');
      return;
    }
    if (alimentareForm.suma <= 0) {
      toast.error('Suma trebuie sa fie pozitiva');
      return;
    }
    if (editingAlimentare) {
      updateAlimentareMutation.mutate({
        id: editingAlimentare.id,
        data: {
          portofel_id: alimentareForm.portofel_id,
          suma: alimentareForm.suma,
          moneda: alimentareForm.moneda,
          comentarii: alimentareForm.comentarii || undefined
        } as Partial<Alimentare>
      });
    } else {
      createAlimentareMutation.mutate({
        portofel_id: alimentareForm.portofel_id,
        suma: alimentareForm.suma,
        moneda: alimentareForm.moneda,
        comentarii: alimentareForm.comentarii || undefined
      });
    }
  };

  // ============================
  // TRANSFERURI HANDLERS
  // ============================

  const resetTransferForm = () => {
    setTransferForm({
      portofel_sursa_id: portofele[0]?.id || 0,
      portofel_dest_id: portofele[1]?.id || 0,
      suma: 0,
      moneda: 'RON',
      suma_dest: 0,
      moneda_dest: '',
      comentarii: ''
    });
    setEditingTransfer(null);
  };

  const openTransferModal = (item?: Transfer) => {
    if (item) {
      setEditingTransfer(item);
      setTransferForm({
        portofel_sursa_id: item.portofel_sursa_id,
        portofel_dest_id: item.portofel_dest_id,
        suma: item.suma,
        moneda: item.moneda || 'RON',
        suma_dest: item.suma_dest || 0,
        moneda_dest: item.moneda_dest || '',
        comentarii: item.comentarii || ''
      });
    } else {
      resetTransferForm();
    }
    setIsTransferModalOpen(true);
  };

  const handleTransferSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!transferForm.portofel_sursa_id || !transferForm.portofel_dest_id) {
      toast.error('Selecteaza ambele portofele');
      return;
    }
    if (transferForm.portofel_sursa_id === transferForm.portofel_dest_id) {
      toast.error('Portofelele trebuie sa fie diferite');
      return;
    }
    if (transferForm.suma <= 0) {
      toast.error('Suma trebuie sa fie pozitiva');
      return;
    }
    const transferData: any = {
      portofel_sursa_id: transferForm.portofel_sursa_id,
      portofel_dest_id: transferForm.portofel_dest_id,
      suma: transferForm.suma,
      moneda: transferForm.moneda,
      comentarii: transferForm.comentarii || undefined
    };
    if (transferForm.moneda_dest && transferForm.moneda_dest !== transferForm.moneda && transferForm.suma_dest) {
      transferData.suma_dest = transferForm.suma_dest;
      transferData.moneda_dest = transferForm.moneda_dest;
    }
    if (editingTransfer) {
      updateTransferMutation.mutate({ id: editingTransfer.id, data: transferData });
    } else {
      createTransferMutation.mutate(transferData);
    }
  };

  // ============================
  // DERIVED
  // ============================

  const filteredCheltuieli = cheltuieli.filter(ch =>
    searchQuery === '' ||
    (ch.denumire && ch.denumire.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  const canVerify = user?.rol === 'sef' || user?.rol === 'admin';

  const handleRefresh = () => {
    if (activeTab === 'cheltuieli') refetch();
    else if (activeTab === 'alimentari') refetchAlimentari();
    else refetchTransferuri();
  };

  const currentLoading = activeTab === 'cheltuieli' ? isLoading
    : activeTab === 'alimentari' ? isLoadingAlimentari
    : isLoadingTransferuri;

  if (currentLoading) {
    return (
      <div className="flex justify-center py-12">
        <Spinner size="lg" />
      </div>
    );
  }

  // ============================
  // CURRENCY SELECTOR COMPONENT
  // ============================

  const CurrencySelect = ({ value, onChange }: { value: string; onChange: (v: string) => void }) => (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full px-4 py-2 rounded-lg border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-900 text-stone-900 dark:text-stone-100"
    >
      {Object.entries(CURRENCY_LABELS).map(([code, label]) => (
        <option key={code} value={code}>{code} ({label})</option>
      ))}
    </select>
  );

  // ============================
  // RENDER
  // ============================

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-stone-900 dark:text-stone-100">
            Cheltuieli
          </h1>
          <p className="text-sm text-stone-500 mt-1">
            {exercitiu ? `Ziua: ${exercitiu.data}` : 'Incarcare...'}
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="secondary"
            onClick={handleRefresh}
            icon={<RefreshCw className="w-4 h-4" />}
          />
          {activeTab === 'cheltuieli' && (
            <Button onClick={() => openModal()} icon={<Plus className="w-4 h-4" />}>
              Adauga cheltuiala
            </Button>
          )}
          {activeTab === 'alimentari' && (
            <Button onClick={() => openAlimentareModal()} icon={<Plus className="w-4 h-4" />}>
              Alimenteaza portofel
            </Button>
          )}
          {activeTab === 'transferuri' && (
            <Button onClick={() => openTransferModal()} icon={<Plus className="w-4 h-4" />}>
              Transfer nou
            </Button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-stone-200 dark:border-stone-700 mb-6">
        <button
          onClick={() => setActiveTab('cheltuieli')}
          className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
            activeTab === 'cheltuieli'
              ? 'border-red-600 text-red-600 dark:text-red-400 dark:border-red-400'
              : 'border-transparent text-stone-500 hover:text-stone-700 dark:hover:text-stone-300'
          }`}
        >
          <DollarSign className="w-4 h-4" />
          Cheltuieli ({cheltuieli.length})
        </button>
        <button
          onClick={() => setActiveTab('alimentari')}
          className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
            activeTab === 'alimentari'
              ? 'border-blue-600 text-blue-600 dark:text-blue-400 dark:border-blue-400'
              : 'border-transparent text-stone-500 hover:text-stone-700 dark:hover:text-stone-300'
          }`}
        >
          <Wallet className="w-4 h-4" />
          Alimentari ({alimentari.length})
        </button>
        <button
          onClick={() => setActiveTab('transferuri')}
          className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
            activeTab === 'transferuri'
              ? 'border-green-600 text-green-600 dark:text-green-400 dark:border-green-400'
              : 'border-transparent text-stone-500 hover:text-stone-700 dark:hover:text-stone-300'
          }`}
        >
          <ArrowRightLeft className="w-4 h-4" />
          Transferuri ({transferuri.length})
        </button>
      </div>

      {/* ============================
          TAB: CHELTUIELI
         ============================ */}
      {activeTab === 'cheltuieli' && (
        <>
          {/* Search and Filters */}
          <Card className="mb-6">
            <div className="flex items-center gap-4 mb-4">
              <div className="flex-1 relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-stone-400 w-4 h-4" />
                <Input
                  placeholder="Cauta dupa denumire..."
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value);
                    handleSearch(e.target.value);
                  }}
                  className="pl-10"
                />

                {/* Autocomplete dropdown */}
                {showAutocomplete && autocompleteResults.length > 0 && (
                  <div className="absolute top-full left-0 right-0 mt-1 bg-white dark:bg-stone-800 border border-stone-200 dark:border-stone-700 rounded-lg shadow-lg z-[60] max-h-60 overflow-y-auto">
                    {autocompleteResults.map((result) => (
                      <div
                        key={result.id}
                        className="px-4 py-3 hover:bg-stone-50 dark:hover:bg-stone-700 cursor-pointer border-b border-stone-100 dark:border-stone-700 last:border-b-0"
                        onClick={(e) => {
                          e.stopPropagation();
                          selectAutocomplete(result);
                        }}
                      >
                        <div className="font-medium text-stone-900 dark:text-stone-100">
                          {result.denumire}
                        </div>
                        <div className="text-sm text-stone-500">
                          {result.categorie_nume} {result.grupa_nume && `• ${result.grupa_nume}`}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <Button
                variant="secondary"
                onClick={() => setShowFilters(!showFilters)}
                icon={<Filter className="w-4 h-4" />}
              >
                Filtre
              </Button>
            </div>

            {showFilters && (
              <div className="pt-4 border-t border-stone-200 dark:border-stone-700 space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-stone-700 dark:text-stone-300 mb-1">Data start</label>
                    <input
                      type="date"
                      value={filters.data_start}
                      onChange={(e) => setFilters({ ...filters, data_start: e.target.value })}
                      className="w-full px-4 py-2 rounded-lg border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-900 text-stone-900 dark:text-stone-100"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-stone-700 dark:text-stone-300 mb-1">Data end</label>
                    <input
                      type="date"
                      value={filters.data_end}
                      onChange={(e) => setFilters({ ...filters, data_end: e.target.value })}
                      className="w-full px-4 py-2 rounded-lg border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-900 text-stone-900 dark:text-stone-100"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-4 gap-4">
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
                  <select
                    value={filters.verificat}
                    onChange={(e) => setFilters({ ...filters, verificat: e.target.value })}
                    className="w-full px-4 py-2 rounded-lg border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-900 text-stone-900 dark:text-stone-100"
                  >
                    <option value="">Toate</option>
                    <option value="true">Verificate</option>
                    <option value="false">Neverificate</option>
                  </select>
                  <select
                    value={filters.neplatit}
                    onChange={(e) => setFilters({ ...filters, neplatit: e.target.value })}
                    className="w-full px-4 py-2 rounded-lg border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-900 text-stone-900 dark:text-stone-100"
                  >
                    <option value="">Toate</option>
                    <option value="false">Platite</option>
                    <option value="true">Neplatite</option>
                  </select>
                </div>
              </div>
            )}
          </Card>

          {/* Cheltuieli List */}
          {filteredCheltuieli.length === 0 ? (
            <Card>
              <EmptyState
                icon={<DollarSign className="w-12 h-12" />}
                title="Nu exista cheltuieli"
                description={
                  searchQuery || Object.values(filters).some(v => v !== '')
                    ? 'Nu s-au gasit cheltuieli conform filtrelor'
                    : 'Adauga prima cheltuiala'
                }
                action={
                  <Button onClick={() => openModal()} icon={<Plus className="w-4 h-4" />}>
                    Adauga cheltuiala
                  </Button>
                }
              />
            </Card>
          ) : (
            <div className="space-y-2">
              {filteredCheltuieli.map((item) => {
                const isLocked = item.verificat || item.exercitiu_activ === false;
                return (
                <Card key={item.id} padding="sm">
                  <div className="flex items-center gap-4">
                    <div
                      className="w-3 h-3 rounded-full flex-shrink-0"
                      style={{ backgroundColor: item.categorie_culoare || '#6B7280' }}
                    />

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-medium text-stone-900 dark:text-stone-100">
                          {item.denumire}
                        </span>
                        <div className="flex gap-1">
                          {item.verificat && <CheckCircle className="w-4 h-4 text-green-500" title="Verificat" />}
                          {item.exercitiu_activ === false && <Lock className="w-4 h-4 text-stone-400" title="Zi închisă" />}
                          {item.neplatit && <EyeOff className="w-4 h-4 text-orange-500" title="Neplatit" />}
                        </div>
                      </div>
                      <div className="flex items-center gap-4 text-sm text-stone-500">
                        {item.exercitiu_data && (
                          <span className="font-medium">{new Date(item.exercitiu_data + 'T00:00:00').toLocaleDateString('ro-RO', { day: '2-digit', month: '2-digit' })}</span>
                        )}
                        <span>{item.portofel_nume}</span>
                        {item.categorie_nume && <span>{item.categorie_nume}</span>}
                        {item.grupa_nume && <span>{item.grupa_nume}</span>}
                        <span>{item.operator_nume}</span>
                      </div>
                      {item.comentarii && (
                        <div className="text-sm text-stone-600 dark:text-stone-400 mt-1">
                          {item.comentarii}
                        </div>
                      )}
                    </div>

                    <div className="text-right flex-shrink-0">
                      <div className="font-bold text-stone-900 dark:text-stone-100">
                        {item.sens === 'Cheltuiala' ? '-' : '+'}{item.suma} {getCurrencyLabel(item.moneda || 'RON')}
                      </div>
                      <div className="text-sm text-stone-500">
                        {new Date(item.created_at).toLocaleTimeString('ro-RO', {
                          hour: '2-digit',
                          minute: '2-digit'
                        })}
                      </div>
                    </div>

                    <div className="flex items-center gap-1 flex-shrink-0">
                      {!isLocked && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => openModal(item)}
                          title="Editeaza"
                        >
                          <Edit2 className="w-4 h-4" />
                        </Button>
                      )}

                      {canVerify && !item.verificat && (
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => verifyMutation.mutate(item.id)}
                          title="Verifica"
                          loading={verifyMutation.isPending}
                        >
                          <Check className="w-4 h-4" />
                        </Button>
                      )}

                      {canVerify && !isLocked && (
                        <Button
                          variant="danger"
                          size="sm"
                          onClick={() => deleteMutation.mutate(item.id)}
                          title="Sterge"
                          loading={deleteMutation.isPending}
                        >
                          <X className="w-4 h-4" />
                        </Button>
                      )}
                    </div>
                  </div>
                </Card>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* ============================
          TAB: ALIMENTARI
         ============================ */}
      {activeTab === 'alimentari' && (
        <>
          {alimentari.length === 0 ? (
            <Card>
              <EmptyState
                icon={<Wallet className="w-12 h-12" />}
                title="Nu exista alimentari"
                description="Alimenteaza un portofel pentru a incepe"
                action={
                  <Button onClick={() => openAlimentareModal()} icon={<Plus className="w-4 h-4" />}>
                    Alimenteaza portofel
                  </Button>
                }
              />
            </Card>
          ) : (
            <div className="space-y-2">
              {alimentari.map((item: Alimentare) => (
                <Card key={item.id} padding="sm">
                  <div className="flex items-center gap-4">
                    <div className="p-2 bg-blue-100 dark:bg-blue-900/20 rounded-lg flex-shrink-0">
                      <Wallet className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-stone-900 dark:text-stone-100">
                        {item.portofel_nume || `Portofel #${item.portofel_id}`}
                      </div>
                      {item.comentarii && (
                        <div className="text-sm text-stone-500 mt-1">
                          {item.comentarii}
                        </div>
                      )}
                    </div>

                    <div className="text-right flex-shrink-0">
                      <div className="font-bold text-blue-600 dark:text-blue-400">
                        +{item.suma} {getCurrencyLabel(item.moneda || 'RON')}
                      </div>
                      <div className="text-sm text-stone-500">
                        {new Date(item.created_at).toLocaleTimeString('ro-RO', {
                          hour: '2-digit',
                          minute: '2-digit'
                        })}
                      </div>
                    </div>

                    {canVerify && (
                      <div className="flex items-center gap-1 flex-shrink-0">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => openAlimentareModal(item)}
                          title="Editeaza"
                        >
                          <Edit2 className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="danger"
                          size="sm"
                          onClick={() => deleteAlimentareMutation.mutate(item.id)}
                          title="Sterge"
                          loading={deleteAlimentareMutation.isPending}
                        >
                          <X className="w-4 h-4" />
                        </Button>
                      </div>
                    )}
                  </div>
                </Card>
              ))}
            </div>
          )}
        </>
      )}

      {/* ============================
          TAB: TRANSFERURI
         ============================ */}
      {activeTab === 'transferuri' && (
        <>
          {transferuri.length === 0 ? (
            <Card>
              <EmptyState
                icon={<ArrowRightLeft className="w-12 h-12" />}
                title="Nu exista transferuri"
                description="Efectueaza un transfer intre portofele"
                action={
                  <Button onClick={() => openTransferModal()} icon={<Plus className="w-4 h-4" />}>
                    Transfer nou
                  </Button>
                }
              />
            </Card>
          ) : (
            <div className="space-y-2">
              {transferuri.map((item: Transfer) => (
                <Card key={item.id} padding="sm">
                  <div className="flex items-center gap-4">
                    <div className="p-2 bg-green-100 dark:bg-green-900/20 rounded-lg flex-shrink-0">
                      <ArrowRightLeft className="w-5 h-5 text-green-600 dark:text-green-400" />
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 font-medium text-stone-900 dark:text-stone-100">
                        <span>{item.portofel_sursa_nume || `#${item.portofel_sursa_id}`}</span>
                        <ArrowRight className="w-4 h-4 text-stone-400" />
                        <span>{item.portofel_dest_nume || `#${item.portofel_dest_id}`}</span>
                      </div>
                      {item.comentarii && (
                        <div className="text-sm text-stone-500 mt-1">
                          {item.comentarii}
                        </div>
                      )}
                    </div>

                    <div className="text-right flex-shrink-0">
                      <div className="font-bold text-green-600 dark:text-green-400">
                        {item.suma_dest && item.moneda_dest ? (
                          <>{item.suma} {getCurrencyLabel(item.moneda || 'RON', CURRENCY_LABELS)} → {item.suma_dest} {getCurrencyLabel(item.moneda_dest, CURRENCY_LABELS)}</>
                        ) : (
                          <>{item.suma} {getCurrencyLabel(item.moneda || 'RON', CURRENCY_LABELS)}</>
                        )}
                      </div>
                      <div className="text-sm text-stone-500">
                        {new Date(item.created_at).toLocaleTimeString('ro-RO', {
                          hour: '2-digit',
                          minute: '2-digit'
                        })}
                      </div>
                    </div>

                    {canVerify && (
                      <div className="flex items-center gap-1 flex-shrink-0">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => openTransferModal(item)}
                          title="Editeaza"
                        >
                          <Edit2 className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="danger"
                          size="sm"
                          onClick={() => deleteTransferMutation.mutate(item.id)}
                          title="Sterge"
                          loading={deleteTransferMutation.isPending}
                        >
                          <X className="w-4 h-4" />
                        </Button>
                      </div>
                    )}
                  </div>
                </Card>
              ))}
            </div>
          )}
        </>
      )}

      {/* ============================
          MODAL: CHELTUIALA
         ============================ */}
      <Modal
        open={isModalOpen}
        onClose={closeModal}
        title={editingItem ? 'Editeaza cheltuiala' : 'Adauga cheltuiala noua'}
        size="lg"
        closeOnBackdropClick={false}
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-stone-700 dark:text-stone-300 mb-1">
                Denumire
              </label>
              <div className="relative">
                <Input
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value);
                    handleSearch(e.target.value);
                    setFormData({ ...formData, denumire_custom: e.target.value, nomenclator_id: undefined });
                  }}
                  placeholder="Cauta in nomenclator sau scrie manual..."
                />
                {showAutocomplete && autocompleteResults.length > 0 && (
                  <div className="absolute top-full left-0 right-0 mt-1 bg-white dark:bg-stone-800 border border-stone-200 dark:border-stone-700 rounded-lg shadow-lg z-[60] max-h-48 overflow-y-auto">
                    {autocompleteResults.map((result) => (
                      <div
                        key={result.id}
                        className="px-4 py-2 hover:bg-stone-50 dark:hover:bg-stone-700 cursor-pointer border-b border-stone-100 dark:border-stone-700 last:border-b-0"
                        onClick={(e) => {
                          e.stopPropagation();
                          selectAutocomplete(result);
                        }}
                      >
                        <div className="font-medium text-stone-900 dark:text-stone-100 text-sm">
                          {result.denumire}
                        </div>
                        <div className="text-xs text-stone-500">
                          {result.categorie_nume} {result.grupa_nume && `• ${result.grupa_nume}`}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-stone-700 dark:text-stone-300 mb-1">
                Portofel
              </label>
              <select
                value={formData.portofel_id}
                onChange={(e) => setFormData({ ...formData, portofel_id: Number(e.target.value) })}
                className="w-full px-4 py-2 rounded-lg border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-900 text-stone-900 dark:text-stone-100"
                required
              >
                <option value="">Selecteaza portofel</option>
                {portofele.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nume}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-stone-700 dark:text-stone-300 mb-1">
                Categorie
              </label>
              <select
                value={formData.categorie_id || ''}
                onChange={(e) => setFormData({ ...formData, categorie_id: e.target.value ? Number(e.target.value) : undefined })}
                className="w-full px-4 py-2 rounded-lg border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-900 text-stone-900 dark:text-stone-100"
              >
                <option value="">Fara categorie</option>
                {categorii.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nume}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-stone-700 dark:text-stone-300 mb-1">
                Grupa
              </label>
              <select
                value={formData.grupa_id || ''}
                onChange={(e) => setFormData({ ...formData, grupa_id: e.target.value ? Number(e.target.value) : undefined })}
                className="w-full px-4 py-2 rounded-lg border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-900 text-stone-900 dark:text-stone-100"
              >
                <option value="">Fara grupa</option>
                {grupe.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.nume}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-stone-700 dark:text-stone-300 mb-1">
                Suma
              </label>
              <Input
                type="number"
                step="0.01"
                min="0"
                value={formData.suma}
                onChange={(e) => setFormData({ ...formData, suma: parseFloat(e.target.value) || 0 })}
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-stone-700 dark:text-stone-300 mb-1">
                Moneda
              </label>
              <CurrencySelect
                value={formData.moneda || 'RON'}
                onChange={(v) => setFormData({ ...formData, moneda: v })}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-stone-700 dark:text-stone-300 mb-1">
                Tip
              </label>
              <select
                value={formData.sens}
                onChange={(e) => setFormData({ ...formData, sens: e.target.value as any })}
                className="w-full px-4 py-2 rounded-lg border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-900 text-stone-900 dark:text-stone-100"
              >
                <option value="Cheltuiala">Cheltuiala</option>
                <option value="Incasare">Incasare</option>
              </select>
            </div>

            <div className="flex items-end">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={formData.neplatit}
                  onChange={(e) => setFormData({ ...formData, neplatit: e.target.checked })}
                  className="rounded"
                />
                <span className="text-sm text-stone-700 dark:text-stone-300">
                  Neplatit (marfuri in stoc)
                </span>
              </label>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-stone-700 dark:text-stone-300 mb-1">
              Comentarii
            </label>
            <textarea
              value={formData.comentarii}
              onChange={(e) => setFormData({ ...formData, comentarii: e.target.value })}
              rows={2}
              className="w-full px-4 py-2 rounded-lg border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-900 text-stone-900 dark:text-stone-100"
              placeholder="Note aditionale..."
            />
          </div>

          <div className="flex gap-3 pt-4">
            <Button type="button" variant="secondary" onClick={closeModal} className="flex-1">
              Anuleaza
            </Button>
            <Button
              type="submit"
              variant="primary"
              className="flex-1"
              loading={createMutation.isPending || updateMutation.isPending}
            >
              {editingItem ? 'Salveaza' : 'Adauga'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* ============================
          MODAL: ALIMENTARE
         ============================ */}
      <Modal
        open={isAlimentareModalOpen}
        onClose={() => { setIsAlimentareModalOpen(false); setEditingAlimentare(null); }}
        title={editingAlimentare ? 'Editeaza alimentare' : 'Alimenteaza portofel'}
        size="md"
        closeOnBackdropClick={false}
      >
        <form onSubmit={handleAlimentareSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-stone-700 dark:text-stone-300 mb-1">
              Portofel
            </label>
            <select
              value={alimentareForm.portofel_id}
              onChange={(e) => setAlimentareForm({ ...alimentareForm, portofel_id: Number(e.target.value) })}
              className="w-full px-4 py-2 rounded-lg border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-900 text-stone-900 dark:text-stone-100"
              required
            >
              <option value="">Selecteaza portofel</option>
              {portofele.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nume}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-stone-700 dark:text-stone-300 mb-1">
                Suma
              </label>
              <Input
                type="number"
                step="0.01"
                min="0"
                value={alimentareForm.suma}
                onChange={(e) => setAlimentareForm({ ...alimentareForm, suma: parseFloat(e.target.value) || 0 })}
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-stone-700 dark:text-stone-300 mb-1">
                Moneda
              </label>
              <CurrencySelect
                value={alimentareForm.moneda}
                onChange={(v) => setAlimentareForm({ ...alimentareForm, moneda: v })}
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-stone-700 dark:text-stone-300 mb-1">
              Comentarii
            </label>
            <textarea
              value={alimentareForm.comentarii}
              onChange={(e) => setAlimentareForm({ ...alimentareForm, comentarii: e.target.value })}
              rows={2}
              className="w-full px-4 py-2 rounded-lg border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-900 text-stone-900 dark:text-stone-100"
              placeholder="Observatii..."
            />
          </div>

          <div className="flex gap-3 pt-4">
            <Button type="button" variant="secondary" onClick={() => { setIsAlimentareModalOpen(false); setEditingAlimentare(null); }} className="flex-1">
              Anuleaza
            </Button>
            <Button
              type="submit"
              variant="primary"
              className="flex-1"
              loading={createAlimentareMutation.isPending || updateAlimentareMutation.isPending}
            >
              {editingAlimentare ? 'Salveaza' : 'Alimenteaza'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* ============================
          MODAL: TRANSFER
         ============================ */}
      <Modal
        open={isTransferModalOpen}
        onClose={() => { setIsTransferModalOpen(false); setEditingTransfer(null); }}
        title={editingTransfer ? 'Editeaza transfer' : 'Transfer intre portofele'}
        size="md"
        closeOnBackdropClick={false}
      >
        <form onSubmit={handleTransferSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-stone-700 dark:text-stone-300 mb-1">
                Din portofel
              </label>
              <select
                value={transferForm.portofel_sursa_id}
                onChange={(e) => setTransferForm({ ...transferForm, portofel_sursa_id: Number(e.target.value) })}
                className="w-full px-4 py-2 rounded-lg border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-900 text-stone-900 dark:text-stone-100"
                required
              >
                <option value="">Selecteaza sursa</option>
                {portofele.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nume}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-stone-700 dark:text-stone-300 mb-1">
                In portofel
              </label>
              <select
                value={transferForm.portofel_dest_id}
                onChange={(e) => setTransferForm({ ...transferForm, portofel_dest_id: Number(e.target.value) })}
                className="w-full px-4 py-2 rounded-lg border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-900 text-stone-900 dark:text-stone-100"
                required
              >
                <option value="">Selecteaza destinatie</option>
                {portofele.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nume}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-stone-700 dark:text-stone-300 mb-1">
                Suma sursă
              </label>
              <Input
                type="number"
                step="0.01"
                min="0"
                value={transferForm.suma}
                onChange={(e) => setTransferForm({ ...transferForm, suma: parseFloat(e.target.value) || 0 })}
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-stone-700 dark:text-stone-300 mb-1">
                Moneda sursă
              </label>
              <CurrencySelect
                value={transferForm.moneda}
                onChange={(v) => setTransferForm({ ...transferForm, moneda: v })}
              />
            </div>
          </div>

          {/* Exchange rate section */}
          <div>
            <label className="flex items-center gap-2 text-sm text-stone-600 dark:text-stone-400 mb-2">
              <input
                type="checkbox"
                checked={!!transferForm.moneda_dest}
                onChange={(e) => setTransferForm({
                  ...transferForm,
                  moneda_dest: e.target.checked ? (transferForm.moneda === 'RON' ? 'EUR' : 'RON') : '',
                  suma_dest: 0
                })}
                className="rounded"
              />
              Schimb valutar (monedă diferită la destinație)
            </label>
            {transferForm.moneda_dest && (
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-stone-700 dark:text-stone-300 mb-1">
                    Suma destinație
                  </label>
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    value={transferForm.suma_dest}
                    onChange={(e) => setTransferForm({ ...transferForm, suma_dest: parseFloat(e.target.value) || 0 })}
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-stone-700 dark:text-stone-300 mb-1">
                    Moneda destinație
                  </label>
                  <select
                    value={transferForm.moneda_dest}
                    onChange={(e) => setTransferForm({ ...transferForm, moneda_dest: e.target.value })}
                    className="w-full px-4 py-2 rounded-lg border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-900 text-stone-900 dark:text-stone-100"
                  >
                    {Object.entries(CURRENCY_LABELS)
                      .filter(([code]) => code !== transferForm.moneda)
                      .map(([code, label]) => (
                        <option key={code} value={code}>{code} ({label})</option>
                      ))}
                  </select>
                </div>
              </div>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-stone-700 dark:text-stone-300 mb-1">
              Comentarii
            </label>
            <textarea
              value={transferForm.comentarii}
              onChange={(e) => setTransferForm({ ...transferForm, comentarii: e.target.value })}
              rows={2}
              className="w-full px-4 py-2 rounded-lg border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-900 text-stone-900 dark:text-stone-100"
              placeholder="Observatii..."
            />
          </div>

          <div className="flex gap-3 pt-4">
            <Button type="button" variant="secondary" onClick={() => { setIsTransferModalOpen(false); setEditingTransfer(null); }} className="flex-1">
              Anuleaza
            </Button>
            <Button
              type="submit"
              variant="primary"
              className="flex-1"
              loading={createTransferMutation.isPending || updateTransferMutation.isPending}
            >
              {editingTransfer ? 'Salveaza' : 'Transfera'}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
