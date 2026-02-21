import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft, Star, Phone, Mail, Globe, MessageSquare, Plus, Trash2,
  Edit3, Check, X, Save, Loader2, CheckSquare, Square, Calendar,
  User, Building2, AlertCircle, AlertTriangle, Clock, ChevronDown, ChevronUp,
} from 'lucide-react';
import { clsx } from 'clsx';
import toast from 'react-hot-toast';
import { format } from 'date-fns';

import api from '@/services/api';
import type { AgendaContact, AgendaFurnizorDetail, AgendaTodo } from '@/types';
import { AGENDA_CATEGORII, AGENDA_CAMP_TIPURI, AGENDA_ROLURI, AGENDA_FRECVENTE, AGENDA_ZILE } from '@/types';
import { Spinner } from '@/components/ui';

// ============================================
// Helpers
// ============================================
const CampIcon: React.FC<{ tip: string; className?: string }> = ({ tip, className = 'w-4 h-4' }) => {
  if (tip === 'Email') return <Mail className={clsx(className, 'text-blue-500')} />;
  if (tip === 'WhatsApp') return <MessageSquare className={clsx(className, 'text-green-500')} />;
  if (tip === 'Website') return <Globe className={clsx(className, 'text-purple-500')} />;
  return <Phone className={clsx(className, 'text-stone-500')} />;
};

const StarEdit: React.FC<{ value: number; onChange: (v: number) => void }> = ({ value, onChange }) => {
  const [hover, setHover] = useState(0);
  return (
    <div className="flex items-center gap-1">
      {[1, 2, 3, 4, 5].map(s => (
        <button key={s} type="button"
          onClick={() => onChange(s)}
          onMouseEnter={() => setHover(s)}
          onMouseLeave={() => setHover(0)}
          className="hover:scale-110 transition-transform"
        >
          <Star className={clsx('w-5 h-5', s <= (hover || value) ? 'text-amber-400 fill-amber-400' : 'text-stone-300 dark:text-stone-600')} />
        </button>
      ))}
    </div>
  );
};

const PrioritateBadge: React.FC<{ p: number }> = ({ p }) => {
  if (p === 1) return <span className="text-xs px-1.5 py-0.5 rounded-full bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400">Urgentă</span>;
  if (p === 3) return <span className="text-xs px-1.5 py-0.5 rounded-full bg-stone-100 dark:bg-stone-800 text-stone-400">Scăzută</span>;
  return null;
};

// ============================================
// Inline editable field
// ============================================
const InlineText: React.FC<{
  value: string;
  onSave: (v: string) => void;
  placeholder?: string;
  textarea?: boolean;
  rows?: number;
}> = ({ value, onSave, placeholder, textarea = false, rows = 3 }) => {
  const [editing, setEditing] = useState(false);
  const [local, setLocal] = useState(value);

  useEffect(() => { setLocal(value); }, [value]);

  const save = () => { onSave(local); setEditing(false); };
  const cls = "w-full px-2 py-1 text-sm rounded border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-800 text-stone-900 dark:text-stone-100 focus:outline-none focus:ring-1 focus:ring-red-500";

  if (editing) {
    return textarea ? (
      <div className="space-y-1">
        <textarea autoFocus value={local} onChange={e => setLocal(e.target.value)} rows={rows} className={clsx(cls, 'resize-none')} />
        <div className="flex gap-1">
          <button onClick={save} className="text-xs px-2 py-1 bg-red-600 text-white rounded hover:bg-red-700">Salvează</button>
          <button onClick={() => { setLocal(value); setEditing(false); }} className="text-xs px-2 py-1 text-stone-500 hover:bg-stone-100 dark:hover:bg-stone-800 rounded">Anulează</button>
        </div>
      </div>
    ) : (
      <div className="flex gap-1">
        <input autoFocus value={local} onChange={e => setLocal(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') save(); if (e.key === 'Escape') { setLocal(value); setEditing(false); } }}
          className={clsx(cls, 'flex-1')} />
        <button onClick={save} className="text-green-500 hover:text-green-600"><Check className="w-4 h-4" /></button>
        <button onClick={() => { setLocal(value); setEditing(false); }} className="text-stone-400"><X className="w-4 h-4" /></button>
      </div>
    );
  }

  return (
    <span
      onClick={() => setEditing(true)}
      className={clsx(
        'text-sm cursor-pointer rounded px-1 -ml-1 hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors inline-block min-w-8',
        value ? 'text-stone-700 dark:text-stone-300' : 'text-stone-400 italic'
      )}
    >
      {value || placeholder || '—'}
    </span>
  );
};

// ============================================
// ADD CAMP INLINE
// ============================================
const AddCampInline: React.FC<{ onAdd: (tip: string, val: string) => void }> = ({ onAdd }) => {
  const [show, setShow] = useState(false);
  const [tip, setTip] = useState('Mobil');
  const [val, setVal] = useState('');

  if (!show) return (
    <button onClick={() => setShow(true)} className="flex items-center gap-1 text-xs text-stone-400 hover:text-red-500 transition-colors mt-1">
      <Plus className="w-3.5 h-3.5" /> adaugă câmp
    </button>
  );

  return (
    <div className="flex items-center gap-1.5 mt-1">
      <select value={tip} onChange={e => setTip(e.target.value)}
        className="text-xs px-1.5 py-1 rounded border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-800 text-stone-700 dark:text-stone-300">
        {AGENDA_CAMP_TIPURI.map(t => <option key={t} value={t}>{t}</option>)}
      </select>
      <input autoFocus value={val} onChange={e => setVal(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter' && val.trim()) { onAdd(tip, val.trim()); setVal(''); setShow(false); } if (e.key === 'Escape') setShow(false); }}
        placeholder="valoare..." className="flex-1 text-xs px-2 py-1 rounded border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-800 text-stone-700 dark:text-stone-300 focus:outline-none focus:ring-1 focus:ring-red-500" />
      <button onClick={() => { if (val.trim()) { onAdd(tip, val.trim()); setVal(''); setShow(false); } }} className="text-green-500"><Check className="w-3.5 h-3.5" /></button>
      <button onClick={() => setShow(false)} className="text-stone-400"><X className="w-3.5 h-3.5" /></button>
    </div>
  );
};

// ============================================
// CONTACT CARD
// ============================================
const ContactCard: React.FC<{
  contact: AgendaContact;
  onDelete: () => void;
  onSetPrimar: () => void;
  onAddCamp: (tip: string, val: string) => void;
  onDeleteCamp: (campId: number) => void;
  onEditCamp: (campId: number, val: string) => void;
  onRename: (name: string) => void;
}> = ({ contact, onDelete, onSetPrimar, onAddCamp, onDeleteCamp, onEditCamp, onRename }) => {
  return (
    <div className={clsx(
      'border rounded-xl p-3 transition-colors',
      contact.primar
        ? 'border-red-200 dark:border-red-800/50 bg-red-50/50 dark:bg-red-900/5'
        : 'border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900'
    )}>
      {/* Header */}
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-8 h-8 rounded-full bg-stone-200 dark:bg-stone-700 flex items-center justify-center text-sm font-bold text-stone-600 dark:text-stone-400 flex-shrink-0">
            {contact.nume.charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              <InlineText value={contact.nume} onSave={onRename} placeholder="Nume contact" />
              {contact.erp_contact && (
                <span className="text-xs px-1.5 py-0.5 rounded bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 font-medium flex-shrink-0">ERP</span>
              )}
              {contact.primar && (
                <span className="text-xs px-1.5 py-0.5 rounded bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 font-medium flex-shrink-0">Principal</span>
              )}
            </div>
            {contact.rol && contact.rol !== 'ERP' && (
              <p className="text-xs text-stone-400">{contact.rol}</p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-0.5 flex-shrink-0">
          {!contact.primar && (
            <button onClick={onSetPrimar} title="Setează principal" className="p-1 text-stone-300 hover:text-amber-500 transition-colors">
              <Star className="w-3.5 h-3.5" />
            </button>
          )}
          <button onClick={onDelete} className="p-1 text-stone-300 hover:text-red-500 transition-colors">
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Fields */}
      <div className="space-y-1">
        {contact.campuri.map(camp => (
          <div key={camp.id} className="flex items-center gap-2 group">
            <CampIcon tip={camp.tip} className="w-3.5 h-3.5 flex-shrink-0" />
            <span className="text-xs text-stone-400 w-14 flex-shrink-0">{camp.tip}</span>
            <InlineText
              value={camp.valoare}
              onSave={val => onEditCamp(camp.id, val)}
              placeholder="—"
            />
            <button onClick={() => onDeleteCamp(camp.id)}
              className="opacity-0 group-hover:opacity-100 p-0.5 text-stone-300 hover:text-red-500 transition-all flex-shrink-0 ml-auto">
              <X className="w-3 h-3" />
            </button>
          </div>
        ))}
        <AddCampInline onAdd={onAddCamp} />
      </div>
    </div>
  );
};

// ============================================
// ADD CONTACT FORM
// ============================================
const AddContactForm: React.FC<{ furnizorId: number; onDone: () => void }> = ({ furnizorId, onDone }) => {
  const queryClient = useQueryClient();
  const [form, setForm] = useState({ nume: '', rol: '', primar: false });
  const [camp, setCamp] = useState({ tip: 'Mobil', valoare: '' });

  const mutation = useMutation({
    mutationFn: () => api.createAgendaContact(furnizorId, {
      ...form,
      campuri: camp.valoare ? [{ tip: camp.tip, valoare: camp.valoare, ordine: 0 }] : [],
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agenda-furnizor', furnizorId] });
      toast.success('Contact adăugat');
      onDone();
    },
    onError: () => toast.error('Eroare'),
  });

  return (
    <div className="border-2 border-dashed border-red-300 dark:border-red-800 rounded-xl p-3 space-y-2.5">
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="text-xs text-stone-500 mb-0.5 block">Nume *</label>
          <input autoFocus value={form.nume} onChange={e => setForm(f => ({ ...f, nume: e.target.value }))}
            className="w-full px-2 py-1.5 text-sm rounded border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-800 text-stone-900 dark:text-stone-100 focus:outline-none focus:ring-1 focus:ring-red-500"
            placeholder="Nume persoană" />
        </div>
        <div>
          <label className="text-xs text-stone-500 mb-0.5 block">Rol</label>
          <select value={form.rol} onChange={e => setForm(f => ({ ...f, rol: e.target.value }))}
            className="w-full px-2 py-1.5 text-sm rounded border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-800 text-stone-900 dark:text-stone-100 focus:outline-none focus:ring-1 focus:ring-red-500">
            <option value="">— Rol —</option>
            {AGENDA_ROLURI.map(r => <option key={r} value={r}>{r}</option>)}
          </select>
        </div>
      </div>
      <div className="flex gap-2">
        <select value={camp.tip} onChange={e => setCamp(c => ({ ...c, tip: e.target.value }))}
          className="px-2 py-1.5 text-sm rounded border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-800 text-stone-900 dark:text-stone-100">
          {AGENDA_CAMP_TIPURI.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
        <input value={camp.valoare} onChange={e => setCamp(c => ({ ...c, valoare: e.target.value }))}
          className="flex-1 px-2 py-1.5 text-sm rounded border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-800 text-stone-900 dark:text-stone-100 focus:outline-none focus:ring-1 focus:ring-red-500"
          placeholder="telefon / email..." />
      </div>
      <label className="flex items-center gap-2 text-xs text-stone-600 dark:text-stone-400 cursor-pointer">
        <input type="checkbox" checked={form.primar} onChange={e => setForm(f => ({ ...f, primar: e.target.checked }))} className="rounded text-red-600" />
        Contact principal
      </label>
      <div className="flex gap-2">
        <button onClick={() => mutation.mutate()} disabled={!form.nume.trim() || mutation.isPending}
          className="px-3 py-1.5 text-xs rounded bg-red-600 text-white hover:bg-red-700 disabled:opacity-50">
          Salvează
        </button>
        <button onClick={onDone} className="px-3 py-1.5 text-xs rounded text-stone-500 hover:bg-stone-100 dark:hover:bg-stone-800">Anulează</button>
      </div>
    </div>
  );
};

// ============================================
// LEFT COLUMN: Contacte + Interacțiuni
// ============================================
const LeftColumn: React.FC<{ furnizor: AgendaFurnizorDetail }> = ({ furnizor }) => {
  const queryClient = useQueryClient();
  const furnizorId = furnizor.id;
  const [showAddContact, setShowAddContact] = useState(false);
  const [notaText, setNotaText] = useState('');
  const [showAllInteractiuni, setShowAllInteractiuni] = useState(false);

  const { data: interactiuni = [], isLoading: loadingInt } = useQuery({
    queryKey: ['agenda-interactiuni', furnizorId],
    queryFn: () => api.getAgendaInteractiuni(furnizorId),
    staleTime: 30000,
  });

  const invalidateFurnizor = () => queryClient.invalidateQueries({ queryKey: ['agenda-furnizor', furnizorId] });

  const addCampMutation = useMutation({
    mutationFn: ({ contactId, tip, val }: { contactId: number; tip: string; val: string }) =>
      api.createAgendaCamp(contactId, { tip, valoare: val, ordine: 0 }),
    onSuccess: invalidateFurnizor,
  });

  const deleteCampMutation = useMutation({
    mutationFn: (id: number) => api.deleteAgendaCamp(id),
    onSuccess: invalidateFurnizor,
  });

  const editCampMutation = useMutation({
    mutationFn: ({ id, val }: { id: number; val: string }) => api.updateAgendaCamp(id, { valoare: val }),
    onSuccess: invalidateFurnizor,
  });

  const deleteContactMutation = useMutation({
    mutationFn: (id: number) => api.deleteAgendaContact(id),
    onSuccess: () => { invalidateFurnizor(); toast.success('Contact șters'); },
  });

  const renameContactMutation = useMutation({
    mutationFn: ({ id, nume }: { id: number; nume: string }) => api.updateAgendaContact(id, { nume }),
    onSuccess: invalidateFurnizor,
  });

  const setPrimarMutation = useMutation({
    mutationFn: async (contactId: number) => {
      for (const c of furnizor.contacte) {
        if (c.primar) await api.updateAgendaContact(c.id, { primar: false });
      }
      await api.updateAgendaContact(contactId, { primar: true });
    },
    onSuccess: invalidateFurnizor,
  });

  const addInteractiuneMutation = useMutation({
    mutationFn: () => api.createAgendaInteractiune(furnizorId, { nota: notaText.trim() }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agenda-interactiuni', furnizorId] });
      queryClient.invalidateQueries({ queryKey: ['agenda-furnizori'] });
      setNotaText('');
      toast.success('Notă adăugată');
    },
    onError: () => toast.error('Eroare'),
  });

  const deleteInteractiuneMutation = useMutation({
    mutationFn: (id: number) => api.deleteAgendaInteractiune(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agenda-interactiuni', furnizorId] });
      queryClient.invalidateQueries({ queryKey: ['agenda-furnizori'] });
    },
  });

  const visibleInteractiuni = showAllInteractiuni ? interactiuni : interactiuni.slice(0, 4);

  return (
    <div className="space-y-4">
      {/* ── Contacte ── */}
      <div className="bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-xl">
        <div className="flex items-center justify-between px-4 py-3 border-b border-stone-100 dark:border-stone-800">
          <h3 className="font-semibold text-stone-900 dark:text-stone-100 text-sm">Contacte</h3>
          <button onClick={() => setShowAddContact(v => !v)}
            className="flex items-center gap-1 text-xs text-red-600 hover:text-red-700 font-medium">
            <Plus className="w-3.5 h-3.5" /> Adaugă
          </button>
        </div>
        <div className="p-3 space-y-2">
          {furnizor.contacte.length === 0 && !showAddContact && (
            <p className="text-xs text-stone-400 text-center py-2">Niciun contact. Apasă + Adaugă.</p>
          )}
          {furnizor.contacte.map(c => (
            <ContactCard
              key={c.id}
              contact={c}
              onDelete={() => deleteContactMutation.mutate(c.id)}
              onSetPrimar={() => setPrimarMutation.mutate(c.id)}
              onAddCamp={(tip, val) => addCampMutation.mutate({ contactId: c.id, tip, val })}
              onDeleteCamp={campId => deleteCampMutation.mutate(campId)}
              onEditCamp={(campId, val) => editCampMutation.mutate({ id: campId, val })}
              onRename={name => renameContactMutation.mutate({ id: c.id, nume: name })}
            />
          ))}
          {showAddContact && (
            <AddContactForm furnizorId={furnizorId} onDone={() => setShowAddContact(false)} />
          )}
        </div>
      </div>

      {/* ── Interacțiuni ── */}
      <div className="bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-xl">
        <div className="flex items-center justify-between px-4 py-3 border-b border-stone-100 dark:border-stone-800">
          <h3 className="font-semibold text-stone-900 dark:text-stone-100 text-sm">
            Interacțiuni {interactiuni.length > 0 && <span className="text-stone-400 font-normal">({interactiuni.length})</span>}
          </h3>
        </div>
        <div className="p-3 space-y-2">
          {/* Add note */}
          <div className="flex gap-2">
            <textarea
              value={notaText}
              onChange={e => setNotaText(e.target.value)}
              rows={2}
              placeholder="Notă nouă (call, întâlnire, condiții...)..."
              className="flex-1 px-2 py-1.5 text-sm rounded-lg border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-800 text-stone-900 dark:text-stone-100 focus:outline-none focus:ring-1 focus:ring-red-500 resize-none"
            />
            <button
              onClick={() => addInteractiuneMutation.mutate()}
              disabled={!notaText.trim() || addInteractiuneMutation.isPending}
              className="px-3 py-1.5 text-sm rounded-lg bg-red-600 text-white hover:bg-red-700 disabled:opacity-50 flex-shrink-0"
            >
              {addInteractiuneMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            </button>
          </div>

          {/* Timeline */}
          {loadingInt ? <div className="flex justify-center py-4"><Spinner /></div> : (
            <>
              {visibleInteractiuni.map(i => (
                <div key={i.id} className="group relative pl-3 border-l-2 border-stone-200 dark:border-stone-700">
                  <p className="text-sm text-stone-700 dark:text-stone-300 leading-relaxed">{i.nota}</p>
                  <div className="flex items-center gap-2 mt-1 text-xs text-stone-400">
                    <span className="flex items-center gap-1"><User className="w-3 h-3" />{i.user_nume || 'Sistem'}</span>
                    <span>·</span>
                    <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{format(new Date(i.created_at), 'dd.MM.yyyy HH:mm')}</span>
                  </div>
                  <button onClick={() => deleteInteractiuneMutation.mutate(i.id)}
                    className="absolute top-0 right-0 opacity-0 group-hover:opacity-100 p-0.5 text-stone-300 hover:text-red-500 transition-all">
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
              {interactiuni.length > 4 && (
                <button onClick={() => setShowAllInteractiuni(v => !v)}
                  className="flex items-center gap-1 text-xs text-stone-400 hover:text-stone-600 dark:hover:text-stone-300 transition-colors w-full justify-center py-1">
                  {showAllInteractiuni ? <><ChevronUp className="w-3.5 h-3.5" /> Mai puțin</> : <><ChevronDown className="w-3.5 h-3.5" /> {interactiuni.length - 4} mai vechi</>}
                </button>
              )}
              {interactiuni.length === 0 && (
                <p className="text-xs text-stone-400 text-center py-2">Nicio interacțiune înregistrată</p>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};

// ============================================
// RIGHT COLUMN: Info furnizor + Todos
// ============================================
const RightColumn: React.FC<{ furnizor: AgendaFurnizorDetail }> = ({ furnizor }) => {
  const queryClient = useQueryClient();
  const furnizorId = furnizor.id;

  const { data: categorii = AGENDA_CATEGORII } = useQuery({
    queryKey: ['agenda-categorii'],
    queryFn: () => api.getAgendaCategorii(),
    staleTime: 300000,
  });

  // Info form state
  const [info, setInfo] = useState({
    categorie: furnizor.categorie || '',
    zile_livrare: furnizor.zile_livrare ? furnizor.zile_livrare.split(',').filter(Boolean) : [] as string[],
    frecventa_comanda: furnizor.frecventa_comanda || '',
    discount_procent: furnizor.discount_procent?.toString() || '',
    termen_plata_zile: furnizor.termen_plata_zile?.toString() ?? '',
    suma_minima_comanda: furnizor.suma_minima_comanda?.toString() || '',
    rating_intern: furnizor.rating_intern || 0,
    note_generale: furnizor.note_generale || '',
  });
  const [dirty, setDirty] = useState(false);

  const upd = (key: string, val: any) => { setInfo(f => ({ ...f, [key]: val })); setDirty(true); };

  const saveMutation = useMutation({
    mutationFn: () => api.updateAgendaFurnizor(furnizorId, {
      categorie: info.categorie || undefined,
      zile_livrare: info.zile_livrare.join(',') || undefined,
      frecventa_comanda: info.frecventa_comanda || undefined,
      discount_procent: info.discount_procent ? parseFloat(info.discount_procent) : undefined,
      termen_plata_zile: info.termen_plata_zile !== '' ? parseInt(info.termen_plata_zile) : undefined,
      suma_minima_comanda: info.suma_minima_comanda ? parseFloat(info.suma_minima_comanda) : undefined,
      rating_intern: info.rating_intern || undefined,
      note_generale: info.note_generale || undefined,
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agenda-furnizor', furnizorId] });
      queryClient.invalidateQueries({ queryKey: ['agenda-furnizori'] });
      setDirty(false);
      toast.success('Salvat');
    },
    onError: () => toast.error('Eroare'),
  });

  // Todos
  const [showAddTodo, setShowAddTodo] = useState(false);
  const [newTodo, setNewTodo] = useState({ titlu: '', cantitate: '', tip: 'todo' as 'todo' | 'comanda', prioritate: 2 as 1 | 2 | 3 });

  const { data: todos = [], isLoading: loadingTodos } = useQuery({
    queryKey: ['agenda-todos', furnizorId],
    queryFn: () => api.getAgendaTodos({ furnizor_id: furnizorId }),
    staleTime: 30000,
  });

  const invalidateTodos = () => {
    queryClient.invalidateQueries({ queryKey: ['agenda-todos', furnizorId] });
    queryClient.invalidateQueries({ queryKey: ['agenda-furnizor', furnizorId] });
    queryClient.invalidateQueries({ queryKey: ['agenda-furnizori'] });
  };

  const addTodoMutation = useMutation({
    mutationFn: () => api.createAgendaTodo({ furnizor_id: furnizorId, ...newTodo, cantitate: newTodo.cantitate || undefined }),
    onSuccess: () => { invalidateTodos(); setShowAddTodo(false); setNewTodo({ titlu: '', cantitate: '', tip: 'todo', prioritate: 2 }); },
    onError: () => toast.error('Eroare'),
  });

  const toggleTodoMutation = useMutation({
    mutationFn: ({ id, rezolvat }: { id: number; rezolvat: boolean }) => api.updateAgendaTodo(id, { rezolvat }),
    onSuccess: invalidateTodos,
  });

  const deleteTodoMutation = useMutation({
    mutationFn: (id: number) => api.deleteAgendaTodo(id),
    onSuccess: invalidateTodos,
  });

  const openTodos = todos.filter(t => !t.rezolvat);
  const doneTodos = todos.filter(t => t.rezolvat);

  return (
    <div className="space-y-4">
      {/* ── Info furnizor ── */}
      <div className="bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-xl">
        <div className="flex items-center justify-between px-4 py-3 border-b border-stone-100 dark:border-stone-800">
          <h3 className="font-semibold text-stone-900 dark:text-stone-100 text-sm">Info furnizor</h3>
          {dirty && (
            <button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}
              className="flex items-center gap-1 text-xs px-2.5 py-1 rounded-lg bg-red-600 text-white hover:bg-red-700 disabled:opacity-50">
              {saveMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
              Salvează
            </button>
          )}
        </div>
        <div className="p-4 space-y-3">
          {/* Rating */}
          <div>
            <p className="text-xs text-stone-400 mb-1">Rating intern</p>
            <StarEdit value={info.rating_intern} onChange={v => upd('rating_intern', v)} />
          </div>

          {/* Categorie */}
          <div>
            <p className="text-xs text-stone-400 mb-1">Categorie</p>
            <select value={info.categorie} onChange={e => upd('categorie', e.target.value)}
              className="w-full px-2 py-1.5 text-sm rounded border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-800 text-stone-900 dark:text-stone-100 focus:outline-none focus:ring-1 focus:ring-red-500">
              <option value="">— Selectează —</option>
              {categorii.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>

          {/* Zile livrare */}
          <div>
            <p className="text-xs text-stone-400 mb-1">Zile livrare</p>
            <div className="flex flex-wrap gap-1">
              {AGENDA_ZILE.map(zi => (
                <button key={zi} type="button"
                  onClick={() => {
                    const next = info.zile_livrare.includes(zi)
                      ? info.zile_livrare.filter(z => z !== zi)
                      : [...info.zile_livrare, zi];
                    upd('zile_livrare', next);
                  }}
                  className={clsx('text-xs px-2 py-1 rounded-lg border transition-colors', info.zile_livrare.includes(zi) ? 'bg-red-600 text-white border-red-600' : 'border-stone-300 dark:border-stone-600 text-stone-500 hover:border-red-400')}>
                  {zi.slice(0, 2)}
                </button>
              ))}
            </div>
          </div>

          {/* Frecventa + Termen */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <p className="text-xs text-stone-400 mb-1">Frecvență</p>
              <select value={info.frecventa_comanda} onChange={e => upd('frecventa_comanda', e.target.value)}
                className="w-full px-2 py-1.5 text-xs rounded border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-800 text-stone-900 dark:text-stone-100 focus:outline-none focus:ring-1 focus:ring-red-500">
                <option value="">—</option>
                {AGENDA_FRECVENTE.map(f => <option key={f} value={f}>{f}</option>)}
              </select>
            </div>
            <div>
              <p className="text-xs text-stone-400 mb-1">Termen plată</p>
              <select value={info.termen_plata_zile} onChange={e => upd('termen_plata_zile', e.target.value)}
                className="w-full px-2 py-1.5 text-xs rounded border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-800 text-stone-900 dark:text-stone-100 focus:outline-none focus:ring-1 focus:ring-red-500">
                <option value="">—</option>
                <option value="0">Cash</option>
                {[7, 14, 30, 60, 90].map(t => <option key={t} value={t}>{t} zile</option>)}
              </select>
            </div>
          </div>

          {/* Discount + Suma minima */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <p className="text-xs text-stone-400 mb-1">Discount (%)</p>
              <input type="number" min="0" max="100" step="0.5" value={info.discount_procent}
                onChange={e => upd('discount_procent', e.target.value)}
                className="w-full px-2 py-1.5 text-sm rounded border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-800 text-stone-900 dark:text-stone-100 focus:outline-none focus:ring-1 focus:ring-red-500"
                placeholder="0" />
            </div>
            <div>
              <p className="text-xs text-stone-400 mb-1">Min. comandă (RON)</p>
              <input type="number" min="0" value={info.suma_minima_comanda}
                onChange={e => upd('suma_minima_comanda', e.target.value)}
                className="w-full px-2 py-1.5 text-sm rounded border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-800 text-stone-900 dark:text-stone-100 focus:outline-none focus:ring-1 focus:ring-red-500"
                placeholder="0" />
            </div>
          </div>

          {/* Note */}
          <div>
            <p className="text-xs text-stone-400 mb-1">Note generale</p>
            <textarea value={info.note_generale} onChange={e => upd('note_generale', e.target.value)} rows={3}
              className="w-full px-2 py-1.5 text-sm rounded border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-800 text-stone-900 dark:text-stone-100 focus:outline-none focus:ring-1 focus:ring-red-500 resize-none"
              placeholder="Observații, condiții speciale..." />
          </div>
        </div>
      </div>

      {/* ── Todos / Comenzi ── */}
      <div className="bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-xl">
        <div className="flex items-center justify-between px-4 py-3 border-b border-stone-100 dark:border-stone-800">
          <h3 className="font-semibold text-stone-900 dark:text-stone-100 text-sm">
            Comenzi & Todos
            {openTodos.length > 0 && (
              <span className="ml-2 text-xs px-1.5 py-0.5 rounded-full bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400">{openTodos.length}</span>
            )}
          </h3>
          <button onClick={() => setShowAddTodo(v => !v)}
            className="flex items-center gap-1 text-xs text-red-600 hover:text-red-700 font-medium">
            <Plus className="w-3.5 h-3.5" /> Adaugă
          </button>
        </div>
        <div className="p-3 space-y-1.5">
          {showAddTodo && (
            <div className="border border-dashed border-red-300 dark:border-red-800 rounded-lg p-3 space-y-2 mb-2">
              <input autoFocus value={newTodo.titlu} onChange={e => setNewTodo(n => ({ ...n, titlu: e.target.value }))}
                placeholder="Titlu *"
                className="w-full px-2 py-1.5 text-sm rounded border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-800 text-stone-900 dark:text-stone-100 focus:outline-none focus:ring-1 focus:ring-red-500" />
              <div className="flex gap-2">
                <input value={newTodo.cantitate} onChange={e => setNewTodo(n => ({ ...n, cantitate: e.target.value }))}
                  placeholder="Cantitate (opț.)"
                  className="flex-1 px-2 py-1.5 text-xs rounded border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-800 text-stone-900 dark:text-stone-100 focus:outline-none focus:ring-1 focus:ring-red-500" />
                <select value={newTodo.prioritate} onChange={e => setNewTodo(n => ({ ...n, prioritate: parseInt(e.target.value) as 1 | 2 | 3 }))}
                  className="px-2 py-1.5 text-xs rounded border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-800 text-stone-900 dark:text-stone-100">
                  <option value="1">Urgentă</option>
                  <option value="2">Normală</option>
                  <option value="3">Scăzută</option>
                </select>
                <select value={newTodo.tip} onChange={e => setNewTodo(n => ({ ...n, tip: e.target.value as 'todo' | 'comanda' }))}
                  className="px-2 py-1.5 text-xs rounded border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-800 text-stone-900 dark:text-stone-100">
                  <option value="todo">Todo</option>
                  <option value="comanda">Comandă</option>
                </select>
              </div>
              <div className="flex gap-2">
                <button onClick={() => addTodoMutation.mutate()} disabled={!newTodo.titlu.trim() || addTodoMutation.isPending}
                  className="px-3 py-1.5 text-xs rounded bg-red-600 text-white hover:bg-red-700 disabled:opacity-50">Salvează</button>
                <button onClick={() => setShowAddTodo(false)} className="px-3 py-1.5 text-xs rounded text-stone-500 hover:bg-stone-100 dark:hover:bg-stone-800">Anulează</button>
              </div>
            </div>
          )}

          {loadingTodos ? <div className="flex justify-center py-4"><Spinner /></div> : (
            <>
              {openTodos.map(t => <TodoItem key={t.id} todo={t} onToggle={() => toggleTodoMutation.mutate({ id: t.id, rezolvat: true })} onDelete={() => deleteTodoMutation.mutate(t.id)} />)}
              {doneTodos.length > 0 && (
                <>
                  <p className="text-xs text-stone-400 pt-2 pb-1 font-medium uppercase tracking-wide">Rezolvate ({doneTodos.length})</p>
                  {doneTodos.map(t => <TodoItem key={t.id} todo={t} onToggle={() => toggleTodoMutation.mutate({ id: t.id, rezolvat: false })} onDelete={() => deleteTodoMutation.mutate(t.id)} />)}
                </>
              )}
              {todos.length === 0 && !showAddTodo && (
                <p className="text-xs text-stone-400 text-center py-2">Nicio comandă sau todo</p>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};

const TodoItem: React.FC<{ todo: AgendaTodo; onToggle: () => void; onDelete: () => void }> = ({ todo, onToggle, onDelete }) => (
  <div className={clsx(
    'flex items-start gap-2 px-3 py-2 rounded-lg border group transition-colors',
    todo.rezolvat ? 'border-stone-100 dark:border-stone-800/50 opacity-60' : 'border-stone-200 dark:border-stone-800'
  )}>
    <button onClick={onToggle} className="flex-shrink-0 mt-0.5">
      {todo.rezolvat ? <CheckSquare className="w-4 h-4 text-green-500" /> : <Square className="w-4 h-4 text-stone-400 hover:text-red-500 transition-colors" />}
    </button>
    <div className="flex-1 min-w-0">
      <div className="flex items-center gap-1.5 flex-wrap">
        <span className={clsx('text-sm', todo.rezolvat ? 'line-through text-stone-400' : 'text-stone-900 dark:text-stone-100')}>{todo.titlu}</span>
        {todo.cantitate && <span className="text-xs text-stone-500 bg-stone-100 dark:bg-stone-800 px-1.5 py-0.5 rounded-full">{todo.cantitate}</span>}
        <PrioritateBadge p={todo.prioritate} />
        {todo.tip === 'comanda' && <span className="text-xs px-1.5 py-0.5 rounded-full bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400">Comandă</span>}
      </div>
      {todo.data_scadenta && (
        <p className="text-xs text-stone-400 mt-0.5 flex items-center gap-1">
          <Calendar className="w-3 h-3" /> {format(new Date(todo.data_scadenta), 'dd.MM.yyyy')}
        </p>
      )}
    </div>
    <button onClick={onDelete} className="opacity-0 group-hover:opacity-100 p-0.5 text-stone-300 hover:text-red-500 transition-all flex-shrink-0">
      <Trash2 className="w-3.5 h-3.5" />
    </button>
  </div>
);

// ============================================
// Main FurnizorDetail
// ============================================
export const FurnizorDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const furnizorId = parseInt(id || '0');

  const { data: furnizor, isLoading, error } = useQuery({
    queryKey: ['agenda-furnizor', furnizorId],
    queryFn: () => api.getAgendaFurnizor(furnizorId),
    enabled: !!furnizorId,
  });

  const [editingNume, setEditingNume] = useState(false);
  const [numeEdit, setNumeEdit] = useState('');

  const updateMutation = useMutation({
    mutationFn: (body: any) => api.updateAgendaFurnizor(furnizorId, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agenda-furnizor', furnizorId] });
      queryClient.invalidateQueries({ queryKey: ['agenda-furnizori'] });
    },
  });

  if (isLoading) return <div className="flex justify-center py-16"><Spinner size="lg" /></div>;
  if (error || !furnizor) return (
    <div className="text-center py-16 text-stone-400">
      <AlertCircle className="w-10 h-10 mx-auto mb-2" />
      <p>Furnizor negăsit</p>
      <button onClick={() => navigate('/agenda')} className="mt-4 text-red-600 hover:underline text-sm">Înapoi</button>
    </div>
  );

  return (
    <div className="space-y-4">
      {/* Back */}
      <button onClick={() => navigate('/agenda')}
        className="flex items-center gap-2 text-sm text-stone-500 hover:text-stone-700 dark:hover:text-stone-300 transition-colors">
        <ArrowLeft className="w-4 h-4" /> Agenda
      </button>

      {/* Header card */}
      <div className={clsx(
        'border rounded-xl p-4',
        furnizor.atentie
          ? 'bg-fuchsia-50 dark:bg-fuchsia-950/30 border-fuchsia-400 dark:border-fuchsia-700'
          : 'bg-white dark:bg-stone-900 border-stone-200 dark:border-stone-800',
      )}>
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              {/* Atentie toggle */}
              <button
                onClick={() => updateMutation.mutate({ atentie: !furnizor.atentie })}
                title={furnizor.atentie ? 'Dezactivează atenție' : 'Marchează ca atenție'}
                className={clsx(
                  'flex items-center gap-1 text-xs px-2 py-1 rounded-lg border transition-colors',
                  furnizor.atentie
                    ? 'bg-fuchsia-600 text-white border-fuchsia-600 hover:bg-fuchsia-700'
                    : 'border-stone-300 dark:border-stone-700 text-stone-400 hover:text-fuchsia-600 hover:border-fuchsia-400',
                )}
              >
                <AlertTriangle className="w-3 h-3" />
                Atenție
              </button>
            </div>
            {editingNume ? (
              <div className="flex items-center gap-2">
                <input autoFocus value={numeEdit} onChange={e => setNumeEdit(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter' && numeEdit.trim()) { updateMutation.mutate({ nume: numeEdit.trim() }); setEditingNume(false); }
                    if (e.key === 'Escape') setEditingNume(false);
                  }}
                  className="text-xl font-bold bg-transparent border-b-2 border-red-500 text-stone-900 dark:text-stone-100 focus:outline-none" />
                <button onClick={() => { updateMutation.mutate({ nume: numeEdit.trim() }); setEditingNume(false); }} className="text-green-500"><Check className="w-5 h-5" /></button>
                <button onClick={() => setEditingNume(false)} className="text-stone-400"><X className="w-5 h-5" /></button>
              </div>
            ) : (
              <div className="flex items-center gap-2 group">
                <h1 className="text-xl font-bold text-stone-900 dark:text-stone-100">{furnizor.nume}</h1>
                <button onClick={() => { setNumeEdit(furnizor.nume); setEditingNume(true); }}
                  className="opacity-0 group-hover:opacity-100 p-1 text-stone-400 hover:text-stone-600 transition-all">
                  <Edit3 className="w-4 h-4" />
                </button>
              </div>
            )}
            {furnizor.erp_name && furnizor.erp_name !== furnizor.nume && (
              <p className="text-xs text-stone-400 mt-0.5">ERP: {furnizor.erp_name}</p>
            )}
          </div>

          {/* Quick info pills */}
          <div className="flex flex-wrap gap-1.5">
            {furnizor.categorie && (
              <span className="text-xs px-2.5 py-1 rounded-full bg-stone-100 dark:bg-stone-800 text-stone-600 dark:text-stone-400">{furnizor.categorie}</span>
            )}
            {furnizor.zile_livrare && (
              <span className="text-xs px-2.5 py-1 rounded-full bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400">Livrare: {furnizor.zile_livrare}</span>
            )}
            {furnizor.termen_plata_zile !== undefined && furnizor.termen_plata_zile !== null && (
              <span className="text-xs px-2.5 py-1 rounded-full bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-400">
                {furnizor.termen_plata_zile === 0 ? 'Cash' : `${furnizor.termen_plata_zile} zile`}
              </span>
            )}
            {furnizor.discount_procent && Number(furnizor.discount_procent) > 0 && (
              <span className="text-xs px-2.5 py-1 rounded-full bg-purple-50 dark:bg-purple-900/20 text-purple-600 dark:text-purple-400">Discount {furnizor.discount_procent}%</span>
            )}
            {furnizor.rating_intern && (
              <span className="flex items-center gap-0.5">
                {Array.from({ length: furnizor.rating_intern }, (_, i) => (
                  <Star key={i} className="w-3.5 h-3.5 text-amber-400 fill-amber-400" />
                ))}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Side-by-side: LEFT (contacte + interacțiuni) | RIGHT (info + todos) */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        <div className="lg:col-span-3">
          <LeftColumn furnizor={furnizor} />
        </div>
        <div className="lg:col-span-2">
          <RightColumn furnizor={furnizor} />
        </div>
      </div>
    </div>
  );
};
