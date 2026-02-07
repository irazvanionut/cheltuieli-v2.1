import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Edit2, Check, X, FolderTree } from 'lucide-react';
import { toast } from 'react-hot-toast';

import api from '@/services/api';
import { Card, Button, Input, Modal, Spinner, Badge, EmptyState, Checkbox } from '@/components/ui';
import type { Categorie } from '@/types';

const COLORS = [
  '#EF4444', '#F97316', '#F59E0B', '#EAB308', '#84CC16',
  '#22C55E', '#10B981', '#14B8A6', '#06B6D4', '#0EA5E9',
  '#3B82F6', '#6366F1', '#8B5CF6', '#A855F7', '#D946EF',
  '#EC4899', '#F43F5E', '#6B7280', '#78716C', '#71717A',
];

export const CategoriiSettings: React.FC = () => {
  const queryClient = useQueryClient();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<Categorie | null>(null);
  const [formData, setFormData] = useState({
    nume: '',
    descriere: '',
    culoare: '#EF4444',
    afecteaza_sold: true,
    ordine: 0,
  });

  // Fetch categorii
  const { data: categorii = [], isLoading } = useQuery({
    queryKey: ['categorii', 'all'],
    queryFn: () => api.getCategorii(),
  });

  // Create mutation
  const createMutation = useMutation({
    mutationFn: (data: Partial<Categorie>) => api.createCategorie(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['categorii'] });
      toast.success('Categorie creată cu succes');
      closeModal();
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.detail || 'Eroare la creare');
    },
  });

  // Update mutation
  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<Categorie> }) =>
      api.updateCategorie(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['categorii'] });
      toast.success('Categorie actualizată');
      closeModal();
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.detail || 'Eroare la actualizare');
    },
  });

  const openModal = (item?: Categorie) => {
    if (item) {
      setEditingItem(item);
      setFormData({
        nume: item.nume,
        descriere: item.descriere || '',
        culoare: item.culoare,
        afecteaza_sold: item.afecteaza_sold,
        ordine: item.ordine,
      });
    } else {
      setEditingItem(null);
      setFormData({
        nume: '',
        descriere: '',
        culoare: COLORS[Math.floor(Math.random() * COLORS.length)],
        afecteaza_sold: true,
        ordine: categorii.length + 1,
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

    if (editingItem) {
      updateMutation.mutate({ id: editingItem.id, data: formData });
    } else {
      createMutation.mutate(formData);
    }
  };

  const toggleActive = (item: Categorie) => {
    updateMutation.mutate({ id: item.id, data: { activ: !item.activ } });
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
            Categorii
          </h1>
          <p className="text-sm text-stone-500 mt-1">
            Categorii principale pentru clasificarea cheltuielilor
          </p>
        </div>
        <Button onClick={() => openModal()} icon={<Plus className="w-4 h-4" />}>
          Adaugă categorie
        </Button>
      </div>

      {/* Info */}
      <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-4 mb-6">
        <p className="text-sm text-amber-800 dark:text-amber-300">
          <strong>Categorii standard:</strong> Cheltuieli (roșu), Marfă (albastru), 
          Salarii (verde), Tips/Pahar (galben), FormePlata (gri - nu afectează sold).
        </p>
      </div>

      {/* Lista categorii */}
      {categorii.length === 0 ? (
        <Card>
          <EmptyState
            icon={<FolderTree className="w-12 h-12" />}
            title="Nu există categorii"
            description="Adaugă prima categorie"
            action={
              <Button onClick={() => openModal()} icon={<Plus className="w-4 h-4" />}>
                Adaugă categorie
              </Button>
            }
          />
        </Card>
      ) : (
        <Card padding="none">
          <div className="divide-y divide-stone-100 dark:divide-stone-800">
            {categorii
              .sort((a, b) => a.ordine - b.ordine)
              .map((item) => (
                <div
                  key={item.id}
                  className="flex items-center gap-4 px-4 py-3 hover:bg-stone-50 dark:hover:bg-stone-800/50 transition-colors"
                >
                  <div
                    className="w-4 h-4 rounded-full flex-shrink-0 ring-2 ring-offset-2 ring-offset-white dark:ring-offset-stone-900"
                    style={{ backgroundColor: item.culoare, ringColor: item.culoare }}
                  />
                  
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-stone-900 dark:text-stone-100">
                        {item.nume}
                      </span>
                      {!item.activ && <Badge variant="gray">Inactiv</Badge>}
                      {!item.afecteaza_sold && (
                        <Badge variant="yellow">Nu afectează sold</Badge>
                      )}
                    </div>
                    {item.descriere && (
                      <p className="text-sm text-stone-500 truncate">{item.descriere}</p>
                    )}
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
      )}

      {/* Modal */}
      <Modal
        open={isModalOpen}
        onClose={closeModal}
        title={editingItem ? 'Editează categorie' : 'Adaugă categorie nouă'}
        closeOnBackdropClick={false}
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <Input
            label="Nume categorie"
            value={formData.nume}
            onChange={(e) => setFormData({ ...formData, nume: e.target.value })}
            placeholder="ex: Cheltuieli, Marfă..."
            required
            autoFocus
          />
          
          <Input
            label="Descriere (opțional)"
            value={formData.descriere}
            onChange={(e) => setFormData({ ...formData, descriere: e.target.value })}
            placeholder="Descriere scurtă"
          />

          <div>
            <label className="block text-sm font-medium text-stone-700 dark:text-stone-300 mb-2">
              Culoare
            </label>
            <div className="flex flex-wrap gap-2">
              {COLORS.map((color) => (
                <button
                  key={color}
                  type="button"
                  onClick={() => setFormData({ ...formData, culoare: color })}
                  className={`w-8 h-8 rounded-lg transition-all ${
                    formData.culoare === color 
                      ? 'ring-2 ring-offset-2 ring-stone-900 dark:ring-stone-100 scale-110' 
                      : 'hover:scale-105'
                  }`}
                  style={{ backgroundColor: color }}
                />
              ))}
            </div>
          </div>
          
          <Input
            label="Ordine afișare"
            type="number"
            min={1}
            value={formData.ordine}
            onChange={(e) => setFormData({ ...formData, ordine: parseInt(e.target.value) || 1 })}
          />

          <Checkbox
            label="Afectează soldul portofelelor (scade din sold)"
            checked={formData.afecteaza_sold}
            onChange={(e) => setFormData({ ...formData, afecteaza_sold: e.target.checked })}
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
