'use client';

import { useEstadoConta } from '@/hooks/useEstadoConta';

export const DICA_CARENCIA = 'Disponível depois de regularizar';

// Botões principais de escrita ficam desabilitados na carência. Os demais contam com o 402 do servidor.
export function useBloqueadoNaCarencia(): { bloqueado: boolean; dica: string | undefined } {
  const { estado } = useEstadoConta();
  const bloqueado = estado?.tipo === 'carencia';
  return { bloqueado, dica: bloqueado ? DICA_CARENCIA : undefined };
}
