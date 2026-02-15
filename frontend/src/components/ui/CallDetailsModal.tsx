import React, { useState } from 'react';
import { clsx } from 'clsx';
import {
  X,
  Phone,
  Clock,
  ChevronDown,
  ChevronRight,
  Package,
  MapPin,
  MessageSquare,
  ThumbsUp,
  Lightbulb,
} from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { ro } from 'date-fns/locale';
import type { RecomandariConversation } from '@/types';

interface CallDetailsModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  conversations: RecomandariConversation[];
}

export const CallDetailsModal: React.FC<CallDetailsModalProps> = ({
  isOpen,
  onClose,
  title,
  conversations,
}) => {
  const [expandedCalls, setExpandedCalls] = useState<Set<number>>(new Set());

  if (!isOpen) return null;

  const toggleExpand = (index: number) => {
    const newExpanded = new Set(expandedCalls);
    if (newExpanded.has(index)) {
      newExpanded.delete(index);
    } else {
      newExpanded.add(index);
    }
    setExpandedCalls(newExpanded);
  };

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/50 backdrop-blur-sm z-40"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="bg-white dark:bg-stone-900 rounded-xl border border-stone-200 dark:border-stone-700 shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col">
          {/* Header */}
          <div className="flex items-center justify-between p-6 border-b border-stone-200 dark:border-stone-800">
            <div>
              <h2 className="text-xl font-bold text-stone-900 dark:text-stone-100">
                {title}
              </h2>
              <p className="text-sm text-stone-500 dark:text-stone-400 mt-1">
                {conversations.length} {conversations.length === 1 ? 'apel' : 'apeluri'}
              </p>
            </div>
            <button
              onClick={onClose}
              className="p-2 rounded-lg hover:bg-stone-100 dark:hover:bg-stone-800 text-stone-500 dark:text-stone-400 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Content */}
          <div className="overflow-y-auto flex-1 p-6">
            <div className="space-y-3">
              {conversations.map((conv) => {
                const isExpanded = expandedCalls.has(conv.conversation_index);
                // Combine data and ora to create a date object
                const dateTimeStr = `${conv.data}T${conv.ora}:00`;
                const timestamp = parseISO(dateTimeStr);

                return (
                  <div
                    key={conv.conversation_index}
                    className="bg-stone-50 dark:bg-stone-800/50 rounded-lg border border-stone-200 dark:border-stone-700 overflow-hidden"
                  >
                    {/* Call summary - always visible */}
                    <div className="p-4">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1 space-y-2">
                          {/* Phone & Time */}
                          <div className="flex items-center gap-4 flex-wrap">
                            <div className="flex items-center gap-2">
                              <Phone className="w-4 h-4 text-blue-500" />
                              <span className="text-sm font-mono font-semibold text-stone-900 dark:text-stone-100">
                                {conv.telefon}
                              </span>
                            </div>
                            <div className="flex items-center gap-2">
                              <Clock className="w-4 h-4 text-stone-400" />
                              <span className="text-sm text-stone-600 dark:text-stone-400">
                                {format(timestamp, 'dd MMM yyyy, HH:mm', { locale: ro })}
                              </span>
                            </div>
                            <span className="px-2 py-0.5 rounded text-xs font-medium bg-stone-200 dark:bg-stone-700 text-stone-700 dark:text-stone-300 capitalize">
                              {conv.tip}
                            </span>
                          </div>
                        </div>

                        {/* Expand button */}
                        <button
                          onClick={() => toggleExpand(conv.conversation_index)}
                          className="p-1.5 rounded-lg hover:bg-stone-200 dark:hover:bg-stone-700 text-stone-600 dark:text-stone-400 transition-colors shrink-0"
                        >
                          {isExpanded ? (
                            <ChevronDown className="w-5 h-5" />
                          ) : (
                            <ChevronRight className="w-5 h-5" />
                          )}
                        </button>
                      </div>
                    </div>

                    {/* Expanded details */}
                    {isExpanded && (
                      <div className="border-t border-stone-200 dark:border-stone-700 p-4 space-y-4 bg-white dark:bg-stone-900">
                        {/* Transcript */}
                        <div>
                          <div className="flex items-center gap-2 mb-2">
                            <MessageSquare className="w-4 h-4 text-amber-500" />
                            <h4 className="text-sm font-semibold text-stone-900 dark:text-stone-100">
                              Transcript
                            </h4>
                          </div>
                          <p className="text-sm text-stone-600 dark:text-stone-400 leading-relaxed whitespace-pre-wrap">
                            {conv.transcript}
                          </p>
                        </div>

                        {/* Analysis sections */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2 border-t border-stone-200 dark:border-stone-700">
                          {/* Products */}
                          {conv.analysis.produse_comandate?.length > 0 && (
                            <div>
                              <div className="flex items-center gap-2 mb-2">
                                <Package className="w-4 h-4 text-blue-500" />
                                <h4 className="text-sm font-semibold text-stone-900 dark:text-stone-100">
                                  Produse
                                </h4>
                              </div>
                              <ul className="space-y-1">
                                {conv.analysis.produse_comandate.map((p, i) => (
                                  <li
                                    key={i}
                                    className="text-sm text-stone-600 dark:text-stone-400"
                                  >
                                    {p.cantitate}x {p.produs}
                                    {p.note && (
                                      <span className="text-xs text-stone-500"> ({p.note})</span>
                                    )}
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}

                          {/* Address */}
                          {conv.analysis.adresa_livrare && (
                            <div>
                              <div className="flex items-center gap-2 mb-2">
                                <MapPin className="w-4 h-4 text-rose-500" />
                                <h4 className="text-sm font-semibold text-stone-900 dark:text-stone-100">
                                  Adresa
                                </h4>
                              </div>
                              <p className="text-sm text-stone-600 dark:text-stone-400">
                                {conv.analysis.adresa_livrare}
                              </p>
                            </div>
                          )}

                          {/* Recommendations */}
                          {conv.analysis.recomandari_training?.length > 0 && (
                            <div>
                              <div className="flex items-center gap-2 mb-2">
                                <Lightbulb className="w-4 h-4 text-amber-500" />
                                <h4 className="text-sm font-semibold text-stone-900 dark:text-stone-100">
                                  Recomandări
                                </h4>
                              </div>
                              <ul className="space-y-1">
                                {conv.analysis.recomandari_training.map((r, i) => (
                                  <li
                                    key={i}
                                    className="text-sm text-stone-600 dark:text-stone-400"
                                  >
                                    • {r}
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}

                          {/* Behavior */}
                          {conv.analysis.comportament_vanzator && (
                            <div>
                              <div className="flex items-center gap-2 mb-2">
                                <ThumbsUp className="w-4 h-4 text-emerald-500" />
                                <h4 className="text-sm font-semibold text-stone-900 dark:text-stone-100">
                                  Comportament
                                </h4>
                              </div>
                              <p className="text-sm text-stone-600 dark:text-stone-400">
                                {conv.analysis.comportament_vanzator}
                              </p>
                            </div>
                          )}
                        </div>

                        {/* Additional info */}
                        {(conv.analysis.pret_final || conv.analysis.timp_estimat_livrare) && (
                          <div className="pt-2 border-t border-stone-200 dark:border-stone-700 flex items-center gap-4 text-sm">
                            {conv.analysis.pret_final && (
                              <span className="text-stone-600 dark:text-stone-400">
                                Preț: <strong className="text-stone-900 dark:text-stone-100">{conv.analysis.pret_final} lei</strong>
                              </span>
                            )}
                            {conv.analysis.timp_estimat_livrare && (
                              <span className="text-stone-600 dark:text-stone-400">
                                Timp livrare: <strong className="text-stone-900 dark:text-stone-100">{conv.analysis.timp_estimat_livrare}</strong>
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </>
  );
};
