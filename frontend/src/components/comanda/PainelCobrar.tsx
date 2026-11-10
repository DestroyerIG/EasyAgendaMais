'use client';

import { useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import { Button, Icon } from '@/components/ui';
import { formatCurrency } from '@/lib/formatters';
import { ehCobrancaEmAndamento, type EstadoCobranca, type PaymentMethod, type PixComanda } from '@/lib/comanda';
import { GuiaMaquininha } from './GuiaMaquininha';
import { PainelCobrarPix } from './PainelCobrarPix';

// Cobrança do saldo da comanda, compartilhada pelo painel (ComandaModal) e pelo app da profissional
// (AtendimentoBancada). O que aparece depende da forma escolhida e do que o negócio tem conectado:
//  - Pix com Mercado Pago: Pix do gateway, confirmado sozinho (a comanda fecha sozinha);
//  - Pix sem gateway (ou "usar minha chave"): QR na chave Pix do negócio, confirmação manual;
//  - Débito/Crédito: só o guia do valor para digitar na maquininha.

const INTERVALO_MS = 3000;

interface Props {
  forma: PaymentMethod | null;
  total: number;
  /** Pix manual na chave do negócio (Fase 1). */
  gerarPixManual: () => Promise<PixComanda>;
  api: {
    estado: () => Promise<EstadoCobranca>;
    cobrar: () => Promise<NonNullable<EstadoCobranca['cobranca']>>;
    cancelar: () => Promise<EstadoCobranca>;
  };
  /** Cobrança pendente: a comanda precisa ficar travada na tela. */
  onPendente: (pendente: boolean) => void;
  /** Pagamento confirmado: a comanda foi (ou vai ser) fechada pelo servidor. */
  onPaga: () => void;
}

export function PainelCobrar({ forma, total, gerarPixManual, api, onPendente, onPaga }: Props) {
  const [estado, setEstado] = useState<EstadoCobranca | null>(null);
  const [falhaEstado, setFalhaEstado] = useState(false);
  const [manual, setManual] = useState(false);
  const [gerando, setGerando] = useState(false);
  const [erro, setErro] = useState<'andamento' | 'geral' | null>(null);
  const [qr, setQr] = useState<string | null>(null);
  const [copiado, setCopiado] = useState(false);

  // As funções vêm novas a cada render do pai: as efeitos leem a versão mais recente por referência.
  const apiRef = useRef(api);
  apiRef.current = api;
  const onPendenteRef = useRef(onPendente);
  onPendenteRef.current = onPendente;
  const onPagaRef = useRef(onPaga);
  onPagaRef.current = onPaga;
  const pagaAvisada = useRef(false);

  const cobranca = estado?.cobranca ?? null;
  const pendente = cobranca?.situacao === 'pendente';
  const paga = cobranca?.situacao === 'paga';

  useEffect(() => {
    if (forma !== 'pix') return;
    let ativo = true;
    apiRef.current.estado()
      .then((e) => { if (ativo) { setEstado(e); setFalhaEstado(false); } })
      .catch(() => { if (ativo) setFalhaEstado(true); });
    return () => { ativo = false; };
  }, [forma]);

  useEffect(() => { onPendenteRef.current(pendente); }, [pendente]);

  // Enquanto aguarda, consulta o estado até o pagamento entrar ou a cobrança vencer.
  useEffect(() => {
    if (!pendente) return;
    const timer = setInterval(() => {
      apiRef.current.estado().then(setEstado).catch(() => undefined);
    }, INTERVALO_MS);
    return () => clearInterval(timer);
  }, [pendente]);

  useEffect(() => {
    if (paga && !pagaAvisada.current) {
      pagaAvisada.current = true;
      onPagaRef.current();
    }
  }, [paga]);

  const codigo = pendente ? cobranca?.codigoPix ?? null : null;
  useEffect(() => {
    if (!codigo) { setQr(null); return; }
    let cancelado = false;
    QRCode.toDataURL(codigo, { margin: 1, width: 220 })
      .then((url) => { if (!cancelado) setQr(url); })
      .catch(() => { if (!cancelado) setQr(null); });
    return () => { cancelado = true; };
  }, [codigo]);

  const gerar = async () => {
    setGerando(true);
    setErro(null);
    try {
      const nova = await apiRef.current.cobrar();
      pagaAvisada.current = false;
      setEstado((e) => ({ gateway: e?.gateway ?? 'mercadopago', cobranca: nova }));
    } catch (e) {
      setErro(ehCobrancaEmAndamento(e) ? 'andamento' : 'geral');
    } finally {
      setGerando(false);
    }
  };

  const cancelar = async () => {
    setErro(null);
    try {
      setEstado(await apiRef.current.cancelar());
    } catch {
      setErro('geral');
    }
  };

  const copiar = async () => {
    if (!codigo) return;
    try {
      await navigator.clipboard.writeText(codigo);
      setCopiado(true);
    } catch {
      setErro('geral');
    }
  };

  if (forma === 'debito' || forma === 'credito') return <GuiaMaquininha total={total} />;
  if (forma !== 'pix') return null;

  const semGateway = falhaEstado || (estado !== null && estado.gateway === null);
  if (semGateway || manual) {
    return (
      <div className="flex flex-col gap-2">
        <PainelCobrarPix total={total} gerar={gerarPixManual} />
        {manual && !semGateway && (
          <Button type="button" variant="ghost" size="sm" onClick={() => setManual(false)}>Usar o Pix do Mercado Pago</Button>
        )}
      </div>
    );
  }
  if (estado === null) return <p className="text-[13px] text-muted">Carregando a cobrança...</p>;

  const refazer = cobranca !== null && (cobranca.situacao === 'expirada' || cobranca.situacao === 'recusada');

  return (
    <section aria-label="Cobrar por Pix" className="flex flex-col gap-3 rounded-xl border border-line bg-surface p-4">
      <div className="flex items-center justify-between gap-3">
        <span className="flex items-center gap-2 text-[15px] font-bold text-ink">
          <Icon name="qr_code_2" size={20} className="text-brand-text" />
          Cobrar por Pix
        </span>
        <span className="text-[18px] font-extrabold tabular-nums text-brand-text">{formatCurrency(cobranca && pendente ? cobranca.valor : total)}</span>
      </div>

      {paga ? (
        <p role="status" className="text-[14px] font-semibold text-success-text">Pagamento recebido. Fechando a comanda...</p>
      ) : pendente ? (
        <div className="flex flex-col items-center gap-3">
          {qr ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={qr} alt="QR Code do Pix" width={220} height={220} className="rounded-lg border border-line bg-surface p-2" />
          ) : null}
          <p className="w-full break-all rounded-lg bg-surface-2 p-3 text-[12px] text-muted">{codigo}</p>
          <Button type="button" variant="secondary" fullWidth onClick={copiar}>
            <Icon name="content_copy" size={18} />
            Copiar código
          </Button>
          {copiado && <p role="status" className="text-[13px] font-semibold text-success-text">Código copiado.</p>}
          <p role="status" className="text-[13px] text-muted">Aguardando o pagamento...</p>
          <Button type="button" variant="ghost" size="sm" onClick={cancelar}>Cancelar cobrança</Button>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {cobranca?.situacao === 'expirada' && <p className="text-[13px] text-warning-text">O Pix venceu. Gere de novo.</p>}
          {cobranca?.situacao === 'recusada' && <p className="text-[13px] text-warning-text">O pagamento foi recusado. Tente de novo.</p>}
          <Button type="button" fullWidth onClick={gerar} loading={gerando}>
            <Icon name="qr_code_2" size={18} />
            {refazer ? 'Tentar de novo' : 'Gerar Pix'}
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={() => setManual(true)}>Usar minha chave Pix</Button>
        </div>
      )}

      {erro === 'andamento' && <p role="alert" className="text-[13px] text-danger">Cancele a cobrança para alterar a comanda.</p>}
      {erro === 'geral' && <p role="alert" className="text-[13px] text-danger">Não foi possível gerar o Pix agora. Tente de novo.</p>}
    </section>
  );
}
