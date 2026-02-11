import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Edit2, Check, X, Search, Sparkles, BookOpen, RefreshCw, AlertCircle, ChevronDown, ChevronUp } from 'lucide-react';
import { toast } from 'react-hot-toast';

import api from '@/services/api';
import { Card, Button, Input, Modal, Spinner, Badge, EmptyState } from '@/components/ui';
import type { Nomenclator, Categorie, Grupa } from '@/types';

const TIP_OPTIONS = [
  { value: 'Furnizor', label: 'Furnizor' },
  { value: 'Persoana', label: 'Persoană' },
  { value: 'Serviciu', label: 'Serviciu' },
  { value: 'Altele', label: 'Altele' },
];

export const NomenclatorSettings: React.FC = () => {
  const queryClient = useQueryClient();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<Nomenclator | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterCategorie, setFilterCategorie] = useState<number | ''>('');
  const [formData, setFormData] = useState({
    denumire: '',
    categorie_id: 0,
    grupa_id: 0,
    tip_entitate: 'Altele',
  });
  const [neasociatDenumire, setNeasociatDenumire] = useState<string | null>(null);

  // Inline create categorie/grupa state
  const [isAddingCategorie, setIsAddingCategorie] = useState(false);
  const [newCategorieName, setNewCategorieName] = useState('');
  const [isAddingGrupa, setIsAddingGrupa] = useState(false);
  const [newGrupaName, setNewGrupaName] = useState('');

  // Fetch nomenclator
  const { data: nomenclator = [], isLoading } = useQuery({
    queryKey: ['nomenclator', 'all'],
    queryFn: () => api.getNomenclator(),
  });

  // Fetch categorii
  const { data: categorii = [] } = useQuery({
    queryKey: ['categorii'],
    queryFn: () => api.getCategorii(),
  });

  // Fetch grupe
  const { data: grupe = [] } = useQuery({
    queryKey: ['grupe'],
    queryFn: () => api.getGrupe(),
  });

  // Fetch neasociate
  const { data: neasociate = [] } = useQuery({
    queryKey: ['nomenclator', 'neasociate'],
    queryFn: () => api.getNeasociate(),
  });

  const [showNeasociate, setShowNeasociate] = useState(false);

  // Mutations
  const createMutation = useMutation({
    mutationFn: (data: Partial<Nomenclator>) => api.createNomenclator(data),
    onSuccess: async (createdItem: Nomenclator) => {
      // If created from neasociat, also link existing cheltuieli
      if (neasociatDenumire) {
        try {
          const result = await api.asociazaNeasociate(neasociatDenumire, createdItem.id);
          toast.success(`Denumire creată și ${result.updated} cheltuieli asociate`);
        } catch {
          toast.success('Denumire creată (asocierea cheltuielilor a eșuat)');
        }
      } else {
        toast.success('Denumire creată');
      }
      queryClient.invalidateQueries({ queryKey: ['nomenclator'] });
      queryClient.invalidateQueries({ queryKey: ['nomenclator', 'neasociate'] });
      queryClient.invalidateQueries({ queryKey: ['cheltuieli'] });
      queryClient.invalidateQueries({ queryKey: ['raport'] });
      closeModal();
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.detail || 'Eroare');
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<Nomenclator> }) =>
      api.updateNomenclator(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['nomenclator'] });
      toast.success('Denumire actualizată');
      closeModal();
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.detail || 'Eroare');
    },
  });

  const embeddingsMutation = useMutation({
    mutationFn: () => api.generateEmbeddings(true),
    onSuccess: (data) => {
      toast.success(`Embeddings: ${data.generated}/${data.total} generate`);
    },
    onError: () => {
      toast.error('Eroare la generarea embeddings. Verifică conexiunea Ollama.');
    },
  });

  const openModal = (item?: Nomenclator) => {
    if (item) {
      setEditingItem(item);
      setFormData({
        denumire: item.denumire,
        categorie_id: item.categorie_id || 0,
        grupa_id: item.grupa_id || 0,
        tip_entitate: item.tip_entitate || 'Altele',
      });
    } else {
      setEditingItem(null);
      setFormData({
        denumire: '',
        categorie_id: filterCategorie ? Number(filterCategorie) : 0,
        grupa_id: 0,
        tip_entitate: 'Altele',
      });
    }
    setIsModalOpen(true);
  };

  const openModalFromNeasociat = (denumire: string) => {
    setEditingItem(null);
    setNeasociatDenumire(denumire);
    setFormData({
      denumire,
      categorie_id: 0,
      grupa_id: 0,
      tip_entitate: 'Altele',
    });
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setEditingItem(null);
    setNeasociatDenumire(null);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.denumire.trim()) {
      toast.error('Denumirea este obligatorie');
      return;
    }

    const data = {
      ...formData,
      categorie_id: formData.categorie_id || undefined,
      grupa_id: formData.grupa_id || undefined,
    };

    if (editingItem) {
      updateMutation.mutate({ id: editingItem.id, data });
    } else {
      createMutation.mutate(data);
    }
  };

  const toggleActive = (item: Nomenclator) => {
    updateMutation.mutate({ id: item.id, data: { activ: !item.activ } });
  };

  // Filtered items
  const filtered = nomenclator.filter((item) => {
    const matchSearch = !searchQuery || 
      item.denumire.toLowerCase().includes(searchQuery.toLowerCase());
    const matchCategorie = !filterCategorie || 
      item.categorie_id === Number(filterCategorie);
    return matchSearch && matchCategorie;
  }).sort((a, b) => {
    // Items without categorie_id come first (Denumiri neasociate)
    if (a.categorie_id === null && b.categorie_id !== null) return -1;
    if (a.categorie_id !== null && b.categorie_id === null) return 1;
    
    // Then sort by denumire
    return a.denumire.localeCompare(b.denumire);
  });

  // Get grupe for selected categorie in form
  const filteredGrupe = formData.categorie_id
    ? grupe.filter((g) => g.categorie_id === formData.categorie_id)
    : grupe;

  const handleInlineCreateCategorie = async () => {
    if (!newCategorieName.trim()) return;
    try {
      const created = await api.createCategorie({ nume: newCategorieName.trim(), culoare: '#6B7280', afecteaza_sold: true });
      queryClient.invalidateQueries({ queryKey: ['categorii'] });
      setFormData({ ...formData, categorie_id: created.id, grupa_id: 0 });
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
      const created = await api.createGrupa({ nume: newGrupaName.trim(), categorie_id: formData.categorie_id || undefined });
      queryClient.invalidateQueries({ queryKey: ['grupe'] });
      setFormData({ ...formData, grupa_id: created.id });
      setNewGrupaName('');
      setIsAddingGrupa(false);
      toast.success('Grupă creată');
    } catch (err: any) {
      toast.error(err.response?.data?.detail || 'Eroare la creare grupă');
    }
  };

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
            Nomenclator
          </h1>
          <p className="text-sm text-stone-500 mt-1">
            Master data pentru autocomplete: furnizori, persoane, servicii
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="secondary"
            onClick={() => embeddingsMutation.mutate()}
            loading={embeddingsMutation.isPending}
            icon={<Sparkles className="w-4 h-4" />}
            title="Regenerează vectorii AI pentru autocomplete semantic"
          >
            Regenerează AI
          </Button>
          <Button onClick={() => openModal()} icon={<Plus className="w-4 h-4" />}>
            Adaugă
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Caută denumire..."
            className="w-full pl-10 pr-4 py-2 rounded-lg border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-900"
          />
        </div>
        <select
          value={filterCategorie}
          onChange={(e) => setFilterCategorie(e.target.value ? Number(e.target.value) : '')}
          className="px-4 py-2 rounded-lg border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-900"
        >
          <option value="">Toate categoriile</option>
          {categorii.map((cat) => (
            <option key={cat.id} value={cat.id}>{cat.nume}</option>
          ))}
        </select>
      </div>

      {/* Stats */}
      <div className="flex gap-4 mb-4 text-sm text-stone-500">
        <span>Total: {nomenclator.length}</span>
        <span>•</span>
        <span>Afișate: {filtered.length}</span>
        <span>•</span>
        <span>Active: {nomenclator.filter(n => n.activ).length}</span>
      </div>

      {/* Neasociate Section */}
      {neasociate.length > 0 && (
        <Card className="mb-6" padding="none">
          <button
            onClick={() => setShowNeasociate(!showNeasociate)}
            className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-stone-50 dark:hover:bg-stone-800/50"
          >
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-amber-500" />
              <span className="font-semibold text-stone-900 dark:text-stone-100">
                Denumiri neasociate ({neasociate.length})
              </span>
              <span className="text-sm text-stone-500">
                — cheltuieli fara nomenclator
              </span>
            </div>
            {showNeasociate ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
          {showNeasociate && (
            <div className="border-t border-stone-200 dark:border-stone-700">
              <table className="w-full text-sm">
                <thead className="bg-stone-50 dark:bg-stone-800/50">
                  <tr>
                    <th className="px-4 py-2 text-left font-semibold text-stone-600 dark:text-stone-400">Denumire</th>
                    <th className="px-4 py-2 text-right font-semibold text-stone-600 dark:text-stone-400">Utilizari</th>
                    <th className="px-4 py-2 text-right font-semibold text-stone-600 dark:text-stone-400">Actiune</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100 dark:divide-stone-800">
                  {neasociate.map((item) => (
                    <tr key={item.denumire} className="hover:bg-stone-50 dark:hover:bg-stone-800/50">
                      <td className="px-4 py-2 text-stone-900 dark:text-stone-100">{item.denumire}</td>
                      <td className="px-4 py-2 text-right text-stone-500">{item.count}</td>
                      <td className="px-4 py-2 text-right">
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => openModalFromNeasociat(item.denumire)}
                        >
                          Asociaza
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}

      {/* Table */}
      {filtered.length === 0 ? (
        <Card>
          <EmptyState
            icon={<BookOpen className="w-12 h-12" />}
            title="Nu există denumiri"
            description={searchQuery ? 'Încearcă altă căutare' : 'Adaugă prima denumire'}
            action={
              !searchQuery && (
                <Button onClick={() => openModal()} icon={<Plus className="w-4 h-4" />}>
                  Adaugă denumire
                </Button>
              )
            }
          />
        </Card>
      ) : (
        <Card padding="none">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-stone-50 dark:bg-stone-800/50 sticky top-0">
                <tr>
                  <th className="px-4 py-3 text-left font-semibold text-stone-600 dark:text-stone-400">
                    Denumire
                  </th>
                  <th className="px-4 py-3 text-left font-semibold text-stone-600 dark:text-stone-400">
                    Categorie / Grupă
                  </th>
                  <th className="px-4 py-3 text-left font-semibold text-stone-600 dark:text-stone-400">
                    Tip
                  </th>
                  <th className="px-4 py-3 text-right font-semibold text-stone-600 dark:text-stone-400">
                    Utilizări
                  </th>
                  <th className="px-4 py-3 text-right font-semibold text-stone-600 dark:text-stone-400">
                    Acțiuni
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100 dark:divide-stone-800">
                {filtered.slice(0, 100).map((item) => (
                  <tr key={item.id} className="hover:bg-stone-50 dark:hover:bg-stone-800/50">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-stone-900 dark:text-stone-100">
                          {item.denumire}
                        </span>
                        {!item.activ && <Badge variant="gray">Inactiv</Badge>}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-stone-600 dark:text-stone-400">
                      <span>{item.categorie_nume || '-'}</span>
                      <span className="text-stone-400"> / </span>
                      <span>{item.grupa_nume || '-'}</span>
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant="gray">{item.tip_entitate}</Badge>
                    </td>
                    <td className="px-4 py-3 text-right text-stone-500">
                      {item.frecventa_utilizare}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => openModal(item)}
                        >
                          <Edit2 className="w-4 h-4" />
                        </Button>
                        <Button
                          variant={item.activ ? 'danger' : 'secondary'}
                          size="sm"
                          onClick={() => toggleActive(item)}
                        >
                          {item.activ ? <X className="w-4 h-4" /> : <Check className="w-4 h-4" />}
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {filtered.length > 100 && (
            <div className="px-4 py-3 text-center text-sm text-stone-500 border-t border-stone-200 dark:border-stone-700">
              Se afișează primele 100 din {filtered.length} rezultate. Folosește căutarea pentru a găsi specific.
            </div>
          )}
        </Card>
      )}

      {/* Modal */}
      <Modal
        open={isModalOpen}
        onClose={closeModal}
        title={editingItem ? 'Editează denumire' : 'Adaugă denumire nouă'}
        size="lg"
        closeOnBackdropClick={false}
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <Input
            label="Denumire"
            value={formData.denumire}
            onChange={(e) => setFormData({ ...formData, denumire: e.target.value })}
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
                value={formData.categorie_id}
                onChange={(e) => setFormData({
                  ...formData,
                  categorie_id: Number(e.target.value),
                  grupa_id: 0
                })}
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
                value={formData.grupa_id}
                onChange={(e) => setFormData({ ...formData, grupa_id: Number(e.target.value) })}
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
              value={formData.tip_entitate}
              onChange={(e) => setFormData({ ...formData, tip_entitate: e.target.value })}
              className="w-full px-3 py-2 rounded-lg border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-900"
            >
              {TIP_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>

          <div className="flex gap-3 pt-4">
            <Button type="button" variant="secondary" onClick={closeModal} className="flex-1">
              Anulează
            </Button>
            <Button
              type="submit"
              variant="primary"
              className="flex-1"
              loading={createMutation.isPending || updateMutation.isPending}
            >
              {editingItem ? 'Salvează' : 'Adaugă'}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
