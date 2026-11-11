'use client';

import { useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import { Button, Icon } from '@/components/ui';
import { formatCurrency } from '@/lib/formatters';
import {
  ehCobrancaEmAndamento, ehLinkDesligado, ehMaquininhaOcupada, type CobrancaSaldo, type ComoCobrar, type EstadoCobranca, type PaymentMethod, type PixComanda,
} from '@/lib/comanda';
import { GuiaMaquininha } from './GuiaMaquininha';
import { PainelCobrarPix } from './PainelCobrarPix';

// Cobrança do saldo da comanda, compartilhada pelo painel (ComandaModal) e pelo app da profissional
// (AtendimentoBancada). O que aparece depende da forma escolhida e do que o negócio tem conectado:
//  - Pix com Mercado Pago: Pix do gateway, confirmado sozinho (a comanda fecha sozinha);
//  - Pix sem gateway (ou "usar minha chave"): QR na chave Pix do negócio, confirmação manual;
//  - Débito/Crédito com Mercado Pago e uma maquininha Point escolhida: cobrança enviada à maquininha,
//    confirmada sozinha; sem isso (ou "digitar manualmente"), só o guia do valor para digitar;
//  - InfinitePay (Pix, débito ou crédito): link de pagamento com QR, o cliente paga no celular e a confirmação
//    vem por webhook; "usar minha chave Pix" / "digitar manualmente" seguem como alternativa.

const INTERVALO_MS = 3000;

type Erro = 'andamento' | 'ocupada' | 'link_desligado' | 'geral' | null;

interface Props {
  forma: PaymentMethod | null;
  total: number;
  /** Pix manual na chave do negócio (Fase 1). */
  gerarPixManual: () => Promise<PixComanda>;
  api: {
    estado: () => Promise<EstadoCobranca>;
    cobrar: (como: ComoCobrar) => Promise<CobrancaSaldo>;
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
  const [erro, setErro] = useState<Erro>(null);
  const [qr, setQr] = useState<string | null>(null);
  const [copiado, setCopiado] = useState(false);

  // As funções vêm novas a cada render do pai: os efeitos leem a versão mais recente por referência.
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
  const ehCartao = forma === 'debito' || forma === 'credito';
  const cobrava = forma === 'pix' || ehCartao;

  useEffect(() => {
    if (!cobrava) return;
    let ativo = true;
    apiRef.current.estado()
      .then((e) => { if (ativo) { setEstado(e); setFalhaEstado(false); } })
      .catch(() => { if (ativo) setFalhaEstado(true); });
    return () => { ativo = false; };
  }, [cobrava]);

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

  const codigo = pendente && cobranca?.via === 'pix' ? cobranca.codigoPix : null;
  const enderecoDoLink = pendente && cobranca?.via === 'link' ? cobranca.checkoutUrl ?? null : null;
  const fonteDoQr = codigo ?? enderecoDoLink;
  useEffect(() => {
    if (!fonteDoQr) { setQr(null); return; }
    let cancelado = false;
    QRCode.toDataURL(fonteDoQr, { margin: 1, width: 220 })
      .then((url) => { if (!cancelado) setQr(url); })
      .catch(() => { if (!cancelado) setQr(null); });
    return () => { cancelado = true; };
  }, [fonteDoQr]);

  const gerar = async (como: ComoCobrar) => {
    setGerando(true);
    setErro(null);
    try {
      const nova = await apiRef.current.cobrar(como);
      pagaAvisada.current = false;
      setEstado((e) => ({ gateway: e?.gateway ?? 'mercadopago', terminal: e?.terminal ?? null, cobranca: nova, avisoMaquininha: false }));
    } catch (e) {
      setErro(ehCobrancaEmAndamento(e) ? 'andamento' : ehMaquininhaOcupada(e) ? 'ocupada' : ehLinkDesligado(e) ? 'link_desligado' : 'geral');
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
    if (!fonteDoQr) return;
    try {
      await navigator.clipboard.writeText(fonteDoQr);
      setCopiado(true);
    } catch {
      setErro('geral');
    }
  };

  if (!cobrava) return null;
  if (estado === null && !falhaEstado) return <p className="text-[13px] text-muted">Carregando a cobrança...</p>;

  const semGateway = falhaEstado || estado?.gateway === null;

  // ─── Link da InfinitePay (Pix, débito e crédito) ─────────────────────────────
  if (estado?.gateway === 'infinitepay') {
    const voltar = (
      <Button type="button" variant="ghost" size="sm" onClick={() => setManual(false)}>Usar o link da InfinitePay</Button>
    );
    if (manual) {
      return (
        <div className="flex flex-col gap-2">
          {forma === 'pix' ? <PainelCobrarPix total={total} gerar={gerarPixManual} /> : <GuiaMaquininha total={total} />}
          {voltar}
        </div>
      );
    }
    const doLink = cobranca?.via === 'link' ? cobranca : null;
    const refazerLink = doLink?.situacao === 'expirada';
    return (
      <section aria-label="Cobrar por link de pagamento" className="flex flex-col gap-3 rounded-xl border border-line bg-surface p-4">
        <div className="flex items-center justify-between gap-3">
          <span className="flex items-center gap-2 text-[15px] font-bold text-ink">
            <Icon name="link" size={20} className="text-brand-text" />
            Link de pagamento
          </span>
          <span className="text-[18px] font-extrabold tabular-nums text-brand-text">{formatCurrency(doLink && pendente ? doLink.valor : total)}</span>
        </div>

        {paga && doLink ? (
          <p role="status" className="text-[14px] font-semibold text-success-text">Pagamento recebido. Fechando a comanda...</p>
        ) : pendente && doLink ? (
          <div className="flex flex-col items-center gap-3">
            <p className="text-[13px] text-muted">O cliente aponta a câmera para o QR Code e paga no celular, em Pix ou cartão.</p>
            {qr ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={qr} alt="QR Code do link de pagamento" width={220} height={220} className="rounded-lg border border-line bg-surface p-2" />
            ) : null}
            <p className="w-full break-all rounded-lg bg-surface-2 p-3 text-[12px] text-muted">{enderecoDoLink}</p>
            <Button type="button" variant="secondary" fullWidth onClick={copiar}>
              <Icon name="content_copy" size={18} />
              Copiar link
            </Button>
            {copiado && <p role="status" className="text-[13px] font-semibold text-success-text">Link copiado.</p>}
            <p role="status" className="text-[13px] text-muted">Aguardando o pagamento...</p>
            <Button type="button" variant="ghost" size="sm" onClick={cancelar}>Cancelar cobrança</Button>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {refazerLink && <p className="text-[13px] text-warning-text">O link venceu. Gere de novo.</p>}
            {doLink?.situacao === 'cancelada' && (
              <p role="status" className="text-[13px] text-warning-text">
                O link já enviado ainda pode ser pago pelo cliente. Se isso acontecer, avisamos você.
              </p>
            )}
            <Button
              type="button" fullWidth loading={gerando}
              onClick={() => gerar({ via: 'link', forma: forma === 'debito' ? 'debito' : forma === 'credito' ? 'credito' : 'pix' })}
            >
              <Icon name="link" size={18} />
              {refazerLink ? 'Tentar de novo' : 'Gerar link de pagamento'}
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={() => setManual(true)}>
              {forma === 'pix' ? 'Usar minha chave Pix' : 'Digitar manualmente'}
            </Button>
          </div>
        )}

        {erro === 'andamento' && <p role="alert" className="text-[13px] text-danger">Cancele a cobrança para alterar a comanda.</p>}
        {erro === 'link_desligado' && (
          <p role="alert" className="text-[13px] text-danger">O link de pagamento não está liberado na sua conta InfinitePay. Peça a liberação à InfinitePay.</p>
        )}
        {erro === 'geral' && <p role="alert" className="text-[13px] text-danger">Não foi possível gerar o link agora. Tente de novo.</p>}
      </section>
    );
  }

  // ─── Débito e crédito ────────────────────────────────────────────────────────
  if (ehCartao) {
    const terminal = estado?.terminal ?? null;
    const daMaquininha = cobranca?.via === 'maquininha' ? cobranca : null;
    // Com a ordem já enviada, a tela segue nela mesmo que a escolha da maquininha tenha mudado.
    if (semGateway || manual || (!terminal && !daMaquininha)) return <GuiaMaquininha total={total} />;
    const refazer = daMaquininha !== null && (daMaquininha.situacao === 'expirada' || daMaquininha.situacao === 'recusada');
    return (
      <section aria-label="Cobrar na maquininha" className="flex flex-col gap-3 rounded-xl border border-line bg-surface p-4">
        <div className="flex items-center justify-between gap-3">
          <span className="flex items-center gap-2 text-[15px] font-bold text-ink">
            <Icon name="credit_card" size={20} className="text-brand-text" />
            Cobrar na maquininha
          </span>
          <span className="text-[18px] font-extrabold tabular-nums text-brand-text">{formatCurrency(daMaquininha && pendente ? daMaquininha.valor : total)}</span>
        </div>
        {terminal && <p className="text-[13px] text-muted">{terminal.nome}</p>}

        {paga && daMaquininha ? (
          <p role="status" className="text-[14px] font-semibold text-success-text">Pagamento recebido. Fechando a comanda...</p>
        ) : pendente && daMaquininha ? (
          <div className="flex flex-col gap-2">
            <p role="status" className="text-[14px] text-ink">Aguardando o cliente passar o cartão na maquininha...</p>
            <Button type="button" variant="ghost" size="sm" onClick={cancelar}>Cancelar cobrança</Button>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {daMaquininha?.situacao === 'expirada' && <p className="text-[13px] text-warning-text">A cobrança venceu. Envie de novo.</p>}
            {daMaquininha?.situacao === 'recusada' && <p className="text-[13px] text-warning-text">O pagamento foi recusado na maquininha. Tente de novo.</p>}
            {estado?.avisoMaquininha && <p role="status" className="text-[13px] text-warning-text">Cancele também na maquininha.</p>}
            <Button type="button" fullWidth onClick={() => gerar({ via: 'maquininha', forma: forma === 'debito' ? 'debito' : 'credito' })} loading={gerando}>
              <Icon name="credit_card" size={18} />
              {refazer ? 'Tentar de novo' : 'Enviar para a maquininha'}
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={() => setManual(true)}>Digitar manualmente</Button>
          </div>
        )}

        {erro === 'andamento' && <p role="alert" className="text-[13px] text-danger">Cancele a cobrança para alterar a comanda.</p>}
        {erro === 'ocupada' && (
          <p role="alert" className="text-[13px] text-danger">Esta maquininha já tem uma cobrança aguardando. Termine ou cancele nela e tente de novo.</p>
        )}
        {erro === 'geral' && <p role="alert" className="text-[13px] text-danger">Não foi possível enviar para a maquininha agora. Tente de novo.</p>}
      </section>
    );
  }

  // ─── Pix ─────────────────────────────────────────────────────────────────────
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

  // Uma cobrança da maquininha (de antes da troca de forma) não fala sobre o Pix.
  const doPix = cobranca?.via === 'pix' ? cobranca : null;
  const refazer = doPix !== null && (doPix.situacao === 'expirada' || doPix.situacao === 'recusada');

  return (
    <section aria-label="Cobrar por Pix" className="flex flex-col gap-3 rounded-xl border border-line bg-surface p-4">
      <div className="flex items-center justify-between gap-3">
        <span className="flex items-center gap-2 text-[15px] font-bold text-ink">
          <Icon name="qr_code_2" size={20} className="text-brand-text" />
          Cobrar por Pix
        </span>
        <span className="text-[18px] font-extrabold tabular-nums text-brand-text">{formatCurrency(doPix && pendente ? doPix.valor : total)}</span>
      </div>

      {paga && doPix ? (
        <p role="status" className="text-[14px] font-semibold text-success-text">Pagamento recebido. Fechando a comanda...</p>
      ) : pendente && doPix ? (
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
          {doPix?.situacao === 'expirada' && <p className="text-[13px] text-warning-text">O Pix venceu. Gere de novo.</p>}
          {doPix?.situacao === 'recusada' && <p className="text-[13px] text-warning-text">O pagamento foi recusado. Tente de novo.</p>}
          <Button type="button" fullWidth onClick={() => gerar({ via: 'pix' })} loading={gerando}>
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
