import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Edit2, Trash2, GripVertical, Check, X, Wallet } from 'lucide-react';
import { toast } from 'react-hot-toast';

import api from '@/services/api';
import { Card, Button, Input, Modal, Spinner, Badge, EmptyState } from '@/components/ui';
import type { Portofel } from '@/types';

export const PortofeleSettings: React.FC = () => {
  const queryClient = useQueryClient();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<Portofel | null>(null);
  const [formData, setFormData] = useState({ nume: '', descriere: '', ordine: 0 });

  // Fetch all portofele (including inactive)
  const { data: portofele = [], isLoading } = useQuery({
    queryKey: ['portofele', 'all'],
    queryFn: async () => {
      // Get all portofele including inactive
      const response = await api.getPortofele();
      return response;
    },
  });

  // Create mutation
  const createMutation = useMutation({
    mutationFn: (data: Partial<Portofel>) => api.createPortofel(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['portofele'] });
      toast.success('Portofel creat cu succes');
      closeModal();
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.detail || 'Eroare la creare');
    },
  });

  // Update mutation
  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<Portofel> }) =>
      api.updatePortofel(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['portofele'] });
      toast.success('Portofel actualizat');
      closeModal();
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.detail || 'Eroare la actualizare');
    },
  });

  const openModal = (item?: Portofel) => {
    if (item) {
      setEditingItem(item);
      setFormData({ 
        nume: item.nume, 
        descriere: item.descriere || '', 
        ordine: item.ordine 
      });
    } else {
      setEditingItem(null);
      setFormData({ 
        nume: '', 
        descriere: '', 
        ordine: portofele.length + 1 
      });
    }
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setEditingItem(null);
    setFormData({ nume: '', descriere: '', ordine: 0 });
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

  const toggleActive = (item: Portofel) => {
    updateMutation.mutate({ 
      id: item.id, 
      data: { activ: !item.activ } 
    });
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
            Portofele
          </h1>
          <p className="text-sm text-stone-500 mt-1">
            Gestionează portofelele pentru urmărirea numerarului
          </p>
        </div>
        <Button onClick={() => openModal()} icon={<Plus className="w-4 h-4" />}>
          Adaugă portofel
        </Button>
      </div>

      {/* Info card */}
      <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4 mb-6">
        <p className="text-sm text-blue-800 dark:text-blue-300">
          <strong>Portofele standard:</strong> Zi (numerar zilnic), Dimineata, Soferi, Apl (aplicații delivery), 
          Seara, Banca (cont bancar), Prot (protocol).
        </p>
      </div>

      {/* Lista portofele */}
      {portofele.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Wallet className="w-12 h-12" />}
            title="Nu există portofele"
            description="Adaugă primul portofel pentru a începe"
            action={
              <Button onClick={() => openModal()} icon={<Plus className="w-4 h-4" />}>
                Adaugă portofel
              </Button>
            }
          />
        </Card>
      ) : (
        <Card padding="none">
          <div className="divide-y divide-stone-100 dark:divide-stone-800">
            {portofele
              .sort((a, b) => a.ordine - b.ordine)
              .map((item) => (
                <div
                  key={item.id}
                  className="flex items-center gap-4 px-4 py-3 hover:bg-stone-50 dark:hover:bg-stone-800/50 transition-colors"
                >
                  <GripVertical className="w-4 h-4 text-stone-300 dark:text-stone-600 cursor-grab" />
                  
                  <div className="w-10 h-10 rounded-lg bg-stone-100 dark:bg-stone-800 flex items-center justify-center">
                    <Wallet className="w-5 h-5 text-stone-500" />
                  </div>
                  
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-stone-900 dark:text-stone-100">
                        {item.nume}
                      </span>
                      {!item.activ && (
                        <Badge variant="gray">Inactiv</Badge>
                      )}
                    </div>
                    {item.descriere && (
                      <p className="text-sm text-stone-500 truncate">
                        {item.descriere}
                      </p>
                    )}
                  </div>

                  <div className="text-sm text-stone-400">
                    #{item.ordine}
                  </div>

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
                      {item.activ ? (
                        <X className="w-4 h-4" />
                      ) : (
                        <Check className="w-4 h-4" />
                      )}
                    </Button>
                  </div>
                </div>
              ))}
          </div>
        </Card>
      )}

      {/* Modal adăugare/editare */}
      <Modal
        open={isModalOpen}
        onClose={closeModal}
        title={editingItem ? 'Editează portofel' : 'Adaugă portofel nou'}
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <Input
            label="Nume portofel"
            value={formData.nume}
            onChange={(e) => setFormData({ ...formData, nume: e.target.value })}
            placeholder="ex: Zi, Banca, Soferi..."
            required
            autoFocus
          />
          
          <Input
            label="Descriere (opțional)"
            value={formData.descriere}
            onChange={(e) => setFormData({ ...formData, descriere: e.target.value })}
            placeholder="Descriere scurtă"
          />
          
          <Input
            label="Ordine afișare"
            type="number"
            min={1}
            value={formData.ordine}
            onChange={(e) => setFormData({ ...formData, ordine: parseInt(e.target.value) || 1 })}
          />

          <div className="flex gap-3 pt-4">
            <Button 
              type="button" 
              variant="secondary" 
              onClick={closeModal}
              className="flex-1"
            >
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
