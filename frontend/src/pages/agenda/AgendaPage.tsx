import React, { useState, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import {
  Search, Plus, LayoutGrid, List, Building2, Star, Phone, Mail,
  Clock, CheckSquare, X, ChevronRight, Users, Globe, MessageSquare,
  AlertTriangle, Settings2,
} from 'lucide-react';
import { clsx } from 'clsx';
import toast from 'react-hot-toast';
import { formatDistanceToNow } from 'date-fns';
import { ro } from 'date-fns/locale';

import api from '@/services/api';
import type { AgendaFurnizor, AgendaContact } from '@/types';
import { AGENDA_CATEGORII, AGENDA_CAMP_TIPURI, AGENDA_ROLURI } from '@/types';
import { Spinner } from '@/components/ui';
import { useAppStore } from '@/hooks/useAppStore';

// ============================================
// Shared helpers
// ============================================

const StarRating: React.FC<{ rating?: number }> = ({ rating }) => {
  if (!rating) return null;
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map(s => (
        <Star key={s} className={clsx('w-3 h-3', s <= rating ? 'text-amber-400 fill-amber-400' : 'text-stone-300 dark:text-stone-600')} />
      ))}
    </div>
  );
};

const CategorieBadge: React.FC<{ categorie?: string }> = ({ categorie }) => {
  if (!categorie) return null;
  const colors: Record<string, string> = {
    'Alimente & Ingrediente': 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
    'Băuturi': 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
    'Produse curățenie': 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-400',
    'Ambalaje & Consumabile': 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
    'Servicii': 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
    'Echipamente & Dotări': 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400',
    'Altele': 'bg-stone-100 text-stone-600 dark:bg-stone-800 dark:text-stone-400',
  };
  return (
    <span className={clsx('text-xs px-2 py-0.5 rounded-full font-medium whitespace-nowrap', colors[categorie] || colors['Altele'])}>
      {categorie}
    </span>
  );
};

const CampIcon: React.FC<{ tip: string; className?: string }> = ({ tip, className = 'w-3.5 h-3.5' }) => {
  if (tip === 'Email') return <Mail className={clsx(className, 'text-blue-500')} />;
  if (tip === 'WhatsApp') return <MessageSquare className={clsx(className, 'text-green-500')} />;
  if (tip === 'Website') return <Globe className={clsx(className, 'text-purple-500')} />;
  return <Phone className={clsx(className, 'text-stone-400')} />;
};

// ============================================
// Add Furnizor Modal
// ============================================
const AddFurnizorModal: React.FC<{
  onClose: () => void;
  onCreated: (id: number) => void;
  categorii: string[];
}> = ({ onClose, onCreated, categorii }) => {
  const queryClient = useQueryClient();
  const [form, setForm] = useState({ nume: '', categorie: '' });

  const createMutation = useMutation({
    mutationFn: () => api.createAgendaFurnizor({ nume: form.nume, categorie: form.categorie || undefined }),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['agenda-furnizori'] });
      toast.success('Furnizor adăugat');
      onCreated(data.id);
    },
    onError: () => toast.error('Eroare la adăugare'),
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white dark:bg-stone-900 rounded-xl shadow-xl w-full max-w-md mx-4">
        <div className="flex items-center justify-between p-5 border-b border-stone-200 dark:border-stone-800">
          <h2 className="font-semibold text-stone-900 dark:text-stone-100">Furnizor nou</h2>
          <button onClick={onClose} className="text-stone-400 hover:text-stone-600"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-5 space-y-4">
          <div>
            <label className="block text-sm font-medium text-stone-700 dark:text-stone-300 mb-1">Nume *</label>
            <input
              autoFocus
              value={form.nume}
              onChange={e => setForm(f => ({ ...f, nume: e.target.value }))}
              onKeyDown={e => e.key === 'Enter' && form.nume.trim() && createMutation.mutate()}
              className="w-full px-3 py-2 rounded-lg border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-800 text-stone-900 dark:text-stone-100 focus:outline-none focus:ring-2 focus:ring-red-500 text-sm"
              placeholder="ex: Metro Cash & Carry"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-stone-700 dark:text-stone-300 mb-1">Categorie</label>
            <select
              value={form.categorie}
              onChange={e => setForm(f => ({ ...f, categorie: e.target.value }))}
              className="w-full px-3 py-2 rounded-lg border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-800 text-stone-900 dark:text-stone-100 focus:outline-none focus:ring-2 focus:ring-red-500 text-sm"
            >
              <option value="">— Selectează —</option>
              {categorii.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
        </div>
        <div className="flex justify-end gap-3 p-5 border-t border-stone-200 dark:border-stone-800">
          <button onClick={onClose} className="px-4 py-2 text-sm rounded-lg text-stone-600 hover:bg-stone-100 dark:text-stone-400 dark:hover:bg-stone-800">Anulează</button>
          <button
            onClick={() => createMutation.mutate()}
            disabled={!form.nume.trim() || createMutation.isPending}
            className="px-4 py-2 text-sm rounded-lg bg-red-600 text-white hover:bg-red-700 disabled:opacity-50"
          >
            {createMutation.isPending ? 'Se salvează...' : 'Adaugă'}
          </button>
        </div>
      </div>
    </div>
  );
};

// ============================================
// Add Contact Modal (standalone)
// ============================================
const AddContactModal: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const queryClient = useQueryClient();
  const [form, setForm] = useState({
    nume: '',
    rol: '',
    camp_tip: 'Mobil',
    camp_valoare: '',
    furnizor_search: '',
    furnizor_id: undefined as number | undefined,
    furnizor_nou: '',
    mode: 'none' as 'none' | 'existing' | 'new',
  });
  const [showDropdown, setShowDropdown] = useState(false);

  const { data: furnizori = [] } = useQuery({
    queryKey: ['agenda-furnizori'],
    queryFn: () => api.getAgendaFurnizori(),
    staleTime: 60000,
  });

  const filtered = form.furnizor_search
    ? furnizori.filter(f => f.nume.toLowerCase().includes(form.furnizor_search.toLowerCase())).slice(0, 8)
    : furnizori.slice(0, 8);

  const createMutation = useMutation({
    mutationFn: () => api.createAgendaContactStandalone({
      nume: form.nume,
      rol: form.rol || undefined,
      campuri: form.camp_valoare.trim()
        ? [{ tip: form.camp_tip, valoare: form.camp_valoare.trim(), ordine: 0 }]
        : [],
      furnizor_id: form.mode === 'existing' ? form.furnizor_id : undefined,
      furnizor_nou: form.mode === 'new' && form.furnizor_nou.trim() ? form.furnizor_nou.trim() : undefined,
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agenda-contacte-global'] });
      queryClient.invalidateQueries({ queryKey: ['agenda-furnizori'] });
      toast.success('Contact adăugat');
      onClose();
    },
    onError: () => toast.error('Eroare la adăugare'),
  });

  const inputCls = "w-full px-3 py-2 rounded-lg border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-800 text-stone-900 dark:text-stone-100 focus:outline-none focus:ring-2 focus:ring-red-500 text-sm";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white dark:bg-stone-900 rounded-xl shadow-xl w-full max-w-md mx-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-5 border-b border-stone-200 dark:border-stone-800">
          <h2 className="font-semibold text-stone-900 dark:text-stone-100">Contact nou</h2>
          <button onClick={onClose} className="text-stone-400 hover:text-stone-600"><X className="w-5 h-5" /></button>
        </div>

        <div className="p-5 space-y-4">
          {/* Name */}
          <div>
            <label className="block text-sm font-medium text-stone-700 dark:text-stone-300 mb-1">Nume *</label>
            <input
              autoFocus
              value={form.nume}
              onChange={e => setForm(f => ({ ...f, nume: e.target.value }))}
              className={inputCls}
              placeholder="ex: Ion Popescu"
            />
          </div>

          {/* Rol */}
          <div>
            <label className="block text-sm font-medium text-stone-700 dark:text-stone-300 mb-1">Rol</label>
            <select
              value={form.rol}
              onChange={e => setForm(f => ({ ...f, rol: e.target.value }))}
              className={inputCls}
            >
              <option value="">— Selectează —</option>
              {AGENDA_ROLURI.map(r => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>

          {/* Contact field */}
          <div>
            <label className="block text-sm font-medium text-stone-700 dark:text-stone-300 mb-1">Telefon / Email</label>
            <div className="flex gap-2">
              <select
                value={form.camp_tip}
                onChange={e => setForm(f => ({ ...f, camp_tip: e.target.value }))}
                className="px-2 py-2 rounded-lg border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-800 text-stone-900 dark:text-stone-100 text-sm focus:outline-none focus:ring-2 focus:ring-red-500"
              >
                {AGENDA_CAMP_TIPURI.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
              <input
                value={form.camp_valoare}
                onChange={e => setForm(f => ({ ...f, camp_valoare: e.target.value }))}
                className={clsx(inputCls, 'flex-1')}
                placeholder="07XX XXX XXX"
              />
            </div>
          </div>

          {/* Furnizor linkage */}
          <div>
            <label className="block text-sm font-medium text-stone-700 dark:text-stone-300 mb-2">Legat de furnizor</label>
            <div className="flex gap-3 mb-3">
              <button
                type="button"
                onClick={() => setForm(f => ({ ...f, mode: 'none', furnizor_id: undefined, furnizor_nou: '', furnizor_search: '' }))}
                className={clsx('flex-1 py-2 text-xs rounded-lg border transition-colors', form.mode === 'none' ? 'border-red-500 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300' : 'border-stone-300 dark:border-stone-700 text-stone-500 hover:bg-stone-50 dark:hover:bg-stone-800')}
              >
                Fără furnizor
              </button>
              <button
                type="button"
                onClick={() => setForm(f => ({ ...f, mode: 'existing', furnizor_nou: '' }))}
                className={clsx('flex-1 py-2 text-xs rounded-lg border transition-colors', form.mode === 'existing' ? 'border-red-500 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300' : 'border-stone-300 dark:border-stone-700 text-stone-500 hover:bg-stone-50 dark:hover:bg-stone-800')}
              >
                Existent
              </button>
              <button
                type="button"
                onClick={() => setForm(f => ({ ...f, mode: 'new', furnizor_id: undefined, furnizor_search: '' }))}
                className={clsx('flex-1 py-2 text-xs rounded-lg border transition-colors', form.mode === 'new' ? 'border-red-500 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300' : 'border-stone-300 dark:border-stone-700 text-stone-500 hover:bg-stone-50 dark:hover:bg-stone-800')}
              >
                Furnizor nou
              </button>
            </div>

            {form.mode === 'existing' && (
              <div className="relative">
                <input
                  value={form.furnizor_id
                    ? (furnizori.find(f => f.id === form.furnizor_id)?.nume ?? form.furnizor_search)
                    : form.furnizor_search}
                  onChange={e => {
                    setForm(f => ({ ...f, furnizor_search: e.target.value, furnizor_id: undefined }));
                    setShowDropdown(true);
                  }}
                  onFocus={() => setShowDropdown(true)}
                  onBlur={() => setTimeout(() => setShowDropdown(false), 150)}
                  className={inputCls}
                  placeholder="Caută furnizor..."
                />
                {showDropdown && filtered.length > 0 && !form.furnizor_id && (
                  <div className="absolute z-10 w-full mt-1 bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-700 rounded-lg shadow-lg overflow-hidden max-h-48 overflow-y-auto">
                    {filtered.map(f => (
                      <button
                        key={f.id}
                        type="button"
                        onMouseDown={() => {
                          setForm(prev => ({ ...prev, furnizor_id: f.id, furnizor_search: f.nume }));
                          setShowDropdown(false);
                        }}
                        className="w-full text-left px-3 py-2 text-sm hover:bg-red-50 dark:hover:bg-red-900/10 text-stone-900 dark:text-stone-100"
                      >
                        {f.nume}
                        {f.categorie && <span className="ml-2 text-xs text-stone-400">{f.categorie}</span>}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {form.mode === 'new' && (
              <input
                value={form.furnizor_nou}
                onChange={e => setForm(f => ({ ...f, furnizor_nou: e.target.value }))}
                className={inputCls}
                placeholder="Nume furnizor nou..."
              />
            )}
          </div>
        </div>

        <div className="flex justify-end gap-3 p-5 border-t border-stone-200 dark:border-stone-800">
          <button onClick={onClose} className="px-4 py-2 text-sm rounded-lg text-stone-600 hover:bg-stone-100 dark:text-stone-400 dark:hover:bg-stone-800">Anulează</button>
          <button
            onClick={() => createMutation.mutate()}
            disabled={!form.nume.trim() || createMutation.isPending ||
              (form.mode === 'existing' && !form.furnizor_id) ||
              (form.mode === 'new' && !form.furnizor_nou.trim())}
            className="px-4 py-2 text-sm rounded-lg bg-red-600 text-white hover:bg-red-700 disabled:opacity-50"
          >
            {createMutation.isPending ? 'Se salvează...' : 'Adaugă'}
          </button>
        </div>
      </div>
    </div>
  );
};

// ============================================
// Categorii editor modal (admin/sef)
// ============================================
const CategoriiModal: React.FC<{ categorii: string[]; onClose: () => void }> = ({ categorii: initial, onClose }) => {
  const queryClient = useQueryClient();
  const [list, setList] = useState<string[]>(initial);
  const [newCat, setNewCat] = useState('');

  const saveMutation = useMutation({
    mutationFn: () => api.updateAgendaCategorii(list),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agenda-categorii'] });
      toast.success('Categorii actualizate');
      onClose();
    },
    onError: () => toast.error('Eroare la salvare'),
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white dark:bg-stone-900 rounded-xl shadow-xl w-full max-w-sm mx-4">
        <div className="flex items-center justify-between p-5 border-b border-stone-200 dark:border-stone-800">
          <h2 className="font-semibold text-stone-900 dark:text-stone-100">Editează categorii</h2>
          <button onClick={onClose} className="text-stone-400 hover:text-stone-600"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-5 space-y-2 max-h-72 overflow-y-auto">
          {list.map((cat, i) => (
            <div key={i} className="flex items-center gap-2">
              <input
                value={cat}
                onChange={e => setList(l => l.map((x, j) => j === i ? e.target.value : x))}
                className="flex-1 px-2 py-1.5 text-sm rounded border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-800 text-stone-900 dark:text-stone-100 focus:outline-none focus:ring-1 focus:ring-red-500"
              />
              <button onClick={() => setList(l => l.filter((_, j) => j !== i))} className="text-stone-400 hover:text-red-500">
                <X className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
        <div className="px-5 pb-3">
          <div className="flex gap-2">
            <input
              value={newCat}
              onChange={e => setNewCat(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' && newCat.trim()) {
                  setList(l => [...l, newCat.trim()]);
                  setNewCat('');
                }
              }}
              placeholder="Categorie nouă..."
              className="flex-1 px-2 py-1.5 text-sm rounded border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-800 text-stone-900 dark:text-stone-100 focus:outline-none focus:ring-1 focus:ring-red-500"
            />
            <button
              onClick={() => { if (newCat.trim()) { setList(l => [...l, newCat.trim()]); setNewCat(''); } }}
              className="px-3 py-1.5 text-sm rounded bg-stone-100 dark:bg-stone-800 text-stone-700 dark:text-stone-300 hover:bg-stone-200 dark:hover:bg-stone-700"
            >
              <Plus className="w-4 h-4" />
            </button>
          </div>
        </div>
        <div className="flex justify-end gap-3 p-5 border-t border-stone-200 dark:border-stone-800">
          <button onClick={onClose} className="px-4 py-2 text-sm text-stone-600 hover:bg-stone-100 dark:text-stone-400 dark:hover:bg-stone-800 rounded-lg">Anulează</button>
          <button
            onClick={() => saveMutation.mutate()}
            disabled={saveMutation.isPending}
            className="px-4 py-2 text-sm rounded-lg bg-red-600 text-white hover:bg-red-700 disabled:opacity-50"
          >
            {saveMutation.isPending ? 'Se salvează...' : 'Salvează'}
          </button>
        </div>
      </div>
    </div>
  );
};

// ============================================
// Furnizori card
// ============================================
const FurnizorCard: React.FC<{ furnizor: AgendaFurnizor; onClick: () => void }> = ({ furnizor, onClick }) => {
  const ultima = furnizor.ultima_interactiune
    ? formatDistanceToNow(new Date(furnizor.ultima_interactiune), { addSuffix: true, locale: ro })
    : null;

  return (
    <div
      onClick={onClick}
      className={clsx(
        'border rounded-xl p-4 cursor-pointer hover:shadow-md transition-all group',
        furnizor.atentie
          ? 'bg-fuchsia-50 dark:bg-fuchsia-950/30 border-fuchsia-400 dark:border-fuchsia-700 hover:border-fuchsia-500'
          : 'bg-white dark:bg-stone-900 border-stone-200 dark:border-stone-800 hover:border-red-300 dark:hover:border-red-800',
      )}
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex items-center gap-2 min-w-0">
          {furnizor.atentie && (
            <AlertTriangle className="w-4 h-4 text-fuchsia-600 dark:text-fuchsia-400 flex-shrink-0" />
          )}
          <h3 className={clsx(
            'font-semibold truncate transition-colors',
            furnizor.atentie
              ? 'text-fuchsia-900 dark:text-fuchsia-100 group-hover:text-fuchsia-700'
              : 'text-stone-900 dark:text-stone-100 group-hover:text-red-600 dark:group-hover:text-red-400',
          )}>
            {furnizor.nume}
          </h3>
        </div>
        <ChevronRight className="w-4 h-4 text-stone-300 flex-shrink-0 mt-0.5 group-hover:text-red-400 transition-colors" />
      </div>

      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <CategorieBadge categorie={furnizor.categorie} />
        <StarRating rating={furnizor.rating_intern} />
      </div>

      {(furnizor.contact_primar_nume || furnizor.contact_primar_valoare) && (
        <div className="flex items-center gap-1.5 mb-2 text-sm text-stone-600 dark:text-stone-400">
          <Phone className="w-3.5 h-3.5 text-stone-400 flex-shrink-0" />
          <span className="font-medium truncate">{furnizor.contact_primar_nume}</span>
          {furnizor.contact_primar_valoare && (
            <span className="text-stone-400 truncate text-xs">{furnizor.contact_primar_valoare}</span>
          )}
        </div>
      )}

      <div className="flex items-center justify-between mt-3 pt-3 border-t border-stone-100 dark:border-stone-800 text-xs text-stone-400">
        <span className="flex items-center gap-1">
          <Clock className="w-3 h-3" />
          {ultima ?? 'Nicio interacțiune'}
        </span>
        {furnizor.todos_deschise > 0 && (
          <span className="flex items-center gap-1 bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 px-2 py-0.5 rounded-full">
            <CheckSquare className="w-3 h-3" /> {furnizor.todos_deschise}
          </span>
        )}
      </div>
    </div>
  );
};

// ============================================
// Furnizori list row
// ============================================
const FurnizorRow: React.FC<{ furnizor: AgendaFurnizor; onClick: () => void }> = ({ furnizor, onClick }) => {
  const ultima = furnizor.ultima_interactiune
    ? formatDistanceToNow(new Date(furnizor.ultima_interactiune), { addSuffix: true, locale: ro })
    : '—';

  return (
    <tr
      onClick={onClick}
      className={clsx(
        'cursor-pointer transition-colors',
        furnizor.atentie
          ? 'bg-fuchsia-50 dark:bg-fuchsia-950/20 hover:bg-fuchsia-100 dark:hover:bg-fuchsia-950/40'
          : 'hover:bg-stone-50 dark:hover:bg-stone-800/50',
      )}
    >
      <td className="px-4 py-3">
        <div className="flex items-center gap-2">
          {furnizor.atentie && <AlertTriangle className="w-3.5 h-3.5 text-fuchsia-600 dark:text-fuchsia-400 flex-shrink-0" />}
          <div>
            <p className={clsx('font-medium', furnizor.atentie ? 'text-fuchsia-900 dark:text-fuchsia-100' : 'text-stone-900 dark:text-stone-100')}>{furnizor.nume}</p>
            {furnizor.erp_name && furnizor.erp_name !== furnizor.nume && (
              <p className="text-xs text-stone-400">{furnizor.erp_name}</p>
            )}
          </div>
        </div>
      </td>
      <td className="px-4 py-3"><CategorieBadge categorie={furnizor.categorie} /></td>
      <td className="px-4 py-3 text-sm text-stone-600 dark:text-stone-400">
        {furnizor.contact_primar_nume ? (
          <div>
            <p className="font-medium">{furnizor.contact_primar_nume}</p>
            {furnizor.contact_primar_valoare && <p className="text-xs text-stone-400">{furnizor.contact_primar_valoare}</p>}
          </div>
        ) : '—'}
      </td>
      <td className="px-4 py-3"><StarRating rating={furnizor.rating_intern} /></td>
      <td className="px-4 py-3 text-sm text-stone-500">{furnizor.zile_livrare || '—'}</td>
      <td className="px-4 py-3 text-center">
        {furnizor.todos_deschise > 0 ? (
          <span className="inline-flex items-center gap-1 bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 text-xs px-2 py-0.5 rounded-full">
            <CheckSquare className="w-3 h-3" /> {furnizor.todos_deschise}
          </span>
        ) : '—'}
      </td>
      <td className="px-4 py-3 text-xs text-stone-400">{ultima}</td>
    </tr>
  );
};

// ============================================
// Contacte global table
// ============================================
const ContacteView: React.FC<{ onNavigate: (furnizorId: number) => void }> = ({ onNavigate }) => {
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [showAddContact, setShowAddContact] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  const { data: contacte = [], isLoading } = useQuery({
    queryKey: ['agenda-contacte-global', debouncedSearch],
    queryFn: () => api.getAgendaContacteGlobal(debouncedSearch || undefined),
    staleTime: 30000,
  });

  const firstCamp = (c: AgendaContact) => c.campuri[0] || null;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Caută după nume, telefon, email..."
            className="w-full pl-9 pr-9 py-2 rounded-lg border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-800 text-stone-900 dark:text-stone-100 text-sm focus:outline-none focus:ring-2 focus:ring-red-500"
          />
          {search && (
            <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-600">
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
        <button
          onClick={() => setShowAddContact(true)}
          className="flex items-center gap-2 px-3 py-2 text-sm rounded-lg bg-red-600 text-white hover:bg-red-700 transition-colors whitespace-nowrap"
        >
          <Plus className="w-4 h-4" />
          <span>Adaugă contact</span>
        </button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12"><Spinner /></div>
      ) : contacte.length === 0 ? (
        <div className="text-center py-12 text-stone-400">
          <Users className="w-10 h-10 mx-auto mb-2 opacity-30" />
          <p>{search ? 'Niciun contact găsit' : 'Niciun contact în agendă'}</p>
        </div>
      ) : (
        <div className="bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-xl overflow-hidden">
          <div className="px-4 py-2 bg-stone-50 dark:bg-stone-800/50 border-b border-stone-200 dark:border-stone-800 text-xs text-stone-500">
            {contacte.length} contacte
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-stone-200 dark:border-stone-800">
                <th className="px-4 py-3 text-left font-semibold text-stone-700 dark:text-stone-300">Firmă</th>
                <th className="px-4 py-3 text-left font-semibold text-stone-700 dark:text-stone-300">Contact</th>
                <th className="px-4 py-3 text-left font-semibold text-stone-700 dark:text-stone-300">Rol</th>
                <th className="px-4 py-3 text-left font-semibold text-stone-700 dark:text-stone-300">Telefon / Email</th>
                <th className="px-4 py-3 text-left font-semibold text-stone-700 dark:text-stone-300">Alte contacte</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100 dark:divide-stone-800">
              {contacte.map(c => {
                const camp = firstCamp(c);
                return (
                  <tr
                    key={c.id}
                    onClick={() => c.furnizor_id ? onNavigate(c.furnizor_id) : undefined}
                    className={clsx(
                      'transition-colors',
                      c.furnizor_id ? 'hover:bg-red-50 dark:hover:bg-red-900/10 cursor-pointer' : 'opacity-60',
                    )}
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-lg bg-stone-100 dark:bg-stone-800 flex items-center justify-center text-xs font-bold text-stone-500 flex-shrink-0">
                          {(c.furnizor_nume || '?').charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <p className="font-medium text-stone-900 dark:text-stone-100">{c.furnizor_nume ?? '—'}</p>
                          {c.furnizor_categorie && <CategorieBadge categorie={c.furnizor_categorie} />}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-stone-900 dark:text-stone-100">{c.nume}</span>
                        {c.erp_contact && (
                          <span className="text-xs px-1.5 py-0.5 rounded bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 font-medium">ERP</span>
                        )}
                        {c.primar && (
                          <span className="text-xs px-1.5 py-0.5 rounded bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 font-medium">Principal</span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-stone-500 dark:text-stone-400 text-xs">{c.rol || '—'}</td>
                    <td className="px-4 py-3">
                      {camp ? (
                        <div className="flex items-center gap-1.5 text-stone-700 dark:text-stone-300">
                          <CampIcon tip={camp.tip} className="w-3.5 h-3.5" />
                          <span className="font-mono text-xs">{camp.valoare}</span>
                        </div>
                      ) : '—'}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        {c.campuri.slice(1).map(camp2 => (
                          <div key={camp2.id} className="flex items-center gap-1 text-stone-500 dark:text-stone-400">
                            <CampIcon tip={camp2.tip} className="w-3 h-3" />
                            <span className="text-xs font-mono">{camp2.valoare}</span>
                          </div>
                        ))}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {showAddContact && <AddContactModal onClose={() => setShowAddContact(false)} />}
    </div>
  );
};

// ============================================
// Main AgendaPage
// ============================================
export const AgendaPage: React.FC = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const user = useAppStore(s => s.user);
  const isAdmin = user?.rol === 'admin' || user?.rol === 'sef';

  const [mainView, setMainView] = useState<'furnizori' | 'contacte'>('furnizori');
  const [subView, setSubView] = useState<'card' | 'list'>('card');
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [categorieFilter, setCategorieFilter] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [showCategorii, setShowCategorii] = useState(false);
  const syncedRef = useRef(false);

  // Debounce search (furnizori search is server-side via query key)
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  // Auto-sync ERP on mount (silent, best-effort)
  const syncMutation = useMutation({
    mutationFn: () => api.syncAgendaErp(),
    onSuccess: (result) => {
      if (result.created_furnizori > 0 || result.created_contacts > 0) {
        queryClient.invalidateQueries({ queryKey: ['agenda-furnizori'] });
        queryClient.invalidateQueries({ queryKey: ['agenda-contacte-global'] });
      }
    },
    onError: () => {}, // silent
  });

  useEffect(() => {
    if (!syncedRef.current) {
      syncedRef.current = true;
      syncMutation.mutate();
    }
  }, []);

  // Load categories from API (with fallback to hardcoded defaults)
  const { data: categorii = AGENDA_CATEGORII } = useQuery({
    queryKey: ['agenda-categorii'],
    queryFn: () => api.getAgendaCategorii(),
    staleTime: 300000,
  });

  const { data: furnizori = [], isLoading } = useQuery({
    queryKey: ['agenda-furnizori', debouncedSearch, categorieFilter],
    queryFn: () => api.getAgendaFurnizori({
      search: debouncedSearch || undefined,
      categorie: categorieFilter || undefined,
    }),
    staleTime: 30000,
    enabled: mainView === 'furnizori',
  });

  const handleCreated = (id: number) => {
    setShowAdd(false);
    navigate(`/agenda/${id}`);
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-stone-900 dark:text-stone-100">Agenda Furnizori</h1>
          <p className="text-sm text-stone-500 mt-0.5 flex items-center gap-2">
            {mainView === 'furnizori' ? `${furnizori.length} furnizori` : 'Contacte globale'}
            {syncMutation.isPending && (
              <span className="text-xs text-blue-500 flex items-center gap-1">
                <Spinner size="sm" /> sync ERP...
              </span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {isAdmin && mainView === 'furnizori' && (
            <button
              onClick={() => setShowCategorii(true)}
              title="Editează categorii"
              className="p-2 rounded-lg text-stone-500 hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors"
            >
              <Settings2 className="w-4 h-4" />
            </button>
          )}
          <button
            onClick={() => setShowAdd(true)}
            className="flex items-center gap-2 px-3 py-2 text-sm rounded-lg bg-red-600 text-white hover:bg-red-700 transition-colors"
          >
            <Plus className="w-4 h-4" />
            <span className="hidden sm:inline">Adaugă furnizor</span>
          </button>
        </div>
      </div>

      {/* Main view selector + filters */}
      <div className="flex items-center gap-3 flex-wrap">
        {/* Furnizori / Contacte toggle */}
        <div className="flex items-center border border-stone-300 dark:border-stone-700 rounded-lg overflow-hidden text-sm">
          <button
            onClick={() => setMainView('furnizori')}
            className={clsx('flex items-center gap-1.5 px-3 py-2 transition-colors', mainView === 'furnizori' ? 'bg-stone-900 dark:bg-stone-100 text-white dark:text-stone-900' : 'text-stone-500 hover:bg-stone-100 dark:hover:bg-stone-800')}
          >
            <Building2 className="w-4 h-4" /> Furnizori
          </button>
          <button
            onClick={() => setMainView('contacte')}
            className={clsx('flex items-center gap-1.5 px-3 py-2 transition-colors border-l border-stone-300 dark:border-stone-700', mainView === 'contacte' ? 'bg-stone-900 dark:bg-stone-100 text-white dark:text-stone-900' : 'text-stone-500 hover:bg-stone-100 dark:hover:bg-stone-800')}
          >
            <Users className="w-4 h-4" /> Contacte
          </button>
        </div>

        {mainView === 'furnizori' && (
          <>
            <div className="relative flex-1 min-w-40">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400" />
              <input
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Caută furnizor sau contact..."
                className="w-full pl-9 pr-8 py-2 rounded-lg border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-800 text-stone-900 dark:text-stone-100 text-sm focus:outline-none focus:ring-2 focus:ring-red-500"
              />
              {search && (
                <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-600">
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            <select
              value={categorieFilter}
              onChange={e => setCategorieFilter(e.target.value)}
              className="px-3 py-2 rounded-lg border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-800 text-stone-900 dark:text-stone-100 text-sm focus:outline-none focus:ring-2 focus:ring-red-500"
            >
              <option value="">Toate categoriile</option>
              {categorii.map(c => <option key={c} value={c}>{c}</option>)}
            </select>

            {/* Card / List sub-toggle */}
            <div className="flex items-center border border-stone-300 dark:border-stone-700 rounded-lg overflow-hidden ml-auto">
              <button
                onClick={() => setSubView('card')}
                className={clsx('p-2 transition-colors', subView === 'card' ? 'bg-stone-900 dark:bg-stone-100 text-white dark:text-stone-900' : 'text-stone-500 hover:bg-stone-100 dark:hover:bg-stone-800')}
              >
                <LayoutGrid className="w-4 h-4" />
              </button>
              <button
                onClick={() => setSubView('list')}
                className={clsx('p-2 transition-colors', subView === 'list' ? 'bg-stone-900 dark:bg-stone-100 text-white dark:text-stone-900' : 'text-stone-500 hover:bg-stone-100 dark:hover:bg-stone-800')}
              >
                <List className="w-4 h-4" />
              </button>
            </div>
          </>
        )}
      </div>

      {/* Content */}
      {mainView === 'contacte' ? (
        <ContacteView onNavigate={(id) => navigate(`/agenda/${id}`)} />
      ) : isLoading ? (
        <div className="flex justify-center py-16"><Spinner size="lg" /></div>
      ) : furnizori.length === 0 ? (
        <div className="text-center py-16 text-stone-400">
          <Building2 className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p className="font-medium">Niciun furnizor{search ? ` pentru "${search}"` : ''}</p>
          <p className="text-sm mt-1">Adaugă manual sau sincronizarea ERP va importa automat</p>
        </div>
      ) : subView === 'card' ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {furnizori.map(f => (
            <FurnizorCard key={f.id} furnizor={f} onClick={() => navigate(`/agenda/${f.id}`)} />
          ))}
        </div>
      ) : (
        <div className="bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-stone-200 dark:border-stone-800 bg-stone-50 dark:bg-stone-800/50">
                <th className="px-4 py-3 text-left font-semibold text-stone-700 dark:text-stone-300">Firmă</th>
                <th className="px-4 py-3 text-left font-semibold text-stone-700 dark:text-stone-300">Categorie</th>
                <th className="px-4 py-3 text-left font-semibold text-stone-700 dark:text-stone-300">Contact primar</th>
                <th className="px-4 py-3 text-left font-semibold text-stone-700 dark:text-stone-300">Rating</th>
                <th className="px-4 py-3 text-left font-semibold text-stone-700 dark:text-stone-300">Zile livrare</th>
                <th className="px-4 py-3 text-center font-semibold text-stone-700 dark:text-stone-300">Todos</th>
                <th className="px-4 py-3 text-left font-semibold text-stone-700 dark:text-stone-300">Ultima interacțiune</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100 dark:divide-stone-800">
              {furnizori.map(f => (
                <FurnizorRow key={f.id} furnizor={f} onClick={() => navigate(`/agenda/${f.id}`)} />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showAdd && <AddFurnizorModal onClose={() => setShowAdd(false)} onCreated={handleCreated} categorii={categorii} />}
      {showCategorii && <CategoriiModal categorii={categorii} onClose={() => setShowCategorii(false)} />}
    </div>
  );
};
