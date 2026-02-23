import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  MessageSquare, Save, Eye, EyeOff, Send, CheckCircle, XCircle,
  Plus, Pencil, Trash2, Check, X, History, Search, RefreshCw,
} from 'lucide-react';
import { clsx } from 'clsx';
import { toast } from 'react-hot-toast';

import api from '@/services/api';
import { Card, Button, Input, Spinner } from '@/components/ui';

// ── SMS segment counter (shared helper) ───────────────────────────────────
const SmsCounter: React.FC<{ text: string }> = ({ text }) => {
  const len = text.length;
  if (len === 0) return <span className="text-[10px] text-stone-400">0 caractere</span>;
  const segments = len <= 160 ? 1 : Math.ceil(len / 153);
  return (
    <span className="text-[10px] tabular-nums">
      <span className={len > 160 ? 'text-amber-500' : 'text-stone-400'}>
        {len} {len === 1 ? 'car.' : 'car.'}
      </span>
      <span className="text-stone-300 dark:text-stone-600 mx-1">·</span>
      <span className={segments > 1 ? 'text-amber-500 font-semibold' : 'text-stone-400'}>
        {segments} {segments === 1 ? 'SMS' : `SMS (${segments} parts)`}
      </span>
    </span>
  );
};

// ── Template row — inline edit ────────────────────────────────────────────
interface TemplateRowProps {
  tmpl: { id: number; titlu: string; corp: string };
  onDeleted: () => void;
  onUpdated: () => void;
}

const TemplateRow: React.FC<TemplateRowProps> = ({ tmpl, onDeleted, onUpdated }) => {
  const [editing, setEditing]           = useState(false);
  const [titlu, setTitlu]               = useState(tmpl.titlu);
  const [corp, setCorp]                 = useState(tmpl.corp);
  const [confirmDel, setConfirmDel]     = useState(false);

  const updateMutation = useMutation({
    mutationFn: () => api.updateSmsTemplate(tmpl.id, titlu, corp),
    onSuccess: () => { toast.success('Template actualizat'); setEditing(false); onUpdated(); },
    onError: () => toast.error('Eroare la actualizare'),
  });

  const deleteMutation = useMutation({
    mutationFn: () => api.deleteSmsTemplate(tmpl.id),
    onSuccess: () => { toast.success('Template șters'); onDeleted(); },
    onError: () => toast.error('Eroare la ștergere'),
  });

  if (editing) {
    return (
      <div className="p-4 rounded-xl border-2 border-blue-300 dark:border-blue-700 bg-blue-50/30 dark:bg-blue-950/10 space-y-3">
        <input
          value={titlu}
          onChange={(e) => setTitlu(e.target.value)}
          placeholder="Titlu / Nume template"
          className="w-full px-3 py-2 text-sm border border-stone-200 dark:border-stone-600 rounded-lg bg-white dark:bg-stone-800 text-stone-900 dark:text-stone-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <textarea
          value={corp}
          onChange={(e) => setCorp(e.target.value)}
          rows={3}
          placeholder="Corp mesaj SMS&#10;Poți folosi {numar} pentru numărul apelantului"
          className="w-full px-3 py-2 text-sm border border-stone-200 dark:border-stone-600 rounded-lg bg-white dark:bg-stone-800 text-stone-900 dark:text-stone-100 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
        />
        <div className="flex items-center justify-between -mt-1">
          <SmsCounter text={corp} />
          <div className="flex gap-2">
            <button
              onClick={() => { setEditing(false); setTitlu(tmpl.titlu); setCorp(tmpl.corp); }}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm border border-stone-200 dark:border-stone-600 text-stone-600 dark:text-stone-300 rounded-lg hover:bg-stone-50 dark:hover:bg-stone-800 transition-colors"
            >
              <X className="w-3.5 h-3.5" /> Anulează
            </button>
            <button
              onClick={() => updateMutation.mutate()}
              disabled={!titlu.trim() || !corp.trim() || updateMutation.isPending}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-lg disabled:opacity-50 transition-colors"
            >
              <Check className="w-3.5 h-3.5" /> Salvează
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-start gap-3 p-4 rounded-xl border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-900 group hover:border-stone-300 dark:hover:border-stone-600 transition-colors">
      <MessageSquare className="w-4 h-4 text-blue-400 mt-0.5 shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-sm text-stone-900 dark:text-stone-100">{tmpl.titlu}</p>
        <p className="text-sm text-stone-500 dark:text-stone-400 mt-0.5 whitespace-pre-wrap break-words">{tmpl.corp}</p>
      </div>
      <div className="flex gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
        <button
          onClick={() => setEditing(true)}
          className="p-1.5 rounded-lg text-stone-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors"
          title="Editează"
        >
          <Pencil className="w-3.5 h-3.5" />
        </button>
        {confirmDel ? (
          <div className="flex items-center gap-1">
            <button
              onClick={() => deleteMutation.mutate()}
              disabled={deleteMutation.isPending}
              className="px-2 py-1 text-xs bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
            >
              Confirmă
            </button>
            <button
              onClick={() => setConfirmDel(false)}
              className="px-2 py-1 text-xs border border-stone-200 dark:border-stone-600 text-stone-500 rounded-lg hover:bg-stone-50 dark:hover:bg-stone-800 transition-colors"
            >
              Nu
            </button>
          </div>
        ) : (
          <button
            onClick={() => setConfirmDel(true)}
            className="p-1.5 rounded-lg text-stone-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
            title="Șterge"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
    </div>
  );
};

// ── SMS Log row — expandable message ──────────────────────────────────────
const LogRow: React.FC<{ entry: {
  id: number; phone: string; message: string; ok: boolean;
  error_msg: string | null; sent_by: string | null; created_at: string;
}}> = ({ entry }) => {
  const [expanded, setExpanded] = useState(false);
  const preview = entry.message.length > 60 ? entry.message.slice(0, 60) + '…' : entry.message;

  return (
    <tr
      className={clsx(
        'border-b border-stone-50 dark:border-stone-800/60 hover:bg-stone-50/60 dark:hover:bg-stone-800/30 transition-colors cursor-pointer',
        !entry.ok && 'bg-red-50/30 dark:bg-red-950/10',
      )}
      onClick={() => setExpanded(v => !v)}
    >
      <td className="py-2 px-3 whitespace-nowrap font-mono text-xs text-stone-400">
        {entry.created_at.slice(0, 16).replace('T', ' ')}
      </td>
      <td className="py-2 px-3 whitespace-nowrap font-mono text-xs text-stone-800 dark:text-stone-200">
        {entry.phone}
      </td>
      <td className="py-2 px-3 text-xs text-stone-600 dark:text-stone-400 max-w-xs">
        {expanded ? (
          <span className="whitespace-pre-wrap break-words text-stone-800 dark:text-stone-200">
            {entry.message}
          </span>
        ) : (
          <span>{preview}</span>
        )}
        {entry.error_msg && (
          <p className="text-red-500 mt-0.5 text-[10px]">{entry.error_msg}</p>
        )}
      </td>
      <td className="py-2 px-3 whitespace-nowrap text-xs text-stone-400">
        {entry.sent_by || '—'}
      </td>
      <td className="py-2 px-3 text-center">
        {entry.ok
          ? <CheckCircle className="w-4 h-4 text-emerald-500 mx-auto" />
          : <XCircle    className="w-4 h-4 text-red-500 mx-auto" />}
      </td>
    </tr>
  );
};

// ── Main settings page ────────────────────────────────────────────────────
export const SmsSettings: React.FC = () => {
  const queryClient = useQueryClient();

  // ── Gateway credentials ──────────────────────────────────────────────
  const [dinstarIp, setDinstarIp]     = useState('');
  const [dinstarUser, setDinstarUser] = useState('');
  const [dinstarPass, setDinstarPass] = useState('');
  const [showPass, setShowPass]       = useState(false);
  const [testPhone, setTestPhone]     = useState('');
  const [testResult, setTestResult]   = useState<{ ok: boolean; msg: string } | null>(null);

  // ── New template form ────────────────────────────────────────────────
  const [showAddForm, setShowAddForm] = useState(false);
  const [newTitlu, setNewTitlu]       = useState('');
  const [newCorp, setNewCorp]         = useState('');

  // ── Log filters ──────────────────────────────────────────────────────
  const [logPhone, setLogPhone] = useState('');
  const [logQuery, setLogQuery] = useState('');

  const { data: settings = [], isLoading: isLoadingSettings } = useQuery({
    queryKey: ['settings'],
    queryFn: () => api.getSettings(),
  });

  const { data: templates = [], isLoading: isLoadingTemplates, refetch: refetchTemplates } = useQuery({
    queryKey: ['sms-templates'],
    queryFn: () => api.getSmsTemplates(),
  });

  const { data: logEntries = [], isLoading: isLoadingLog, refetch: refetchLog } = useQuery({
    queryKey: ['sms-log', logQuery],
    queryFn: () => api.getSmsLog({ limit: 200, phone: logQuery || undefined }),
    staleTime: 15000,
  });

  useEffect(() => {
    if (settings.length > 0) {
      const ip   = settings.find((s) => s.cheie === 'dinstar_ip');
      const user = settings.find((s) => s.cheie === 'dinstar_user');
      const pass = settings.find((s) => s.cheie === 'dinstar_pass');
      if (ip?.valoare   && !dinstarIp)   setDinstarIp(ip.valoare);
      if (user?.valoare && !dinstarUser) setDinstarUser(user.valoare);
      if (pass?.valoare && !dinstarPass) setDinstarPass(pass.valoare);
    }
  }, [settings]);

  const updateMutation = useMutation({
    mutationFn: ({ cheie, valoare }: { cheie: string; valoare: string }) =>
      api.upsertSetting(cheie, valoare),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['settings'] }),
  });

  const handleSaveGateway = async () => {
    try {
      await Promise.all([
        updateMutation.mutateAsync({ cheie: 'dinstar_ip',   valoare: dinstarIp   }),
        updateMutation.mutateAsync({ cheie: 'dinstar_user', valoare: dinstarUser }),
        updateMutation.mutateAsync({ cheie: 'dinstar_pass', valoare: dinstarPass }),
      ]);
      toast.success('Setări gateway salvate');
    } catch {
      toast.error('Eroare la salvare');
    }
  };

  const testMutation = useMutation({
    mutationFn: () => api.sendSms(testPhone, 'Test SMS din Cheltuieli App'),
    onSuccess: (res) => {
      if (res.ok) {
        setTestResult({ ok: true, msg: `SMS acceptat pentru ${testPhone}` });
        refetchLog();
      } else {
        setTestResult({ ok: false, msg: res.error || 'Gateway a refuzat mesajul' });
      }
    },
    onError: (err: any) => {
      setTestResult({ ok: false, msg: err.response?.data?.detail || 'Eroare de rețea' });
    },
  });

  const createTemplateMutation = useMutation({
    mutationFn: () => api.createSmsTemplate(newTitlu, newCorp),
    onSuccess: () => {
      toast.success('Template adăugat');
      setNewTitlu('');
      setNewCorp('');
      setShowAddForm(false);
      refetchTemplates();
    },
    onError: () => toast.error('Eroare la creare'),
  });

  if (isLoadingSettings) {
    return <div className="flex justify-center py-12"><Spinner size="lg" /></div>;
  }

  const isConfigured = dinstarIp && dinstarUser && dinstarPass;

  return (
    <div>
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-xl font-bold text-stone-900 dark:text-stone-100 flex items-center gap-2">
          <MessageSquare className="w-5 h-5 text-blue-500" />
          SMS Gateway (Dinstar)
        </h1>
        <p className="text-sm text-stone-500 mt-1">
          Configurează gateway-ul, definește template-uri și vizualizează istoricul trimiterilor
        </p>
      </div>

      {/* ── Gateway credentials ─────────────────────────────────────────── */}
      <Card className="mb-6">
        <h3 className="font-semibold text-stone-900 dark:text-stone-100 mb-4 text-sm uppercase tracking-wide">
          Conexiune Gateway
        </h3>
        <div className="space-y-4">
          <Input
            label="IP / Host gateway"
            value={dinstarIp}
            onChange={(e) => setDinstarIp(e.target.value)}
            placeholder="192.168.1.100"
          />
          <Input
            label="Utilizator"
            value={dinstarUser}
            onChange={(e) => setDinstarUser(e.target.value)}
            placeholder="admin"
          />
          <div>
            <label className="block text-sm font-medium text-stone-700 dark:text-stone-300 mb-1">Parolă</label>
            <div className="relative">
              <input
                type={showPass ? 'text' : 'password'}
                value={dinstarPass}
                onChange={(e) => setDinstarPass(e.target.value)}
                placeholder="••••••••"
                className="w-full px-3 py-2 pr-10 text-sm border border-stone-200 dark:border-stone-600 rounded-xl bg-white dark:bg-stone-800 text-stone-900 dark:text-stone-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <button
                type="button"
                onClick={() => setShowPass(v => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-600 dark:hover:text-stone-200"
              >
                {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>
          <div className="pt-1">
            <Button
              variant="primary"
              onClick={handleSaveGateway}
              loading={updateMutation.isPending}
              icon={<Save className="w-4 h-4" />}
            >
              Salvează
            </Button>
          </div>
        </div>
      </Card>

      {/* ── Test SMS ─────────────────────────────────────────────────────── */}
      <Card className="mb-6">
        <h3 className="font-semibold text-stone-900 dark:text-stone-100 mb-4 text-sm uppercase tracking-wide flex items-center gap-2">
          <Send className="w-4 h-4" />
          Test trimitere
        </h3>
        <div className="flex gap-3 items-end flex-wrap">
          <div className="flex-1 min-w-[180px]">
            <label className="block text-xs font-medium text-stone-500 dark:text-stone-400 mb-1.5 uppercase tracking-wide">
              Număr de test
            </label>
            <input
              type="tel"
              value={testPhone}
              onChange={(e) => { setTestPhone(e.target.value); setTestResult(null); }}
              placeholder="07xxxxxxxxx"
              className="w-full px-3 py-2 text-sm font-mono border border-stone-200 dark:border-stone-600 rounded-xl bg-white dark:bg-stone-800 text-stone-900 dark:text-stone-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <Button
            variant="secondary"
            onClick={() => testMutation.mutate()}
            loading={testMutation.isPending}
            disabled={!testPhone.trim() || !isConfigured}
            icon={<Send className="w-4 h-4" />}
          >
            Trimite test
          </Button>
        </div>
        {!isConfigured && (
          <p className="text-sm text-amber-600 dark:text-amber-400 mt-3">
            Salvează mai întâi configurarea gateway-ului.
          </p>
        )}
        {testResult && (
          <div className={`mt-4 flex items-center gap-2 text-sm rounded-xl px-4 py-3 ${
            testResult.ok
              ? 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400'
              : 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400'
          }`}>
            {testResult.ok ? <CheckCircle className="w-4 h-4 shrink-0" /> : <XCircle className="w-4 h-4 shrink-0" />}
            {testResult.msg}
          </div>
        )}
      </Card>

      {/* ── SMS Templates ─────────────────────────────────────────────────── */}
      <Card className="mb-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-stone-900 dark:text-stone-100 text-sm uppercase tracking-wide flex items-center gap-2">
            <MessageSquare className="w-4 h-4" />
            Template-uri mesaje
          </h3>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setShowAddForm(v => !v)}
            icon={<Plus className="w-4 h-4" />}
          >
            Adaugă
          </Button>
        </div>

        <p className="text-xs text-stone-400 dark:text-stone-500 mb-4">
          Folosește{' '}
          <code className="bg-stone-100 dark:bg-stone-800 px-1 rounded">{'{numar}'}</code>
          {' '}în corp pentru a insera automat numărul apelantului. Fără limită de caractere — mesajele lungi se trimit în mai multe SMS-uri.
        </p>

        {/* Add form */}
        {showAddForm && (
          <div className="mb-4 p-4 rounded-xl border-2 border-dashed border-blue-300 dark:border-blue-700 space-y-3">
            <input
              value={newTitlu}
              onChange={(e) => setNewTitlu(e.target.value)}
              placeholder="Titlu / Nume template (ex: Confirmare comandă)"
              autoFocus
              className="w-full px-3 py-2 text-sm border border-stone-200 dark:border-stone-600 rounded-lg bg-white dark:bg-stone-800 text-stone-900 dark:text-stone-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <textarea
              value={newCorp}
              onChange={(e) => setNewCorp(e.target.value)}
              rows={3}
              placeholder="Corp mesaj SMS...&#10;Ex: Buna ziua, comanda dvs este in pregatire. Va multumim!"
              className="w-full px-3 py-2 text-sm border border-stone-200 dark:border-stone-600 rounded-lg bg-white dark:bg-stone-800 text-stone-900 dark:text-stone-100 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
            />
            <div className="flex items-center justify-between">
              <SmsCounter text={newCorp} />
              <div className="flex gap-2">
                <button
                  onClick={() => { setShowAddForm(false); setNewTitlu(''); setNewCorp(''); }}
                  className="px-3 py-1.5 text-sm border border-stone-200 dark:border-stone-600 text-stone-600 dark:text-stone-300 rounded-lg hover:bg-stone-50 dark:hover:bg-stone-800 transition-colors"
                >
                  Anulează
                </button>
                <button
                  onClick={() => createTemplateMutation.mutate()}
                  disabled={!newTitlu.trim() || !newCorp.trim() || createTemplateMutation.isPending}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-lg disabled:opacity-50 transition-colors"
                >
                  <Plus className="w-3.5 h-3.5" /> Adaugă
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Template list */}
        {isLoadingTemplates ? (
          <div className="flex justify-center py-6"><Spinner /></div>
        ) : templates.length === 0 ? (
          <p className="text-sm text-stone-400 dark:text-stone-500 italic text-center py-6">
            Niciun template definit. Apasă „Adaugă" pentru a crea primul.
          </p>
        ) : (
          <div className="space-y-2">
            {templates.map((t) => (
              <TemplateRow
                key={t.id}
                tmpl={t}
                onDeleted={() => refetchTemplates()}
                onUpdated={() => refetchTemplates()}
              />
            ))}
          </div>
        )}
      </Card>

      {/* ── SMS History ───────────────────────────────────────────────────── */}
      <Card padding="none">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-stone-100 dark:border-stone-800">
          <h3 className="font-semibold text-stone-900 dark:text-stone-100 text-sm uppercase tracking-wide flex items-center gap-2">
            <History className="w-4 h-4" />
            Istoric SMS trimise
            {logEntries.length > 0 && (
              <span className="bg-stone-100 dark:bg-stone-800 text-stone-500 px-1.5 py-0.5 rounded-full text-[10px] font-medium normal-case">
                {logEntries.length}
              </span>
            )}
          </h3>
          <button
            onClick={() => refetchLog()}
            disabled={isLoadingLog}
            className="p-1.5 rounded-lg text-stone-400 hover:text-stone-600 dark:hover:text-stone-200 hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors"
            title="Reîncarcă"
          >
            <RefreshCw className={clsx('w-4 h-4', isLoadingLog && 'animate-spin')} />
          </button>
        </div>

        {/* Phone filter */}
        <div className="px-4 py-2 border-b border-stone-100 dark:border-stone-800">
          <div className="relative max-w-xs">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-stone-400 pointer-events-none" />
            <input
              type="text"
              value={logPhone}
              onChange={(e) => setLogPhone(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && setLogQuery(logPhone)}
              placeholder="Filtrare după număr..."
              className="w-full pl-8 pr-3 py-1.5 text-sm border border-stone-200 dark:border-stone-600 rounded-lg bg-white dark:bg-stone-800 text-stone-900 dark:text-stone-100 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>
        </div>

        {/* Table */}
        {isLoadingLog ? (
          <div className="flex justify-center py-10"><Spinner /></div>
        ) : logEntries.length === 0 ? (
          <p className="text-sm text-stone-400 dark:text-stone-500 italic text-center py-10">
            {logQuery ? 'Niciun SMS găsit pentru filtrul aplicat.' : 'Niciun SMS trimis încă.'}
          </p>
        ) : (
          <div className="overflow-x-auto max-h-[500px] overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-stone-50 dark:bg-stone-800/80 backdrop-blur-sm">
                <tr className="border-b border-stone-100 dark:border-stone-700">
                  <th className="text-left py-2 px-3 text-xs font-semibold text-stone-500 uppercase tracking-wide whitespace-nowrap">Dată</th>
                  <th className="text-left py-2 px-3 text-xs font-semibold text-stone-500 uppercase tracking-wide whitespace-nowrap">Număr</th>
                  <th className="text-left py-2 px-3 text-xs font-semibold text-stone-500 uppercase tracking-wide">Mesaj</th>
                  <th className="text-left py-2 px-3 text-xs font-semibold text-stone-500 uppercase tracking-wide whitespace-nowrap">Trimis de</th>
                  <th className="text-center py-2 px-3 text-xs font-semibold text-stone-500 uppercase tracking-wide">Status</th>
                </tr>
              </thead>
              <tbody>
                {logEntries.map((entry) => (
                  <LogRow key={entry.id} entry={entry} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
};
