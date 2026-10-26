'use client';

import axios from 'axios';
import { Lock, RefreshCw } from 'lucide-react';
import { EmptyState } from '@/components/ui';
import { getApiErrorMessage } from '@/utils/handleApiError';
import { useVocabulario } from '@/hooks/useVocabulario';

// Erro das telas da bancada. 403 é plano fora ou acesso encerrado: nada a fazer aqui, "Fale com o salão".

export function ErroBancada({ erro, onRetry }: { erro: unknown; onRetry?: () => void }) {
  const { prof } = useVocabulario();
  const status = axios.isAxiosError(erro) ? erro.response?.status : undefined;
  if (status === 403) {
    return (
      <EmptyState
        icon={Lock}
        title="App indisponível"
        description={`${getApiErrorMessage(erro, `O app ${prof.doS} não está liberado para o seu salão.`)} Fale com o salão.`}
      />
    );
  }
  return (
    <EmptyState
      icon={RefreshCw}
      title="Não deu para carregar"
      description={getApiErrorMessage(erro, 'Confira sua conexão e tente de novo.')}
      action={onRetry ? { label: 'Tentar de novo', icon: RefreshCw, onClick: onRetry } : undefined}
    />
  );
}
