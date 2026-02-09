import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2, DollarSign } from 'lucide-react';
import { toast } from 'react-hot-toast';

import api from '@/services/api';
import { Card, Button, Input, Spinner, EmptyState } from '@/components/ui';

interface MonedaItem {
  code: string;
  label: string;
}

export const MonedaSettings: React.FC = () => {
  const queryClient = useQueryClient();
  const [newCode, setNewCode] = useState('');
  const [newLabel, setNewLabel] = useState('');

  const { data: monede = [], isLoading } = useQuery<MonedaItem[]>({
    queryKey: ['monede'],
    queryFn: () => api.getMonede(),
  });

  const updateMutation = useMutation({
    mutationFn: (newMonede: MonedaItem[]) => {
      const valoare = newMonede.map(m => `${m.code}:${m.label}`).join(',');
      return api.updateSetting('monede', valoare);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['monede'] });
      toast.success('Monede actualizate');
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.detail || 'Eroare la actualizare');
    },
  });

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    const code = newCode.trim().toUpperCase();
    const label = newLabel.trim();

    if (!code || !label) {
      toast.error('Codul și eticheta sunt obligatorii');
      return;
    }
    if (code.length < 2 || code.length > 5) {
      toast.error('Codul trebuie să aibă 2-5 caractere');
      return;
    }
    if (monede.some(m => m.code === code)) {
      toast.error(`Moneda ${code} există deja`);
      return;
    }

    updateMutation.mutate([...monede, { code, label }]);
    setNewCode('');
    setNewLabel('');
  };

  const handleDelete = (code: string) => {
    if (monede.length <= 1) {
      toast.error('Trebuie să existe cel puțin o monedă');
      return;
    }
    updateMutation.mutate(monede.filter(m => m.code !== code));
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
            Monede
          </h1>
          <p className="text-sm text-stone-500 mt-1">
            Gestionează monedele disponibile în aplicație
          </p>
        </div>
      </div>

      {/* Info card */}
      <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4 mb-6">
        <p className="text-sm text-blue-800 dark:text-blue-300">
          <strong>Format:</strong> Cod (ex: RON, EUR, USD) și etichetă afișată (ex: lei, &euro;, $).
          Monedele definite aici apar în selectoarele de monedă din cheltuieli, alimentări și transferuri.
        </p>
      </div>

      {/* Lista monede */}
      {monede.length === 0 ? (
        <Card>
          <EmptyState
            icon={<DollarSign className="w-12 h-12" />}
            title="Nu există monede"
            description="Adaugă prima monedă pentru a începe"
          />
        </Card>
      ) : (
        <Card padding="none">
          <div className="divide-y divide-stone-100 dark:divide-stone-800">
            {monede.map((item) => (
              <div
                key={item.code}
                className="flex items-center gap-4 px-4 py-3 hover:bg-stone-50 dark:hover:bg-stone-800/50 transition-colors"
              >
                <div className="w-10 h-10 rounded-lg bg-stone-100 dark:bg-stone-800 flex items-center justify-center">
                  <span className="text-lg font-semibold text-stone-600 dark:text-stone-400">
                    {item.label}
                  </span>
                </div>

                <div className="flex-1 min-w-0">
                  <span className="font-medium text-stone-900 dark:text-stone-100">
                    {item.code}
                  </span>
                  <span className="text-stone-400 mx-2">&mdash;</span>
                  <span className="text-stone-500">{item.label}</span>
                </div>

                <Button
                  variant="danger"
                  size="sm"
                  onClick={() => handleDelete(item.code)}
                  title="Șterge"
                  disabled={updateMutation.isPending}
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Add form */}
      <Card className="mt-6">
        <h3 className="font-semibold text-stone-900 dark:text-stone-100 mb-4">
          Adaugă monedă
        </h3>
        <form onSubmit={handleAdd} className="flex items-end gap-3">
          <div className="w-32">
            <Input
              label="Cod"
              value={newCode}
              onChange={(e) => setNewCode(e.target.value)}
              placeholder="EUR"
              maxLength={5}
            />
          </div>
          <div className="flex-1">
            <Input
              label="Etichetă"
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
              placeholder="€"
            />
          </div>
          <Button
            type="submit"
            variant="primary"
            icon={<Plus className="w-4 h-4" />}
            loading={updateMutation.isPending}
          >
            Adaugă
          </Button>
        </form>
      </Card>
    </div>
  );
};
