'use client';

import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { contaApi, type EstadoConta } from '@/lib/conta';

// Estado da conta (ativa, carência ou bloqueada). Só consulta com a pessoa autenticada.
export function useEstadoConta(): { estado: EstadoConta | null; recarregar(): Promise<void> } {
  const { user } = useAuth();
  const logado = Boolean(user);
  const [estado, setEstado] = useState<EstadoConta | null>(null);

  const recarregar = useCallback(async () => {
    if (!logado) return;
    try {
      setEstado(await contaApi.estado());
    } catch {
      // Sem o estado o painel segue como está; o servidor continua barrando o que for preciso.
    }
  }, [logado]);

  useEffect(() => {
    void recarregar();
  }, [recarregar]);

  return { estado, recarregar };
}
