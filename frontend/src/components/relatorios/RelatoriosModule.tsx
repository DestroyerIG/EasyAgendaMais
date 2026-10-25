'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/contexts/AuthContext';
import { formatCurrency } from '@/lib/formatters';
import { getApiErrorMessage } from '@/utils/handleApiError';
import { cn } from '@/lib/cn';
import {
  type ChaveDia, type Evolucao, type Ocupacao, type Periodo, type VisaoGeral,
  hojeLocal, relatoriosApi, rotuloMes, ultimos30,
} from '@/lib/relatorios';
import { pdfRelatorio } from '@/lib/relatoriosPdf';
import { Banner, Button, Card, Icon, Skeleton } from '@/components/ui';
import { SeletorPeriodo } from './SeletorPeriodo';
import { AvaliacoesRelatorio } from './AvaliacoesRelatorio';
import { useVocabulario } from '@/hooks/useVocabulario';

// Relatórios (sub-projeto 3): indicadores com comparação ao período anterior, mapa de
// ocupação, origem dos agendamentos e evolução de 6 meses. Tudo com dado real.
// Fase 5: avaliações das clientes por profissional.

const DIAS: { id: ChaveDia; rotulo: string }[] = [
  { id: 'seg', rotulo: 'Seg' }, { id: 'ter', rotulo: 'Ter' }, { id: 'qua', rotulo: 'Qua' },
  { id: 'qui', rotulo: 'Qui' }, { id: 'sex', rotulo: 'Sex' }, { id: 'sab', rotulo: 'Sáb' }, { id: 'dom', rotulo: 'Dom' },
];

const ICONE_ORIGEM: Record<string, string> = {
  publico: 'link', whatsapp: 'smart_toy', painel: 'storefront', retorno_campanhas: 'campaign',
};

const sem = (v: number | null | undefined, f: (n: number) => string) => (v === null || v === undefined ? '—' : f(v));
const pct = (v: number) => `${String(v).replace('.', ',')}%`;

export function RelatoriosModule() {
  const { user } = useAuth();
  const [periodo, setPeriodo] = useState<Periodo>(() => ultimos30(hojeLocal()));
  const [visao, setVisao] = useState<VisaoGeral | null>(null);
  const [ocupacao, setOcupacao] = useState<Ocupacao | null>(null);
  const [evolucao, setEvolucao] = useState<Evolucao | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  const carregar = useCallback(async (p: Periodo) => {
    setErro(null);
    setVisao(null);
    setOcupacao(null);
    try {
      const [v, o] = await Promise.all([relatoriosApi.visaoGeral(p), relatoriosApi.ocupacao(p)]);
      setVisao(v);
      setOcupacao(o);
    } catch (e) {
      setErro(getApiErrorMessage(e, 'Não foi possível carregar os relatórios.'));
    }
  }, []);

  useEffect(() => {
    void carregar(periodo);
  }, [carregar, periodo]);

  useEffect(() => {
    relatoriosApi.evolucao().then(setEvolucao).catch(() => setEvolucao({ meses: [] }));
  }, []);

  return (
    <div className="space-y-6 pb-10">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold text-ink">Relatórios</h1>
          <p className="text-[14px] text-muted">Desempenho da equipe, ocupação da grade e faturamento, com dados do seu painel.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <SeletorPeriodo periodo={periodo} onChange={setPeriodo} opcoes={['30dias', 'mes', 'mes_anterior', 'livre']} />
          <Button variant="secondary" size="sm" disabled={!visao} onClick={() => visao && pdfRelatorio(visao, evolucao, user?.businessName ?? 'EasyAgenda+')}>
            <Icon name="download" size={18} />
            Exportar relatório
          </Button>
        </div>
      </div>

      {erro && (
        <Banner tone="danger" variant="inline" action={<Button size="sm" variant="secondary" onClick={() => carregar(periodo)}>Tentar de novo</Button>}>
          {erro}
        </Banner>
      )}

      {visao ? <Indicadores v={visao} /> : !erro && <Esqueleto />}

      <MapaOcupacao o={ocupacao} carregando={!ocupacao && !erro} />

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-5">
        <Card className="space-y-4 xl:col-span-2">
          <div>
            <h2 className="text-lg font-bold text-ink">Origem dos agendamentos</h2>
            <p className="text-[13px] text-muted">
              {visao ? `De onde vieram os ${visao.origem.total} agendamentos do período e quanto cada canal faturou.` : ' '}
            </p>
          </div>
          {!visao ? <Skeleton className="h-48 w-full" /> : visao.origem.total === 0 ? (
            <p className="text-[14px] text-muted">Nenhum agendamento neste período.</p>
          ) : (
            <ul className="space-y-4">
              {visao.origem.itens.map((o) => (
                <li key={o.id} className="space-y-1.5">
                  <div className="flex items-center justify-between gap-3 text-[14px]">
                    <span className="flex items-center gap-2 font-semibold text-ink">
                      <Icon name={ICONE_ORIGEM[o.id] ?? 'circle'} size={18} className="text-muted" />
                      {o.rotulo}
                    </span>
                    <span className="tabular-nums text-muted">{o.quantidade} · {o.percentual}%</span>
                  </div>
                  <div className="h-2 rounded-full bg-surface-2">
                    <div className="h-2 rounded-full bg-brand" style={{ width: `${o.percentual}%` }} />
                  </div>
                  <p className="text-right text-[12px] tabular-nums text-muted">{formatCurrency(o.faturamento)}</p>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card className="space-y-4 xl:col-span-3">
          <div>
            <h2 className="text-lg font-bold text-ink">Evolução do faturamento</h2>
            <p className="text-[13px] text-muted">Últimos 6 meses, serviços e produtos, com a meta mensal e a projeção do mês atual.</p>
          </div>
          {!evolucao ? <Skeleton className="h-56 w-full" /> : <GraficoEvolucao e={evolucao} />}
        </Card>
      </div>

      <AvaliacoesRelatorio periodo={periodo} />

      {visao && (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <Rodape icone="shopping_bag" titulo="Vendas de produtos"
            texto={visao.rodape.produtosPercentual === null ? 'Sem vendas no período' : `${visao.rodape.produtosPercentual}% da receita do período`} />
          <Rodape icone="sync" titulo="Projeção de fechamento"
            texto={`${formatCurrency(visao.rodape.projecaoMes, { cents: false })} no mês, faltam ${visao.rodape.diasRestantes} ${visao.rodape.diasRestantes === 1 ? 'dia' : 'dias'}`} />
          <Rodape icone="alarm_on" titulo="Horário de pico"
            texto={ocupacao?.pico ? `${ocupacao.pico.rotulo}, com ${ocupacao.pico.ocupacao}% da capacidade` : 'Ainda sem dados de ocupação'} />
        </div>
      )}
    </div>
  );
}

function Esqueleto() {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {Array.from({ length: 4 }).map((_, i) => (
        <Card key={i} className="space-y-2"><Skeleton className="h-4 w-24" /><Skeleton className="h-8 w-28" /></Card>
      ))}
    </div>
  );
}

function Variacao({ v, menorMelhor = false }: { v: number | null; menorMelhor?: boolean }) {
  if (v === null) return <span className="text-muted">sem comparação</span>;
  const bom = menorMelhor ? v <= 0 : v >= 0;
  return (
    <span className={cn('inline-flex items-center gap-0.5 font-semibold', bom ? 'text-success-text' : 'text-danger')}>
      <Icon name={v >= 0 ? 'trending_up' : 'trending_down'} size={16} />
      {v > 0 ? '+' : ''}{pct(v)}
    </span>
  );
}

function Indicador({ titulo, icone, valor, children }: { titulo: string; icone: string; valor: string; children: React.ReactNode }) {
  return (
    <Card className="flex flex-col gap-2">
      <div className="flex items-center justify-between text-[13px] font-semibold text-muted">
        {titulo}
        <Icon name={icone} size={20} />
      </div>
      <p className="text-[28px] font-bold leading-tight tabular-nums text-ink">{valor}</p>
      <div className="text-[13px] text-muted">{children}</div>
    </Card>
  );
}

function Indicadores({ v }: { v: VisaoGeral }) {
  const i = v.indicadores;
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <Indicador titulo="Ticket médio" icone="receipt_long" valor={sem(i.ticketMedio.valor, (n) => formatCurrency(n))}>
        <Variacao v={i.ticketMedio.variacao} /> vs período anterior
      </Indicador>
      <Indicador titulo="Retorno no ciclo" icone="replay" valor={sem(i.retornoNoCiclo.valor, (n) => `${n}%`)}>
        {i.retornoNoCiclo.valor === null ? 'Poucos dados ainda' : <>Voltam no ciclo de costume · <Variacao v={i.retornoNoCiclo.variacao} /></>}
      </Indicador>
      <Indicador titulo="Taxa de faltas" icone="event_busy" valor={sem(i.faltas.valor, pct)}>
        {i.faltas.sinalPix && i.faltas.lembretes ? (
          <span className="inline-flex items-center gap-1"><Icon name="verified" size={16} className="text-success-text" />Sinal Pix + lembrete ativo</span>
        ) : (
          <Link href="/servicos" className="font-semibold text-brand-text underline">Ative o sinal Pix para reduzir faltas</Link>
        )}
      </Indicador>
      <Indicador titulo="Faturamento do mês" icone="payments" valor={formatCurrency(i.faturamentoMes.valor, { cents: false })}>
        {i.faturamentoMes.meta === null ? (
          <Link href="/configuracoes" className="font-semibold text-brand-text underline">Definir meta</Link>
        ) : (
          <div className="space-y-1">
            <div className="flex justify-between"><span>Meta {formatCurrency(i.faturamentoMes.meta, { cents: false })}</span><span className="font-semibold text-ink">{i.faturamentoMes.percentual}% atingido</span></div>
            <div className="h-1.5 rounded-full bg-surface-2">
              <div className="h-1.5 rounded-full bg-brand" style={{ width: `${Math.min(100, i.faturamentoMes.percentual ?? 0)}%` }} />
            </div>
          </div>
        )}
      </Indicador>
    </div>
  );
}

const nivel = (v: number) =>
  v >= 85 ? 'bg-brand text-on-brand' : v >= 65 ? 'bg-brand/60 text-ink' : v >= 40 ? 'bg-brand/30 text-ink' : 'bg-brand/10 text-ink';

function Celula({ v }: { v: number | null }) {
  if (v === null) return <td className="px-1 py-1"><div className="rounded-md bg-surface-2 py-2 text-center text-[11px] text-muted">Fechado</div></td>;
  return <td className="px-1 py-1"><div className={cn('rounded-md py-2 text-center text-[12px] font-semibold tabular-nums', nivel(v))}>{v}%</div></td>;
}

function MapaOcupacao({ o, carregando }: { o: Ocupacao | null; carregando: boolean }) {
  const { prof } = useVocabulario();
  const dias = o ? DIAS.filter((d) => d.id !== 'dom' || o.diasAbertos.dom) : DIAS.slice(0, 6);
  const valor = (cs: Ocupacao['media'], dia: ChaveDia, turno: 'manha' | 'tarde') => cs.find((c) => c.dia === dia && c.turno === turno)?.ocupacao ?? null;
  return (
    <Card className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-ink">Mapa de ocupação da grade</h2>
          <p className="text-[13px] text-muted">Horas agendadas sobre as horas abertas, por {prof.s}, dia da semana e turno (manhã e tarde).</p>
        </div>
        <div className="flex items-center gap-1 text-[12px] text-muted" aria-hidden="true">
          Lotação
          {['bg-brand/10', 'bg-brand/30', 'bg-brand/60', 'bg-brand'].map((c) => <span key={c} className={cn('h-3 w-5 rounded-sm', c)} />)}
        </div>
      </div>
      {carregando || !o ? <Skeleton className="h-48 w-full" /> : o.linhas.length === 0 ? (
        <p className="text-[14px] text-muted">Cadastre {prof.p} para ver a ocupação.</p>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-[13px]">
              <thead>
                <tr className="text-left text-[12px] font-semibold text-muted">
                  <th scope="col" className="px-2 py-1">{prof.S}</th>
                  {dias.map((d) => <th key={d.id} scope="col" colSpan={2} className="px-1 py-1 text-center">{d.rotulo}</th>)}
                </tr>
                <tr className="text-[11px] text-muted">
                  <th />
                  {dias.flatMap((d) => [
                    <th key={`${d.id}m`} scope="col" className="font-normal"><abbr title="Manhã">M</abbr></th>,
                    <th key={`${d.id}t`} scope="col" className="font-normal"><abbr title="Tarde">T</abbr></th>,
                  ])}
                </tr>
              </thead>
              <tbody>
                {o.linhas.map((l) => (
                  <tr key={l.professional.id}>
                    <th scope="row" className="px-2 py-1 text-left">
                      <p className="font-semibold text-ink">{l.professional.nome}</p>
                      {l.professional.especialidade && <p className="text-[11px] font-normal text-muted">{l.professional.especialidade}</p>}
                    </th>
                    {dias.flatMap((d) => [
                      <Celula key={`${d.id}m`} v={valor(l.celulas, d.id, 'manha')} />,
                      <Celula key={`${d.id}t`} v={valor(l.celulas, d.id, 'tarde')} />,
                    ])}
                  </tr>
                ))}
                <tr className="border-t border-line">
                  <th scope="row" className="px-2 py-2 text-left font-semibold text-ink">Média do salão</th>
                  {dias.flatMap((d) => [
                    <Celula key={`${d.id}m`} v={valor(o.media, d.id, 'manha')} />,
                    <Celula key={`${d.id}t`} v={valor(o.media, d.id, 'tarde')} />,
                  ])}
                </tr>
              </tbody>
            </table>
          </div>
          {o.insight && (
            <div className="flex flex-col gap-3 rounded-xl border border-line bg-surface-2 p-4 sm:flex-row sm:items-center sm:justify-between">
              <p className="flex items-start gap-2 text-[14px] text-ink">
                <Icon name="lightbulb" size={20} className="mt-0.5 shrink-0 text-brand-text" />
                {o.insight.texto}
              </p>
              <Link href="/whatsapp?aba=campanhas" className="inline-flex h-9 shrink-0 items-center rounded-control bg-brand px-3 text-[13px] font-semibold text-on-brand">
                Criar campanha
              </Link>
            </div>
          )}
        </>
      )}
    </Card>
  );
}

function GraficoEvolucao({ e }: { e: Evolucao }) {
  if (!e.meses.length || e.meses.every((m) => m.total === 0 && !m.projecao)) {
    return <p className="text-[14px] text-muted">Ainda não há comandas fechadas nos últimos 6 meses.</p>;
  }
  const W = 600;
  const H = 220;
  const base = H - 28;
  const topo = 16;
  const maximo = Math.max(...e.meses.map((m) => Math.max(m.total, m.projecao ?? 0, m.meta ?? 0)), 1);
  const y = (v: number) => base - ((base - topo) * v) / maximo;
  const largura = W / e.meses.length;
  const barra = Math.min(56, largura * 0.55);
  const meta = e.meses.find((m) => m.meta)?.meta ?? null;
  return (
    <div className="space-y-3">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Faturamento dos últimos 6 meses" className="h-56 w-full">
        {meta !== null && (
          <g>
            <line x1={0} x2={W} y1={y(meta)} y2={y(meta)} className="stroke-muted" strokeDasharray="4 4" strokeWidth={1} />
            <text x={W - 4} y={y(meta) - 4} textAnchor="end" className="fill-muted text-[11px]">Meta {formatCurrency(meta, { cents: false })}</text>
          </g>
        )}
        {e.meses.map((m, i) => {
          const x = i * largura + (largura - barra) / 2;
          return (
            <g key={m.mes}>
              <title>{`${rotuloMes(m.mes)}: serviços ${formatCurrency(m.servicos)}, produtos ${formatCurrency(m.produtos)}`}</title>
              {m.projecao !== null && m.projecao > m.total && (
                <rect x={x} y={y(m.projecao)} width={barra} height={y(m.total) - y(m.projecao)} rx={4} className="fill-none stroke-brand" strokeDasharray="4 3" strokeWidth={1.5} />
              )}
              <rect x={x} y={y(m.servicos)} width={barra} height={base - y(m.servicos)} rx={4} className="fill-brand" />
              <rect x={x} y={y(m.total)} width={barra} height={y(m.servicos) - y(m.total)} rx={4} className="fill-tertiary" />
              <text x={x + barra / 2} y={y(Math.max(m.total, m.projecao ?? 0)) - 6} textAnchor="middle" className="fill-ink text-[11px] font-semibold">
                {formatCurrency(m.total, { cents: false })}
              </text>
              <text x={x + barra / 2} y={H - 8} textAnchor="middle" className={cn('text-[12px]', m.atual ? 'fill-ink font-bold' : 'fill-muted')}>
                {m.atual ? 'Atual' : rotuloMes(m.mes)}
              </text>
            </g>
          );
        })}
      </svg>
      <div className="flex flex-wrap gap-4 text-[12px] text-muted">
        <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded-sm bg-brand" />Serviços</span>
        <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded-sm bg-tertiary" />Produtos</span>
        <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded-sm border border-dashed border-brand" />Projeção do mês</span>
      </div>
    </div>
  );
}

function Rodape({ icone, titulo, texto }: { icone: string; titulo: string; texto: string }) {
  return (
    <Card className="flex items-start gap-3">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-surface-2 text-brand-text">
        <Icon name={icone} size={22} />
      </span>
      <div>
        <p className="text-[14px] font-semibold text-ink">{titulo}</p>
        <p className="text-[13px] text-muted">{texto}</p>
      </div>
    </Card>
  );
}
