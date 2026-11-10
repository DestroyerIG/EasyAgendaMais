'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import QRCode from 'qrcode';
import { Button, Icon } from '@/components/ui';
import { formatCurrency } from '@/lib/formatters';
import { ehChavePixAusente, type PixComanda } from '@/lib/comanda';

// Cobrança do saldo da comanda por Pix, na chave do negócio. Compartilhado pelo painel (ComandaModal)
// e pelo app da profissional (AtendimentoBancada). O código só sai quando a pessoa pede e é sempre
// calculado pelo servidor; se o total mudar depois, o QR antigo some para ninguém pagar o valor errado.

interface Props {
  /** Total a cobrar mostrado na comanda. Mudou depois de gerado: o QR deixa de valer. */
  total: number;
  /** Salva o rascunho e devolve o código Pix do saldo. */
  gerar: () => Promise<PixComanda>;
}

type Falha = 'sem_chave' | 'erro' | null;

export function PainelCobrarPix({ total, gerar }: Props) {
  const [pix, setPix] = useState<PixComanda | null>(null);
  const [qr, setQr] = useState<string | null>(null);
  const [gerando, setGerando] = useState(false);
  const [falha, setFalha] = useState<Falha>(null);
  const [copiado, setCopiado] = useState(false);
  const [venceu, setVenceu] = useState(false);
  const totalGerado = useRef<number | null>(null);

  // O total da comanda mudou depois de gerado: descarta o QR antigo.
  useEffect(() => {
    if (pix && totalGerado.current !== null && totalGerado.current !== total) {
      setPix(null);
      setQr(null);
      setCopiado(false);
      setVenceu(true);
      totalGerado.current = null;
    }
  }, [total, pix]);

  useEffect(() => {
    if (!pix) return;
    let cancelado = false;
    QRCode.toDataURL(pix.pixPayload, { margin: 1, width: 220 })
      .then((url) => { if (!cancelado) setQr(url); })
      .catch(() => { if (!cancelado) setQr(null); });
    return () => { cancelado = true; };
  }, [pix]);

  const pedir = async () => {
    setGerando(true);
    setFalha(null);
    setVenceu(false);
    try {
      const r = await gerar();
      totalGerado.current = total;
      setPix(r);
    } catch (e) {
      setFalha(ehChavePixAusente(e) ? 'sem_chave' : 'erro');
    } finally {
      setGerando(false);
    }
  };

  const copiar = async () => {
    if (!pix) return;
    try {
      await navigator.clipboard.writeText(pix.pixPayload);
      setCopiado(true);
    } catch {
      setFalha('erro');
    }
  };

  return (
    <section aria-label="Cobrar por Pix" className="flex flex-col gap-3 rounded-xl border border-line bg-surface p-4">
      <div className="flex items-center justify-between gap-3">
        <span className="flex items-center gap-2 text-[15px] font-bold text-ink">
          <Icon name="qr_code_2" size={20} className="text-brand-text" />
          Cobrar por Pix
        </span>
        <span className="text-[18px] font-extrabold tabular-nums text-brand-text">{formatCurrency(pix ? pix.valor : total)}</span>
      </div>

      {venceu && (
        <p role="status" className="text-[13px] text-warning-text">O valor mudou. Gere o QR Code de novo.</p>
      )}

      {pix ? (
        <div className="flex flex-col items-center gap-3">
          {qr ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={qr} alt="QR Code do Pix" width={220} height={220} className="rounded-lg border border-line bg-surface p-2" />
          ) : null}
          <p className="w-full break-all rounded-lg bg-surface-2 p-3 text-[12px] text-muted">{pix.pixPayload}</p>
          <Button type="button" variant="secondary" fullWidth onClick={copiar}>
            <Icon name="content_copy" size={18} />
            Copiar código
          </Button>
          {copiado && <p role="status" className="text-[13px] font-semibold text-success-text">Código copiado.</p>}
        </div>
      ) : (
        <Button type="button" fullWidth onClick={pedir} loading={gerando}>
          <Icon name="qr_code_2" size={18} />
          Gerar QR Code
        </Button>
      )}

      {falha === 'sem_chave' && (
        <p role="alert" className="text-[13px] text-danger">
          Falta cadastrar a chave Pix do negócio. Cadastre em{' '}
          <Link href="/configuracoes/recebimentos" className="font-bold underline">Recebimentos</Link>.
        </p>
      )}
      {falha === 'erro' && (
        <p role="alert" className="text-[13px] text-danger">Não foi possível gerar o Pix. Tente novamente.</p>
      )}
    </section>
  );
}
