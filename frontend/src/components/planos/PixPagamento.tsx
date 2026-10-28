'use client';

import { useEffect, useRef, useState } from 'react';
import { billingApi } from '@/lib/billing';
import { formatCurrency } from '@/lib/formatters';
import { Button, Icon } from '@/components/ui';

// QR Code e copia-e-cola de uma cobrança Pix (diferença de upgrade ou mensalidade em
// aberto). Com `acompanhar`, consulta o pagamento a cada 5 s, como o checkout Pix já faz,
// e chama `onPago` quando o Asaas confirma.

export const INTERVALO_CONSULTA_PIX_MS = 5000;

const fonteDoQr = (valor: string | null): string | null => {
  if (!valor) return null;
  if (valor.startsWith('data:image/') || valor.startsWith('http://') || valor.startsWith('https://')) return valor;
  return `data:image/png;base64,${valor}`;
};

interface PixPagamentoProps {
  paymentId: string;
  /** Sem valor conhecido, a linha do valor não aparece. */
  valor: number | null;
  qrCode: string | null;
  pixCopyPaste: string | null;
  acompanhar?: boolean;
  onPago?: () => void;
}

export function PixPagamento({ paymentId, valor, qrCode, pixCopyPaste, acompanhar = false, onPago }: PixPagamentoProps) {
  const [copiado, setCopiado] = useState(false);
  const onPagoRef = useRef(onPago);
  onPagoRef.current = onPago;
  const qr = fonteDoQr(qrCode);

  useEffect(() => {
    if (!acompanhar) return;
    let ativo = true;
    const timer = window.setInterval(async () => {
      try {
        const r = await billingApi.getPixPaymentStatus(paymentId);
        if (ativo && r.status === 'active') {
          window.clearInterval(timer);
          onPagoRef.current?.();
        }
      } catch {
        // Falha de rede numa consulta: tenta de novo na próxima.
      }
    }, INTERVALO_CONSULTA_PIX_MS);
    return () => {
      ativo = false;
      window.clearInterval(timer);
    };
  }, [acompanhar, paymentId]);

  const copiar = async () => {
    if (!pixCopyPaste) return;
    try {
      await navigator.clipboard.writeText(pixCopyPaste);
      setCopiado(true);
      window.setTimeout(() => setCopiado(false), 2000);
    } catch {
      setCopiado(false);
    }
  };

  return (
    <div className="flex flex-col items-center gap-4 text-center">
      {valor !== null && (
        <>
          <div className="text-[13px] font-semibold uppercase tracking-wider text-muted">Valor do Pix</div>
          <div className="-mt-3 text-2xl font-bold text-ink">{formatCurrency(valor)}</div>
        </>
      )}
      {qr ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={qr} alt="QR Code do Pix" className="h-48 w-48 rounded-xl border border-line bg-surface p-2" />
      ) : (
        <div className="flex h-48 w-48 items-center justify-center rounded-xl border border-dashed border-line text-[13px] text-muted">
          QR Code indisponível. Use o copia e cola.
        </div>
      )}
      {pixCopyPaste && (
        <div className="w-full space-y-2">
          <div className="break-all rounded-control border border-line bg-surface-2 p-3 text-left font-mono text-[12px] text-muted">
            {pixCopyPaste}
          </div>
          <Button variant="secondary" fullWidth onClick={copiar}>
            <Icon name={copiado ? 'check' : 'content_copy'} size={18} />
            {copiado ? 'Código copiado' : 'Copiar código Pix'}
          </Button>
        </div>
      )}
      {acompanhar && (
        <p className="flex items-center gap-2 text-[13px] text-muted">
          <span className="h-2 w-2 animate-pulse rounded-full bg-warning" aria-hidden="true" />
          Aguardando o pagamento. A tela atualiza sozinha.
        </p>
      )}
    </div>
  );
}
