'use client';

import { Banner } from '@/components/ui';
import type { EstadoConta } from '@/lib/conta';

// Aviso da profissional na carência: sem valores e sem falar de cobrança.
export function FaixaCarenciaBancada({ estado }: { estado: EstadoConta | null }) {
  if (estado?.tipo !== 'carencia') return null;
  return (
    <div className="mx-auto max-w-xl px-4 pt-3">
      <Banner tone="warning">
        Agenda em modo restrito: só os atendimentos de hoje podem ser concluídos.
      </Banner>
    </div>
  );
}

// Conta bloqueada: a profissional não vê valores nem fala de pagamento, só o recado neutro.
export function AvisoAgendaPausadaBancada() {
  return (
    <Banner tone="warning">
      A agenda está pausada. Fale com a responsável pelo estabelecimento.
    </Banner>
  );
}
