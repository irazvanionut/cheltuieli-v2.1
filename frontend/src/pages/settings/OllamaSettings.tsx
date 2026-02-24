import React from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Bot, RefreshCw, Server, Cpu, Sparkles } from 'lucide-react';
import { toast } from 'react-hot-toast';

import api from '@/services/api';
import { Card, Button, Badge } from '@/components/ui';

export const OllamaSettings: React.FC = () => {

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

      {/* Settings moved to Keys */}
      <div className="mb-6 px-4 py-3 rounded-xl border border-stone-200 dark:border-stone-700 bg-stone-50 dark:bg-stone-800/50 text-sm text-stone-500 dark:text-stone-400 flex items-center gap-2">
        <Server className="w-4 h-4 shrink-0" />
        Configurarea conexiunii (host, modele) se face din <strong className="text-stone-700 dark:text-stone-300">Setări › Keys</strong>.
      </div>

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
