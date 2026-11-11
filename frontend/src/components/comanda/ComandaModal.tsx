'use client';

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import Link from 'next/link';
import api from '@/lib/api';
import { cn } from '@/lib/cn';
import { formatCurrency, parseValorBR } from '@/lib/formatters';
import { getToday } from '@/lib/dateUtils';
import { Modal, Button, Avatar, Skeleton, Icon, Input } from '@/components/ui';
import { useToast } from '@/components/Toast';
import { formatarDuracao } from '@/components/appointments/LinhaDoTempo';
import { getApiErrorMessage } from '@/utils/handleApiError';
import { listarProdutos, type Produto } from '@/lib/produtos';
import { abrirCaixa, reabrirCaixa } from '@/lib/caixa';
import {
  abrirComanda, salvarComanda, fecharComanda, gerarPixComanda, buscarCobranca, cobrarComanda, cancelarCobranca, buscarAtalhos, calcularComanda, ehCaixaFechado, ehCaixaJaFechado, ROTULO_PAGAMENTO,
  type ComandaDetail, type ComandaShortcut, type PaymentMethod, type SalvarComandaInput,
} from '@/lib/comanda';
import type { Service } from '@/types';
import { AbrirCaixaInline, ReabrirCaixaInline } from './AbrirCaixaInline';
import { PainelCobrar } from './PainelCobrar';
import { useVocabulario } from '@/hooks/useVocabulario';

interface Extra { kind: 'servico' | 'produto'; refId: string; name: string; legenda: string | null; unitPrice: number; quantity: number }
interface Opcao { kind: 'servico' | 'produto'; id: string; name: string; price: number; legenda?: string | null }

const GORJETAS = [5, 10, 15] as const;
const TENTATIVAS_APOS_PAGAMENTO = 3;
const ESPERA_APOS_PAGAMENTO_MS = 1000;
const esperar = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const semAcento = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const round2 = (v: number) => Math.round(v * 100) / 100;
const numero = (s: string) => { const v = parseValorBR(s); return v !== null && v > 0 ? v : 0; };
// Dia local (AAAA-MM-DD) de um instante ISO, para saber se a comanda foi fechada hoje.
const diaLocal = (iso: string) => { const d = new Date(iso); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
// Preço curto dos atalhos e resultados da busca, como no Stitch: "R$ 30", "R$ 12,50".
const precoCurto = (v: number) => `R$ ${Number.isInteger(v) ? v : v.toFixed(2).replace('.', ',')}`;
// Valor em texto de botão: espaço comum no lugar do espaço inseparável do Intl, para o nome acessível.
const brl = (v: number) => formatCurrency(v).replace(/ /g, ' ');
const textoValor = (v: number) => (v > 0 ? String(v).replace('.', ',') : '');

const FORMAS: Array<{ chave: PaymentMethod; icone: string; legenda: string; selo?: string }> = [
  { chave: 'pix', icone: 'qr_code_2', legenda: 'Instantâneo', selo: 'Sem taxa' },
  { chave: 'debito', icone: 'credit_card', legenda: 'Máquina' },
  { chave: 'credito', icone: 'payments', legenda: 'À vista / 1x' },
  { chave: 'dinheiro', icone: 'attach_money', legenda: 'Troco disponível' },
];

export interface ComandaModalProps {
  appointmentId: string | null;
  onClose: () => void;
  onAtualizada: () => void;
}

export function ComandaModal({ appointmentId, onClose, onAtualizada }: ComandaModalProps) {
  const { showToast } = useToast();
  const { prof, adaptar } = useVocabulario();
  const [dto, setDto] = useState<ComandaDetail | null>(null);
  const [servicos, setServicos] = useState<Service[]>([]);
  const [produtos, setProdutos] = useState<Produto[]>([]);
  const [atalhos, setAtalhos] = useState<ComandaShortcut[]>([]);
  const [extras, setExtras] = useState<Extra[]>([]);
  const [busca, setBusca] = useState('');
  const [mostrarDesconto, setMostrarDesconto] = useState(false);
  const [descontoModo, setDescontoModo] = useState<'reais' | 'percentual'>('reais');
  const [descontoTexto, setDescontoTexto] = useState('');
  const [gorjeta, setGorjeta] = useState(0);
  const [gorjetaOutro, setGorjetaOutro] = useState(false);
  const [gorjetaTexto, setGorjetaTexto] = useState('');
  const [forma, setForma] = useState<PaymentMethod | null>(null);
  const [enviando, setEnviando] = useState(false);
  // Cobrança do saldo pendente no gateway: a comanda não pode mudar até pagar ou cancelar.
  const [bloqueada, setBloqueada] = useState(false);
  // Por que o fechamento parou no caixa: ainda não aberto hoje, ou já fechado hoje.
  const [pedirCaixa, setPedirCaixa] = useState<'abrir' | 'reabrir' | null>(null);
  // Sessão de clube/pacote: a dona pode desligar quando a cliente prefere pagar.
  const [usarCobertura, setUsarCobertura] = useState(true);

  useEffect(() => {
    if (!appointmentId) return;
    let ativo = true;
    setDto(null); setPedirCaixa(null); setBusca(''); setBloqueada(false);
    setMostrarDesconto(false); setDescontoModo('reais'); setDescontoTexto('');
    setGorjeta(0); setGorjetaOutro(false); setGorjetaTexto('');
    Promise.all([
      abrirComanda(appointmentId),
      buscarAtalhos().catch(() => [] as ComandaShortcut[]),
      listarProdutos().catch(() => [] as Produto[]),
      api.get<Service[]>('/business/services').then((r) => r.data).catch(() => [] as Service[]),
    ]).then(([c, a, p, s]) => {
      if (!ativo) return;
      setDto(c); setAtalhos(a); setProdutos(p); setServicos(s);
      setExtras(c.items.filter((i) => !i.isMain).map((i) => ({
        kind: i.kind, refId: i.refId ?? '', name: i.name,
        legenda: i.kind === 'produto' ? p.find((x) => x.id === i.refId)?.description ?? 'Produto' : null,
        unitPrice: i.unitPrice, quantity: i.quantity,
      })));
      setForma(c.paymentMethod);
      setUsarCobertura(c.cobertura.usando || (!!c.cobertura.disponivel && c.status === 'rascunho'));
      if ((GORJETAS as readonly number[]).includes(c.tip) || c.tip <= 0) setGorjeta(c.tip > 0 ? c.tip : 0);
      else { setGorjetaOutro(true); setGorjetaTexto(textoValor(c.tip)); }
      if (c.discount > 0) { setMostrarDesconto(true); setDescontoTexto(textoValor(c.discount)); }
    }).catch((e) => {
      if (!ativo) return;
      showToast(getApiErrorMessage(e, 'Não foi possível abrir a comanda'), 'error');
      onClose();
    });
    return () => { ativo = false; };
  }, [appointmentId]); // eslint-disable-line react-hooks/exhaustive-deps

  const principal = dto?.items.find((i) => i.isMain) ?? null;
  const cobertura = dto?.cobertura ?? null;
  // Comanda fechada mostra o que foi gravado; no rascunho vale a chave.
  const valorCoberto = dto?.status === 'fechada'
    ? principal?.coveredValue ?? null
    : usarCobertura && cobertura?.disponivel ? cobertura.disponivel.valorSessao : null;
  const coberto = valorCoberto !== null;
  const subtotalBruto = (principal && !coberto ? principal.unitPrice : 0) + extras.reduce((t, e) => t + e.unitPrice * e.quantity, 0);
  const descontoReais = descontoModo === 'percentual' ? round2(subtotalBruto * numero(descontoTexto) / 100) : numero(descontoTexto);
  const gorjetaFinal = gorjetaOutro ? numero(gorjetaTexto) : gorjeta;

  // Fechada: os totais gravados no fechamento (o desconto de sócia não é recalculado).
  const calc = useMemo(() => dto && (dto.status === 'fechada' ? dto.calc : calcularComanda({
    items: [
      ...(principal ? [{ kind: 'servico' as const, unitPrice: principal.unitPrice, quantity: 1, coveredValue: valorCoberto }] : []),
      ...extras.map((e) => ({ kind: e.kind, unitPrice: e.unitPrice, quantity: e.quantity })),
    ],
    depositAvailable: dto.depositAvailable, discount: descontoReais, tip: gorjetaFinal,
    serviceCommissionPct: dto.commission.servicePct, productCommissionPct: dto.commission.productPct,
    memberDiscountPct: dto.cobertura.descontoSociaPct,
  })), [dto, principal, extras, descontoReais, gorjetaFinal, valorCoberto]);
  // O desconto total inclui o da sócia; o backend recebe só o manual e recalcula o resto.
  const descontoManual = calc ? round2(calc.discount - calc.memberDiscount) : 0;

  const resultados = useMemo<Opcao[]>(() => {
    const termo = semAcento(busca.trim());
    if (!termo) return [];
    const opcoes: Opcao[] = [
      ...servicos.filter((s) => s.active !== false && s.id !== principal?.refId)
        .map((s) => ({ kind: 'servico' as const, id: s.id, name: s.name, price: Number(s.price), legenda: null })),
      ...produtos.filter((p) => p.active !== false)
        .map((p) => ({ kind: 'produto' as const, id: p.id, name: p.name, price: Number(p.price), legenda: p.description ?? 'Produto' })),
    ];
    return opcoes.filter((o) => semAcento(o.name).includes(termo)).slice(0, 6);
  }, [busca, servicos, produtos, principal]);

  const adicionar = (item: Opcao) => {
    setExtras((atual) => {
      const i = atual.findIndex((e) => e.kind === item.kind && e.refId === item.id);
      if (i >= 0) return atual.map((e, k) => (k === i ? { ...e, quantity: e.quantity + 1 } : e));
      const legenda = item.kind === 'produto' ? item.legenda ?? produtos.find((p) => p.id === item.id)?.description ?? 'Produto' : null;
      return [...atual, { kind: item.kind, refId: item.id, name: item.name, legenda, unitPrice: item.price, quantity: 1 }];
    });
    setBusca('');
  };
  const mudarQuantidade = (indice: number, delta: number) =>
    setExtras((atual) => atual.map((e, k) => (k === indice ? { ...e, quantity: Math.max(1, e.quantity + delta) } : e)));
  const remover = (indice: number) => setExtras((atual) => atual.filter((_, k) => k !== indice));

  const escolherGorjeta = (valor: number) => {
    if (!gorjetaOutro && gorjeta === valor) { setGorjeta(0); return; }
    setGorjetaOutro(false); setGorjetaTexto(''); setGorjeta(valor);
  };
  const alternarGorjetaOutro = () => {
    if (gorjetaOutro) { setGorjetaOutro(false); setGorjetaTexto(''); setGorjeta(0); return; }
    setGorjetaOutro(true); setGorjeta(0);
  };
  const removerDesconto = () => { setMostrarDesconto(false); setDescontoTexto(''); setDescontoModo('reais'); };

  const entrada = (): SalvarComandaInput => ({
    extras: extras.map((e) => ({ kind: e.kind, id: e.refId, quantity: e.quantity })),
    discount: descontoManual, tip: calc?.tip ?? 0, paymentMethod: forma,
    ...(cobertura?.disponivel ? { usarCobertura } : {}),
  });

  // Pagamento do saldo confirmado: o servidor fecha a comanda sozinho; relê até ver o fechamento.
  const aoPagar = async () => {
    if (!appointmentId) return;
    for (let n = 0; n < TENTATIVAS_APOS_PAGAMENTO; n++) {
      try {
        const c = await abrirComanda(appointmentId);
        setDto(c);
        if (c.status === 'fechada') {
          showToast(`Pagamento recebido. Comanda #${c.number} fechada`, 'success');
          onAtualizada();
          return;
        }
      } catch {
        // Tenta de novo: o fechamento pode estar terminando.
      }
      if (n < TENTATIVAS_APOS_PAGAMENTO - 1) await esperar(ESPERA_APOS_PAGAMENTO_MS);
    }
    showToast('Pagamento recebido. Abra o caixa e feche a comanda.', 'info');
    onAtualizada();
  };

  const salvarRascunho = async () => {
    if (!dto) return;
    setEnviando(true);
    try {
      await salvarComanda(dto.id, entrada());
      showToast('Rascunho salvo', 'success');
      onAtualizada();
    } catch (e) {
      showToast(getApiErrorMessage(e, 'Erro ao salvar a comanda'), 'error');
    } finally { setEnviando(false); }
  };

  const fechar = async () => {
    if (!dto) return;
    setEnviando(true);
    try {
      const fechada = await fecharComanda(dto.id, entrada());
      const extra = fechada.receiptSentAt ? ' · comprovante enviado' : dto.whatsappConnected ? ' · comprovante não enviado' : '';
      showToast(`Comanda #${fechada.number} fechada${extra}`, 'success');
      onAtualizada();
      onClose();
    } catch (e) {
      if (ehCaixaFechado(e)) setPedirCaixa('abrir');
      else if (ehCaixaJaFechado(e)) setPedirCaixa('reabrir');
      else showToast(getApiErrorMessage(e, 'Erro ao fechar a comanda'), 'error');
    } finally { setEnviando(false); }
  };

  const abrirCaixaEFechar = async (saldo: number) => {
    setEnviando(true);
    try {
      await abrirCaixa(saldo);
      setPedirCaixa(null);
    } catch (e) {
      showToast(getApiErrorMessage(e, 'Erro ao abrir o caixa'), 'error');
      setEnviando(false);
      return;
    }
    await fechar();
  };

  const reabrirCaixaEFechar = async () => {
    setEnviando(true);
    try {
      await reabrirCaixa();
      setPedirCaixa(null);
    } catch (e) {
      showToast(getApiErrorMessage(e, 'Erro ao reabrir o caixa'), 'error');
      setEnviando(false);
      return;
    }
    await fechar();
  };

  if (!appointmentId) return null;

  const carregando = !dto || !calc;
  const somenteLeitura = dto?.status === 'fechada';
  const primeiroNome = dto?.professional.name.trim().split(/\s+/)[0] ?? '';
  const qtdItens = (principal ? 1 : 0) + extras.length;
  const semComissao = dto ? dto.commission.servicePct === 0 && dto.commission.productPct === 0 : false;
  const faltaForma = !!calc && calc.totalCharged > 0 && !forma;
  // Cartões do rodapé só afirmam o que é verdade para esta comanda.
  const mostrarComprovante = !!dto?.whatsappConnected && (!somenteLeitura || !!dto.receiptSentAt);
  const mostrarLancamento = !!dto && (!somenteLeitura || (!!dto.closedAt && diaLocal(dto.closedAt) === getToday()));
  const rotuloFechar = dto?.whatsappConnected
    ? `Fechar comanda e enviar WhatsApp (${brl(calc?.totalCharged ?? 0)})`
    : `Fechar comanda (${brl(calc?.totalCharged ?? 0)})`;

  return (
    <Modal isOpen onClose={onClose} title="Fechamento de comanda" size="xl" headerless>
      {carregando ? (
        <div className="flex flex-col gap-4 p-6">
          <Skeleton className="h-16 w-full" label="Carregando comanda" />
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
            <div className="flex flex-col gap-3 lg:col-span-7">
              <Skeleton className="h-20 w-full" />
              <Skeleton className="h-20 w-full" />
              <Skeleton className="h-32 w-full" />
            </div>
            <Skeleton className="h-72 w-full lg:col-span-5" />
          </div>
        </div>
      ) : (
        <>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {/* Cabeçalho */}
            <div className="flex flex-col justify-between gap-4 rounded-t-card bg-surface-2 p-6 max-sm:rounded-none md:flex-row md:items-center">
              <div className="flex items-start gap-4 md:items-center">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-brand text-on-brand shadow-sm">
                  <Icon name="point_of_sale" size={26} />
                </div>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full bg-brand px-2.5 py-0.5 text-[12px] font-bold uppercase tracking-wider text-on-brand">
                      Comanda #{dto.number}
                    </span>
                    <span className="text-[13px] font-medium text-muted">Finalização de atendimento</span>
                  </div>
                  <h1 className="mt-1 text-[22px] font-bold text-ink">{dto.client.name}</h1>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-3 rounded-xl bg-surface px-3 py-2 shadow-sm">
                  <Avatar name={dto.professional.name} size={36} className="font-bold text-brand-text" />
                  <div className="flex flex-col">
                    <span className="text-[12px] text-muted">{prof.S} responsável</span>
                    <span className="text-[13px] font-bold text-ink">{dto.professional.name}</span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={onClose}
                  aria-label="Fechar comanda"
                  className="ml-auto flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-surface text-muted transition-colors hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand md:ml-0"
                >
                  <Icon name="close" size={20} />
                </button>
              </div>
            </div>

            <fieldset disabled={somenteLeitura || bloqueada} className="m-0 grid min-w-0 grid-cols-1 gap-8 border-0 p-6 lg:grid-cols-12 lg:p-8">
              {/* Coluna esquerda: itens, extras e forma de pagamento */}
              <div className="flex min-w-0 flex-col gap-6 lg:col-span-7">
                <div>
                  <div className="mb-3 flex items-center justify-between gap-2">
                    <h2 className="flex items-center gap-2 text-[18px] font-bold text-ink">
                      <Icon name="receipt_long" size={22} className="text-brand-text" />
                      <span>Itens do atendimento</span>
                    </h2>
                    <span className="text-[12px] text-muted">
                      {qtdItens} {qtdItens === 1 ? 'item registrado' : 'itens registrados'}
                    </span>
                  </div>
                  <ul className="space-y-3">
                    {principal ? (
                      <li className="flex items-center justify-between gap-4 rounded-xl bg-surface-2 p-4">
                        <div className="flex min-w-0 items-center gap-3">
                          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-surface text-brand-text shadow-sm">
                            <Icon name="brush" size={22} />
                          </div>
                          <div className="flex min-w-0 flex-col">
                            <span className="truncate text-[15px] font-semibold text-ink">{principal.name}</span>
                            <div className="flex flex-wrap items-center gap-2 text-[14px] text-muted">
                              {principal.durationMinutes ? (
                                <>
                                  <span className="flex items-center gap-1">
                                    <Icon name="schedule" size={16} />
                                    <span>{formatarDuracao(principal.durationMinutes)}</span>
                                  </span>
                                  <span aria-hidden="true">•</span>
                                </>
                              ) : null}
                              <span className="rounded-full bg-surface px-2 py-0.5 text-[12px] text-ink">Serviço principal</span>
                              {coberto && cobertura?.disponivel ? (
                                <span className="rounded-full bg-success/15 px-2 py-0.5 text-[12px] font-semibold text-success-text">
                                  Coberto pelo {cobertura.disponivel.tipo === 'clube' ? 'clube' : 'pacote'}
                                  {cobertura.disponivel.sessao !== null
                                    ? ` · Sessão ${cobertura.disponivel.sessao}${cobertura.disponivel.de !== null ? ` de ${cobertura.disponivel.de}` : ''}`
                                    : ''}
                                </span>
                              ) : null}
                            </div>
                          </div>
                        </div>
                        {coberto ? (
                          <span className="flex shrink-0 flex-col items-end">
                            <span className="text-[13px] text-muted line-through">{formatCurrency(principal.unitPrice)}</span>
                            <span className="text-[15px] font-bold text-success-text">{formatCurrency(0)}</span>
                          </span>
                        ) : (
                          <span className="shrink-0 text-right text-[15px] font-bold text-ink">{formatCurrency(principal.unitPrice)}</span>
                        )}
                      </li>
                    ) : null}
                    {cobertura?.disponivel && !somenteLeitura ? (
                      <li className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-success/30 bg-success/8 p-4">
                        <div className="flex min-w-0 items-center gap-3">
                          <Icon name="loyalty" size={22} className="shrink-0 text-success-text" />
                          <div className="min-w-0">
                            <p className="text-[14px] font-semibold text-ink">Clube / pacote ativo · {cobertura.disponivel.nome}</p>
                            <p className="text-[12px] text-muted">
                              {usarCobertura
                                ? `A sessão sai a R$ 0,00. A comissão de ${primeiroNome} é sobre ${formatCurrency(cobertura.disponivel.valorSessao)}.`
                                : 'Desligado: o serviço será cobrado normalmente.'}
                            </p>
                          </div>
                        </div>
                        <label className="flex cursor-pointer items-center gap-2 text-[13px] font-semibold text-ink">
                          <input
                            type="checkbox"
                            role="switch"
                            checked={usarCobertura}
                            onChange={(ev) => setUsarCobertura(ev.target.checked)}
                            className="h-5 w-9 cursor-pointer accent-brand"
                          />
                          Usar {cobertura.disponivel.tipo === 'clube' ? 'clube' : 'pacote'}
                        </label>
                      </li>
                    ) : null}
                    {cobertura?.bloqueio && !somenteLeitura ? (
                      <li role="status" className="flex items-start gap-3 rounded-xl border border-warning/30 bg-warning/8 p-4 text-[13px]">
                        <Icon name="info" size={20} className="shrink-0 text-warning-text" />
                        <span>
                          <strong className="text-ink">{cobertura.bloqueio.nome}</strong>
                          <span className="text-muted"> não cobre esta sessão: {cobertura.bloqueio.motivo}.</span>
                        </span>
                      </li>
                    ) : null}
                    {extras.map((e, i) => (
                      <li key={`${e.kind}-${e.refId}`} className="flex flex-wrap items-center justify-between gap-4 rounded-xl bg-surface-2 p-4 sm:flex-nowrap">
                        <div className="flex min-w-0 items-center gap-3">
                          <div
                            className={cn(
                              'flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-surface shadow-sm',
                              e.kind === 'produto' ? 'text-tertiary' : 'text-brand-text',
                            )}
                          >
                            <Icon name={e.kind === 'produto' ? 'shopping_bag' : 'brush'} size={22} />
                          </div>
                          <div className="flex min-w-0 flex-col">
                            <span className="truncate text-[15px] font-semibold text-ink">{e.name}</span>
                            <span className="text-[14px] text-muted">{e.kind === 'produto' ? e.legenda ?? 'Produto' : 'Serviço extra'}</span>
                          </div>
                        </div>
                        <div className="ml-auto flex shrink-0 items-center gap-4">
                          <div className="flex items-center rounded-lg bg-surface p-1 shadow-sm">
                            <button
                              type="button"
                              onClick={() => mudarQuantidade(i, -1)}
                              disabled={e.quantity <= 1}
                              aria-label={`Diminuir quantidade de ${e.name}`}
                              className="flex h-7 w-7 items-center justify-center text-muted transition-colors hover:text-ink disabled:opacity-40"
                            >
                              <Icon name="remove" size={16} />
                            </button>
                            <span className="w-7 text-center text-[13px] font-bold text-ink">{e.quantity}</span>
                            <button
                              type="button"
                              onClick={() => mudarQuantidade(i, 1)}
                              aria-label={`Aumentar quantidade de ${e.name}`}
                              className="flex h-7 w-7 items-center justify-center text-muted transition-colors hover:text-ink"
                            >
                              <Icon name="add" size={16} />
                            </button>
                          </div>
                          <span className="text-right text-[15px] font-bold text-ink">{formatCurrency(e.unitPrice * e.quantity)}</span>
                          <button
                            type="button"
                            onClick={() => remover(i)}
                            aria-label={`Remover ${e.name}`}
                            className="flex h-8 w-8 items-center justify-center rounded-lg text-danger transition-colors hover:bg-danger/10"
                          >
                            <Icon name="delete" size={18} />
                          </button>
                        </div>
                      </li>
                    ))}
                  </ul>

                  <div className="mt-4 flex flex-col gap-3 rounded-xl bg-surface-2 p-4">
                    <span className="flex items-center gap-1.5 text-[13px] font-bold text-ink">
                      <Icon name="add_circle" size={18} />
                      <span>Adicionar serviço ou produto extra</span>
                    </span>
                    <div className="relative">
                      <Icon name="search" size={20} className="pointer-events-none absolute left-3 top-3 text-muted" />
                      <input
                        type="search"
                        value={busca}
                        onChange={(ev) => setBusca(ev.target.value)}
                        placeholder="Buscar serviço ou produto"
                        aria-label="Buscar serviço ou produto"
                        className="h-11 w-full rounded-xl border-0 bg-surface pl-10 pr-4 text-[14px] text-ink placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-brand"
                      />
                    </div>
                    {busca.trim() ? (
                      resultados.length > 0 ? (
                        <div className="flex flex-wrap items-center gap-2">
                          {resultados.map((r) => (
                            <BotaoItem key={`${r.kind}-${r.id}`} onClick={() => adicionar(r)} icone={r.kind === 'produto' ? 'shopping_bag' : 'add'}>
                              {`${r.name} (${precoCurto(r.price)})`}
                            </BotaoItem>
                          ))}
                        </div>
                      ) : (
                        <p className="text-[12px] text-muted">Nenhum serviço ou produto encontrado</p>
                      )
                    ) : null}
                    {atalhos.length > 0 ? (
                      <div className="flex flex-wrap items-center gap-2 pt-1">
                        <span className="text-[12px] text-muted">Atalhos:</span>
                        {atalhos.map((a) => (
                          <BotaoItem key={`${a.kind}-${a.id}`} onClick={() => adicionar({ kind: a.kind, id: a.id, name: a.name, price: a.price })} icone="add">
                            {`${a.name} (${precoCurto(a.price)})`}
                          </BotaoItem>
                        ))}
                      </div>
                    ) : null}
                  </div>
                </div>

                <div>
                  <h2 id="forma-pagamento-titulo" className="mb-3 flex items-center gap-2 text-[18px] font-bold text-ink">
                    <Icon name="credit_card" size={22} className="text-brand-text" />
                    <span>Forma de pagamento</span>
                  </h2>
                  <div role="radiogroup" aria-labelledby="forma-pagamento-titulo" className="grid grid-cols-2 gap-3">
                    {FORMAS.map((f) => {
                      const ativa = forma === f.chave;
                      return (
                        <label
                          key={f.chave}
                          className={cn(
                            'relative flex cursor-pointer flex-col rounded-xl p-3.5 transition-all focus-within:ring-2 focus-within:ring-brand',
                            ativa ? 'bg-brand/10 ring-2 ring-brand' : 'bg-surface-2 hover:bg-line/60',
                          )}
                        >
                          <input
                            type="radio"
                            name="forma-pagamento"
                            value={f.chave}
                            checked={ativa}
                            onChange={() => setForma(f.chave)}
                            className="sr-only"
                          />
                          <span className="mb-2 flex items-center justify-between">
                            <Icon name={f.icone} size={22} className={ativa ? 'text-brand-text' : 'text-muted'} />
                            {f.selo ? (
                              <span className="rounded-full bg-success/20 px-2 py-0.5 text-[12px] font-bold text-success-text">{f.selo}</span>
                            ) : null}
                          </span>
                          <span className="text-[15px] font-semibold text-ink">{ROTULO_PAGAMENTO[f.chave]}</span>
                          <span className="text-[12px] text-muted">{f.legenda}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Coluna direita: resumo financeiro e repasse */}
              <div className="flex min-w-0 flex-col gap-5 lg:col-span-5">
                <div className="flex flex-col gap-4 rounded-card bg-surface-2 p-6 shadow-sm">
                  <h2 className="flex items-center justify-between text-[15px] font-bold text-ink">
                    <span>Resumo financeiro</span>
                    <Icon name="calculate" size={20} className="text-muted" />
                  </h2>
                  <div className="space-y-2.5 text-[14px] text-ink">
                    <Linha rotulo="Serviços executados" valor={formatCurrency(calc.servicesTotal)} />
                    {calc.coveredTotal > 0 ? <Linha rotulo="Sessão coberta (clube/pacote)" valor={formatCurrency(0)} /> : null}
                    {calc.productsTotal > 0 ? <Linha rotulo="Produtos extras" valor={formatCurrency(calc.productsTotal)} /> : null}
                    <div className="flex items-center justify-between pt-1">
                      <span className="font-medium text-muted">Subtotal</span>
                      <span className="font-bold">{formatCurrency(calc.subtotal)}</span>
                    </div>
                    {calc.depositApplied > 0 ? (
                      <div className="flex items-center justify-between rounded-lg bg-success/10 p-2.5 text-[13px] font-bold text-success-text">
                        <span className="flex items-center gap-1.5">
                          <Icon name="verified" size={18} />
                          <span>Sinal já pago via Pix</span>
                        </span>
                        <span>− {formatCurrency(calc.depositApplied)}</span>
                      </div>
                    ) : null}
                  </div>

                  <div className="flex flex-col gap-2 pt-2">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2">
                        <Icon name="sell" size={18} className="text-muted" />
                        <span className="text-[14px] text-muted">Desconto</span>
                      </div>
                      {mostrarDesconto ? (
                        <div className="flex items-center gap-2">
                          {descontoManual > 0 ? (
                            <span className="text-[14px] font-semibold text-ink">− {formatCurrency(descontoManual)}</span>
                          ) : null}
                          <button
                            type="button"
                            onClick={removerDesconto}
                            aria-label="Remover desconto"
                            className="flex h-7 w-7 items-center justify-center rounded-lg text-muted transition-colors hover:text-ink"
                          >
                            <Icon name="close" size={16} />
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setMostrarDesconto(true)}
                          className="flex items-center gap-1 text-[12px] font-bold text-brand-text hover:underline"
                        >
                          <Icon name="add" size={16} />
                          Adicionar desconto
                        </button>
                      )}
                    </div>
                    {mostrarDesconto ? (
                      <div className="flex items-center gap-2">
                        <Input
                          inputMode="decimal"
                          value={descontoTexto}
                          onChange={(ev) => setDescontoTexto(ev.target.value)}
                          aria-label="Valor do desconto"
                          placeholder={descontoModo === 'percentual' ? '0' : '0,00'}
                          className="h-10 flex-1 bg-surface"
                        />
                        <div className="flex rounded-lg bg-surface p-1 shadow-sm">
                          {(['reais', 'percentual'] as const).map((modo) => (
                            <button
                              key={modo}
                              type="button"
                              onClick={() => setDescontoModo(modo)}
                              aria-pressed={descontoModo === modo}
                              aria-label={modo === 'reais' ? 'Desconto em reais' : 'Desconto em percentual'}
                              className={cn(
                                'h-8 min-w-9 rounded-md px-2 text-[13px] font-bold transition-colors',
                                descontoModo === modo ? 'bg-brand text-on-brand' : 'text-muted hover:text-ink',
                              )}
                            >
                              {modo === 'reais' ? 'R$' : '%'}
                            </button>
                          ))}
                        </div>
                      </div>
                    ) : null}
                    {calc.memberDiscount > 0 ? (
                      <div className="flex items-center justify-between text-[14px]">
                        <span className="flex items-center gap-2 text-muted">
                          <Icon name="loyalty" size={18} />
                          Desconto de sócia ({String(dto.cobertura.descontoSociaPct).replace('.', ',')}%)
                        </span>
                        <span className="font-semibold text-ink">− {formatCurrency(calc.memberDiscount)}</span>
                      </div>
                    ) : null}
                  </div>

                  <div className="pt-2">
                    <div className="mb-2 flex items-center justify-between">
                      <span className="flex items-center gap-1.5 text-[13px] font-bold text-ink">
                        <Icon name="volunteer_activism" size={18} className="text-brand-text" />
                        <span>Gorjeta para {primeiroNome}</span>
                      </span>
                      <span className="text-[12px] text-muted">100% repassado</span>
                    </div>
                    <div className="grid grid-cols-4 gap-2">
                      {GORJETAS.map((v) => (
                        <BotaoGorjeta key={v} ativo={!gorjetaOutro && gorjeta === v} onClick={() => escolherGorjeta(v)}>
                          R$ {v}
                        </BotaoGorjeta>
                      ))}
                      <BotaoGorjeta ativo={gorjetaOutro} onClick={alternarGorjetaOutro}>
                        Outro
                      </BotaoGorjeta>
                    </div>
                    {gorjetaOutro ? (
                      <Input
                        inputMode="decimal"
                        value={gorjetaTexto}
                        onChange={(ev) => setGorjetaTexto(ev.target.value)}
                        aria-label="Valor da gorjeta"
                        placeholder="0,00"
                        className="mt-2 h-10 bg-surface"
                      />
                    ) : null}
                  </div>

                  <div className="mt-2 flex items-center justify-between gap-3 pt-4">
                    <div className="flex flex-col">
                      <span className="text-[12px] font-bold uppercase tracking-wider text-muted">Total a cobrar</span>
                      <span className="text-[12px] text-muted">Saldo remanescente</span>
                    </div>
                    <span data-testid="total-a-cobrar" className="text-[28px] font-extrabold tracking-tight text-brand-text">
                      {formatCurrency(calc.totalCharged)}
                    </span>
                  </div>
                </div>

                <div className="flex flex-col gap-3 rounded-card bg-surface-2 p-5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="flex items-center gap-1.5 text-[13px] font-bold text-ink">
                      <Icon name="analytics" size={18} className="text-tertiary" />
                      <span>Divisão do repasse automático</span>
                    </span>
                    <span className="text-[12px] text-muted">
                      {dto.commission.origem === 'profissional' ? adaptar('Regra da profissional') : 'Regra do negócio'}
                    </span>
                  </div>
                  {semComissao ? (
                    <p className="text-[14px] text-muted">
                      <Link href="/configuracoes" className="font-bold text-brand-text hover:underline">
                        Configure a comissão em Ajustes
                      </Link>
                    </p>
                  ) : (
                    <>
                      <div className="space-y-1.5 text-[14px] text-muted">
                        <Linha
                          rotulo={`Serviço (${dto.commission.servicePct}% de ${formatCurrency(calc.serviceBase)})`}
                          valor={formatCurrency(calc.commissionService)}
                          forte
                        />
                        {calc.productsTotal > 0 ? (
                          <Linha
                            rotulo={`Produto (${dto.commission.productPct}% de ${formatCurrency(calc.productBase)})`}
                            valor={formatCurrency(calc.commissionProduct)}
                            forte
                          />
                        ) : null}
                        {calc.tip > 0 ? <Linha rotulo="Gorjeta integral" valor={formatCurrency(calc.tip)} forte /> : null}
                      </div>
                      <div className="flex items-center justify-between pt-3">
                        <div className="flex flex-col">
                          <span className="text-[12px] text-muted">Comissão total {prof.doS}</span>
                          <span className="text-[15px] font-bold text-success-text">{formatCurrency(calc.commissionTotal)}</span>
                        </div>
                        <div className="flex flex-col text-right">
                          <span className="text-[12px] text-muted">Retenção da casa</span>
                          <span className="text-[15px] font-bold text-ink">{formatCurrency(calc.houseRetention)}</span>
                        </div>
                      </div>
                    </>
                  )}
                </div>
              </div>
            </fieldset>

            {/* Fora do fieldset: com a comanda travada, "Cancelar cobrança" precisa continuar clicável. */}
            {forma && calc.totalCharged > 0 && !somenteLeitura ? (
              <div className="px-6 pb-6 lg:px-8">
                <PainelCobrar
                  forma={forma}
                  total={calc.totalCharged}
                  gerarPixManual={() => gerarPixComanda(dto.id, entrada())}
                  api={{
                    estado: () => buscarCobranca(dto.id),
                    cobrar: (como) => {
                      const { paymentMethod: forma, ...semForma } = entrada();
                      void forma;
                      return cobrarComanda(dto.id, semForma, como);
                    },
                    cancelar: () => cancelarCobranca(dto.id),
                  }}
                  onPendente={setBloqueada}
                  onPaga={aoPagar}
                />
              </div>
            ) : null}

            {/* Cartões informativos */}
            {mostrarComprovante || mostrarLancamento ? (
              <div className="grid grid-cols-1 gap-4 px-6 pb-6 md:grid-cols-2 lg:px-8">
                {mostrarComprovante ? (
                  <CartaoInfo icone="chat" tom="whatsapp" titulo="Comprovante instantâneo" texto={adaptar('Enviado pelo WhatsApp da cliente')} />
                ) : null}
                {mostrarLancamento ? (
                  <CartaoInfo icone="account_balance_wallet" tom="success" titulo="Lançamento em caixa" texto="Entrada no caixa de hoje" />
                ) : null}
              </div>
            ) : null}
          </div>

          {/* Rodapé */}
          <div className="flex flex-col-reverse items-center justify-between gap-4 rounded-b-card bg-surface-2 p-6 max-sm:rounded-none sm:flex-row">
            {somenteLeitura ? (
              <>
                <span className="flex items-center gap-1.5 text-[14px] font-semibold text-success-text">
                  <Icon name="check_circle" size={18} />
                  <span>Comanda fechada</span>
                </span>
                <Button variant="secondary" onClick={onClose} className="w-full rounded-xl sm:w-auto">
                  Fechar
                </Button>
              </>
            ) : pedirCaixa === 'reabrir' ? (
              <ReabrirCaixaInline carregando={enviando} onReabrir={reabrirCaixaEFechar} />
            ) : pedirCaixa === 'abrir' ? (
              <AbrirCaixaInline carregando={enviando} rotuloBotao="Abrir caixa e fechar comanda" onAbrir={abrirCaixaEFechar} />
            ) : (
              <>
                <Button
                  variant="secondary"
                  onClick={salvarRascunho}
                  disabled={enviando || bloqueada}
                  className="w-full rounded-xl border-0 bg-surface px-5 shadow-sm sm:w-auto"
                >
                  <Icon name="bookmark" size={18} />
                  Salvar como rascunho
                </Button>
                <div className="flex w-full flex-col items-stretch gap-1 sm:w-auto sm:items-end">
                  <Button
                    size="lg"
                    onClick={fechar}
                    loading={enviando}
                    disabled={faltaForma || bloqueada}
                    aria-describedby={faltaForma ? 'dica-forma-pagamento' : undefined}
                    className="w-full whitespace-normal rounded-xl px-8 text-[15px] shadow-md sm:w-auto"
                  >
                    {enviando ? null : <Icon name="check_circle" size={22} />}
                    {rotuloFechar}
                  </Button>
                  {faltaForma ? (
                    <span id="dica-forma-pagamento" className="text-center text-[12px] text-muted sm:text-right">
                      Escolha a forma de pagamento
                    </span>
                  ) : null}
                </div>
              </>
            )}
          </div>
        </>
      )}
    </Modal>
  );
}

function Linha({ rotulo, valor, forte = false }: { rotulo: string; valor: string; forte?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className={forte ? undefined : 'text-muted'}>{rotulo}</span>
      <span className={cn('font-semibold', forte && 'text-ink')}>{valor}</span>
    </div>
  );
}

function BotaoItem({ onClick, icone, children }: { onClick: () => void; icone: string; children: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-1 rounded-lg bg-surface px-3 py-1.5 text-[12px] text-ink shadow-sm transition-all hover:bg-line/60"
    >
      <Icon name={icone} size={16} className="text-brand-text" />
      {children}
    </button>
  );
}

function BotaoGorjeta({ ativo, onClick, children }: { ativo: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={ativo}
      className={cn(
        'rounded-lg py-1.5 text-[13px] transition-colors',
        ativo ? 'bg-brand font-bold text-on-brand shadow-sm' : 'bg-surface font-semibold text-ink hover:bg-line/60',
      )}
    >
      {children}
    </button>
  );
}

function CartaoInfo({ icone, tom, titulo, texto }: { icone: string; tom: 'whatsapp' | 'success'; titulo: string; texto: string }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-line bg-surface p-4 shadow-sm">
      <div
        className={cn(
          'flex h-10 w-10 shrink-0 items-center justify-center rounded-lg',
          tom === 'whatsapp' ? 'bg-whatsapp/10 text-whatsapp' : 'bg-success/10 text-success-text',
        )}
      >
        <Icon name={icone} size={22} />
      </div>
      <div className="flex flex-col">
        <span className="text-[13px] font-bold text-ink">{titulo}</span>
        <span className="text-[14px] text-muted">{texto}</span>
      </div>
    </div>
  );
}
