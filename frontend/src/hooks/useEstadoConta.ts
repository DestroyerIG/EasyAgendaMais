'use client';

import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { contaApi, type EstadoConta } from '@/lib/conta';

// Estado da conta (ativa, carência ou bloqueada). Só consulta com a pessoa autenticada.
export function useEstadoConta(): { estado: EstadoConta | null; recarregar(): Promise<EstadoConta | null> } {
  const { user } = useAuth();
  const logado = Boolean(user);
  const [estado, setEstado] = useState<EstadoConta | null>(null);

  // Devolve o estado lido (ou null se falhar), para quem precisa decidir na hora.
  const recarregar = useCallback(async (): Promise<EstadoConta | null> => {
    if (!logado) return null;
    try {
      const novo = await contaApi.estado();
      setEstado(novo);
      return novo;
    } catch {
      // Sem o estado o painel segue como está; o servidor continua barrando o que for preciso.
      return null;
    }
  }, [logado]);

  useEffect(() => {
    void recarregar();
  }, [recarregar]);

  return { estado, recarregar };
}
