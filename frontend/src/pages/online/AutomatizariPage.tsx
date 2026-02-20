import React, { useState, useMemo, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Power,
  Plus,
  Trash2,
  Crown,
  WifiOff,
  Loader2,
  Search,
  X,
  Zap,
  Timer,
  AlertCircle,
  Edit2,
  Check,
} from 'lucide-react';
import { clsx } from 'clsx';
import { toast } from 'react-hot-toast';
import api from '@/services/api';
import { Card, Spinner } from '@/components/ui';

// ─── Types ─────────────────────────────────────────────────────────────────

interface GroupEntity {
  id: number;
  entity_id: string;
  friendly_name: string;
  is_master: boolean;
  sort_order: number;
}

interface HassGroup {
  id: number;
  name: string;
  interval_seconds: number;
  entities: GroupEntity[];
}

interface HaEntity {
  entity_id: string;
  friendly_name: string;
  state: string;
  domain: string;
}

interface EntityState {
  state: string;
  last_updated: string;
}

interface ConfirmState {
  title: string;
  message: string;
  confirmLabel: string;
  onConfirm: () => Promise<void>;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function stateColor(state: string) {
  if (state === 'on') return 'text-emerald-500';
  if (state === 'off') return 'text-stone-400 dark:text-stone-600';
  return 'text-amber-400'; // unavailable
}

function stateBg(state: string) {
  if (state === 'on') return 'bg-emerald-500';
  if (state === 'off') return 'bg-stone-300 dark:bg-stone-600';
  return 'bg-amber-400';
}

function stateLabel(state: string) {
  if (state === 'on') return 'Pornit';
  if (state === 'off') return 'Oprit';
  return 'Indisponibil';
}

// ─── Confirm Modal ──────────────────────────────────────────────────────────

const ConfirmModal: React.FC<{
  confirm: ConfirmState;
  onCancel: () => void;
}> = ({ confirm, onCancel }) => {
  const [loading, setLoading] = useState(false);

  const handleConfirm = async () => {
    setLoading(true);
    try {
      await confirm.onConfirm();
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="bg-white dark:bg-stone-900 rounded-2xl shadow-xl border border-stone-200 dark:border-stone-700 w-full max-w-sm p-6">
        <div className="flex items-start gap-3 mb-4">
          <AlertCircle className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
          <div>
            <h3 className="font-semibold text-stone-900 dark:text-stone-100">{confirm.title}</h3>
            <p className="text-sm text-stone-600 dark:text-stone-400 mt-1">{confirm.message}</p>
          </div>
        </div>
        <div className="flex gap-2 justify-end">
          <button
            onClick={onCancel}
            disabled={loading}
            className="px-4 py-2 text-sm rounded-lg border border-stone-200 dark:border-stone-700 hover:bg-stone-50 dark:hover:bg-stone-800 transition-colors"
          >
            Anulează
          </button>
          <button
            onClick={handleConfirm}
            disabled={loading}
            className="px-4 py-2 text-sm rounded-lg bg-amber-500 hover:bg-amber-600 text-white font-medium transition-colors inline-flex items-center gap-2"
          >
            {loading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            {confirm.confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
};

// ─── Add Group Modal ────────────────────────────────────────────────────────

const AddGroupModal: React.FC<{
  initial?: HassGroup;
  onSave: (name: string, interval: number) => Promise<void>;
  onClose: () => void;
}> = ({ initial, onSave, onClose }) => {
  const [name, setName] = useState(initial?.name ?? '');
  const [interval, setInterval] = useState(String(initial?.interval_seconds ?? 3));
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setLoading(true);
    try {
      await onSave(name.trim(), Number(interval) || 3);
      onClose();
    } catch {
      toast.error('Eroare la salvare');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="bg-white dark:bg-stone-900 rounded-2xl shadow-xl border border-stone-200 dark:border-stone-700 w-full max-w-sm p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-stone-900 dark:text-stone-100">
            {initial ? 'Editează grup' : 'Grup nou'}
          </h3>
          <button onClick={onClose} className="text-stone-400 hover:text-stone-600 dark:hover:text-stone-300">
            <X className="w-4 h-4" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="text-xs font-medium text-stone-500 uppercase tracking-wide">Nume grup</label>
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="ex: Boxe Foisor"
              className="mt-1 w-full px-3 py-2 rounded-lg border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-800 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/40"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-stone-500 uppercase tracking-wide">
              Interval master→slave (secunde)
            </label>
            <input
              type="number"
              min={0}
              max={60}
              value={interval}
              onChange={(e) => setInterval(e.target.value)}
              className="mt-1 w-full px-3 py-2 rounded-lg border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-800 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/40"
            />
            <p className="text-[11px] text-stone-400 mt-1">
              La All ON: pornire master → așteptare interval → pornire slave-uri
            </p>
          </div>
          <div className="flex gap-2 justify-end pt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm rounded-lg border border-stone-200 dark:border-stone-700 hover:bg-stone-50 dark:hover:bg-stone-800 transition-colors">
              Anulează
            </button>
            <button
              type="submit"
              disabled={!name.trim() || loading}
              className="px-4 py-2 text-sm rounded-lg bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-white font-medium transition-colors inline-flex items-center gap-2"
            >
              {loading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              Salvează
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

// ─── Add Entity Modal ───────────────────────────────────────────────────────

const AddEntityModal: React.FC<{
  groupId: number;
  existingIds: Set<string>;
  onAdd: (entity: HaEntity, isMaster: boolean) => Promise<void>;
  onClose: () => void;
}> = ({ groupId, existingIds, onAdd, onClose }) => {
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<HaEntity | null>(null);
  const [isMaster, setIsMaster] = useState(false);
  const [loading, setLoading] = useState(false);

  const { data: allEntities = [], isLoading } = useQuery({
    queryKey: ['hass-all-entities'],
    queryFn: () => api.getHassAllEntities(),
    staleTime: 30_000,
  });

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return allEntities
      .filter((e) => !existingIds.has(e.entity_id))
      .filter((e) =>
        !q ||
        e.friendly_name.toLowerCase().includes(q) ||
        e.entity_id.toLowerCase().includes(q)
      )
      .slice(0, 50);
  }, [allEntities, existingIds, search]);

  const handleAdd = async () => {
    if (!selected) return;
    setLoading(true);
    try {
      await onAdd(selected, isMaster);
      onClose();
    } catch {
      toast.error('Eroare la adăugare');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="bg-white dark:bg-stone-900 rounded-2xl shadow-xl border border-stone-200 dark:border-stone-700 w-full max-w-md p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-stone-900 dark:text-stone-100">Adaugă dispozitiv</h3>
          <button onClick={onClose} className="text-stone-400 hover:text-stone-600 dark:hover:text-stone-300">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Search */}
        <div className="relative mb-3">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400" />
          <input
            autoFocus
            value={search}
            onChange={(e) => { setSearch(e.target.value); setSelected(null); }}
            placeholder="Caută după nume sau entity_id…"
            className="w-full pl-9 pr-3 py-2 rounded-lg border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-800 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/40"
          />
        </div>

        {/* List */}
        <div className="border border-stone-200 dark:border-stone-700 rounded-lg overflow-hidden mb-4 max-h-60 overflow-y-auto">
          {isLoading ? (
            <div className="flex justify-center py-8"><Spinner size="sm" /></div>
          ) : filtered.length === 0 ? (
            <p className="text-center text-stone-400 text-sm py-8">Niciun rezultat</p>
          ) : (
            filtered.map((e) => (
              <button
                key={e.entity_id}
                onClick={() => setSelected(e)}
                className={clsx(
                  'w-full text-left px-3 py-2.5 flex items-center gap-3 border-b border-stone-100 dark:border-stone-800 last:border-0 transition-colors',
                  selected?.entity_id === e.entity_id
                    ? 'bg-amber-50 dark:bg-amber-900/20'
                    : 'hover:bg-stone-50 dark:hover:bg-stone-800/50',
                )}
              >
                <span
                  className={clsx('w-2 h-2 rounded-full flex-shrink-0', stateBg(e.state))}
                />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-stone-800 dark:text-stone-200 truncate">
                    {e.friendly_name}
                  </p>
                  <p className="text-[11px] text-stone-400 truncate">{e.entity_id}</p>
                </div>
                {selected?.entity_id === e.entity_id && (
                  <Check className="w-4 h-4 text-amber-500 flex-shrink-0" />
                )}
              </button>
            ))
          )}
        </div>

        {/* Master toggle */}
        <label className="flex items-center gap-3 mb-4 cursor-pointer">
          <div
            onClick={() => setIsMaster((v) => !v)}
            className={clsx(
              'w-10 h-6 rounded-full transition-colors relative',
              isMaster ? 'bg-amber-500' : 'bg-stone-200 dark:bg-stone-700',
            )}
          >
            <span
              className={clsx(
                'absolute top-1 w-4 h-4 rounded-full bg-white shadow transition-transform',
                isMaster ? 'translate-x-5' : 'translate-x-1',
              )}
            />
          </div>
          <div>
            <span className="flex items-center gap-1.5 text-sm font-medium text-stone-800 dark:text-stone-200">
              <Crown className="w-3.5 h-3.5 text-amber-500" />
              Master
            </span>
            <p className="text-[11px] text-stone-400">Controlează ordinea pornirii/opririi</p>
          </div>
        </label>

        <div className="flex gap-2 justify-end">
          <button onClick={onClose} className="px-4 py-2 text-sm rounded-lg border border-stone-200 dark:border-stone-700 hover:bg-stone-50 dark:hover:bg-stone-800 transition-colors">
            Anulează
          </button>
          <button
            onClick={handleAdd}
            disabled={!selected || loading}
            className="px-4 py-2 text-sm rounded-lg bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-white font-medium transition-colors inline-flex items-center gap-2"
          >
            {loading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            Adaugă
          </button>
        </div>
      </div>
    </div>
  );
};

// ─── Entity Row ─────────────────────────────────────────────────────────────

const EntityRow: React.FC<{
  entity: GroupEntity;
  group: HassGroup;
  state: EntityState | undefined;
  operating: boolean;
  onToggle: (entity: GroupEntity, targetService: 'turn_on' | 'turn_off') => void;
  onSetMaster: (entity: GroupEntity) => void;
  onRemove: (entity: GroupEntity) => void;
}> = ({ entity, group, state, operating, onToggle, onSetMaster, onRemove }) => {
  const currentState = state?.state ?? 'unknown';
  const isOn = currentState === 'on';
  const isUnavailable = currentState === 'unavailable' || currentState === 'unknown';

  return (
    <div className="flex items-center gap-3 py-2.5 px-3 rounded-xl hover:bg-stone-50 dark:hover:bg-stone-800/50 group/row transition-colors">
      {/* Status dot */}
      <span className={clsx('w-2.5 h-2.5 rounded-full flex-shrink-0', stateBg(currentState))} />

      {/* Name + badges */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-medium text-stone-800 dark:text-stone-200 truncate">
            {entity.friendly_name}
          </span>
          {entity.is_master && (
            <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400">
              <Crown className="w-2.5 h-2.5" />
              Master
            </span>
          )}
        </div>
        <p className="text-[11px] text-stone-400">{stateLabel(currentState)}</p>
      </div>

      {/* Actions — always visible on mobile, fade on desktop */}
      <div className="flex items-center gap-1 opacity-100 md:opacity-0 md:group-hover/row:opacity-100 transition-opacity">
        {!entity.is_master && (
          <button
            onClick={() => onSetMaster(entity)}
            title="Setează ca master"
            className="p-1.5 rounded-lg text-stone-300 hover:text-amber-500 hover:bg-amber-50 dark:hover:bg-amber-900/20 transition-colors"
          >
            <Crown className="w-3.5 h-3.5" />
          </button>
        )}
        <button
          onClick={() => onRemove(entity)}
          title="Elimină"
          className="p-1.5 rounded-lg text-stone-300 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Toggle button */}
      <button
        onClick={() => !isUnavailable && !operating && onToggle(entity, isOn ? 'turn_off' : 'turn_on')}
        disabled={isUnavailable || operating}
        title={isUnavailable ? 'Indisponibil' : isOn ? 'Oprește' : 'Pornește'}
        className={clsx(
          'w-10 h-6 rounded-full relative transition-colors flex-shrink-0',
          isUnavailable || operating ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer',
          isOn ? 'bg-emerald-500' : 'bg-stone-200 dark:bg-stone-700',
        )}
      >
        {operating ? (
          <Loader2 className="absolute inset-0 m-auto w-3.5 h-3.5 text-white animate-spin" />
        ) : (
          <span
            className={clsx(
              'absolute top-1 w-4 h-4 rounded-full bg-white shadow transition-transform',
              isOn ? 'translate-x-5' : 'translate-x-1',
            )}
          />
        )}
      </button>
    </div>
  );
};

// ─── Group Card ─────────────────────────────────────────────────────────────

const GroupCard: React.FC<{
  group: HassGroup;
  states: Record<string, EntityState>;
  operating: Set<string>;
  onToggleEntity: (group: HassGroup, entity: GroupEntity, service: 'turn_on' | 'turn_off') => void;
  onSetMaster: (group: HassGroup, entity: GroupEntity) => void;
  onRemoveEntity: (group: HassGroup, entity: GroupEntity) => void;
  onAllOn: (group: HassGroup) => void;
  onAllOff: (group: HassGroup) => void;
  onDelete: (group: HassGroup) => void;
  onEdit: (group: HassGroup) => void;
  onAddEntity: (group: HassGroup) => void;
}> = ({
  group, states, operating,
  onToggleEntity, onSetMaster, onRemoveEntity,
  onAllOn, onAllOff, onDelete, onEdit, onAddEntity,
}) => {
  const activeCount = group.entities.filter((e) => states[e.entity_id]?.state === 'on').length;
  const allOn = activeCount === group.entities.length && group.entities.length > 0;
  const anyOn = activeCount > 0;

  return (
    <Card className="overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 border-b border-stone-100 dark:border-stone-800 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <Zap className="w-4 h-4 text-amber-500 flex-shrink-0" />
          <div className="min-w-0">
            <h3 className="font-semibold text-stone-800 dark:text-stone-200 truncate text-sm">
              {group.name}
            </h3>
            <div className="flex items-center gap-2 text-[11px] text-stone-400">
              <span>{group.entities.length} dispozitive</span>
              {anyOn && <span className="text-emerald-500 font-medium">{activeCount} active</span>}
              <span className="flex items-center gap-1">
                <Timer className="w-3 h-3" />{group.interval_seconds}s
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1.5 flex-shrink-0">
          {/* All ON */}
          <button
            onClick={() => onAllOn(group)}
            disabled={allOn || group.entities.length === 0}
            title="Pornește toate"
            className="px-2.5 py-1.5 text-xs rounded-lg bg-emerald-500 hover:bg-emerald-600 disabled:opacity-30 text-white font-medium transition-colors"
          >
            All ON
          </button>
          {/* All OFF */}
          <button
            onClick={() => onAllOff(group)}
            disabled={!anyOn}
            title="Oprește toate"
            className="px-2.5 py-1.5 text-xs rounded-lg bg-stone-500 hover:bg-stone-600 disabled:opacity-30 text-white font-medium transition-colors"
          >
            All OFF
          </button>
          {/* Edit */}
          <button
            onClick={() => onEdit(group)}
            className="p-1.5 rounded-lg text-stone-400 hover:text-stone-600 dark:hover:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors"
          >
            <Edit2 className="w-3.5 h-3.5" />
          </button>
          {/* Delete */}
          <button
            onClick={() => onDelete(group)}
            className="p-1.5 rounded-lg text-stone-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Entities */}
      <div className="px-2 py-2">
        {group.entities.length === 0 ? (
          <p className="text-center text-xs text-stone-400 py-4">
            Niciun dispozitiv. Apasă + pentru a adăuga.
          </p>
        ) : (
          group.entities.map((entity) => (
            <EntityRow
              key={entity.entity_id}
              entity={entity}
              group={group}
              state={states[entity.entity_id]}
              operating={operating.has(entity.entity_id)}
              onToggle={(e, svc) => onToggleEntity(group, e, svc)}
              onSetMaster={(e) => onSetMaster(group, e)}
              onRemove={(e) => onRemoveEntity(group, e)}
            />
          ))
        )}

        {/* Add entity button */}
        <button
          onClick={() => onAddEntity(group)}
          className="mt-1 w-full flex items-center justify-center gap-2 py-2 rounded-xl border border-dashed border-stone-200 dark:border-stone-700 text-xs text-stone-400 hover:text-amber-500 hover:border-amber-300 dark:hover:border-amber-700 hover:bg-amber-50/50 dark:hover:bg-amber-900/10 transition-colors"
        >
          <Plus className="w-3.5 h-3.5" />
          Adaugă dispozitiv
        </button>
      </div>
    </Card>
  );
};

// ─── Main Page ──────────────────────────────────────────────────────────────

export const AutomatizariPage: React.FC = () => {
  const qc = useQueryClient();
  const [confirmState, setConfirmState] = useState<ConfirmState | null>(null);
  const [addGroupOpen, setAddGroupOpen] = useState(false);
  const [editGroup, setEditGroup] = useState<HassGroup | null>(null);
  const [addEntityGroup, setAddEntityGroup] = useState<HassGroup | null>(null);
  const [operating, setOperating] = useState<Set<string>>(new Set());

  // Groups from DB
  const { data: groups = [], isLoading, error } = useQuery<HassGroup[]>({
    queryKey: ['hass-groups'],
    queryFn: () => api.getHassGroups(),
    staleTime: 10_000,
  });

  // All entity_ids across all groups
  const allEntityIds = useMemo(
    () => groups.flatMap((g) => g.entities.map((e) => e.entity_id)),
    [groups],
  );

  // States from HA — poll every 15s
  const { data: states = {} } = useQuery<Record<string, EntityState>>({
    queryKey: ['hass-states', allEntityIds.join(',')],
    queryFn: () => api.getHassStates(allEntityIds),
    enabled: allEntityIds.length > 0,
    refetchInterval: 15_000,
    staleTime: 5_000,
  });

  const refetchAll = () => {
    qc.invalidateQueries({ queryKey: ['hass-groups'] });
    qc.invalidateQueries({ queryKey: ['hass-states'] });
  };

  // ── Service call helper ──────────────────────────────────────────────────
  const callService = async (entityId: string, service: 'turn_on' | 'turn_off') => {
    setOperating((s) => new Set(s).add(entityId));
    try {
      await api.callHassService(entityId, service);
      // Optimistically update state
      qc.setQueryData<Record<string, EntityState>>(
        ['hass-states', allEntityIds.join(',')],
        (prev) => ({
          ...(prev ?? {}),
          [entityId]: { state: service === 'turn_on' ? 'on' : 'off', last_updated: new Date().toISOString() },
        }),
      );
    } catch {
      toast.error(`Eroare la ${service === 'turn_on' ? 'pornire' : 'oprire'} ${entityId}`);
    } finally {
      setOperating((s) => { const n = new Set(s); n.delete(entityId); return n; });
    }
  };

  // ── Toggle entity with master logic ─────────────────────────────────────
  const handleToggleEntity = (group: HassGroup, entity: GroupEntity, service: 'turn_on' | 'turn_off') => {
    const master = group.entities.find((e) => e.is_master);
    const slaves = group.entities.filter((e) => !e.is_master);
    const masterState = master ? states[master.entity_id]?.state : null;

    // Slave ON but master is OFF → ask to turn on master first
    if (service === 'turn_on' && !entity.is_master && master && masterState === 'off') {
      setConfirmState({
        title: 'Master oprit',
        message: `"${master.friendly_name}" este oprit. Pornești masterul mai întâi și apoi dispozitivul?`,
        confirmLabel: 'Pornește master + dispozitiv',
        onConfirm: async () => {
          await callService(master.entity_id, 'turn_on');
          await sleep(group.interval_seconds * 1000);
          await callService(entity.entity_id, 'turn_on');
          setConfirmState(null);
        },
      });
      return;
    }

    // Master OFF but slaves are ON → ask to turn off slaves first
    if (service === 'turn_off' && entity.is_master) {
      const activeSlaves = slaves.filter((s) => states[s.entity_id]?.state === 'on');
      if (activeSlaves.length > 0) {
        setConfirmState({
          title: 'Dispozitive active',
          message: `Sunt ${activeSlaves.length} dispozitive active. Opresc mai întâi toate dispozitivele (${group.interval_seconds}s) și apoi masterul?`,
          confirmLabel: 'Oprește toate + master',
          onConfirm: async () => {
            for (const s of activeSlaves) {
              await callService(s.entity_id, 'turn_off');
            }
            await sleep(group.interval_seconds * 1000);
            await callService(entity.entity_id, 'turn_off');
            setConfirmState(null);
          },
        });
        return;
      }
    }

    callService(entity.entity_id, service);
  };

  // ── All ON ───────────────────────────────────────────────────────────────
  const handleAllOn = async (group: HassGroup) => {
    const master = group.entities.find((e) => e.is_master);
    const slaves = group.entities.filter((e) => !e.is_master);
    if (master) {
      await callService(master.entity_id, 'turn_on');
      await sleep(group.interval_seconds * 1000);
    }
    for (const s of slaves) {
      await callService(s.entity_id, 'turn_on');
    }
  };

  // ── All OFF ──────────────────────────────────────────────────────────────
  const handleAllOff = async (group: HassGroup) => {
    const master = group.entities.find((e) => e.is_master);
    const slaves = group.entities.filter((e) => !e.is_master);
    for (const s of slaves) {
      await callService(s.entity_id, 'turn_off');
    }
    if (master) {
      await sleep(group.interval_seconds * 1000);
      await callService(master.entity_id, 'turn_off');
    }
  };

  // ── Mutations ─────────────────────────────────────────────────────────────
  const createGroup = useMutation({
    mutationFn: (d: { name: string; interval_seconds: number }) => api.createHassGroup(d),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['hass-groups'] }); toast.success('Grup creat'); },
    onError: () => toast.error('Eroare la creare grup'),
  });

  const updateGroup = useMutation({
    mutationFn: ({ id, ...d }: { id: number; name: string; interval_seconds: number }) =>
      api.updateHassGroup(id, d),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['hass-groups'] }); toast.success('Grup actualizat'); },
    onError: () => toast.error('Eroare la actualizare'),
  });

  const deleteGroup = useMutation({
    mutationFn: (id: number) => api.deleteHassGroup(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['hass-groups'] }); toast.success('Grup șters'); },
    onError: () => toast.error('Eroare la ștergere'),
  });

  const addEntity = useMutation({
    mutationFn: ({ groupId, entity, isMaster }: { groupId: number; entity: HaEntity; isMaster: boolean }) =>
      api.addHassEntity(groupId, { entity_id: entity.entity_id, friendly_name: entity.friendly_name, is_master: isMaster }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['hass-groups'] }); toast.success('Dispozitiv adăugat'); },
    onError: () => toast.error('Eroare la adăugare'),
  });

  const setMaster = useMutation({
    mutationFn: ({ groupId, entityId }: { groupId: number; entityId: string }) =>
      api.updateHassEntity(groupId, entityId, { is_master: true }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['hass-groups'] }); },
    onError: () => toast.error('Eroare'),
  });

  const removeEntity = useMutation({
    mutationFn: ({ groupId, entityId }: { groupId: number; entityId: string }) =>
      api.removeHassEntity(groupId, entityId),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['hass-groups'] }); },
    onError: () => toast.error('Eroare la eliminare'),
  });

  const handleDeleteGroup = (group: HassGroup) => {
    setConfirmState({
      title: `Șterge "${group.name}"`,
      message: 'Grupul și toate dispozitivele asociate vor fi șterse.',
      confirmLabel: 'Șterge',
      onConfirm: async () => {
        await deleteGroup.mutateAsync(group.id);
        setConfirmState(null);
      },
    });
  };

  const hassError = error as any;

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-stone-900 dark:text-stone-100 flex items-center gap-2">
            <Zap className="w-6 h-6 text-amber-500" />
            Automatizări
          </h1>
          <p className="text-stone-500 text-sm mt-0.5">
            {groups.length > 0 ? `${groups.length} grupuri · Home Assistant` : 'Home Assistant'}
          </p>
        </div>
        <button
          onClick={() => setAddGroupOpen(true)}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 text-white font-medium text-sm transition-colors"
        >
          <Plus className="w-4 h-4" />
          Grup nou
        </button>
      </div>

      {/* HA config error */}
      {hassError && (
        <Card className="p-6 mb-4">
          <div className="flex items-start gap-3 text-amber-600 dark:text-amber-400">
            <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-medium">Home Assistant neconfigurat</p>
              <p className="text-sm mt-1 text-stone-500">
                Adaugă <code className="bg-stone-100 dark:bg-stone-800 px-1 rounded">hass_url</code> și{' '}
                <code className="bg-stone-100 dark:bg-stone-800 px-1 rounded">hass_token</code> în{' '}
                <a href="/settings" className="underline">Setări</a>.
              </p>
            </div>
          </div>
        </Card>
      )}

      {/* Loading */}
      {isLoading && (
        <div className="flex justify-center py-16">
          <Spinner size="lg" />
        </div>
      )}

      {/* Empty state */}
      {!isLoading && !hassError && groups.length === 0 && (
        <Card className="p-10 text-center">
          <Zap className="w-10 h-10 text-amber-300 mx-auto mb-3" />
          <p className="font-medium text-stone-700 dark:text-stone-300">Niciun grup definit</p>
          <p className="text-sm text-stone-400 mt-1">Creează primul grup și adaugă dispozitive din Home Assistant.</p>
          <button
            onClick={() => setAddGroupOpen(true)}
            className="mt-4 inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 text-white text-sm font-medium transition-colors"
          >
            <Plus className="w-4 h-4" />
            Grup nou
          </button>
        </Card>
      )}

      {/* Groups grid */}
      {!isLoading && groups.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {groups.map((group) => (
            <GroupCard
              key={group.id}
              group={group}
              states={states}
              operating={operating}
              onToggleEntity={handleToggleEntity}
              onSetMaster={(g, e) => setMaster.mutate({ groupId: g.id, entityId: e.entity_id })}
              onRemoveEntity={(g, e) =>
                setConfirmState({
                  title: `Elimină "${e.friendly_name}"`,
                  message: 'Dispozitivul va fi eliminat din grup.',
                  confirmLabel: 'Elimină',
                  onConfirm: async () => {
                    await removeEntity.mutateAsync({ groupId: g.id, entityId: e.entity_id });
                    setConfirmState(null);
                  },
                })
              }
              onAllOn={handleAllOn}
              onAllOff={handleAllOff}
              onDelete={handleDeleteGroup}
              onEdit={setEditGroup}
              onAddEntity={setAddEntityGroup}
            />
          ))}
        </div>
      )}

      {/* Modals */}
      {confirmState && (
        <ConfirmModal
          confirm={confirmState}
          onCancel={() => setConfirmState(null)}
        />
      )}

      {addGroupOpen && (
        <AddGroupModal
          onSave={(name, interval) => createGroup.mutateAsync({ name, interval_seconds: interval })}
          onClose={() => setAddGroupOpen(false)}
        />
      )}

      {editGroup && (
        <AddGroupModal
          initial={editGroup}
          onSave={(name, interval) =>
            updateGroup.mutateAsync({ id: editGroup.id, name, interval_seconds: interval })
          }
          onClose={() => setEditGroup(null)}
        />
      )}

      {addEntityGroup && (
        <AddEntityModal
          groupId={addEntityGroup.id}
          existingIds={new Set(addEntityGroup.entities.map((e) => e.entity_id))}
          onAdd={(entity, isMaster) =>
            addEntity.mutateAsync({ groupId: addEntityGroup.id, entity, isMaster })
          }
          onClose={() => setAddEntityGroup(null)}
        />
      )}
    </div>
  );
};
