'use client';

/**
 * Visão por fases do CRM (Stitch 19ad17): três KPIs e cinco colunas (Novo, Recorrente,
 * Fiel / VIP, Em risco, Perdido) com os cartões das clientes. Tudo vem de GET /clients/phases.
 * Cada fase tem uma ação: WhatsApp com a mensagem da fase ou "Agendar retorno".
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Avatar, EmptyState, Icon, Skeleton } from '@/components/ui';
import { MensagemWhatsappModal } from '@/components/clientes/MensagemWhatsappModal';
import { FASE_CORES, primeiroNome } from '@/components/clientes/ListaClientes';
import { cn } from '@/lib/cn';
import { formatCurrency, formatPhone } from '@/lib/formatters';
import { materialIcon } from '@/lib/materialIconAdapter';
import { buscarFases, type ClienteInsight, type Fase, type FasesDto } from '@/lib/crm';
import { linkWhatsapp, MENSAGENS, preencherMensagem, type TipoMensagem } from '@/lib/whatsappLink';

const ICONE_ERRO = materialIcon('error');

const FRASE_FASE: Record<Fase, string> = {
  novo: 'Primeira visita nos últimos 30 dias',
  recorrente: '2 a 4 atendimentos com ciclo regular',
  fiel: '5 ou mais atendimentos com ciclo regular',
  em_risco: 'Passou do ciclo de retorno',
  perdido: 'Mais de 120 dias sem visita',
};

const ACAO_FASE: Record<Fase, { rotulo: string; mensagem: TipoMensagem | null }> = {
  novo: { rotulo: 'Pós-atendimento WhatsApp', mensagem: 'pos_atendimento' },
  recorrente: { rotulo: 'Agendar retorno', mensagem: null },
  fiel: { rotulo: 'Enviar mimo no WhatsApp', mensagem: 'mimo' },
  em_risco: { rotulo: 'Resgatar no WhatsApp', mensagem: 'resgate' },
  perdido: { rotulo: 'Campanha de resgate', mensagem: 'resgate' },
};

const classeAcao =
  'inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-surface-2 px-3 py-2 text-[12px] font-semibold text-ink transition-colors hover:bg-line/60 disabled:cursor-not-allowed disabled:opacity-50';

export interface FasesClientesProps {
  nomeNegocio?: string;
  /** Muda quando o container cadastrou/editou alguém: a visão recarrega. */
  versao?: number;
}

export function FasesClientes({ nomeNegocio, versao = 0 }: FasesClientesProps) {
  const router = useRouter();
  const [dados, setDados] = useState<FasesDto | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState(false);
  const [whatsappDe, setWhatsappDe] = useState<{ cliente: ClienteInsight; tipo: TipoMensagem } | null>(null);
  // Só a resposta do pedido mais recente vale.
  const ultimoPedido = useRef(0);

  const carregar = useCallback(async () => {
    const pedido = ++ultimoPedido.current;
    setCarregando(true);
    setErro(false);
    try {
      const r = await buscarFases();
      if (pedido !== ultimoPedido.current) return;
      setDados(r);
    } catch {
      if (pedido !== ultimoPedido.current) return;
      setErro(true);
    } finally {
      if (pedido === ultimoPedido.current) setCarregando(false);
    }
  }, []);

  useEffect(() => {
    carregar();
  }, [carregar, versao]);

  if (carregando && !dados) {
    return (
      <div className="flex flex-col gap-4">
        <Skeleton className="h-24 w-full" label="Carregando fases..." />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }
  if (erro && !dados) {
    return (
      <EmptyState
        icon={ICONE_ERRO}
        title="Não foi possível carregar as fases"
        action={{ label: 'Tentar de novo', onClick: () => carregar() }}
        actionVariant="secondary"
      />
    );
  }
  if (!dados) return null;

  const { kpis } = dados;
  const kpiCartoes: Array<{ rotulo: string; valor: string; apoio?: string; icone: string }> = [
    {
      rotulo: 'Total de clientes ativas',
      valor: String(kpis.ativas),
      apoio: `+${kpis.ativasNovasNoMes} este mês`,
      icone: 'groups',
    },
    { rotulo: 'LTV médio da carteira', valor: kpis.ltvMedio === null ? '—' : formatCurrency(kpis.ltvMedio), icone: 'payments' },
    { rotulo: 'Taxa de retenção', valor: kpis.retencao === null ? '—' : `${kpis.retencao}%`, icone: 'autorenew' },
  ];

  const mensagem = (c: ClienteInsight, tipo: TipoMensagem) =>
    preencherMensagem(MENSAGENS[tipo], {
      nome: primeiroNome(c.name),
      servico: c.ultimaVisita?.servico,
      negocio: nomeNegocio,
    });

  const acao = (c: ClienteInsight, fase: Fase) => {
    const def = ACAO_FASE[fase];
    if (!def.mensagem) {
      return (
        <Link href={`/agendamentos?novo=1&cliente=${c.id}`} className={classeAcao}>
          <Icon name="event_repeat" size={16} className="text-muted" />
          {def.rotulo}
        </Link>
      );
    }
    const tipo = def.mensagem;
    const temTelefone = linkWhatsapp(c.phone, 'x') !== null;
    return (
      <button
        type="button"
        disabled={!temTelefone}
        title={temTelefone ? undefined : 'Cadastre o telefone da cliente'}
        onClick={() => setWhatsappDe({ cliente: c, tipo })}
        className={classeAcao}
      >
        <Icon name="chat" size={16} className="text-whatsapp" />
        {def.rotulo}
      </button>
    );
  };

  return (
    <div className="flex flex-col gap-6">
      {erro && (
        <p role="alert" className="text-[13px] text-danger">
          Não foi possível atualizar as fases.
        </p>
      )}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {kpiCartoes.map((k) => (
          <div key={k.rotulo} className="flex items-center gap-4 rounded-xl bg-surface p-4 shadow-sm">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-brand/12 text-brand-text">
              <Icon name={k.icone} size={22} />
            </span>
            <div className="flex min-w-0 flex-col">
              <span className="text-[12px] font-semibold text-muted">{k.rotulo}</span>
              <span className="text-[22px] font-bold tabular-nums text-ink">{k.valor}</span>
              {k.apoio && <span className="text-[12px] font-semibold text-success-text">{k.apoio}</span>}
            </div>
          </div>
        ))}
      </div>

      <div className="-mx-4 flex snap-x snap-mandatory gap-4 overflow-x-auto px-4 pb-2 lg:mx-0 lg:px-0">
        {dados.colunas.map((col) => {
          const cores = FASE_CORES[col.fase];
          return (
            <section
              key={col.fase}
              aria-label={col.rotulo}
              className="flex w-[280px] shrink-0 snap-start flex-col gap-3 rounded-xl bg-surface-2/60 p-3 lg:min-w-0 lg:flex-1"
            >
              <header className="flex flex-col gap-0.5 px-1">
                <h2 className="flex items-center gap-2 text-[14px] font-bold text-ink">
                  <span className={cn('h-2 w-2 rounded-full', cores.ponto)} />
                  {col.rotulo}
                  <span className={cn('rounded-full px-2 py-0.5 text-[11px] font-semibold', cores.fundo, cores.texto)}>{col.contagem}</span>
                </h2>
                <span className="text-[12px] font-semibold tabular-nums text-ink">
                  {col.contagem} {col.contagem === 1 ? 'cliente' : 'clientes'} · {formatCurrency(col.ltvTotal)}
                </span>
                <span className="text-[11px] text-muted">{FRASE_FASE[col.fase]}</span>
              </header>

              {col.cartoes.length === 0 ? (
                <p className="rounded-lg bg-surface p-4 text-center text-[12px] text-muted">Nenhuma cliente nesta fase</p>
              ) : (
                col.cartoes.map((c) => (
                  <article
                    key={c.id}
                    className="flex flex-col gap-3 rounded-lg bg-surface p-3 shadow-sm transition-shadow hover:shadow-md"
                  >
                    <div
                      role="link"
                      tabIndex={0}
                      aria-label={`Ver ficha de ${c.name}`}
                      onClick={() => router.push(`/clientes/${c.id}`)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          router.push(`/clientes/${c.id}`);
                        }
                      }}
                      className="flex cursor-pointer flex-col gap-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
                    >
                      <div className="flex items-center gap-3">
                        <Avatar name={c.name} src={c.avatarUrl} size={36} />
                        <div className="flex min-w-0 flex-col">
                          <span className="truncate font-bold text-ink">{c.name}</span>
                          <span className="text-[12px] tabular-nums text-muted">{c.phone ? formatPhone(c.phone) : 'Sem telefone'}</span>
                        </div>
                      </div>
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="inline-flex rounded bg-surface-2 px-1.5 py-0.5 text-[10px] font-semibold text-muted">
                          {c.cicloMedio === null ? '1ª visita' : `Ciclo ${c.cicloMedio}d`}
                        </span>
                      </div>
                      <span className="truncate text-[12px] text-muted">
                        {c.ultimaVisita ? `${c.ultimaVisita.servico} · ${c.ultimaVisita.profissional}` : 'Sem visitas'}
                      </span>
                      <span className="text-[12px] tabular-nums text-muted">
                        LTV <span className="font-bold text-ink">{formatCurrency(c.ltv)}</span>
                      </span>
                    </div>
                    {acao(c, col.fase)}
                  </article>
                ))
              )}
            </section>
          );
        })}
      </div>

      <MensagemWhatsappModal
        isOpen={whatsappDe !== null}
        onClose={() => setWhatsappDe(null)}
        telefone={whatsappDe?.cliente.phone}
        nomeCliente={whatsappDe?.cliente.name ?? ''}
        mensagemInicial={whatsappDe ? mensagem(whatsappDe.cliente, whatsappDe.tipo) : ''}
      />
    </div>
  );
}
