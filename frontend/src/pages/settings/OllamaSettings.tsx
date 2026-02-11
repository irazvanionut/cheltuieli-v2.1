import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Bot, RefreshCw, CheckCircle, XCircle, Server, Cpu, Sparkles, Save } from 'lucide-react';
import { toast } from 'react-hot-toast';

import api from '@/services/api';
import { Card, Button, Input, Spinner, Badge } from '@/components/ui';
import type { OllamaStatus, Setting } from '@/types';

export const OllamaSettings: React.FC = () => {
  const queryClient = useQueryClient();
  const [ollamaHost, setOllamaHost] = useState('');
  const [embeddingModel, setEmbeddingModel] = useState('');
  const [chatModel, setChatModel] = useState('');

  // Fetch settings
  const { data: settings = [], isLoading: isLoadingSettings } = useQuery({
    queryKey: ['settings'],
    queryFn: () => api.getSettings(),
    onSuccess: (data) => {
      const hostSetting = data.find((s) => s.cheie === 'ollama_host');
      const embSetting = data.find((s) => s.cheie === 'ollama_embedding_model');
      const chatSetting = data.find((s) => s.cheie === 'ollama_chat_model');
      
      if (hostSetting?.valoare) setOllamaHost(hostSetting.valoare);
      if (embSetting?.valoare) setEmbeddingModel(embSetting.valoare);
      if (chatSetting?.valoare) setChatModel(chatSetting.valoare);
    },
  });

  // Test connection
  const { 
    data: ollamaStatus, 
    isLoading: isTestingConnection,
    refetch: testConnection 
  } = useQuery({
    queryKey: ['ollama-status'],
    queryFn: () => api.testOllamaConnection(),
    enabled: false,
    retry: false,
  });

  // Update setting mutation
  const updateMutation = useMutation({
    mutationFn: ({ cheie, valoare }: { cheie: string; valoare: string }) =>
      api.updateSetting(cheie, valoare),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings'] });
    },
  });

  // Generate embeddings mutation
  const embeddingsMutation = useMutation({
    mutationFn: () => api.generateEmbeddings(true),
    onSuccess: (data) => {
      toast.success(`Embeddings generate: ${data.generated}/${data.total}`);
    },
    onError: () => {
      toast.error('Eroare la generarea embeddings');
    },
  });

  const handleSaveSettings = async () => {
    try {
      await Promise.all([
        updateMutation.mutateAsync({ cheie: 'ollama_host', valoare: ollamaHost }),
        updateMutation.mutateAsync({ cheie: 'ollama_embedding_model', valoare: embeddingModel }),
        updateMutation.mutateAsync({ cheie: 'ollama_chat_model', valoare: chatModel }),
      ]);
      toast.success('Setări salvate');
    } catch {
      toast.error('Eroare la salvarea setărilor');
    }
  };

  // Initialize values from settings
  React.useEffect(() => {
    if (settings.length > 0) {
      const host = settings.find((s) => s.cheie === 'ollama_host');
      const emb = settings.find((s) => s.cheie === 'ollama_embedding_model');
      const chat = settings.find((s) => s.cheie === 'ollama_chat_model');
      
      if (host?.valoare && !ollamaHost) setOllamaHost(host.valoare);
      if (emb?.valoare && !embeddingModel) setEmbeddingModel(emb.valoare);
      if (chat?.valoare && !chatModel) setChatModel(chat.valoare);
    }
  }, [settings]);

  if (isLoadingSettings) {
    return (
      <div className="flex justify-center py-12">
        <Spinner size="lg" />
      </div>
    );
  }

  const isConnected = ollamaStatus?.status === 'connected';

  return (
    <div>
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-xl font-bold text-stone-900 dark:text-stone-100">
          Conexiune AI (Ollama)
        </h1>
        <p className="text-sm text-stone-500 mt-1">
          Configurează conexiunea la Ollama pentru autocomplete semantic
        </p>
      </div>

      {/* Connection Status */}
      <Card className="mb-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className={`p-3 rounded-xl ${isConnected ? 'bg-green-100 dark:bg-green-900/30' : 'bg-stone-100 dark:bg-stone-800'}`}>
              <Bot className={`w-6 h-6 ${isConnected ? 'text-green-600' : 'text-stone-500'}`} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-semibold text-stone-900 dark:text-stone-100">
                  Status conexiune
                </span>
                {ollamaStatus && (
                  <Badge variant={isConnected ? 'green' : 'red'}>
                    {isConnected ? 'Conectat' : 'Deconectat'}
                  </Badge>
                )}
              </div>
              {ollamaStatus && (
                <p className="text-sm text-stone-500 mt-1">
                  {isConnected 
                    ? `Host: ${ollamaStatus.host}` 
                    : ollamaStatus.error || 'Nu s-a putut conecta'
                  }
                </p>
              )}
            </div>
          </div>
          
          <Button
            variant="secondary"
            onClick={() => testConnection()}
            loading={isTestingConnection}
            icon={<RefreshCw className="w-4 h-4" />}
          >
            Testează
          </Button>
        </div>

        {/* Models info */}
        {isConnected && ollamaStatus?.models && ollamaStatus.models.length > 0 && (
          <div className="mt-4 pt-4 border-t border-stone-200 dark:border-stone-700">
            <h4 className="text-sm font-medium text-stone-700 dark:text-stone-300 mb-2">
              Modele disponibile:
            </h4>
            <div className="flex flex-wrap gap-2">
              {ollamaStatus.models.map((model) => (
                <Badge key={model} variant="gray">
                  <Cpu className="w-3 h-3 mr-1" />
                  {model}
                </Badge>
              ))}
            </div>
          </div>
        )}
      </Card>

      {/* Settings Form */}
      <Card className="mb-6">
        <h3 className="font-semibold text-stone-900 dark:text-stone-100 mb-4 flex items-center gap-2">
          <Server className="w-5 h-5" />
          Configurare conexiune
        </h3>

        <div className="space-y-4">
          <Input
            label="Ollama Host URL"
            value={ollamaHost}
            onChange={(e) => setOllamaHost(e.target.value)}
            placeholder="http://localhost:11434"
          />

          <Input
            label="Model pentru Embeddings"
            value={embeddingModel}
            onChange={(e) => setEmbeddingModel(e.target.value)}
            placeholder="mxbai-embed-large"
          />

          <Input
            label="Model pentru Chat (opțional)"
            value={chatModel}
            onChange={(e) => setChatModel(e.target.value)}
            placeholder="llama3.2:3b"
          />

          <div className="pt-2">
            <Button
              variant="primary"
              onClick={handleSaveSettings}
              loading={updateMutation.isPending}
              icon={<Save className="w-4 h-4" />}
            >
              Salvează setările
            </Button>
          </div>
        </div>
      </Card>

      {/* Generate Embeddings */}
      <Card>
        <h3 className="font-semibold text-stone-900 dark:text-stone-100 mb-2 flex items-center gap-2">
          <Sparkles className="w-5 h-5" />
          Regenerare Embeddings
        </h3>
        <p className="text-sm text-stone-500 mb-4">
          Generează vectori AI pentru toate denumirile din nomenclator. 
          Acest lucru îmbunătățește autocomplete-ul semantic.
        </p>

        <Button
          variant="secondary"
          onClick={() => embeddingsMutation.mutate()}
          loading={embeddingsMutation.isPending}
          disabled={!isConnected}
          icon={<Sparkles className="w-4 h-4" />}
        >
          Regenerează embeddings
        </Button>

        {!isConnected && (
          <p className="text-sm text-amber-600 dark:text-amber-400 mt-2">
            ⚠️ Trebuie să fii conectat la Ollama pentru a genera embeddings
          </p>
        )}
      </Card>

    </div>
  );
};
