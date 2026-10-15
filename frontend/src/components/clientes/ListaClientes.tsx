'use client';

/**
 * Lista do CRM de clientes (Stitch "Ajustada", 805f33). Tudo vem de GET /clients/insights:
 * fase, etiquetas (manuais e automáticas), última visita, ciclo médio, retorno previsto,
 * LTV e atendimentos — busca, fase, etiqueta, profissional, ordem e página são feitos no
 * servidor. A linha abre a ficha (/clientes/<id>).
 */

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import api from '@/lib/api';
import {
  Avatar,
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  EmptyState,
  Icon,
  Modal,
  Skeleton,
} from '@/components/ui';
import { useToast } from '@/components/Toast';
import { MensagemWhatsappModal } from '@/components/clientes/MensagemWhatsappModal';
import { cn } from '@/lib/cn';
import { formatCurrency, formatPhone } from '@/lib/formatters';
import { materialIcon } from '@/lib/materialIconAdapter';
import {
  buscarInsights,
  exportarClientesCsv,
  FASE_ROTULO,
  FASES,
  type ClienteInsight,
  type Fase,
  type InsightsDto,
  type InsightsQuery,
} from '@/lib/crm';
import { definirEtiquetasCliente, listarEtiquetas, type Etiqueta } from '@/lib/tags';
import { linkWhatsapp, MENSAGENS, preencherMensagem } from '@/lib/whatsappLink';
import { useRegisterTopBarSearch } from '@/components/shell/TopBarSearchContext';

const TAMANHO_PAGINA = 10;
const ESPERA_BUSCA_MS = 300;
const ICONE_GRUPO = materialIcon('group');
const ICONE_FILTRO = materialIcon('filter_alt_off');
const ICONE_ERRO = materialIcon('error');

type Ordem = NonNullable<InsightsQuery['ordem']>;
const ORDENS: Array<{ valor: Ordem; rotulo: string }> = [
  { valor: 'ultima_visita', rotulo: 'Última visita (mais recente)' },
  { valor: 'nome', rotulo: 'Nome' },
  { valor: 'ltv', rotulo: 'Maior LTV' },
  { valor: 'retorno', rotulo: 'Retorno vencido' },
];

// Rótulo curto das abas (o chip da tabela usa FASE_ROTULO).
const ROTULO_ABA: Record<Fase, string> = {
  novo: 'Novo', recorrente: 'Recorrente', fiel: 'Fiel', em_risco: 'Em risco', perdido: 'Perdido',
};

export const FASE_CORES: Record<Fase, { fundo: string; texto: string; ponto: string }> = {
  novo: { fundo: 'bg-tertiary/12', texto: 'text-tertiary', ponto: 'bg-tertiary' },
  recorrente: { fundo: 'bg-success/12', texto: 'text-success-text', ponto: 'bg-success' },
  fiel: { fundo: 'bg-brand/12', texto: 'text-brand-text', ponto: 'bg-brand' },
  em_risco: { fundo: 'bg-warning/12', texto: 'text-warning-text', ponto: 'bg-warning' },
  perdido: { fundo: 'bg-danger/12', texto: 'text-danger', ponto: 'bg-danger' },
};

// Cor da etiqueta manual (nome do token gravado na etiqueta) → classes.
export const ETIQUETA_CORES: Record<string, string> = {
  brand: 'bg-brand/12 text-brand-text',
  success: 'bg-success/12 text-success-text',
  warning: 'bg-warning/12 text-warning-text',
  danger: 'bg-danger/12 text-danger',
  tertiary: 'bg-tertiary/12 text-tertiary',
  muted: 'bg-surface-2 text-muted',
};

const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

/** "2026-09-17" → "17 set" (sem fuso: a data já é o dia do salão). */
export function diaMes(data: string): string {
  const [, mes, dia] = data.slice(0, 10).split('-').map(Number);
  if (!mes || !dia) return data;
  return `${dia} ${MESES[mes - 1]}`;
}

export function relativoDias(dias: number): string {
  if (dias <= 0) return '(hoje)';
  if (dias === 1) return '(ontem)';
  return `(há ${dias} dias)`;
}

/** Botões numéricos da paginação: 1ª, 2 seguintes, vizinhas da atual e a última. */
export function construirPaginas(atual: number, total: number): Array<number | '...'> {
  if (total <= 0) return [];
  const paginas = new Set<number>();
  [1, 2, 3, atual - 1, atual, atual + 1, total].forEach((p) => {
    if (p >= 1 && p <= total) paginas.add(p);
  });
  const ordenadas = [...paginas].sort((a, b) => a - b);
  const resultado: Array<number | '...'> = [];
  let anterior = 0;
  for (const p of ordenadas) {
    if (anterior && p - anterior > 1) resultado.push('...');
    resultado.push(p);
    anterior = p;
  }
  return resultado;
}

const primeiroNome = (nome: string) => nome.trim().split(/\s+/)[0] ?? nome;

const legendaCiclo = (c: ClienteInsight): { texto: string; alerta: boolean } => {
  if (c.cicloMedio === null) return { texto: 'Histórico em formação', alerta: false };
  if (c.retornoPrevisto.venceuHa !== null) return { texto: 'Ciclo estourado', alerta: true };
  return { texto: 'Padrão regular', alerta: false };
};

export interface ListaClientesProps {
  nomeNegocio?: string;
  onNovaCliente: () => void;
  onEditar: (cliente: ClienteInsight) => void;
  /** Muda quando o container cadastrou/editou alguém: a lista recarrega. */
  versao?: number;
  /** Total de clientes sem filtro de busca/etiqueta/profissional (para o cabeçalho). */
  onTotalGeral?: (total: number) => void;
}

interface Profissional { id: string; name: string }

export function ListaClientes({ nomeNegocio, onNovaCliente, onEditar, versao = 0, onTotalGeral }: ListaClientesProps) {
  const router = useRouter();
  const { showToast } = useToast();
  const buscaRef = useRef<HTMLInputElement>(null);

  const [textoBusca, setTextoBusca] = useState('');
  const [busca, setBusca] = useState('');
  const [fase, setFase] = useState<Fase | null>(null);
  const [ordem, setOrdem] = useState<Ordem>('ultima_visita');
  const [etiqueta, setEtiqueta] = useState('');
  const [profissional, setProfissional] = useState('');
  const [pagina, setPagina] = useState(1);

  const [dados, setDados] = useState<InsightsDto | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState(false);
  // Só a resposta do pedido mais recente vale: filtros trocados rápido não sobrescrevem dado novo.
  const ultimoPedido = useRef(0);
  const [exportando, setExportando] = useState(false);
  const [etiquetas, setEtiquetas] = useState<Etiqueta[]>([]);
  const [profissionais, setProfissionais] = useState<Profissional[]>([]);
  const [whatsappDe, setWhatsappDe] = useState<ClienteInsight | null>(null);
  const [etiquetasDe, setEtiquetasDe] = useState<ClienteInsight | null>(null);

  // A busca da barra superior do painel controla o mesmo campo.
  useRegisterTopBarSearch({ value: textoBusca, onChange: setTextoBusca });

  // Busca com espera: só pede de novo quando a digitação para.
  useEffect(() => {
    const id = setTimeout(() => {
      setBusca(textoBusca.trim());
      setPagina(1);
    }, ESPERA_BUSCA_MS);
    return () => clearTimeout(id);
  }, [textoBusca]);

  const carregar = useCallback(async () => {
    const pedido = ++ultimoPedido.current;
    setCarregando(true);
    try {
      const q: InsightsQuery = { page: pagina, pageSize: TAMANHO_PAGINA, ordem };
      if (busca) q.busca = busca;
      if (fase) q.fase = fase;
      if (etiqueta) q.etiqueta = etiqueta;
      if (profissional) q.profissional = profissional;
      const r = await buscarInsights(q);
      if (pedido !== ultimoPedido.current) return;
      setDados(r);
      setErro(false);
      if (!busca && !etiqueta && !profissional) onTotalGeral?.(r.contagemPorFase.todas);
    } catch {
      if (pedido !== ultimoPedido.current) return;
      setErro(true);
      showToast('Erro ao carregar clientes', 'error');
    } finally {
      if (pedido === ultimoPedido.current) setCarregando(false);
    }
    // onTotalGeral é callback do pai; não deve disparar recarga.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pagina, ordem, busca, fase, etiqueta, profissional, showToast, versao]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  useEffect(() => {
    listarEtiquetas().then(setEtiquetas).catch(() => setEtiquetas([]));
    api
      .get<Profissional[]>('/business/professionals')
      .then((r) => setProfissionais(Array.isArray(r?.data) ? r.data : []))
      .catch(() => setProfissionais([]));
  }, []);

  // Atalho "/" foca a busca quando o foco não está num campo de texto.
  useEffect(() => {
    function aoTeclar(e: KeyboardEvent) {
      if (e.key !== '/') return;
      const alvo = document.activeElement;
      if (
        alvo instanceof HTMLInputElement ||
        alvo instanceof HTMLTextAreaElement ||
        alvo instanceof HTMLSelectElement ||
        (alvo instanceof HTMLElement && alvo.isContentEditable)
      ) return;
      e.preventDefault();
      buscaRef.current?.focus();
    }
    window.addEventListener('keydown', aoTeclar);
    return () => window.removeEventListener('keydown', aoTeclar);
  }, []);

  const exportar = async () => {
    setExportando(true);
    try {
      await exportarClientesCsv();
    } catch {
      showToast('Erro ao exportar clientes', 'error');
    } finally {
      setExportando(false);
    }
  };

  const abrirFicha = (c: ClienteInsight) => router.push(`/clientes/${c.id}`);

  const contagem = dados?.contagemPorFase;
  const total = dados?.total ?? 0;
  const itens = dados?.itens ?? [];
  const totalPaginas = Math.max(1, Math.ceil(total / TAMANHO_PAGINA));
  const inicio = total === 0 ? 0 : (pagina - 1) * TAMANHO_PAGINA + 1;
  const fim = Math.min(pagina * TAMANHO_PAGINA, total);
  const temFiltro = Boolean(busca || fase || etiqueta || profissional);

  const abas: Array<{ valor: Fase | null; rotulo: string; n: number }> = [
    { valor: null, rotulo: 'Todas', n: contagem?.todas ?? 0 },
    ...FASES.map((f) => ({ valor: f, rotulo: ROTULO_ABA[f], n: contagem?.[f] ?? 0 })),
  ];

  const mensagemWhatsapp = (c: ClienteInsight) =>
    preencherMensagem(c.retornoPrevisto.venceuHa !== null ? MENSAGENS.retorno_vencido : MENSAGENS.pos_atendimento, {
      nome: primeiroNome(c.name),
      servico: c.ultimaVisita?.servico,
      negocio: nomeNegocio,
    });

  const acoes = (c: ClienteInsight) => {
    const temTelefone = linkWhatsapp(c.phone, 'x') !== null;
    return (
      // A célula de ações não abre a ficha ao ser clicada.
      <div className="inline-flex items-center gap-1" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
        <button
          type="button"
          disabled={!temTelefone}
          onClick={() => setWhatsappDe(c)}
          aria-label={`WhatsApp de ${c.name}`}
          title={temTelefone ? 'Conversar no WhatsApp' : 'Cadastre o telefone da cliente'}
          className="flex h-8 w-8 items-center justify-center rounded-lg bg-whatsapp/12 text-whatsapp transition-all hover:bg-whatsapp hover:text-surface disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-whatsapp/12 disabled:hover:text-whatsapp"
        >
          <Icon name="chat" size={18} />
        </button>
        <Link
          href={`/agendamentos?novo=1&cliente=${c.id}`}
          aria-label={`Agendar para ${c.name}`}
          title="Novo agendamento"
          className="flex h-8 w-8 items-center justify-center rounded-lg bg-surface-2 text-ink transition-all hover:bg-brand hover:text-on-brand"
        >
          <Icon name="add_circle" size={18} />
        </Link>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              aria-label={`Mais opções de ${c.name}`}
              title="Mais opções"
              className="flex h-8 w-8 items-center justify-center rounded-lg text-muted transition-colors hover:bg-surface-2 hover:text-ink"
            >
              <Icon name="more_vert" size={18} />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={() => onEditar(c)}>
              <Icon name="edit" size={18} className="text-muted" />
              Editar
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => setEtiquetasDe(c)}>
              <Icon name="sell" size={18} className="text-muted" />
              Etiquetas
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => abrirFicha(c)}>
              <Icon name="person" size={18} className="text-muted" />
              Ver ficha
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    );
  };

  const chipFase = (f: Fase) => (
    <span className={cn('inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-1 text-[12px] font-semibold', FASE_CORES[f].fundo, FASE_CORES[f].texto)}>
      <span className={cn('h-1.5 w-1.5 rounded-full', FASE_CORES[f].ponto)} />
      {FASE_ROTULO[f]}
    </span>
  );

  const etiquetasDaCliente = (c: ClienteInsight) =>
    c.tags.length > 0 || c.etiquetasAuto.length > 0 ? (
      <div className="mt-1 flex flex-wrap items-center gap-1.5">
        {c.tags.map((t) => (
          <span
            key={t.id}
            className={cn('inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-semibold', ETIQUETA_CORES[t.color] ?? ETIQUETA_CORES.muted)}
          >
            {t.name}
          </span>
        ))}
        {c.etiquetasAuto.map((nome) => (
          <span key={nome} className="inline-flex items-center rounded bg-surface-2 px-1.5 py-0.5 text-[10px] font-semibold text-muted">
            {nome}
          </span>
        ))}
      </div>
    ) : null;

  const corpo = (): ReactNode => {
    if (carregando && !dados) {
      return (
        <div className="flex flex-col gap-3 p-4">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-14 w-full" label={i === 0 ? 'Carregando clientes...' : undefined} />
          ))}
        </div>
      );
    }
    if (erro && !dados) {
      return (
        <EmptyState
          icon={ICONE_ERRO}
          title="Não foi possível carregar as clientes"
          action={{ label: 'Tentar de novo', onClick: () => carregar() }}
          actionVariant="secondary"
        />
      );
    }
    if (itens.length === 0) {
      return temFiltro ? (
        <EmptyState icon={ICONE_FILTRO} title="Nenhuma cliente encontrada com esses filtros" />
      ) : (
        <EmptyState
          icon={ICONE_GRUPO}
          title="Nenhuma cliente cadastrada"
          action={{ label: '+ Nova cliente', onClick: onNovaCliente }}
          actionVariant="secondary"
        />
      );
    }
    return (
      <>
        <div className="hidden overflow-x-auto lg:block">
          <table className="w-full min-w-[960px] border-collapse text-left">
            <thead>
              <tr className="select-none bg-surface-2 text-[11px] font-semibold uppercase tracking-wider text-muted">
                <th className="py-3.5 pl-5 pr-3 font-semibold">Cliente</th>
                <th className="px-3 py-3.5 font-semibold">Fase CRM</th>
                <th className="px-3 py-3.5 font-semibold">Última visita</th>
                <th className="px-3 py-3.5 font-semibold">Ciclo médio</th>
                <th className="px-3 py-3.5 font-semibold">Retorno previsto</th>
                <th className="px-3 py-3.5 font-semibold">LTV acumulado</th>
                <th className="py-3.5 pl-3 pr-5 text-right font-semibold">Ações rápidas</th>
              </tr>
            </thead>
            <tbody>
              {itens.map((c, i) => {
                const vencido = c.retornoPrevisto.venceuHa !== null;
                const legenda = legendaCiclo(c);
                return (
                  <tr
                    key={c.id}
                    tabIndex={0}
                    aria-label={`Ver ficha de ${c.name}`}
                    onClick={() => abrirFicha(c)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        abrirFicha(c);
                      }
                    }}
                    className={cn(
                      'group cursor-pointer transition-colors hover:bg-surface-2/60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-brand',
                      i % 2 === 1 && 'bg-surface-2/20',
                    )}
                  >
                    <td className="py-3.5 pl-5 pr-3">
                      <div className="flex items-center gap-3">
                        <Avatar name={c.name} size={36} />
                        <div className="flex min-w-0 flex-col">
                          <span className="truncate font-bold text-ink transition-colors group-hover:text-brand-text">{c.name}</span>
                          <span className="text-[12px] tabular-nums text-muted">{c.phone ? formatPhone(c.phone) : 'Sem telefone'}</span>
                          {etiquetasDaCliente(c)}
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-3.5">{chipFase(c.fase)}</td>
                    <td className="px-3 py-3.5">
                      {c.ultimaVisita ? (
                        <div className="flex flex-col">
                          <span className="text-[13px] font-semibold tabular-nums text-ink">
                            <span>{diaMes(c.ultimaVisita.date)}</span>{' '}
                            <span className={cn('text-[12px] font-normal', c.fase === 'em_risco' || c.fase === 'perdido' ? 'text-danger' : 'text-muted')}>
                              {relativoDias(c.ultimaVisita.diasAtras)}
                            </span>
                          </span>
                          <span className="truncate text-[12px] text-muted">
                            {c.ultimaVisita.servico} · {c.ultimaVisita.profissional}
                          </span>
                        </div>
                      ) : (
                        <span className="text-[13px] text-muted">Sem visitas</span>
                      )}
                    </td>
                    <td className="px-3 py-3.5">
                      <div className="flex items-center gap-1.5">
                        <span className={cn('text-[13px] font-bold tabular-nums', c.cicloMedio === null ? 'text-muted' : 'text-ink')}>
                          {c.cicloMedio === null ? '1ª visita' : `${c.cicloMedio} dias`}
                        </span>
                      </div>
                      <span className={cn('text-[11px]', legenda.alerta ? 'text-danger' : 'text-muted')}>{legenda.texto}</span>
                    </td>
                    <td className="px-3 py-3.5">
                      {vencido ? (
                        <span className="inline-flex items-center gap-1 text-[13px] font-bold text-danger">
                          <Icon name="warning" size={16} />
                          {c.retornoPrevisto.texto}
                        </span>
                      ) : (
                        <span className="text-[13px] font-semibold tabular-nums text-ink">{c.retornoPrevisto.texto}</span>
                      )}
                    </td>
                    <td className="px-3 py-3.5">
                      <div className="flex flex-col">
                        <span className="text-[13px] font-bold tabular-nums text-ink">{formatCurrency(c.ltv)}</span>
                        <span className="text-[12px] tabular-nums text-muted">
                          {c.atendimentos} {c.atendimentos === 1 ? 'atendimento' : 'atendimentos'}
                        </span>
                      </div>
                    </td>
                    <td className="py-3.5 pl-3 pr-5 text-right">{acoes(c)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Celular e tablet: cartões compactos (a tabela só aparece a partir de lg). */}
        <div data-testid="cartoes-clientes" className="flex flex-col divide-y divide-line lg:hidden">
          {itens.map((c) => {
            const vencido = c.retornoPrevisto.venceuHa !== null;
            return (
              <div
                key={c.id}
                role="button"
                tabIndex={0}
                aria-label={`Ver ficha de ${c.name}`}
                onClick={() => abrirFicha(c)}
                onKeyDown={(e) => {
                  if (e.target !== e.currentTarget) return;
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    abrirFicha(c);
                  }
                }}
                className="flex cursor-pointer flex-col gap-3 p-4 transition-colors hover:bg-surface-2/60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-brand"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <Avatar name={c.name} size={36} />
                    <div className="flex min-w-0 flex-col">
                      <span className="truncate font-bold text-ink">{c.name}</span>
                      <span className="text-[12px] tabular-nums text-muted">{c.phone ? formatPhone(c.phone) : 'Sem telefone'}</span>
                    </div>
                  </div>
                  {chipFase(c.fase)}
                </div>
                {etiquetasDaCliente(c)}
                <div className="grid grid-cols-2 gap-3 text-[12px]">
                  <div className="flex min-w-0 flex-col">
                    <span className="text-[11px] font-semibold uppercase tracking-wider text-muted">Última visita</span>
                    {c.ultimaVisita ? (
                      <>
                        <span className="font-semibold tabular-nums text-ink">
                          {diaMes(c.ultimaVisita.date)}{' '}
                          <span className="font-normal text-muted">{relativoDias(c.ultimaVisita.diasAtras)}</span>
                        </span>
                        <span className="truncate text-muted">
                          {c.ultimaVisita.servico} · {c.ultimaVisita.profissional}
                        </span>
                      </>
                    ) : (
                      <span className="text-muted">Sem visitas</span>
                    )}
                  </div>
                  <div className="flex min-w-0 flex-col">
                    <span className="text-[11px] font-semibold uppercase tracking-wider text-muted">Retorno previsto</span>
                    {vencido ? (
                      <span className="inline-flex items-center gap-1 font-bold text-danger">
                        <Icon name="warning" size={14} />
                        {c.retornoPrevisto.texto}
                      </span>
                    ) : (
                      <span className="font-semibold tabular-nums text-ink">{c.retornoPrevisto.texto}</span>
                    )}
                  </div>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <div className="flex flex-col">
                    <span className="text-[13px] font-bold tabular-nums text-ink">{formatCurrency(c.ltv)}</span>
                    <span className="text-[12px] tabular-nums text-muted">
                      {c.atendimentos} {c.atendimentos === 1 ? 'atendimento' : 'atendimentos'}
                    </span>
                  </div>
                  {acoes(c)}
                </div>
              </div>
            );
          })}
        </div>

        <div className="flex flex-col items-center justify-between gap-3 px-5 py-3.5 text-[13px] font-semibold text-muted sm:flex-row">
          <span>
            Mostrando <span className="text-ink">{inicio}–{fim}</span> de <span className="text-ink">{total}</span>{' '}
            {total === 1 ? 'cliente' : 'clientes'}
          </span>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              disabled={pagina === 1}
              onClick={() => setPagina((p) => Math.max(1, p - 1))}
              className="rounded-lg bg-surface-2 px-3 py-1.5 text-ink transition-colors hover:bg-line/60 disabled:cursor-not-allowed disabled:text-muted disabled:opacity-50"
            >
              Anterior
            </button>
            {construirPaginas(pagina, totalPaginas).map((p, i) =>
              p === '...' ? (
                <span key={`r-${i}`} className="px-1 text-muted">…</span>
              ) : (
                <button
                  key={p}
                  type="button"
                  onClick={() => setPagina(p)}
                  aria-current={p === pagina ? 'page' : undefined}
                  className={cn(
                    'flex h-8 w-8 items-center justify-center rounded-lg transition-colors',
                    p === pagina ? 'bg-ink text-surface' : 'text-ink hover:bg-surface-2',
                  )}
                >
                  {p}
                </button>
              ),
            )}
            <button
              type="button"
              disabled={pagina >= totalPaginas}
              onClick={() => setPagina((p) => Math.min(totalPaginas, p + 1))}
              className="rounded-lg bg-surface-2 px-3 py-1.5 text-ink transition-colors hover:bg-line/60 disabled:cursor-not-allowed disabled:text-muted disabled:opacity-50"
            >
              Próxima
            </button>
          </div>
        </div>
      </>
    );
  };

  const seletor = 'h-8 cursor-pointer appearance-none rounded-lg bg-surface pl-2.5 pr-7 text-[12px] font-semibold text-ink shadow-sm focus:outline-none focus:ring-1 focus:ring-brand';

  return (
    <div className="flex flex-col">
      {/* Barra de busca, ordenação, exportação e filtros */}
      <div className="mb-6 flex flex-col gap-4 rounded-xl bg-surface p-4 shadow-sm">
        <div className="flex flex-col items-stretch justify-between gap-3 lg:flex-row lg:items-center">
          <div className="relative flex-1">
            <Icon name="search" size={20} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" />
            <input
              ref={buscaRef}
              type="text"
              aria-label="Buscar clientes"
              placeholder="Buscar por nome, telefone ou e-mail"
              value={textoBusca}
              onChange={(e) => setTextoBusca(e.target.value)}
              className="h-11 w-full rounded-lg bg-surface-2 pl-11 pr-14 text-[14px] text-ink transition-all placeholder:text-muted focus:bg-surface focus:outline-none focus:ring-2 focus:ring-brand"
            />
            <kbd className="pointer-events-none absolute right-3 top-1/2 hidden h-6 -translate-y-1/2 select-none items-center justify-center rounded bg-surface px-1.5 text-[11px] font-semibold text-muted shadow-sm sm:inline-flex">
              /
            </kbd>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <div className="relative">
              <select
                aria-label="Ordenar por"
                value={ordem}
                onChange={(e) => {
                  setOrdem(e.target.value as Ordem);
                  setPagina(1);
                }}
                className="h-11 cursor-pointer appearance-none rounded-lg bg-surface-2 pl-3.5 pr-8 text-[13px] font-semibold text-ink transition-all focus:outline-none focus:ring-2 focus:ring-brand"
              >
                {ORDENS.map((o) => (
                  <option key={o.valor} value={o.valor}>
                    {o.rotulo}
                  </option>
                ))}
              </select>
              <Icon name="expand_more" size={18} className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-muted" />
            </div>
            <button
              type="button"
              onClick={exportar}
              disabled={exportando}
              title="Exportar dados"
              className="inline-flex h-11 items-center gap-1.5 rounded-lg bg-surface-2 px-3.5 text-[13px] font-semibold text-ink transition-colors hover:bg-line/60 disabled:opacity-60"
            >
              <Icon name="download" size={18} className="text-muted" />
              <span>Exportar</span>
            </button>
          </div>
        </div>

        <div className="-mx-4 -mb-4 flex flex-wrap items-center justify-between gap-3 rounded-b-xl bg-surface-2/40 px-4 py-3">
          <div role="tablist" aria-label="Fases" className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
            {abas.map((a) => {
              const ativa = fase === a.valor;
              return (
                <button
                  key={a.rotulo}
                  type="button"
                  role="tab"
                  aria-selected={ativa}
                  onClick={() => {
                    setFase(a.valor);
                    setPagina(1);
                  }}
                  className={cn(
                    'whitespace-nowrap rounded-full px-3 py-1 text-[13px] font-semibold transition-colors',
                    ativa ? 'bg-ink text-surface shadow-sm' : 'bg-surface-2 text-ink hover:bg-line/60',
                  )}
                >
                  {a.rotulo}{' '}
                  <span className={cn('ml-1 font-normal', ativa ? 'opacity-70' : 'text-muted')}>{a.n}</span>
                </button>
              );
            })}
          </div>
          <div className="flex items-center gap-2">
            <div className="relative">
              <select
                aria-label="Etiqueta"
                value={etiqueta}
                onChange={(e) => {
                  setEtiqueta(e.target.value);
                  setPagina(1);
                }}
                className={seletor}
              >
                <option value="">Etiquetas (todas)</option>
                {etiquetas.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
              <Icon name="expand_more" size={16} className="pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2 text-muted" />
            </div>
            <div className="relative">
              <select
                aria-label="Profissional"
                value={profissional}
                onChange={(e) => {
                  setProfissional(e.target.value);
                  setPagina(1);
                }}
                className={seletor}
              >
                <option value="">Profissional (todas)</option>
                {profissionais.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
              <Icon name="expand_more" size={16} className="pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2 text-muted" />
            </div>
          </div>
        </div>
      </div>

      <div className="flex flex-col overflow-hidden rounded-xl bg-surface shadow-sm">{corpo()}</div>

      <MensagemWhatsappModal
        isOpen={whatsappDe !== null}
        onClose={() => setWhatsappDe(null)}
        telefone={whatsappDe?.phone}
        nomeCliente={whatsappDe?.name ?? ''}
        mensagemInicial={whatsappDe ? mensagemWhatsapp(whatsappDe) : ''}
      />

      <EtiquetasClienteModal
        cliente={etiquetasDe}
        etiquetas={etiquetas}
        onClose={() => setEtiquetasDe(null)}
        onSalvo={() => {
          setEtiquetasDe(null);
          carregar();
        }}
      />
    </div>
  );
}

interface EtiquetasClienteModalProps {
  cliente: ClienteInsight | null;
  etiquetas: Etiqueta[];
  onClose: () => void;
  onSalvo: () => void;
}

/** Marca/desmarca as etiquetas manuais da cliente (PUT /clients/:id/tags). */
function EtiquetasClienteModal({ cliente, etiquetas, onClose, onSalvo }: EtiquetasClienteModalProps) {
  const { showToast } = useToast();
  const [marcadas, setMarcadas] = useState<string[]>([]);
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    if (cliente) setMarcadas(cliente.tags.map((t) => t.id));
  }, [cliente]);

  const alternar = (id: string) =>
    setMarcadas((atual) => (atual.includes(id) ? atual.filter((x) => x !== id) : [...atual, id]));

  const salvar = async () => {
    if (!cliente) return;
    setSalvando(true);
    try {
      await definirEtiquetasCliente(cliente.id, marcadas);
      showToast('Etiquetas atualizadas', 'success');
      onSalvo();
    } catch {
      showToast('Erro ao salvar etiquetas', 'error');
    } finally {
      setSalvando(false);
    }
  };

  return (
    <Modal
      isOpen={cliente !== null}
      onClose={onClose}
      title={`Etiquetas de ${cliente?.name ?? ''}`}
      icon="sell"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={salvar} disabled={salvando}>
            Salvar etiquetas
          </Button>
        </>
      }
    >
      {etiquetas.length === 0 ? (
        <p className="text-[13px] text-muted">Nenhuma etiqueta criada ainda.</p>
      ) : (
        <div className="flex flex-col gap-2">
          {etiquetas.map((t) => (
            <label key={t.id} className="flex cursor-pointer items-center gap-3 rounded-control px-2 py-1.5 hover:bg-surface-2">
              <input
                type="checkbox"
                checked={marcadas.includes(t.id)}
                onChange={() => alternar(t.id)}
                className="h-4 w-4 accent-brand"
              />
              <span className={cn('inline-flex items-center rounded px-1.5 py-0.5 text-[12px] font-semibold', ETIQUETA_CORES[t.color] ?? ETIQUETA_CORES.muted)}>
                {t.name}
              </span>
            </label>
          ))}
        </div>
      )}
    </Modal>
  );
}
