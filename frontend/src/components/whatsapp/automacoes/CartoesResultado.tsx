'use client';

import type { ReactNode } from 'react';
import { Icon } from '@/components/ui';
import { cn } from '@/lib/cn';
import { formatCurrency, formatNumber } from '@/lib/formatters';
import type { PainelAutomacoesDto } from '@/lib/whatsappAutomacoes';

interface CartoesResultadoProps {
  /** null enquanto carrega: os valores mostram "—". */
  painel: PainelAutomacoesDto | null;
}

const COR_SELO = { Excelente: 'text-whatsapp', Boa: 'text-warning-text', Baixa: 'text-danger' } as const;

function Cartao({ rotulo, icone, corIcone, valor, complemento, rodape }: {
  rotulo: string; icone: string; corIcone: string; valor: string; complemento?: ReactNode; rodape: string;
}) {
  return (
    <div className="flex flex-col justify-between rounded-xl border border-line bg-surface p-6 shadow-sm">
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="text-[13px] font-semibold uppercase leading-[18px] tracking-wider text-muted">{rotulo}</span>
        <div className={cn('flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-surface-2', corIcone)}>
          <Icon name={icone} size={20} />
        </div>
      </div>
      <div className="flex flex-wrap items-baseline gap-2">
        <span className="text-[40px] font-extrabold leading-[48px] tracking-tight text-ink tabular-nums">{valor}</span>
        {complemento}
      </div>
      <span className="mt-1 text-[14px] leading-5 text-muted">{rodape}</span>
    </div>
  );
}

function Variacao({ pct }: { pct: number }) {
  const subiu = pct >= 0;
  return (
    <div
      className={cn(
        'inline-flex items-center gap-[2px] rounded-full px-1 py-[2px] text-[11px] font-semibold leading-4',
        subiu ? 'bg-whatsapp/12 text-whatsapp' : 'bg-danger/12 text-danger',
      )}
    >
      <Icon name={subiu ? 'trending_up' : 'trending_down'} size={14} />
      <span className="font-bold tabular-nums">{`${subiu ? '+' : ''}${pct}%`}</span>
    </div>
  );
}

function rodapeTaxa(painel: PainelAutomacoesDto | null) {
  if (!painel) return 'Tempo médio até a resposta do cliente';
  const min = painel.taxaResposta.mediaMin;
  if (min === null) return 'Ainda sem respostas neste mês';
  return `Média de ${min} ${min === 1 ? 'minuto' : 'minutos'} para retorno do cliente`;
}

export function CartoesResultado({ painel }: CartoesResultadoProps) {
  const taxa = painel?.taxaResposta;
  return (
    <section aria-label="Resultados do mês" className="grid grid-cols-1 gap-4 md:grid-cols-3">
      <Cartao
        rotulo="Receita recuperada no mês"
        icone="payments"
        corIcone="text-whatsapp"
        valor={painel ? formatCurrency(painel.receitaMes, { cents: false }) : '—'}
        complemento={painel && painel.receitaVariacaoPct !== null ? <Variacao pct={painel.receitaVariacaoPct} /> : null}
        rodape="Recuperados por lembretes, sinais e reativações"
      />
      <Cartao
        rotulo="Faltas e no-shows evitados"
        icone="event_available"
        corIcone="text-status-confirmed"
        valor={painel ? formatNumber(painel.faltasEvitadas) : '—'}
        complemento={<span className="text-[17px] font-medium leading-6 text-muted">agendamentos</span>}
        rodape="Horários liberados para repasse imediato na fila"
      />
      <Cartao
        rotulo="Taxa de resposta dos clientes"
        icone="forum"
        corIcone="text-brand"
        valor={taxa && taxa.pct !== null ? `${formatNumber(taxa.pct)}%` : '—'}
        complemento={taxa?.selo ? <span className={cn('text-[11px] font-semibold leading-4', COR_SELO[taxa.selo])}>{taxa.selo}</span> : null}
        rodape={rodapeTaxa(painel)}
      />
    </section>
  );
}
