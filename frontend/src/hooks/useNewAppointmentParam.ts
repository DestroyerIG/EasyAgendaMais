'use client';

import { useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

// O botão "+" da barra inferior leva a /agendamentos?novo=1; a Agenda abre o modal de criação.
// Com &cliente=<id> (ex.: "agendar" da lista de Clientes), a cliente já vem escolhida.
export function useNewAppointmentParam(): { open: boolean; clienteId: string | null; clear: () => void } {
  const searchParams = useSearchParams();
  const router = useRouter();
  const open = searchParams.get('novo') === '1';
  const clienteId = open ? searchParams.get('cliente') || null : null;

  const clear = useCallback(() => {
    if (open) {
      router.replace('/agendamentos', { scroll: false });
    }
  }, [open, router]);

  return { open, clienteId, clear };
}
