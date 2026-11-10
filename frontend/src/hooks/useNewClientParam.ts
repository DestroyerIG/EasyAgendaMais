'use client';

import { useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

// O balão "Novo cliente" do + da barra inferior leva a /clientes?novo=1; a tela de Clientes
// abre o cadastro e limpa o parâmetro para não reabrir ao voltar.
export function useNewClientParam(): { open: boolean; clear: () => void } {
  const searchParams = useSearchParams();
  const router = useRouter();
  const open = searchParams.get('novo') === '1';

  const clear = useCallback(() => {
    router.replace('/clientes', { scroll: false });
  }, [router]);

  return { open, clear };
}
