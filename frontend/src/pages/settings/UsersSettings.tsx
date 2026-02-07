import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Edit2, Check, X, Users, Shield, User as UserIcon, Key } from 'lucide-react';
import { toast } from 'react-hot-toast';

import api from '@/services/api';
import { Card, Button, Input, Modal, Spinner, Badge, EmptyState } from '@/components/ui';
import type { User } from '@/types';

const ROLE_OPTIONS = [
  { value: 'operator', label: 'Operator', description: 'Poate adăuga cheltuieli' },
  { value: 'sef', label: 'Șef', description: 'Poate verifica și vedea rapoarte' },
  { value: 'admin', label: 'Administrator', description: 'Acces complet la setări' },
];

const ROLE_COLORS: Record<string, 'gray' | 'blue' | 'red'> = {
  operator: 'gray',
  sef: 'blue',
  admin: 'red',
};

export const UsersSettings: React.FC = () => {
  const queryClient = useQueryClient();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<User | null>(null);
  const [formData, setFormData] = useState({
    username: '',
    nume_complet: '',
    cod_acces: '',
    rol: 'operator' as 'operator' | 'sef' | 'admin',
  });

  // Fetch users
  const { data: users = [], isLoading } = useQuery({
    queryKey: ['users'],
    queryFn: () => api.getUsers(),
  });

  // Create mutation
  const createMutation = useMutation({
    mutationFn: (data: Partial<User> & { cod_acces: string }) => api.createUser(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      toast.success('Utilizator creat cu succes');
      closeModal();
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.detail || 'Eroare la creare');
    },
  });

  // Update mutation
  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<User> }) =>
      api.updateUser(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      toast.success('Utilizator actualizat');
      closeModal();
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.detail || 'Eroare la actualizare');
    },
  });

  const openModal = (item?: User) => {
    if (item) {
      setEditingItem(item);
      setFormData({
        username: item.username,
        nume_complet: item.nume_complet,
        cod_acces: '', // Don't show existing code
        rol: item.rol,
      });
    } else {
      setEditingItem(null);
      setFormData({
        username: '',
        nume_complet: '',
        cod_acces: '',
        rol: 'operator',
      });
    }
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setEditingItem(null);
    setFormData({
      username: '',
      nume_complet: '',
      cod_acces: '',
      rol: 'operator',
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.username.trim() || !formData.nume_complet.trim()) {
      toast.error('Completează toate câmpurile obligatorii');
      return;
    }

    if (!editingItem && !formData.cod_acces.trim()) {
      toast.error('Codul de acces este obligatoriu pentru utilizatori noi');
      return;
    }

    if (editingItem) {
      const updateData: Partial<User> & { cod_acces?: string } = {
        username: formData.username,
        nume_complet: formData.nume_complet,
        rol: formData.rol,
      };
      // Only include cod_acces if provided (to change password)
      if (formData.cod_acces.trim()) {
        (updateData as any).cod_acces = formData.cod_acces;
      }
      updateMutation.mutate({ id: editingItem.id, data: updateData });
    } else {
      createMutation.mutate(formData);
    }
  };

  const toggleActive = (item: User) => {
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
            Utilizatori
          </h1>
          <p className="text-sm text-stone-500 mt-1">
            Gestionează conturile și permisiunile utilizatorilor
          </p>
        </div>
        <Button onClick={() => openModal()} icon={<Plus className="w-4 h-4" />}>
          Adaugă utilizator
        </Button>
      </div>

      {/* Roles info */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        {ROLE_OPTIONS.map((role) => (
          <div
            key={role.value}
            className="p-4 bg-stone-50 dark:bg-stone-800/50 rounded-lg border border-stone-200 dark:border-stone-700"
          >
            <div className="flex items-center gap-2 mb-1">
              <Shield className="w-4 h-4 text-stone-500" />
              <span className="font-medium text-stone-900 dark:text-stone-100">
                {role.label}
              </span>
            </div>
            <p className="text-sm text-stone-500">{role.description}</p>
          </div>
        ))}
      </div>

      {/* Users list */}
      {users.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Users className="w-12 h-12" />}
            title="Nu există utilizatori"
            description="Adaugă primul utilizator"
            action={
              <Button onClick={() => openModal()} icon={<Plus className="w-4 h-4" />}>
                Adaugă utilizator
              </Button>
            }
          />
        </Card>
      ) : (
        <Card padding="none">
          <div className="divide-y divide-stone-100 dark:divide-stone-800">
            {users.map((item) => (
              <div
                key={item.id}
                className="flex items-center gap-4 px-4 py-3 hover:bg-stone-50 dark:hover:bg-stone-800/50 transition-colors"
              >
                <div className="w-10 h-10 rounded-full bg-stone-200 dark:bg-stone-700 flex items-center justify-center">
                  <UserIcon className="w-5 h-5 text-stone-500" />
                </div>
                
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-stone-900 dark:text-stone-100">
                      {item.nume_complet}
                    </span>
                    <Badge variant={ROLE_COLORS[item.rol]}>
                      {item.rol}
                    </Badge>
                    {!item.activ && <Badge variant="gray">Inactiv</Badge>}
                  </div>
                  <p className="text-sm text-stone-500">
                    @{item.username}
                    {item.ultima_autentificare && (
                      <span className="ml-2">
                        • Ultima autentificare: {new Date(item.ultima_autentificare).toLocaleDateString('ro-RO')}
                      </span>
                    )}
                  </p>
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
                  
                  {item.username !== 'admin' && (
                    <Button
                      variant={item.activ ? 'danger' : 'secondary'}
                      size="sm"
                      onClick={() => toggleActive(item)}
                      title={item.activ ? 'Dezactivează' : 'Activează'}
                    >
                      {item.activ ? <X className="w-4 h-4" /> : <Check className="w-4 h-4" />}
                    </Button>
                  )}
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
        title={editingItem ? 'Editează utilizator' : 'Adaugă utilizator nou'}
        closeOnBackdropClick={false}
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <Input
            label="Username"
            value={formData.username}
            onChange={(e) => setFormData({ ...formData, username: e.target.value })}
            placeholder="ex: ion.popescu"
            required
            autoFocus
          />

          <Input
            label="Nume complet"
            value={formData.nume_complet}
            onChange={(e) => setFormData({ ...formData, nume_complet: e.target.value })}
            placeholder="ex: Ion Popescu"
            required
          />

          <div className="relative">
            <Input
              label={editingItem ? 'Cod acces nou (lasă gol pentru a păstra)' : 'Cod acces'}
              type="password"
              value={formData.cod_acces}
              onChange={(e) => setFormData({ ...formData, cod_acces: e.target.value })}
              placeholder={editingItem ? '••••••' : 'Cod numeric sau alfanumeric'}
              required={!editingItem}
              icon={<Key className="w-4 h-4" />}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-stone-700 dark:text-stone-300 mb-1">
              Rol
            </label>
            <select
              value={formData.rol}
              onChange={(e) => setFormData({ ...formData, rol: e.target.value as any })}
              className="w-full px-4 py-2 rounded-lg border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-900"
              disabled={editingItem?.username === 'admin'}
            >
              {ROLE_OPTIONS.map((role) => (
                <option key={role.value} value={role.value}>
                  {role.label} - {role.description}
                </option>
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
