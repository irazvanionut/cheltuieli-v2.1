import React, { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Lightbulb, Play, Loader2, AlertCircle, Search, RefreshCw } from 'lucide-react';
import { clsx } from 'clsx';
import { toast } from 'react-hot-toast';
import api from '@/services/api';
import { Spinner } from '@/components/ui';

interface HaScene {
  entity_id: string;
  friendly_name: string;
  group_name: string;
  state: string;
}

function extractGroup(entity_id: string, attributes: Record<string, any>): string {
  // Prefer area_id or explicit group attributes if available
  if (attributes?.area_id) return String(attributes.area_id).replace(/_/g, ' ');
  // Extract from entity_id: scene.zona_numele_scenei → "zona"
  const parts = entity_id.replace('scene.', '').split('_');
  // Return first word(s) as group hint (capitalize)
  return parts.length > 1
    ? parts[0].charAt(0).toUpperCase() + parts[0].slice(1)
    : '—';
}

export const ScenePage: React.FC = () => {
  const [activating, setActivating] = useState<Set<string>>(new Set());
  const [justActivated, setJustActivated] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState('');

  const { data: allEntities = [], isLoading, isError, refetch } = useQuery({
    queryKey: ['hass-all-entities-scene'],
    queryFn: () => api.getHassAllEntities(),
    staleTime: Infinity,
  });

  const scenes: HaScene[] = useMemo(() => {
    return allEntities
      .filter((e: any) => e.entity_id.startsWith('scene.'))
      .map((e: any) => ({
        entity_id: e.entity_id,
        friendly_name: e.friendly_name || e.entity_id,
        group_name: extractGroup(e.entity_id, e.attributes ?? {}),
        state: e.state,
      }))
      .sort((a, b) => a.group_name.localeCompare(b.group_name) || a.friendly_name.localeCompare(b.friendly_name));
  }, [allEntities]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    if (!q) return scenes;
    return scenes.filter(
      (s) =>
        s.friendly_name.toLowerCase().includes(q) ||
        s.group_name.toLowerCase().includes(q) ||
        s.entity_id.toLowerCase().includes(q),
    );
  }, [scenes, search]);

  // Group by group_name for display
  const grouped = useMemo(() => {
    const map: Record<string, HaScene[]> = {};
    filtered.forEach((s) => {
      if (!map[s.group_name]) map[s.group_name] = [];
      map[s.group_name].push(s);
    });
    return Object.entries(map).sort(([a], [b]) => a.localeCompare(b));
  }, [filtered]);

  const activateScene = async (scene: HaScene) => {
    if (activating.has(scene.entity_id)) return;
    setActivating((prev) => new Set(prev).add(scene.entity_id));
    try {
      await api.callHassService(scene.entity_id, 'turn_on');
      setJustActivated((prev) => new Set(prev).add(scene.entity_id));
      toast.success(`Scenă activată: ${scene.friendly_name}`);
      setTimeout(() => {
        setJustActivated((prev) => {
          const n = new Set(prev);
          n.delete(scene.entity_id);
          return n;
        });
      }, 3000);
    } catch {
      toast.error(`Eroare la activarea scenei "${scene.friendly_name}"`);
    } finally {
      setActivating((prev) => {
        const n = new Set(prev);
        n.delete(scene.entity_id);
        return n;
      });
    }
  };

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-stone-900 dark:text-stone-100 flex items-center gap-2">
            <Lightbulb className="w-6 h-6 text-amber-500" />
            Scene
          </h1>
          <p className="text-stone-500 text-sm mt-0.5">
            {scenes.length > 0 ? `${scenes.length} scene · Home Assistant` : 'Home Assistant'}
          </p>
        </div>
        <button
          onClick={() => refetch()}
          className="p-2 rounded-lg border border-stone-200 dark:border-stone-700 text-stone-500 hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors"
          title="Reîncarcă"
        >
          <RefreshCw className={clsx('w-4 h-4', isLoading && 'animate-spin')} />
        </button>
      </div>

      {/* Error */}
      {isError && (
        <div className="mb-4 p-4 rounded-xl bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-900/30 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-medium text-amber-800 dark:text-amber-200">Home Assistant neconfigurat</p>
            <p className="text-sm text-amber-600 dark:text-amber-400 mt-0.5">
              Adaugă <code className="bg-amber-100 dark:bg-amber-900/40 px-1 rounded">hass_url</code> și{' '}
              <code className="bg-amber-100 dark:bg-amber-900/40 px-1 rounded">hass_token</code> în Setări.
            </p>
          </div>
        </div>
      )}

      {/* Search */}
      {scenes.length > 0 && (
        <div className="relative mb-5">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Caută scenă…"
            className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-800/50 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/40"
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-600"
            >
              ×
            </button>
          )}
        </div>
      )}

      {/* Loading */}
      {isLoading && (
        <div className="flex justify-center py-16">
          <Spinner size="lg" />
        </div>
      )}

      {/* Empty */}
      {!isLoading && !isError && scenes.length === 0 && (
        <div className="text-center py-16">
          <Lightbulb className="w-12 h-12 text-stone-300 mx-auto mb-3" />
          <p className="text-stone-500 font-medium">Nicio scenă găsită</p>
          <p className="text-sm text-stone-400 mt-1">
            Nu există entități de tip <code className="bg-stone-100 dark:bg-stone-800 px-1 rounded">scene.*</code> în Home Assistant.
          </p>
        </div>
      )}

      {/* Grouped scenes */}
      {!isLoading && grouped.map(([groupName, groupScenes]) => (
        <div key={groupName} className="mb-6">
          <h2 className="text-xs font-semibold text-stone-400 uppercase tracking-wider mb-2 px-1">
            {groupName}
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
            {groupScenes.map((scene) => {
              const isActivating = activating.has(scene.entity_id);
              const wasActivated = justActivated.has(scene.entity_id);
              return (
                <button
                  key={scene.entity_id}
                  onClick={() => activateScene(scene)}
                  disabled={isActivating}
                  className={clsx(
                    'relative flex flex-col items-center justify-center gap-2 p-4 rounded-2xl border transition-all duration-200 text-center group',
                    wasActivated
                      ? 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800 shadow-emerald-100 dark:shadow-emerald-900/20 shadow-md'
                      : 'bg-white dark:bg-stone-900 border-stone-200 dark:border-stone-800 hover:border-amber-300 dark:hover:border-amber-700 hover:bg-amber-50/50 dark:hover:bg-amber-900/10 hover:shadow-md',
                    isActivating && 'opacity-70',
                  )}
                >
                  {/* Icon */}
                  <div className={clsx(
                    'w-10 h-10 rounded-xl flex items-center justify-center transition-colors',
                    wasActivated
                      ? 'bg-emerald-100 dark:bg-emerald-900/40'
                      : 'bg-amber-50 dark:bg-amber-900/20 group-hover:bg-amber-100 dark:group-hover:bg-amber-900/40',
                  )}>
                    {isActivating ? (
                      <Loader2 className="w-5 h-5 text-amber-500 animate-spin" />
                    ) : wasActivated ? (
                      <Lightbulb className="w-5 h-5 text-emerald-500 fill-emerald-200" />
                    ) : (
                      <Lightbulb className="w-5 h-5 text-amber-500" />
                    )}
                  </div>

                  {/* Name */}
                  <div>
                    <p className={clsx(
                      'text-xs font-semibold leading-tight',
                      wasActivated
                        ? 'text-emerald-700 dark:text-emerald-400'
                        : 'text-stone-800 dark:text-stone-200',
                    )}>
                      {scene.friendly_name}
                    </p>
                    <p className="text-[10px] text-stone-400 mt-0.5">{scene.group_name}</p>
                  </div>

                  {/* Activated flash */}
                  {wasActivated && (
                    <span className="absolute top-2 right-2 w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                  )}
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
};
