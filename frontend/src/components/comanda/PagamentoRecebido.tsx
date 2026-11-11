'use client';

import { Icon } from '@/components/ui';
import { CascaPublica } from '@/components/publicBooking/CascaPublica';

// Para onde o link de pagamento da InfinitePay devolve o cliente depois de pagar. Pública e sem dados: quem
// paga não tem conta, e a confirmação para o negócio vem por webhook, não por esta página.
export function PagamentoRecebido() {
  return (
    <CascaPublica cor={null}>
      <main className="flex flex-1 flex-col items-center justify-center gap-4 px-4 py-16 text-center">
        <span className="flex h-16 w-16 items-center justify-center rounded-full bg-success/15 text-success-text">
          <Icon name="check_circle" size={40} />
        </span>
        <h1 className="text-[24px] font-bold text-ink">Pagamento recebido</h1>
        <p className="max-w-sm text-[15px] text-muted">Obrigado! O estabelecimento já foi avisado. Você pode fechar esta página.</p>
      </main>
    </CascaPublica>
  );
}
