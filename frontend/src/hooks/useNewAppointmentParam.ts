'use client';

import { useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

// O botão "+" da barra inferior leva a /agendamentos?novo=1; a Agenda abre o modal de criação.
export function useNewAppointmentParam(): { open: boolean; clear: () => void } {
  const searchParams = useSearchParams();
  const router = useRouter();
  const open = searchParams.get('novo') === '1';

  const clear = useCallback(() => {
    if (open) {
      router.replace('/agendamentos', { scroll: false });
    }
  }, [open, router]);

  return { open, clear };
}
