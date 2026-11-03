'use client';

import { useState } from 'react';
import { billingApi } from '@/lib/billing';
import { formatCurrency } from '@/lib/formatters';
import { getApiErrorMessage } from '@/utils/handleApiError';
import { PixPagamento } from '@/components/planos/PixPagamento';
import { Button, Icon } from '@/components/ui';

// Bloco de pagamento da tela de assinatura vencida (Stitch "Pague via Pix").
// Pix: gera a cobrança da mensalidade (`billing/reactivate`) e acompanha até o Asaas confirmar.
// Cartão: abre a fatura vencida na página do Asaas, onde ela paga com outro cartão. Gerar Pix para
// uma assinatura de cartão criaria uma segunda cobrança em paralelo, por isso o cartão não vê Pix.

type PixGerado = { paymentId: string; qrCode: string | null; pixCopyPaste: string | null; expiraEm: string | null };

export interface PagamentoContingenciaProps {
  /** null: a forma de pagamento não pôde ser lida; só sobra o "Já paguei". */
  forma: 'pix' | 'cartao' | null;
  valor: number | null;
  onPagarComCartao: () => void;
  pagandoComCartao?: boolean;
  /** Pagamento confirmado pelo acompanhamento do Pix. */
  onPago: () => void;
  /** "Já paguei": confere a cobrança e diz se a conta voltou a ficar ativa. */
  onConferir: () => Promise<boolean>;
}

const validade = (iso: string | null): string | null => {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const dia = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(d);
  const hora = new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' }).format(d);
  return `${dia} às ${hora}`;
};

export function PagamentoContingencia({
  forma,
  valor,
  onPagarComCartao,
  pagandoComCartao = false,
  onPago,
  onConferir,
}: PagamentoContingenciaProps) {
  const [pix, setPix] = useState<PixGerado | null>(null);
  const [gerando, setGerando] = useState(false);
  const [conferindo, setConferindo] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);

  const gerarPix = async () => {
    setGerando(true);
    setAviso(null);
    try {
      const r = await billingApi.reactivateSubscription();
      if ('reactivationMode' in r && r.reactivationMode === 'new_pix_checkout' && 'paymentId' in r && r.paymentId) {
        setPix({ paymentId: r.paymentId, qrCode: r.qrCode, pixCopyPaste: r.pixCopyPaste, expiraEm: r.expiresAt ?? null });
      } else if (!(await onConferir())) {
        setAviso('Não foi possível gerar o Pix agora. Tente de novo em alguns minutos.');
      }
    } catch (error) {
      setAviso(getApiErrorMessage(error, 'Não foi possível gerar o Pix agora. Tente de novo em alguns minutos.'));
    } finally {
      setGerando(false);
    }
  };

  const jaPaguei = async () => {
    setConferindo(true);
    setAviso(null);
    try {
      if (!(await onConferir())) {
        setAviso('O pagamento ainda não foi confirmado. Se você acabou de pagar, tente de novo em alguns minutos.');
      }
    } finally {
      setConferindo(false);
    }
  };

  const validoAte = validade(pix?.expiraEm ?? null);

  return (
    <section className="rounded-card border border-line bg-surface p-4 shadow-sm sm:p-6" aria-labelledby="pagamento-titulo">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="rounded-full bg-brand/12 px-2.5 py-0.5 text-[12px] font-bold uppercase tracking-wider text-brand-text">
          Mensalidade em aberto
        </span>
        {forma && (
          <span className="flex items-center gap-1 text-[13px] font-semibold text-muted">
            <Icon name={forma === 'pix' ? 'qr_code_2' : 'credit_card'} size={16} />
            {forma === 'pix' ? 'Pix' : 'Cartão de crédito'}
          </span>
        )}
      </div>

      <div className="mt-3">
        <h2 id="pagamento-titulo" className="text-xl font-bold text-ink sm:text-2xl">
          {forma === 'pix' ? 'Pague com Pix' : forma === 'cartao' ? 'Pague com outro cartão' : 'Regularize a mensalidade'}
        </h2>
        <p className="mt-1 text-[14px] text-muted">
          {forma === 'pix'
            ? 'Quando o pagamento for confirmado, o painel volta ao normal.'
            : forma === 'cartao'
              ? 'No portal de pagamento você cadastra outro cartão e quita a mensalidade.'
              : 'Não foi possível carregar a forma de pagamento agora. Se já pagou, confira abaixo; se precisar, fale com o suporte.'}
        </p>
      </div>

      {pix ? (
        <div className="mt-4 rounded-xl bg-surface-2 p-4">
          <PixPagamento
            paymentId={pix.paymentId}
            valor={valor}
            qrCode={pix.qrCode}
            pixCopyPaste={pix.pixCopyPaste}
            acompanhar
            onPago={onPago}
          />
          {validoAte && (
            <p className="mt-3 flex items-center justify-center gap-1.5 text-[13px] text-muted">
              <Icon name="timer" size={16} />
              Código válido até {validoAte}
            </p>
          )}
        </div>
      ) : (
        valor !== null && (
          <div className="mt-4 flex flex-col items-center rounded-xl bg-surface-2 p-4 text-center">
            <span className="text-[13px] font-semibold text-muted">Valor da mensalidade</span>
            <span className="mt-1 text-3xl font-extrabold tracking-tight text-ink sm:text-4xl">{formatCurrency(valor)}</span>
          </div>
        )
      )}

      <div className="mt-4 flex flex-col gap-2">
        {forma === 'pix' && !pix && (
          <Button fullWidth onClick={gerarPix} loading={gerando}>
            <Icon name="qr_code_2" size={20} />
            Gerar Pix
          </Button>
        )}
        {forma === 'cartao' && (
          <Button fullWidth onClick={onPagarComCartao} loading={pagandoComCartao}>
            <Icon name="credit_card" size={20} />
            Pagar com outro cartão
          </Button>
        )}
        <Button variant="secondary" fullWidth onClick={jaPaguei} loading={conferindo}>
          <Icon name="check_circle" size={20} />
          Já paguei
        </Button>
        {aviso && (
          <p role="status" className="text-center text-[13px] text-warning-text">
            {aviso}
          </p>
        )}
      </div>
    </section>
  );
}
