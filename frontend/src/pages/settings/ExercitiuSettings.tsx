import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Calendar, Lock, Unlock, Plus, Clock, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { format } from 'date-fns';
import { ro } from 'date-fns/locale';
import { toast } from 'react-hot-toast';

import api from '@/services/api';
import { useAppStore, useIsSef } from '@/hooks/useAppStore';
import { Card, Button, Spinner, Badge, Input, Modal } from '@/components/ui';

export const ExercitiuSettings: React.FC = () => {
  const queryClient = useQueryClient();
  const { exercitiu, setExercitiu, loadExercitiu } = useAppStore();
  const isSef = useIsSef();

  const [showCloseModal, setShowCloseModal] = useState(false);
  const [closeObservatii, setCloseObservatii] = useState('');
  const [showOpenModal, setShowOpenModal] = useState(false);
  const [openDate, setOpenDate] = useState(() => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    return tomorrow.toISOString().split('T')[0];
  });
  const [openObservatii, setOpenObservatii] = useState('');

  // Fetch exercitii list
  const { data: exercitii = [], isLoading } = useQuery({
    queryKey: ['exercitii'],
    queryFn: () => api.getExercitii(30),
  });

  // Close day mutation
  const closeMutation = useMutation({
    mutationFn: (observatii?: string) => api.inchideExercitiu(observatii),
    onSuccess: async () => {
      toast.success('Ziua a fost închisă');
      setShowCloseModal(false);
      setCloseObservatii('');
      queryClient.invalidateQueries({ queryKey: ['exercitii'] });
      queryClient.invalidateQueries({ queryKey: ['raport'] });
      await loadExercitiu();
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.detail || 'Eroare la închiderea zilei');
    },
  });

  // Open next day mutation
  const openMutation = useMutation({
    mutationFn: (data: { data?: string; observatii?: string }) =>
      api.createExercitiu(data),
    onSuccess: async (newEx) => {
      toast.success('Ziua nouă a fost deschisă');
      setShowOpenModal(false);
      setOpenObservatii('');
      queryClient.invalidateQueries({ queryKey: ['exercitii'] });
      queryClient.invalidateQueries({ queryKey: ['raport'] });
      queryClient.invalidateQueries({ queryKey: ['cheltuieli'] });
      setExercitiu(newEx);
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.detail || 'Eroare la deschiderea zilei');
    },
  });

  const handleClose = (e: React.FormEvent) => {
    e.preventDefault();
    closeMutation.mutate(closeObservatii || undefined);
  };

  const handleOpen = (e: React.FormEvent) => {
    e.preventDefault();
    openMutation.mutate({
      data: openDate || undefined,
      observatii: openObservatii || undefined,
    });
  };

  if (!isSef) {
    return (
      <div className="max-w-4xl mx-auto">
        <h1 className="text-2xl font-bold text-stone-900 dark:text-stone-100 mb-6">
          Gestiune Exerciții
        </h1>
        <Card className="p-6">
          <div className="flex items-center gap-3 text-amber-600 dark:text-amber-400">
            <AlertTriangle className="w-5 h-5" />
            <span>Doar utilizatorii cu rol de Șef sau Admin pot gestiona exercițiile.</span>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold text-stone-900 dark:text-stone-100 mb-6">
        Gestiune Exerciții (Închidere / Deschidere zi)
      </h1>

      {/* Current exercitiu status */}
      <Card className="mb-6 p-6">
        <h2 className="font-semibold text-stone-900 dark:text-stone-100 mb-4 flex items-center gap-2">
          <Calendar className="w-5 h-5 text-red-500" />
          Exercițiul curent
        </h2>

        {exercitiu ? (
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-stone-50 dark:bg-stone-800/50 rounded-lg p-4">
                <div className="text-xs text-stone-500 uppercase tracking-wider mb-1">Data</div>
                <div className="text-lg font-semibold text-stone-900 dark:text-stone-100">
                  {format(new Date(exercitiu.data), 'EEEE, dd MMMM yyyy', { locale: ro })}
                </div>
              </div>
              <div className="bg-stone-50 dark:bg-stone-800/50 rounded-lg p-4">
                <div className="text-xs text-stone-500 uppercase tracking-wider mb-1">Status</div>
                <div className="flex items-center gap-2">
                  {exercitiu.activ ? (
                    <>
                      <Unlock className="w-5 h-5 text-emerald-500" />
                      <Badge variant="green">Deschis</Badge>
                    </>
                  ) : (
                    <>
                      <Lock className="w-5 h-5 text-red-500" />
                      <Badge variant="red">Închis</Badge>
                    </>
                  )}
                </div>
              </div>
              <div className="bg-stone-50 dark:bg-stone-800/50 rounded-lg p-4">
                <div className="text-xs text-stone-500 uppercase tracking-wider mb-1">Deschis la</div>
                <div className="text-stone-900 dark:text-stone-100">
                  {format(new Date(exercitiu.ora_deschidere), 'HH:mm, dd MMM', { locale: ro })}
                </div>
                {exercitiu.ora_inchidere && (
                  <div className="text-xs text-stone-500 mt-1">
                    Închis la: {format(new Date(exercitiu.ora_inchidere), 'HH:mm, dd MMM', { locale: ro })}
                  </div>
                )}
              </div>
            </div>

            {/* Action buttons */}
            <div className="flex gap-3 pt-2">
              {exercitiu.activ && (
                <Button
                  variant="danger"
                  onClick={() => setShowCloseModal(true)}
                  icon={<Lock className="w-4 h-4" />}
                >
                  Închide ziua curentă
                </Button>
              )}
              <Button
                variant="primary"
                onClick={() => {
                  const tomorrow = new Date();
                  tomorrow.setDate(tomorrow.getDate() + 1);
                  setOpenDate(tomorrow.toISOString().split('T')[0]);
                  setOpenObservatii('');
                  setShowOpenModal(true);
                }}
                icon={<Plus className="w-4 h-4" />}
              >
                Deschide zi nouă
              </Button>
            </div>
          </div>
        ) : (
          <div className="text-center py-6">
            <div className="text-stone-500 mb-4">Nu există exercițiu activ</div>
            <Button
              variant="primary"
              onClick={() => {
                setOpenDate(new Date().toISOString().split('T')[0]);
                setOpenObservatii('');
                setShowOpenModal(true);
              }}
              icon={<Plus className="w-4 h-4" />}
            >
              Deschide zi nouă
            </Button>
          </div>
        )}
      </Card>

      {/* History */}
      <Card padding="none">
        <div className="px-6 py-4 border-b border-stone-200 dark:border-stone-700">
          <h2 className="font-semibold text-stone-900 dark:text-stone-100 flex items-center gap-2">
            <Clock className="w-5 h-5 text-stone-500" />
            Istoric exerciții
          </h2>
        </div>

        {isLoading ? (
          <div className="p-8 flex justify-center">
            <Spinner />
          </div>
        ) : exercitii.length === 0 ? (
          <div className="p-8 text-center text-stone-500">
            Nu există exerciții
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-stone-50 dark:bg-stone-800/50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-stone-500 uppercase tracking-wider">Data</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-stone-500 uppercase tracking-wider">Deschis</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-stone-500 uppercase tracking-wider">Închis</th>
                  <th className="px-4 py-3 text-center text-xs font-semibold text-stone-500 uppercase tracking-wider">Status</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-stone-500 uppercase tracking-wider">Observații</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100 dark:divide-stone-800">
                {exercitii.map((ex) => (
                  <tr
                    key={ex.id}
                    className={`hover:bg-stone-50 dark:hover:bg-stone-800/50 transition-colors ${
                      ex.id === exercitiu?.id ? 'bg-red-50/50 dark:bg-red-900/10' : ''
                    }`}
                  >
                    <td className="px-4 py-3">
                      <div className="font-medium text-stone-900 dark:text-stone-100">
                        {format(new Date(ex.data), 'EEEE, dd MMM yyyy', { locale: ro })}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm text-stone-600 dark:text-stone-400">
                      {format(new Date(ex.ora_deschidere), 'HH:mm')}
                    </td>
                    <td className="px-4 py-3 text-sm text-stone-600 dark:text-stone-400">
                      {ex.ora_inchidere
                        ? format(new Date(ex.ora_inchidere), 'HH:mm')
                        : '-'
                      }
                    </td>
                    <td className="px-4 py-3 text-center">
                      {ex.activ ? (
                        <Badge variant="green">Deschis</Badge>
                      ) : (
                        <Badge variant="gray">Închis</Badge>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm text-stone-500 max-w-[200px] truncate">
                      {ex.observatii || '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Close day modal */}
      <Modal
        open={showCloseModal}
        onClose={() => setShowCloseModal(false)}
        title="Închide ziua curentă"
        size="md"
        closeOnBackdropClick={false}
      >
        <form onSubmit={handleClose} className="space-y-4">
          <div className="p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg">
            <div className="flex items-center gap-2 text-amber-700 dark:text-amber-400 text-sm">
              <AlertTriangle className="w-4 h-4" />
              <span>După închidere, nu se mai pot adăuga cheltuieli pe ziua curentă.</span>
            </div>
          </div>

          <Input
            label="Observații (opțional)"
            value={closeObservatii}
            onChange={(e) => setCloseObservatii(e.target.value)}
            placeholder="Ex: Totul în regulă, verificat..."
          />

          <div className="flex gap-3 pt-4">
            <Button type="button" variant="secondary" onClick={() => setShowCloseModal(false)} className="flex-1">
              Anulează
            </Button>
            <Button type="submit" variant="danger" className="flex-1" loading={closeMutation.isPending}>
              Închide ziua
            </Button>
          </div>
        </form>
      </Modal>

      {/* Open new day modal */}
      <Modal
        open={showOpenModal}
        onClose={() => setShowOpenModal(false)}
        title="Deschide zi nouă"
        size="md"
        closeOnBackdropClick={false}
      >
        <form onSubmit={handleOpen} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-stone-700 dark:text-stone-300 mb-1">
              Data exercițiului
            </label>
            <input
              type="date"
              value={openDate}
              onChange={(e) => setOpenDate(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-900"
              required
            />
          </div>

          <Input
            label="Observații (opțional)"
            value={openObservatii}
            onChange={(e) => setOpenObservatii(e.target.value)}
            placeholder="Ex: Deschidere manuală..."
          />

          {exercitiu?.activ && (
            <div className="p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
              <div className="flex items-center gap-2 text-blue-700 dark:text-blue-400 text-sm">
                <CheckCircle2 className="w-4 h-4" />
                <span>Ziua curentă va fi închisă automat.</span>
              </div>
            </div>
          )}

          <div className="flex gap-3 pt-4">
            <Button type="button" variant="secondary" onClick={() => setShowOpenModal(false)} className="flex-1">
              Anulează
            </Button>
            <Button type="submit" variant="primary" className="flex-1" loading={openMutation.isPending}>
              Deschide
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
