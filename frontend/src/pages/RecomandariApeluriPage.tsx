import React, { useState, useMemo, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { clsx } from 'clsx';
import {
  Lightbulb,
  ThumbsUp,
  Package,
  MapPin,
  MessageSquare,
  Loader2,
  Phone,
} from 'lucide-react';
import api from '@/services/api';
import type { RecomandariApeluri, RecomandariConversation } from '@/types';
import { DatePickerCalendar } from '@/components/ui/DatePickerCalendar';
import { CallDetailsModal } from '@/components/ui/CallDetailsModal';

type Tab = 'sumar' | 'produse' | 'adrese';

export const RecomandariApeluriPage: React.FC = () => {
  const [selectedDate, setSelectedDate] = useState<string>('');
  const [selectedAiModel, setSelectedAiModel] = useState<'Claude' | 'Ollama' | 'Any'>('Any');
  const [activeTab, setActiveTab] = useState<Tab>('sumar');
  const [isInitialLoad, setIsInitialLoad] = useState<boolean>(true);
  const [modalState, setModalState] = useState<{
    isOpen: boolean;
    title: string;
    conversations: RecomandariConversation[];
  }>({
    isOpen: false,
    title: '',
    conversations: [],
  });

  // Fetch all available dates (regardless of model)
  const { data: zileDisponibile = [] } = useQuery({
    queryKey: ['recomandari-zile-all'],
    queryFn: () => api.getRecomandariZileDisponibile(undefined), // Get all dates
  });

  // Fetch dates for Claude specifically
  const { data: zileClaudeDisponibile = [] } = useQuery({
    queryKey: ['recomandari-zile-claude'],
    queryFn: () => api.getRecomandariZileDisponibile('Claude'),
  });

  // Fetch dates for Ollama specifically
  const { data: zileOllamaDisponibile = [] } = useQuery({
    queryKey: ['recomandari-zile-ollama'],
    queryFn: () => api.getRecomandariZileDisponibile('Ollama'),
  });

  // Auto-select on initial load: newest date + appropriate model
  useEffect(() => {
    if (isInitialLoad && zileDisponibile.length > 0) {
      const newestDate = zileDisponibile[0]; // First is newest (desc order)
      setSelectedDate(newestDate);

      // Check which models have data for this date
      const hasClaudeData = zileClaudeDisponibile.includes(newestDate);
      const hasOllamaData = zileOllamaDisponibile.includes(newestDate);

      if (hasClaudeData) {
        setSelectedAiModel('Claude'); // Prefer Claude
      } else if (hasOllamaData) {
        setSelectedAiModel('Ollama');
      } else {
        setSelectedAiModel('Any'); // Fallback
      }

      setIsInitialLoad(false);
    }
  }, [zileDisponibile.length, zileClaudeDisponibile.length, zileOllamaDisponibile.length, isInitialLoad]);

  // When date changes manually, auto-select appropriate model
  useEffect(() => {
    if (!isInitialLoad && selectedDate) {
      const hasClaudeData = zileClaudeDisponibile.includes(selectedDate);
      const hasOllamaData = zileOllamaDisponibile.includes(selectedDate);

      // If both models have data, prefer Claude
      if (hasClaudeData && hasOllamaData) {
        setSelectedAiModel('Claude');
      } else if (hasClaudeData) {
        setSelectedAiModel('Claude');
      } else if (hasOllamaData) {
        setSelectedAiModel('Ollama');
      }
      // Otherwise keep current selection
    }
  }, [selectedDate, isInitialLoad]);

  // Calendar ALWAYS shows all dates, regardless of selected model
  const calendarDates = zileDisponibile;

  const { data, isLoading } = useQuery<RecomandariApeluri>({
    queryKey: ['recomandari-apeluri', selectedDate, selectedAiModel],
    queryFn: () => api.getRecomandariApeluri(selectedDate, selectedAiModel === 'Any' ? undefined : selectedAiModel),
    enabled: !!selectedDate,
  });

  // Aggregate products from conversations
  const produse = useMemo(() => {
    if (!data?.conversations?.length) return [];
    const map = new Map<string, { cantitate: number; comenzi: number }>();
    for (const conv of data.conversations) {
      const produse = conv.analysis?.produse_comandate || [];
      const seen = new Set<string>();
      for (const p of produse) {
        if (!p.produs) continue;
        const key = p.produs;
        const existing = map.get(key) || { cantitate: 0, comenzi: 0 };
        existing.cantitate += p.cantitate || 0;
        if (!seen.has(key)) {
          existing.comenzi += 1;
          seen.add(key);
        }
        map.set(key, existing);
      }
    }
    return Array.from(map.entries())
      .map(([produs, stats]) => ({ produs, ...stats }))
      .sort((a, b) => b.cantitate - a.cantitate);
  }, [data?.conversations]);

  // Aggregate addresses from conversations
  const adrese = useMemo(() => {
    if (!data?.conversations?.length) return [];
    const map = new Map<string, { comenzi: number; valoare: number }>();
    for (const conv of data.conversations) {
      const addr = conv.analysis?.adresa_livrare;
      if (!addr) continue;
      const existing = map.get(addr) || { comenzi: 0, valoare: 0 };
      existing.comenzi += 1;
      existing.valoare += conv.analysis?.pret_final || 0;
      map.set(addr, existing);
    }
    return Array.from(map.entries())
      .map(([adresa, stats]) => ({ adresa, ...stats }))
      .sort((a, b) => b.comenzi - a.comenzi);
  }, [data?.conversations]);

  // Filter handlers
  const handleFilterByTipApel = (tip: string, count: number) => {
    if (!data?.conversations) return;
    const filtered = data.conversations.filter((c) => c.tip === tip);
    console.log('handleFilterByTipApel - Full data:', data);
    console.log('handleFilterByTipApel - Filtered conversations:', filtered);
    console.log('handleFilterByTipApel - First conversation:', filtered[0]);
    setModalState({
      isOpen: true,
      title: `${tip} (${count} apeluri)`,
      conversations: filtered,
    });
  };

  const handleFilterByRecomandare = (recomandare: string, count: number) => {
    if (!data?.conversations) return;
    const filtered = data.conversations.filter((c) =>
      c.analysis?.recomandari_training?.includes(recomandare)
    );
    setModalState({
      isOpen: true,
      title: `Recomandare: ${recomandare}`,
      conversations: filtered,
    });
  };

  const handleFilterByLucruBun = (comportament: string, count: number) => {
    if (!data?.conversations) return;
    const filtered = data.conversations.filter((c) =>
      c.analysis?.comportament_vanzator?.includes(comportament)
    );
    setModalState({
      isOpen: true,
      title: `Comportament bun: ${comportament}`,
      conversations: filtered,
    });
  };

  const handleCloseModal = () => {
    setModalState({ isOpen: false, title: '', conversations: [] });
  };

  const tabs: { key: Tab; label: string; icon: React.ElementType }[] = [
    { key: 'sumar', label: 'Sumar', icon: MessageSquare },
    { key: 'produse', label: 'Produse', icon: Package },
    { key: 'adrese', label: 'Adrese', icon: MapPin },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-stone-900 dark:text-stone-100">
            Recomandari Apeluri
          </h1>
          <p className="text-sm text-stone-500 dark:text-stone-400 mt-1">
            Insights din conversatiile telefonice
          </p>
        </div>

        {/* Date and AI Model selectors */}
        <div className="flex items-center gap-3">
          {/* AI Model Dropdown */}
          <select
            value={selectedAiModel}
            onChange={(e) => {
              setSelectedAiModel(e.target.value as 'Claude' | 'Ollama' | 'Any');
              // Keep the same date selected, don't reset it
            }}
            className="px-3 py-2 rounded-lg border border-stone-300 dark:border-stone-600 bg-white dark:bg-stone-800 text-sm text-stone-900 dark:text-stone-100 font-medium"
          >
            <option value="Any">Any</option>
            <option value="Claude">Claude</option>
            <option value="Ollama">Ollama</option>
          </select>

          {/* Date Picker Calendar */}
          <DatePickerCalendar
            selectedDate={selectedDate}
            availableDates={calendarDates}
            onSelectDate={setSelectedDate}
          />
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-stone-100 dark:bg-stone-800 rounded-lg p-1">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={clsx(
              'flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors',
              activeTab === tab.key
                ? 'bg-white dark:bg-stone-700 text-stone-900 dark:text-stone-100 shadow-sm'
                : 'text-stone-500 dark:text-stone-400 hover:text-stone-700 dark:hover:text-stone-300'
            )}
          >
            <tab.icon className="w-4 h-4" />
            {tab.label}
          </button>
        ))}
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-8 h-8 animate-spin text-stone-400" />
        </div>
      ) : !data || data.total_conversatii === 0 ? (
        <div className="text-center py-20 text-stone-400">
          <Lightbulb className="w-12 h-12 mx-auto mb-3 opacity-50" />
          <p>Nu exista date pentru aceasta zi</p>
        </div>
      ) : (
        <>
          {activeTab === 'sumar' && (
            <SumarTab
              data={data}
              onFilterByTipApel={handleFilterByTipApel}
              onFilterByRecomandare={handleFilterByRecomandare}
              onFilterByLucruBun={handleFilterByLucruBun}
            />
          )}
          {activeTab === 'produse' && <ProduseTab produse={produse} />}
          {activeTab === 'adrese' && <AdreseTab adrese={adrese} />}
        </>
      )}

      {/* Call Details Modal */}
      <CallDetailsModal
        isOpen={modalState.isOpen}
        onClose={handleCloseModal}
        title={modalState.title}
        conversations={modalState.conversations}
      />
    </div>
  );
};

// ============================================
// SUMAR TAB
// ============================================

interface SumarTabProps {
  data: RecomandariApeluri;
  onFilterByTipApel: (tip: string, count: number) => void;
  onFilterByRecomandare: (recomandare: string, count: number) => void;
  onFilterByLucruBun: (comportament: string, count: number) => void;
}

const SumarTab: React.FC<SumarTabProps> = ({
  data,
  onFilterByTipApel,
  onFilterByRecomandare,
  onFilterByLucruBun,
}) => (
  <div className="space-y-6">
    {/* Total card + tip apeluri */}
    <div className="bg-white dark:bg-stone-900 rounded-xl border border-stone-200 dark:border-stone-800 p-6">
      <div className="flex items-center gap-6 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
            <MessageSquare className="w-6 h-6 text-amber-600 dark:text-amber-400" />
          </div>
          <div>
            <p className="text-sm text-stone-500 dark:text-stone-400">Total Conversatii</p>
            <p className="text-3xl font-bold text-stone-900 dark:text-stone-100">
              {data.total_conversatii}
            </p>
          </div>
        </div>

        {data.tip_apeluri && Object.keys(data.tip_apeluri).length > 0 && (
          <div className="flex items-center gap-2 flex-wrap">
            {Object.entries(data.tip_apeluri)
              .sort(([, a], [, b]) => (b as number) - (a as number))
              .map(([tip, count]) => (
                <button
                  key={tip}
                  onClick={() => onFilterByTipApel(tip, count as number)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-stone-100 dark:bg-stone-800 hover:bg-stone-200 dark:hover:bg-stone-700 transition-colors cursor-pointer"
                >
                  <Phone className="w-3.5 h-3.5 text-stone-400" />
                  <span className="text-sm text-stone-600 dark:text-stone-300 capitalize">{tip}</span>
                  <span className="text-sm font-semibold text-stone-900 dark:text-stone-100">{count as number}</span>
                </button>
              ))}
          </div>
        )}
      </div>
    </div>

    {/* Top Recomandari */}
    {data.top_recomandari?.length > 0 && (
      <div className="bg-white dark:bg-stone-900 rounded-xl border border-stone-200 dark:border-stone-800 p-6">
        <div className="flex items-center gap-2 mb-4">
          <Lightbulb className="w-5 h-5 text-amber-500" />
          <h2 className="text-lg font-semibold text-stone-900 dark:text-stone-100">
            Top Recomandari Training
          </h2>
        </div>
        <div className="space-y-3">
          {data.top_recomandari.map((item, i) => (
            <button
              key={i}
              onClick={() => onFilterByRecomandare(item.recomandare, item.frecventa)}
              className="w-full flex items-start gap-3 p-3 rounded-lg bg-stone-50 dark:bg-stone-800/50 hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors cursor-pointer text-left"
            >
              <span className="flex-1 text-sm text-stone-700 dark:text-stone-300">
                {item.recomandare}
              </span>
              <span className="shrink-0 px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400">
                {item.frecventa}x
              </span>
            </button>
          ))}
        </div>
      </div>
    )}

    {/* Top Lucruri Bune */}
    {data.top_lucruri_bune?.length > 0 && (
      <div className="bg-white dark:bg-stone-900 rounded-xl border border-stone-200 dark:border-stone-800 p-6">
        <div className="flex items-center gap-2 mb-4">
          <ThumbsUp className="w-5 h-5 text-emerald-500" />
          <h2 className="text-lg font-semibold text-stone-900 dark:text-stone-100">
            Top Lucruri Bune
          </h2>
        </div>
        <div className="space-y-3">
          {data.top_lucruri_bune.map((item, i) => (
            <button
              key={i}
              onClick={() => onFilterByLucruBun(item.comportament, item.frecventa)}
              className="w-full flex items-start gap-3 p-3 rounded-lg bg-stone-50 dark:bg-stone-800/50 hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors cursor-pointer text-left"
            >
              <span className="flex-1 text-sm text-stone-700 dark:text-stone-300">
                {item.comportament}
              </span>
              <span className="shrink-0 px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400">
                {item.frecventa}x
              </span>
            </button>
          ))}
        </div>
      </div>
    )}
  </div>
);

// ============================================
// PRODUSE TAB
// ============================================

const ProduseTab: React.FC<{
  produse: { produs: string; cantitate: number; comenzi: number }[];
}> = ({ produse }) => (
  <div className="bg-white dark:bg-stone-900 rounded-xl border border-stone-200 dark:border-stone-800 overflow-hidden">
    <div className="p-4 border-b border-stone-200 dark:border-stone-800">
      <div className="flex items-center gap-2">
        <Package className="w-5 h-5 text-blue-500" />
        <h2 className="text-lg font-semibold text-stone-900 dark:text-stone-100">
          Produse Comandate
        </h2>
        <span className="text-sm text-stone-400">({produse.length})</span>
      </div>
    </div>
    {produse.length === 0 ? (
      <div className="p-8 text-center text-stone-400 text-sm">Nicio comanda</div>
    ) : (
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="bg-stone-50 dark:bg-stone-800/50 text-left text-xs font-medium text-stone-500 dark:text-stone-400 uppercase tracking-wider">
              <th className="px-4 py-3">Produs</th>
              <th className="px-4 py-3 text-right">Total Cantitate</th>
              <th className="px-4 py-3 text-right">Nr. Comenzi</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-200 dark:divide-stone-800">
            {produse.map((p, i) => (
              <tr key={i} className="hover:bg-stone-50 dark:hover:bg-stone-800/30">
                <td className="px-4 py-3 text-sm text-stone-900 dark:text-stone-100 font-medium">
                  {p.produs}
                </td>
                <td className="px-4 py-3 text-sm text-stone-600 dark:text-stone-400 text-right font-mono">
                  {p.cantitate}
                </td>
                <td className="px-4 py-3 text-sm text-stone-600 dark:text-stone-400 text-right font-mono">
                  {p.comenzi}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )}
  </div>
);

// ============================================
// ADRESE TAB
// ============================================

const AdreseTab: React.FC<{
  adrese: { adresa: string; comenzi: number; valoare: number }[];
}> = ({ adrese }) => (
  <div className="bg-white dark:bg-stone-900 rounded-xl border border-stone-200 dark:border-stone-800 overflow-hidden">
    <div className="p-4 border-b border-stone-200 dark:border-stone-800">
      <div className="flex items-center gap-2">
        <MapPin className="w-5 h-5 text-rose-500" />
        <h2 className="text-lg font-semibold text-stone-900 dark:text-stone-100">
          Adrese Livrare
        </h2>
        <span className="text-sm text-stone-400">({adrese.length})</span>
      </div>
    </div>
    {adrese.length === 0 ? (
      <div className="p-8 text-center text-stone-400 text-sm">Nicio adresa</div>
    ) : (
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="bg-stone-50 dark:bg-stone-800/50 text-left text-xs font-medium text-stone-500 dark:text-stone-400 uppercase tracking-wider">
              <th className="px-4 py-3">Adresa</th>
              <th className="px-4 py-3 text-right">Nr. Comenzi</th>
              <th className="px-4 py-3 text-right">Total Valoare</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-200 dark:divide-stone-800">
            {adrese.map((a, i) => (
              <tr key={i} className="hover:bg-stone-50 dark:hover:bg-stone-800/30">
                <td className="px-4 py-3 text-sm text-stone-900 dark:text-stone-100 font-medium">
                  {a.adresa}
                </td>
                <td className="px-4 py-3 text-sm text-stone-600 dark:text-stone-400 text-right font-mono">
                  {a.comenzi}
                </td>
                <td className="px-4 py-3 text-sm text-stone-600 dark:text-stone-400 text-right font-mono">
                  {a.valoare > 0 ? `${a.valoare} lei` : '-'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )}
  </div>
);
