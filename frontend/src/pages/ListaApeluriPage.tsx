import React, { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  PhoneIncoming,
  PhoneOff,
  PhoneMissed,
  Phone,
  RefreshCw,
  Search,
  Radio,
  Copy,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  Activity,
  MessageSquare,
  X,
  Send,
  CheckCircle2,
  XCircle,
} from 'lucide-react';
import { clsx } from 'clsx';
import { format, parseISO } from 'date-fns';
import { ro } from 'date-fns/locale';
import { toast } from 'react-hot-toast';

import api from '@/services/api';
import { useAppStore } from '@/hooks/useAppStore';
import { Card, Spinner, Button } from '@/components/ui';

// ── WhatsApp SVG icon ──────────────────────────────────────────────────────
const WhatsAppIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg viewBox="0 0 24 24" className={className} fill="currentColor">
    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
  </svg>
);

// ── Helpers ────────────────────────────────────────────────────────────────
const STATUS_CONFIG: Record<string, {
  label: string;
  icon: React.ElementType;
  bg: string;
  text: string;
}> = {
  COMPLETAT: {
    label: 'Completat',
    icon: PhoneIncoming,
    bg: 'bg-emerald-100 dark:bg-emerald-900/30',
    text: 'text-emerald-700 dark:text-emerald-400',
  },
  ABANDONAT: {
    label: 'Abandonat',
    icon: PhoneOff,
    bg: 'bg-red-100 dark:bg-red-900/30',
    text: 'text-red-700 dark:text-red-400',
  },
  NEPRELUATE: {
    label: 'Nepreluate',
    icon: PhoneMissed,
    bg: 'bg-amber-100 dark:bg-amber-900/30',
    text: 'text-amber-700 dark:text-amber-400',
  },
  IN_CURS: {
    label: 'In curs',
    icon: Phone,
    bg: 'bg-blue-100 dark:bg-blue-900/30',
    text: 'text-blue-700 dark:text-blue-400',
  },
};

const formatDur = (s: number): string => {
  if (!s || s <= 0) return '0s';
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return m > 0 ? `${m}m ${sec.toString().padStart(2, '0')}s` : `${sec}s`;
};

const todayStr = () => new Date().toISOString().slice(0, 10);

/** Convert Romanian phone to international format for wa.me links.
 *  07xxxxxxxx → 407xxxxxxxx | +4xxx → 4xxx | others unchanged */
const toWaNum = (raw: string): string => {
  const digits = raw.replace(/\D/g, '');
  if (digits.startsWith('0')) return '4' + digits.slice(1);
  if (digits.startsWith('40')) return digits;
  return digits;
};

// ── Live timer hook ────────────────────────────────────────────────────────
const useLiveSeconds = (initialSeconds: number): number => {
  const [secs, setSecs] = useState(initialSeconds);
  useEffect(() => {
    setSecs(initialSeconds); // reset if call changes
    const id = setInterval(() => setSecs(s => s + 1), 1000);
    return () => clearInterval(id);
  }, [initialSeconds]);
  return secs;
};

// ── SMS segment counter ────────────────────────────────────────────────────
/** Shows char count + how many SMS parts the message will occupy.
 *  Single SMS: 160 GSM7 chars. Multi-part: 153 chars/segment. */
const SmsCounter: React.FC<{ text: string }> = ({ text }) => {
  const len = text.length;
  if (len === 0) return <p className="text-right text-[10px] text-stone-400 mt-1">0 caractere</p>;
  const segments = len <= 160 ? 1 : Math.ceil(len / 153);
  return (
    <p className="text-right text-[10px] mt-1 tabular-nums">
      <span className={len > 160 ? 'text-amber-500' : 'text-stone-400'}>
        {len} {len === 1 ? 'caracter' : 'caractere'}
      </span>
      <span className="text-stone-300 dark:text-stone-600 mx-1">·</span>
      <span className={segments > 1 ? 'text-amber-500 font-semibold' : 'text-stone-400'}>
        {segments} {segments === 1 ? 'SMS' : `SMS (${segments} parts)`}
      </span>
    </p>
  );
};

// ── SMS Modal ──────────────────────────────────────────────────────────────
interface SmsModalProps {
  phone: string;
  onClose: () => void;
}

const SmsModal: React.FC<SmsModalProps> = ({ phone, onClose }) => {
  const [editPhone, setEditPhone] = useState(phone);
  const [message, setMessage] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Load predefined templates
  const { data: templates = [] } = useQuery({
    queryKey: ['sms-templates'],
    queryFn: () => api.getSmsTemplates(),
    staleTime: 60000,
  });

  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  // Close on Escape
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  /** Apply template — substitute {numar} with the actual phone number */
  const applyTemplate = (corp: string) => {
    setMessage(corp.replace(/\{numar\}/g, editPhone));
    textareaRef.current?.focus();
  };

  const queryClient = useQueryClient();
  const sendMutation = useMutation({
    mutationFn: () => api.sendSms(editPhone, message),
    onSuccess: (res) => {
      if (res.ok) {
        toast.success(`SMS trimis la ${editPhone}`);
        queryClient.invalidateQueries({ queryKey: ['sms-log'] });
        onClose();
      } else {
        toast.error(`Eroare gateway: ${res.error || 'necunoscut'}`);
      }
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.detail || 'Eroare la trimitere SMS');
    },
  });

  const canSend = editPhone.trim().length > 4 && message.trim().length > 0;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-white dark:bg-stone-900 rounded-2xl shadow-2xl border border-stone-200 dark:border-stone-700 w-full max-w-md">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-stone-100 dark:border-stone-800">
          <div className="flex items-center gap-2">
            <MessageSquare className="w-5 h-5 text-blue-500" />
            <span className="font-semibold text-stone-900 dark:text-stone-100">Trimite SMS</span>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-stone-400 hover:text-stone-600 dark:hover:text-stone-200 hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="px-5 py-4 space-y-4">
          {/* Phone field */}
          <div>
            <label className="block text-xs font-medium text-stone-500 dark:text-stone-400 mb-1.5 uppercase tracking-wide">
              Număr destinatar
            </label>
            <input
              type="tel"
              value={editPhone}
              onChange={(e) => setEditPhone(e.target.value)}
              className="w-full px-3 py-2 text-sm font-mono border border-stone-200 dark:border-stone-600 rounded-xl bg-white dark:bg-stone-800 text-stone-900 dark:text-stone-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="07xxxxxxxxx"
            />
          </div>

          {/* Predefined templates */}
          {templates.length > 0 && (
            <div>
              <label className="block text-xs font-medium text-stone-500 dark:text-stone-400 mb-2 uppercase tracking-wide">
                Template predefinit
              </label>
              <div className="flex flex-wrap gap-2">
                {templates.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => applyTemplate(t.corp)}
                    className={clsx(
                      'px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors',
                      message === t.corp.replace(/\{numar\}/g, editPhone)
                        ? 'bg-blue-600 border-blue-600 text-white'
                        : 'bg-white dark:bg-stone-800 border-stone-200 dark:border-stone-600 text-stone-700 dark:text-stone-300 hover:border-blue-400 hover:text-blue-600 dark:hover:border-blue-500 dark:hover:text-blue-400',
                    )}
                    title={t.corp}
                  >
                    {t.titlu}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Message field */}
          <div>
            <label className="block text-xs font-medium text-stone-500 dark:text-stone-400 mb-1.5 uppercase tracking-wide">
              Mesaj
            </label>
            <textarea
              ref={textareaRef}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={4}
              className="w-full px-3 py-2 text-sm border border-stone-200 dark:border-stone-600 rounded-xl bg-white dark:bg-stone-800 text-stone-900 dark:text-stone-100 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
              placeholder="Scrie mesajul SMS sau alege un template de mai sus..."
            />
            <SmsCounter text={message} />
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-stone-100 dark:border-stone-800 flex gap-2 justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm rounded-xl border border-stone-200 dark:border-stone-600 text-stone-600 dark:text-stone-300 hover:bg-stone-50 dark:hover:bg-stone-800 transition-colors"
          >
            Anulează
          </button>
          <button
            onClick={() => sendMutation.mutate()}
            disabled={!canSend || sendMutation.isPending}
            className={clsx(
              'flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-xl transition-colors',
              canSend && !sendMutation.isPending
                ? 'bg-blue-600 hover:bg-blue-700 text-white'
                : 'bg-stone-100 dark:bg-stone-800 text-stone-400 cursor-not-allowed',
            )}
          >
            {sendMutation.isPending ? (
              <><Spinner size="sm" />Trimite...</>
            ) : (
              <><Send className="w-4 h-4" />Trimite SMS</>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

// ── ActiveCallCard ─────────────────────────────────────────────────────────
interface ActiveCallCardProps {
  call: {
    caller_id: string;
    agent: string;
    queue: string;
    status: string; // IN_QUEUE | IN_CURS
    seconds: number;
    bridged: boolean;
  };
  copied: string | null;
  onCopy: (n: string) => void;
  onSms?: (n: string) => void;
}

const ActiveCallCard: React.FC<ActiveCallCardProps> = ({ call, copied, onCopy, onSms }) => {
  const elapsed = useLiveSeconds(call.seconds);
  const inQueue = !call.bridged; // IN_QUEUE = waiting, IN_CURS = bridged/talking
  const waNum = call.caller_id ? toWaNum(call.caller_id) : '';
  const isCopied = copied === call.caller_id;

  return (
    <div className={clsx(
      'rounded-2xl border-2 p-5 flex flex-col gap-4 shadow-md min-w-[260px] max-w-xs w-full',
      inQueue
        ? 'bg-amber-50 dark:bg-amber-950/20 border-amber-300 dark:border-amber-700/60'
        : 'bg-emerald-50 dark:bg-emerald-950/20 border-emerald-300 dark:border-emerald-700/60',
    )}>
      {/* Top row: status + elapsed */}
      <div className="flex items-center justify-between gap-2">
        <span className={clsx(
          'inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider px-2.5 py-1 rounded-full',
          inQueue
            ? 'bg-amber-200 dark:bg-amber-800/50 text-amber-800 dark:text-amber-200'
            : 'bg-emerald-200 dark:bg-emerald-800/50 text-emerald-800 dark:text-emerald-200',
        )}>
          <span className={clsx(
            'w-2 h-2 rounded-full animate-pulse',
            inQueue ? 'bg-amber-500' : 'bg-emerald-500',
          )} />
          {inQueue ? 'Coadă' : 'În curs'}
        </span>
        <span className="font-mono text-sm font-semibold text-stone-500 dark:text-stone-400 flex items-center gap-1">
          <Clock className="w-3.5 h-3.5 opacity-60" />
          {formatDur(elapsed)}
        </span>
      </div>

      {/* Phone number — large & prominent */}
      <div>
        <p className="text-[10px] uppercase tracking-widest text-stone-400 dark:text-stone-500 mb-1">
          Număr apelant
        </p>
        <span className="text-3xl font-mono font-bold tracking-tight text-stone-900 dark:text-stone-50 leading-none break-all">
          {call.caller_id || '—'}
        </span>
      </div>

      {/* Agent info */}
      {call.agent ? (
        <p className="text-sm text-stone-500 dark:text-stone-400 -mt-1">
          Agent:{' '}
          <span className="font-semibold text-stone-700 dark:text-stone-200">
            {call.agent}
          </span>
        </p>
      ) : (
        <p className="text-sm text-stone-400 dark:text-stone-500 italic -mt-1">
          Nealocat
        </p>
      )}

      {/* Action buttons */}
      <div className="flex gap-2 flex-wrap">
        <button
          onClick={() => onCopy(call.caller_id)}
          disabled={!call.caller_id}
          className={clsx(
            'flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg border text-sm font-medium transition-colors',
            isCopied
              ? 'bg-emerald-100 dark:bg-emerald-900/40 border-emerald-300 dark:border-emerald-700 text-emerald-700 dark:text-emerald-300'
              : 'bg-white dark:bg-stone-800 border-stone-200 dark:border-stone-600 text-stone-700 dark:text-stone-300 hover:bg-stone-50 dark:hover:bg-stone-700',
          )}
        >
          {isCopied
            ? <><Check className="w-4 h-4" /> Copiat!</>
            : <><Copy className="w-4 h-4" /> Copiază</>}
        </button>

        {call.caller_id && onSms && (
          <button
            onClick={() => onSms(call.caller_id)}
            className="flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium transition-colors"
          >
            <MessageSquare className="w-4 h-4" />
            SMS
          </button>
        )}

        {waNum && (
          <a
            href={`https://wa.me/${waNum}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg bg-[#25D366] hover:bg-[#1ebe5d] text-white text-sm font-medium transition-colors"
          >
            <WhatsAppIcon className="w-4 h-4" />
            WhatsApp
          </a>
        )}
      </div>
    </div>
  );
};

// ── Main page ──────────────────────────────────────────────────────────────
export const ListaApeluriPage: React.FC = () => {
  const [dataStart, setDataStart] = useState(todayStr);
  const [dataEnd, setDataEnd] = useState(todayStr);
  const [q, setQ] = useState('');
  const [activeQ, setActiveQ] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [page, setPage] = useState(1);
  const [copied, setCopied] = useState<string | null>(null);
  const [wsConnected, setWsConnected] = useState(false);
  const [showEventLog, setShowEventLog] = useState(false);
  const [smsPhone, setSmsPhone] = useState<string | null>(null); // null = modal closed
  const [expandedCallIds, setExpandedCallIds] = useState<Set<string>>(new Set());

  const { token, isAuthenticated } = useAppStore();
  const queryClient = useQueryClient();
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── WebSocket: connect to public or authenticated endpoint ──────────────
  useEffect(() => {
    let active = true;

    const connect = () => {
      if (!active) return;
      const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = isAuthenticated && token
        ? `${proto}//${window.location.host}/api/ws/apeluri?token=${token}`
        : `${proto}//${window.location.host}/api/ws/apeluri/public`;
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        setWsConnected(true);
        queryClient.invalidateQueries({ queryKey: ['apeluri-ami-canale'] });
      };

      ws.onmessage = (e) => {
        try {
          const msg = JSON.parse(e.data);
          if (msg.type === 'ami_event') {
            queryClient.invalidateQueries({ queryKey: ['apeluri-lista'] });
            queryClient.invalidateQueries({ queryKey: ['apeluri-ami-canale'] });
          }
          if (msg.type === 'ami_disconnected' || msg.type === 'ami_connected') {
            queryClient.invalidateQueries({ queryKey: ['apeluri-ami-canale'] });
          }
          if (msg.type === 'welcome') {
            queryClient.invalidateQueries({ queryKey: ['apeluri-ami-canale'] });
          }
          if (msg.type === 'ping') ws.send('ping');
        } catch {}
      };

      ws.onclose = () => {
        setWsConnected(false);
        if (active) {
          reconnectRef.current = setTimeout(connect, 4000);
        }
      };

      ws.onerror = () => ws.close();
    };

    connect();
    return () => {
      active = false;
      if (reconnectRef.current) clearTimeout(reconnectRef.current);
      wsRef.current?.close();
      setWsConnected(false);
    };
  }, [token, isAuthenticated, queryClient]);

  // Main list — use public endpoint when not authenticated
  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ['apeluri-lista', dataStart, dataEnd, activeQ, statusFilter, page],
    queryFn: () => isAuthenticated
      ? api.getApeluriLista({
          data_start: dataStart,
          data_end: dataEnd,
          q: activeQ || undefined,
          status: statusFilter || undefined,
          page,
          limit: 50,
        })
      : api.getApeluriListaPublic({
          data_start: dataStart,
          data_end: dataEnd,
          q: activeQ || undefined,
          status: statusFilter || undefined,
          page,
          limit: 50,
        }),
    staleTime: 60000,
    refetchInterval: false,
  });

  // AMI canale — use public endpoint when not authenticated
  const { data: amiData, refetch: refetchAmi } = useQuery({
    queryKey: ['apeluri-ami-canale'],
    queryFn: () => isAuthenticated
      ? api.getApeluriAmiCanale()
      : api.getApeluriAmiCanalePublic(),
    staleTime: 8000,
    refetchInterval: wsConnected ? false : 10000,
  });

  // SMS log — pre-fetch all (authenticated only), grouped by phone for inline display
  const { data: smsLogAll = [] } = useQuery({
    queryKey: ['sms-log-all'],
    queryFn: () => api.getSmsLog({ limit: 500 }),
    enabled: isAuthenticated,
    staleTime: 30000,
  });

  const smsByPhone = useMemo(() => {
    const map = new Map<string, typeof smsLogAll>();
    for (const entry of smsLogAll) {
      const key = entry.phone.replace(/\D/g, ''); // normalise digits only
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(entry);
    }
    return map;
  }, [smsLogAll]);

  const handleSearch = useCallback(() => {
    setPage(1);
    setActiveQ(q);
  }, [q]);

  const handleCopy = (num: string) => {
    if (!num) return;
    navigator.clipboard.writeText(num).then(() => {
      setCopied(num);
      setTimeout(() => setCopied(null), 2000);
    });
  };

  const toggleExpandedCall = (callid: string) => {
    setExpandedCallIds(prev => {
      const next = new Set(prev);
      if (next.has(callid)) next.delete(callid);
      else next.add(callid);
      return next;
    });
  };

  const calls: any[] = data?.calls ?? [];
  const total: number = data?.total ?? 0;
  const pages: number = data?.pages ?? 1;
  const amiCanale: any[] = amiData?.canale ?? [];
  const amiConnected: boolean = amiData?.connected ?? false;
  const eventLog: any[] = amiData?.event_log ?? [];

  return (
    <>
      {/* Standalone header for unauthenticated public view */}
      {!isAuthenticated && (
        <div className="sticky top-0 z-10 bg-white dark:bg-stone-900 border-b border-stone-200 dark:border-stone-700 px-4 py-2.5 flex items-center justify-between shadow-sm">
          <div className="flex items-center gap-2">
            <Phone className="w-4 h-4 text-stone-500" />
            <span className="font-bold text-stone-900 dark:text-stone-100 text-sm">Monitor Coadă</span>
            <span className="text-xs text-stone-400 font-mono">live</span>
          </div>
          <div className="flex items-center gap-2 text-xs">
            <span className={clsx(
              'font-medium',
              amiConnected ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500 dark:text-red-400',
            )}>
              AMI {amiConnected ? '●' : '○'}
            </span>
            <span className="text-stone-300 dark:text-stone-600">|</span>
            <span className={clsx(
              'font-medium',
              wsConnected ? 'text-emerald-600 dark:text-emerald-400' : 'text-stone-400',
            )}>
              WS {wsConnected ? '●' : '○'}
            </span>
          </div>
        </div>
      )}

      <div className={clsx('space-y-4', !isAuthenticated && 'p-4')}>
        {/* SMS modal */}
        {smsPhone !== null && (
          <SmsModal phone={smsPhone} onClose={() => setSmsPhone(null)} />
        )}

        {/* Header (authenticated view only — public gets the sticky bar above) */}
        {isAuthenticated && (
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <h1 className="text-xl font-bold text-stone-900 dark:text-stone-100 flex items-center gap-2">
              <Phone className="w-5 h-5 text-stone-500" />
              Monitor Coadă
            </h1>

            <div className="flex items-center gap-2">
              {/* AMI + WS status indicators */}
              <div className="flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full border bg-stone-50 dark:bg-stone-800 border-stone-200 dark:border-stone-700">
                <Radio className={clsx(
                  'w-3 h-3',
                  !amiConnected ? 'text-red-400' :
                  amiCanale.length > 0 ? 'text-blue-500 animate-pulse' : 'text-emerald-500',
                )} />
                <span className={clsx(
                  'font-medium',
                  amiConnected
                    ? 'text-emerald-600 dark:text-emerald-400'
                    : 'text-red-500 dark:text-red-400 animate-pulse',
                )}>
                  AMI {amiConnected ? '●' : '○'}
                </span>
                <span className="text-stone-300 dark:text-stone-600">|</span>
                <span className={clsx(
                  'font-medium',
                  wsConnected ? 'text-emerald-600 dark:text-emerald-400' : 'text-stone-400 animate-pulse',
                )}>
                  WS {wsConnected ? '●' : '○'}
                </span>
              </div>

              <Button
                variant="secondary"
                size="sm"
                onClick={() => { refetch(); refetchAmi(); }}
                disabled={isFetching}
              >
                <RefreshCw className={clsx('w-3.5 h-3.5', isFetching && 'animate-spin')} />
                Refresh
              </Button>
            </div>
          </div>
        )}

        {/* ── Active Calls Section ──────────────────────────────────────────── */}
        {amiCanale.length > 0 ? (
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-stone-400 dark:text-stone-500 mb-3">
              {amiCanale.length === 1 ? '1 apel activ' : `${amiCanale.length} apeluri active`}
            </p>
            <div className="flex flex-wrap gap-4">
              {amiCanale.map((c: any, i: number) => (
                <ActiveCallCard
                  key={c.channel || i}
                  call={c}
                  copied={copied}
                  onCopy={handleCopy}
                  onSms={isAuthenticated ? setSmsPhone : undefined}
                />
              ))}
            </div>
          </div>
        ) : (
          <div className={clsx(
            'rounded-xl border px-4 py-3 flex items-center gap-2 text-sm',
            amiConnected
              ? 'bg-stone-50 dark:bg-stone-800/40 border-stone-200 dark:border-stone-700 text-stone-400'
              : 'bg-red-50/40 dark:bg-red-950/10 border-red-200 dark:border-red-900/40 text-red-500 dark:text-red-400',
          )}>
            <Radio className={clsx('w-4 h-4', amiConnected ? 'text-emerald-500' : 'text-red-400')} />
            {amiConnected ? 'Niciun apel activ în coadă' : 'AMI deconectat — reconectare...'}
          </div>
        )}

        {/* ── Event Log (collapsible) ──────────────────────────────────────── */}
        <div className="rounded-xl border border-stone-200 dark:border-stone-700 overflow-hidden">
          <button
            onClick={() => setShowEventLog(v => !v)}
            className="w-full flex items-center justify-between px-3 py-2 bg-stone-50 dark:bg-stone-800/60 hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors text-left"
          >
            <span className="flex items-center gap-2 text-xs font-semibold text-stone-500 dark:text-stone-400 uppercase tracking-wider">
              <Activity className="w-3.5 h-3.5" />
              Jurnal AMI
              {eventLog.length > 0 && (
                <span className="bg-stone-200 dark:bg-stone-700 text-stone-600 dark:text-stone-300 px-1.5 py-0.5 rounded-full text-[10px] font-medium">
                  {eventLog.length}
                </span>
              )}
            </span>
            {showEventLog
              ? <ChevronUp className="w-3.5 h-3.5 text-stone-400" />
              : <ChevronDown className="w-3.5 h-3.5 text-stone-400" />}
          </button>

          {showEventLog && (
            <div className="overflow-x-auto max-h-52 overflow-y-auto">
              {eventLog.length === 0 ? (
                <p className="text-xs text-stone-400 px-3 py-3 italic">
                  Niciun eveniment înregistrat încă.
                </p>
              ) : (
                <table className="w-full text-xs font-mono">
                  <thead className="sticky top-0 bg-white dark:bg-stone-900">
                    <tr className="border-b border-stone-100 dark:border-stone-700">
                      <th className="text-left px-3 py-1.5 text-stone-400 font-medium w-16">Oră</th>
                      <th className="text-left px-3 py-1.5 text-stone-400 font-medium w-44">Eveniment</th>
                      <th className="text-left px-3 py-1.5 text-stone-400 font-medium">Număr</th>
                      <th className="text-left px-3 py-1.5 text-stone-400 font-medium">Coadă</th>
                      <th className="text-left px-3 py-1.5 text-stone-400 font-medium">Detalii</th>
                    </tr>
                  </thead>
                  <tbody>
                    {eventLog.map((ev: any, i: number) => {
                      const isQueue = ['Join', 'QueueCallerJoin', 'Leave', 'QueueCallerAbandon',
                                       'AgentConnect', 'AgentComplete', 'Bridge:Link'].includes(ev.event);
                      return (
                        <tr
                          key={i}
                          className={clsx(
                            'border-b border-stone-50 dark:border-stone-800/40',
                            isQueue
                              ? 'bg-blue-50/40 dark:bg-blue-950/10'
                              : 'hover:bg-stone-50 dark:hover:bg-stone-800/20',
                          )}
                        >
                          <td className="px-3 py-1 text-stone-400 whitespace-nowrap">{ev.ts}</td>
                          <td className={clsx(
                            'px-3 py-1 whitespace-nowrap font-semibold',
                            isQueue ? 'text-blue-600 dark:text-blue-400' : 'text-stone-500 dark:text-stone-400',
                          )}>
                            {ev.event}
                          </td>
                          <td className="px-3 py-1 text-stone-700 dark:text-stone-300 whitespace-nowrap">
                            {ev.caller_id || '-'}
                          </td>
                          <td className="px-3 py-1 text-stone-500 dark:text-stone-400 whitespace-nowrap">
                            {ev.queue || '-'}
                          </td>
                          <td className="px-3 py-1 text-stone-400 whitespace-nowrap">
                            {ev.extra || ''}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          )}
        </div>

        {/* ── Filters ───────────────────────────────────────────────────────── */}
        <Card padding="sm">
          <div className="flex flex-wrap gap-3 items-center">
            <div className="flex items-center gap-2">
              <label className="text-xs text-stone-500 dark:text-stone-400 whitespace-nowrap">De la</label>
              <input
                type="date"
                value={dataStart}
                onChange={e => { setDataStart(e.target.value); setPage(1); }}
                className="text-sm border border-stone-200 dark:border-stone-600 rounded-lg px-2 py-1 bg-white dark:bg-stone-800 text-stone-900 dark:text-stone-100 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
            <div className="flex items-center gap-2">
              <label className="text-xs text-stone-500 dark:text-stone-400 whitespace-nowrap">Până la</label>
              <input
                type="date"
                value={dataEnd}
                onChange={e => { setDataEnd(e.target.value); setPage(1); }}
                className="text-sm border border-stone-200 dark:border-stone-600 rounded-lg px-2 py-1 bg-white dark:bg-stone-800 text-stone-900 dark:text-stone-100 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>

            <div className="flex items-center gap-1.5">
              <div className="relative">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-stone-400 pointer-events-none" />
                <input
                  type="text"
                  placeholder="Număr telefon..."
                  value={q}
                  onChange={e => setQ(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleSearch()}
                  className="pl-7 pr-3 py-1 text-sm border border-stone-200 dark:border-stone-600 rounded-lg bg-white dark:bg-stone-800 text-stone-900 dark:text-stone-100 focus:outline-none focus:ring-1 focus:ring-blue-500 w-44"
                />
              </div>
              <Button size="sm" onClick={handleSearch}>Caută</Button>
            </div>

            <select
              value={statusFilter}
              onChange={e => { setStatusFilter(e.target.value); setPage(1); }}
              className="text-sm border border-stone-200 dark:border-stone-600 rounded-lg px-2 py-1 bg-white dark:bg-stone-800 text-stone-900 dark:text-stone-100 focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              <option value="">Toate statusurile</option>
              <option value="COMPLETAT">Completat</option>
              <option value="ABANDONAT">Abandonat</option>
              <option value="IN_CURS">In curs</option>
              <option value="NEPRELUATE">Nepreluate</option>
            </select>

            {total > 0 && (
              <span className="text-xs text-stone-400 ml-auto">
                {total.toLocaleString()} apeluri
              </span>
            )}
          </div>
        </Card>

        {/* ── History Table ─────────────────────────────────────────────────── */}
        <Card padding="none">
          {isLoading ? (
            <div className="flex justify-center py-14">
              <Spinner size="lg" />
            </div>
          ) : calls.length === 0 ? (
            <div className="py-14 text-center">
              <Phone className="w-8 h-8 mx-auto mb-2 text-stone-300 dark:text-stone-600" />
              <p className="text-sm text-stone-400">
                Niciun apel în intervalul selectat.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-stone-100 dark:border-stone-700 bg-stone-50 dark:bg-stone-800/50">
                    <th className="text-left py-2.5 px-3 text-xs font-semibold text-stone-500 dark:text-stone-400 uppercase tracking-wide">Dată</th>
                    <th className="text-left py-2.5 px-3 text-xs font-semibold text-stone-500 dark:text-stone-400 uppercase tracking-wide">Oră</th>
                    <th className="text-left py-2.5 px-3 text-xs font-semibold text-stone-500 dark:text-stone-400 uppercase tracking-wide">Număr</th>
                    <th className="text-left py-2.5 px-3 text-xs font-semibold text-stone-500 dark:text-stone-400 uppercase tracking-wide">Agent</th>
                    <th className="text-left py-2.5 px-3 text-xs font-semibold text-stone-500 dark:text-stone-400 uppercase tracking-wide">Status</th>
                    <th className="text-right py-2.5 px-3 text-xs font-semibold text-stone-500 dark:text-stone-400 uppercase tracking-wide">Așteptare</th>
                    <th className="text-right py-2.5 px-3 text-xs font-semibold text-stone-500 dark:text-stone-400 uppercase tracking-wide">Durată</th>
                    <th className="py-2.5 px-3"></th>
                  </tr>
                </thead>
                <tbody>
                  {calls.map((c: any, i: number) => {
                    const cfg = STATUS_CONFIG[c.status];
                    const Icon = cfg?.icon ?? Phone;
                    const dateStr = (() => {
                      try { return format(parseISO(c.data), 'd MMM', { locale: ro }); }
                      catch { return c.data; }
                    })();
                    const isLive = c.status === 'IN_CURS' || c.status === 'IN_QUEUE';
                    const waNum = c.caller_id ? toWaNum(c.caller_id) : '';
                    const callKey = c.callid || String(i);
                    const isExpanded = expandedCallIds.has(callKey);

                    // SMS for this phone number (authenticated only)
                    const phoneDigits = c.caller_id?.replace(/\D/g, '') ?? '';
                    const phoneSms = isAuthenticated && phoneDigits
                      ? (smsByPhone.get(phoneDigits) ?? [])
                      : [];

                    return (
                      <React.Fragment key={callKey}>
                        <tr
                          className={clsx(
                            'border-b border-stone-50 dark:border-stone-800/60 hover:bg-stone-50/60 dark:hover:bg-stone-800/30 transition-colors',
                            isLive && 'bg-blue-50/20 dark:bg-blue-950/10',
                            isExpanded && 'border-b-0',
                          )}
                        >
                          <td className="py-2 px-3 text-stone-500 dark:text-stone-400 font-mono text-xs whitespace-nowrap">
                            {dateStr}
                          </td>
                          <td className="py-2 px-3 text-stone-500 dark:text-stone-400 font-mono text-xs whitespace-nowrap">
                            {c.ora || '-'}
                          </td>
                          <td className="py-2 px-3">
                            <button
                              onClick={() => handleCopy(c.caller_id)}
                              className="flex items-center gap-1 font-mono text-xs text-stone-800 dark:text-stone-200 hover:text-blue-600 dark:hover:text-blue-400 transition-colors group"
                              title="Copiază numărul"
                            >
                              {c.caller_id || '-'}
                              {c.caller_id && (
                                copied === c.caller_id
                                  ? <Check className="w-3 h-3 text-emerald-500 flex-shrink-0" />
                                  : <Copy className="w-3 h-3 opacity-0 group-hover:opacity-40 flex-shrink-0" />
                              )}
                            </button>
                          </td>
                          <td className="py-2 px-3 text-stone-500 dark:text-stone-400 font-mono text-xs">
                            {c.agent || '-'}
                          </td>
                          <td className="py-2 px-3">
                            {cfg ? (
                              <span className={clsx(
                                'inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium whitespace-nowrap',
                                cfg.bg, cfg.text,
                              )}>
                                <Icon className="w-3 h-3 flex-shrink-0" />
                                {cfg.label}
                                {isLive && (
                                  <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse ml-0.5" />
                                )}
                              </span>
                            ) : (
                              <span className="text-xs text-stone-400">{c.status}</span>
                            )}
                          </td>
                          <td className="py-2 px-3 text-right font-mono text-xs text-stone-500 dark:text-stone-400 whitespace-nowrap">
                            {formatDur(c.hold_time)}
                          </td>
                          <td className="py-2 px-3 text-right font-mono text-xs text-stone-500 dark:text-stone-400 whitespace-nowrap">
                            {formatDur(c.call_time)}
                          </td>
                          {/* Actions: SMS + WhatsApp + SMS-dropdown chevron */}
                          <td className="py-2 px-2 text-right whitespace-nowrap">
                            <div className="flex items-center justify-end gap-1">
                              {isAuthenticated && c.caller_id && (
                                <button
                                  onClick={() => setSmsPhone(c.caller_id)}
                                  title="Trimite SMS"
                                  className="p-1 rounded-lg text-blue-500 hover:text-blue-700 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors"
                                >
                                  <MessageSquare className="w-3.5 h-3.5" />
                                </button>
                              )}
                              {waNum && (
                                <a
                                  href={`https://wa.me/${waNum}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  title="Deschide WhatsApp"
                                  className="inline-flex items-center gap-1 text-[#25D366] hover:text-[#1da851] transition-colors p-1"
                                >
                                  <WhatsAppIcon className="w-3.5 h-3.5" />
                                  <ExternalLink className="w-2.5 h-2.5 opacity-60" />
                                </a>
                              )}
                              {/* SMS history dropdown — only when there are messages */}
                              {isAuthenticated && phoneSms.length > 0 && (
                                <button
                                  onClick={() => toggleExpandedCall(callKey)}
                                  title={isExpanded ? 'Ascunde SMS' : `${phoneSms.length} SMS trimise`}
                                  className={clsx(
                                    'flex items-center gap-0.5 p-1 rounded-lg text-xs font-medium transition-colors',
                                    isExpanded
                                      ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400'
                                      : 'text-stone-400 hover:text-blue-500 hover:bg-stone-100 dark:hover:bg-stone-700',
                                  )}
                                >
                                  <MessageSquare className="w-3 h-3" />
                                  <span className="text-[10px] tabular-nums">{phoneSms.length}</span>
                                  {isExpanded
                                    ? <ChevronUp className="w-3 h-3" />
                                    : <ChevronDown className="w-3 h-3" />}
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>

                        {/* ── SMS sub-row ── */}
                        {isExpanded && phoneSms.length > 0 && (
                          <tr className="border-b border-stone-100 dark:border-stone-800">
                            <td colSpan={8} className="px-0 py-0">
                              <div className="bg-blue-50/40 dark:bg-blue-950/10 border-t border-blue-100 dark:border-blue-900/30 px-4 py-2.5">
                                <p className="text-[10px] uppercase tracking-wider font-semibold text-blue-500 dark:text-blue-400 mb-2">
                                  SMS trimise la {c.caller_id}
                                </p>
                                <div className="space-y-1.5">
                                  {phoneSms.map((entry: any) => {
                                    const ts = (() => {
                                      try { return format(parseISO(entry.created_at), 'd MMM HH:mm', { locale: ro }); }
                                      catch { return entry.created_at?.slice(0, 16) ?? '-'; }
                                    })();
                                    return (
                                      <div key={entry.id} className="flex items-start gap-3 text-xs">
                                        <span className="font-mono text-stone-400 whitespace-nowrap pt-px">{ts}</span>
                                        <span className="flex-1 text-stone-700 dark:text-stone-300 whitespace-pre-wrap break-words leading-relaxed">
                                          {entry.message}
                                        </span>
                                        {entry.sent_by && (
                                          <span className="text-stone-400 whitespace-nowrap pt-px italic">{entry.sent_by}</span>
                                        )}
                                        {entry.ok
                                          ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0 mt-px" title="Trimis" />
                                          : <XCircle className="w-3.5 h-3.5 text-red-500 flex-shrink-0 mt-px" title={entry.error_msg || 'Eroare'} />
                                        }
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {pages > 1 && (
            <div className="flex items-center justify-between px-3 py-2 border-t border-stone-100 dark:border-stone-700">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
              >
                <ChevronLeft className="w-4 h-4" />
              </Button>
              <span className="text-xs text-stone-500 dark:text-stone-400">
                Pagina {page} din {pages}
              </span>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setPage(p => Math.min(pages, p + 1))}
                disabled={page === pages}
              >
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
          )}
        </Card>

      </div>
    </>
  );
};
