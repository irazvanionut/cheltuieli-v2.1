import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Edit2, Check, X, Layers } from 'lucide-react';
import { toast } from 'react-hot-toast';

import api from '@/services/api';
import { Card, Button, Input, Modal, Spinner, Badge, EmptyState } from '@/components/ui';
import type { Grupa, Categorie } from '@/types';

export const GrupeSettings: React.FC = () => {
  const queryClient = useQueryClient();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<Grupa | null>(null);
  const [filterCategorie, setFilterCategorie] = useState<number | ''>('');
  const [formData, setFormData] = useState({
    nume: '',
    categorie_id: 0,
    ordine: 0,
  });

  // Fetch grupe
  const { data: grupe = [], isLoading } = useQuery({
    queryKey: ['grupe', 'all'],
    queryFn: () => api.getGrupe(),
  });

  // Fetch categorii
  const { data: categorii = [] } = useQuery({
    queryKey: ['categorii'],
    queryFn: () => api.getCategorii(),
  });

  // Create mutation
  const createMutation = useMutation({
    mutationFn: (data: Partial<Grupa>) => api.createGrupa(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['grupe'] });
      toast.success('Grupă creată cu succes');
      closeModal();
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.detail || 'Eroare la creare');
    },
  });

  // Update mutation
  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<Grupa> }) =>
      api.updateGrupa(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['grupe'] });
      toast.success('Grupă actualizată');
      closeModal();
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.detail || 'Eroare la actualizare');
    },
  });

  const openModal = (item?: Grupa) => {
    if (item) {
      setEditingItem(item);
      setFormData({
        nume: item.nume,
        categorie_id: item.categorie_id || 0,
        ordine: item.ordine,
      });
    } else {
      setEditingItem(null);
      setFormData({
        nume: '',
        categorie_id: filterCategorie ? Number(filterCategorie) : (categorii[0]?.id || 0),
        ordine: grupe.length + 1,
      });
    }
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setEditingItem(null);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.nume.trim()) {
      toast.error('Numele este obligatoriu');
      return;
    }
    if (!formData.categorie_id) {
      toast.error('Selectează o categorie');
      return;
    }

    if (editingItem) {
      updateMutation.mutate({ id: editingItem.id, data: formData });
    } else {
      createMutation.mutate(formData);
    }
  };

  const toggleActive = (item: Grupa) => {
    updateMutation.mutate({ id: item.id, data: { activ: !item.activ } });
  };

  // Filter and group
  const filteredGrupe = filterCategorie
    ? grupe.filter((g) => g.categorie_id === Number(filterCategorie))
    : grupe;

  // Group by categorie
  const grupeByCategorie: Record<number, Grupa[]> = {};
  filteredGrupe.forEach((g) => {
    const catId = g.categorie_id || 0;
    if (!grupeByCategorie[catId]) grupeByCategorie[catId] = [];
    grupeByCategorie[catId].push(g);
  });

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
            Grupe
          </h1>
          <p className="text-sm text-stone-500 mt-1">
            Subgrupări pentru organizarea detaliată pe categorii
          </p>
        </div>
        <Button onClick={() => openModal()} icon={<Plus className="w-4 h-4" />}>
          Adaugă grupă
        </Button>
      </div>

      {/* Filter */}
      <div className="mb-6">
        <select
          value={filterCategorie}
          onChange={(e) => setFilterCategorie(e.target.value ? Number(e.target.value) : '')}
          className="px-4 py-2 rounded-lg border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-900 text-sm"
        >
          <option value="">Toate categoriile</option>
          {categorii.map((cat) => (
            <option key={cat.id} value={cat.id}>
              {cat.nume}
            </option>
          ))}
        </select>
      </div>

      {/* Lista grupe */}
      {Object.keys(grupeByCategorie).length === 0 ? (
        <Card>
          <EmptyState
            icon={<Layers className="w-12 h-12" />}
            title="Nu există grupe"
            description={filterCategorie ? 'Nu există grupe pentru această categorie' : 'Adaugă prima grupă'}
            action={
              <Button onClick={() => openModal()} icon={<Plus className="w-4 h-4" />}>
                Adaugă grupă
              </Button>
            }
          />
        </Card>
      ) : (
        <div className="space-y-4">
          {Object.entries(grupeByCategorie).map(([catId, grupeList]) => {
            const categorie = categorii.find((c) => c.id === Number(catId));
            return (
              <Card key={catId} padding="none">
                <div
                  className="px-4 py-3 border-b border-stone-200 dark:border-stone-700 flex items-center gap-3"
                  style={{ borderLeftWidth: 4, borderLeftColor: categorie?.culoare || '#6B7280' }}
                >
                  <div
                    className="w-3 h-3 rounded-full"
                    style={{ backgroundColor: categorie?.culoare || '#6B7280' }}
                  />
                  <span className="font-semibold text-stone-800 dark:text-stone-200">
                    {categorie?.nume || 'Fără categorie'}
                  </span>
                  <Badge variant="gray">{grupeList.length} grupe</Badge>
                </div>
                
                <div className="divide-y divide-stone-100 dark:divide-stone-800">
                  {grupeList
                    .sort((a, b) => a.ordine - b.ordine)
                    .map((item) => (
                      <div
                        key={item.id}
                        className="flex items-center gap-4 px-4 py-3 hover:bg-stone-50 dark:hover:bg-stone-800/50 transition-colors"
                      >
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-stone-900 dark:text-stone-100">
                              {item.nume}
                            </span>
                            {!item.activ && <Badge variant="gray">Inactiv</Badge>}
                          </div>
                        </div>

                        <div className="text-sm text-stone-400">#{item.ordine}</div>

                        <div className="flex items-center gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => openModal(item)}
                            title="Editează"
                          >
                            <Edit2 className="w-4 h-4" />
                          </Button>
                          
                          <Button
                            variant={item.activ ? 'danger' : 'secondary'}
                            size="sm"
                            onClick={() => toggleActive(item)}
                            title={item.activ ? 'Dezactivează' : 'Activează'}
                          >
                            {item.activ ? <X className="w-4 h-4" /> : <Check className="w-4 h-4" />}
                          </Button>
                        </div>
                      </div>
                    ))}
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* Modal */}
      <Modal
        open={isModalOpen}
        onClose={closeModal}
        title={editingItem ? 'Editează grupă' : 'Adaugă grupă nouă'}
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <Input
            label="Nume grupă"
            value={formData.nume}
            onChange={(e) => setFormData({ ...formData, nume: e.target.value })}
            placeholder="ex: Distribuitori, ChZilnice..."
            required
            autoFocus
          />

          <div>
            <label className="block text-sm font-medium text-stone-700 dark:text-stone-300 mb-1">
              Categorie
            </label>
            <select
              value={formData.categorie_id}
              onChange={(e) => setFormData({ ...formData, categorie_id: Number(e.target.value) })}
              className="w-full px-4 py-2 rounded-lg border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-900"
              required
            >
              <option value="">Selectează categoria</option>
              {categorii.map((cat) => (
                <option key={cat.id} value={cat.id}>
                  {cat.nume}
                </option>
              ))}
            </select>
          </div>
          
          <Input
            label="Ordine afișare"
            type="number"
            min={1}
            value={formData.ordine}
            onChange={(e) => setFormData({ ...formData, ordine: parseInt(e.target.value) || 1 })}
          />

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
