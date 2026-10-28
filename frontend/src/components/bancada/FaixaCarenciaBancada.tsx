'use client';

import { Banner } from '@/components/ui';
import { useEstadoConta } from '@/hooks/useEstadoConta';

// Aviso da profissional na carência: sem valores e sem falar de cobrança.
export function FaixaCarenciaBancada() {
  const { estado } = useEstadoConta();
  if (estado?.tipo !== 'carencia') return null;
  return (
    <div className="mx-auto max-w-xl px-4 pt-3">
      <Banner tone="warning">
        Agenda em modo restrito: só os atendimentos de hoje podem ser concluídos.
      </Banner>
    </div>
  );
}
