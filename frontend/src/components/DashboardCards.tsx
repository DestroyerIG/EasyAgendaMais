'use client';

import { Icon } from '@/components/ui';
import { conteudoDemo } from '@/lib/conteudoDemo';
import { formatCurrency } from '@/lib/formatters';
import type { MetricasAgendaDoDia } from '@/lib/agendaMetrics';
import type { DashboardData } from '@/types';

interface DashboardCardsProps {
    data: DashboardData;
    /**
     * Ocupação e vagas livres reais do dia (mesmo cálculo que a Agenda faz sobre
     * GET /appointments) — `null` enquanto a busca de agendamentos de hoje ainda não
     * respondeu (correção I3 da revisão final: antes eram números fixos de conteudoDemo,
     * que podiam contradizer o que a Agenda calculava para o mesmo dia).
     */
    metricasAgenda: MetricasAgendaDoDia | null;
}

const { metaFaturamentoDiaria, taxaOcupacao, receitaRecuperada } = conteudoDemo.hoje;

/** Vagas livres a partir do meio-dia — é o recorte que "horários livres à tarde" descreve. */
const INICIO_TARDE_MINUTOS = 12 * 60;

// Cartão de métrica da tela Hoje (hoje-desktop.html / hoje-mobile.html): rótulo
// 13px/600 + ícone à direita, valor 32px/700 em dígitos tabulares, rodapé variável.
// Correções da seção 11 do INVENTARIO já aplicadas aqui: 32px (o arquivo usa 28px)
// e tabular-nums sobre a Plus Jakarta Sans em vez de font-mono.
function CartaoMetrica({
    titulo,
    icone,
    iconeTom,
    valor,
    children,
}: {
    titulo: string;
    icone: string;
    iconeTom: string;
    valor: string | number;
    children: React.ReactNode;
}) {
    return (
        <div className="flex flex-col justify-between gap-3 rounded-card border border-line bg-surface p-4 shadow-sm sm:p-5">
            <div className="flex items-center justify-between text-muted">
                <span className="text-[13px] font-semibold">{titulo}</span>
                <Icon name={icone} size={20} className={iconeTom} />
            </div>
            <div className="text-[32px] font-bold leading-none tabular-nums text-ink">{valor}</div>
            {children}
        </div>
    );
}

export function DashboardCards({ data, metricasAgenda }: DashboardCardsProps) {
    // % da meta: sempre calculado do faturamento real de hoje sobre a meta, nunca um
    // número gravado (correção I3 — mesmo padrão que a Tarefa 9 já aplicou no Caixa).
    const percentualMeta =
        metaFaturamentoDiaria.valorMeta > 0
            ? Math.min(100, Math.round((data.earningsToday / metaFaturamentoDiaria.valorMeta) * 100))
            : 0;

    const vagasTarde = metricasAgenda?.vagasLivres.filter((vaga) => vaga.inicioMinutos >= INICIO_TARDE_MINUTOS) ?? [];
    const legendaVagas =
        metricasAgenda === null
            ? 'Calculando horários livres…'
            : vagasTarde.length === 0
              ? 'Nenhum horário livre à tarde'
              : `${vagasTarde.length} horário${vagasTarde.length === 1 ? '' : 's'} livre${vagasTarde.length === 1 ? '' : 's'} à tarde`;

    return (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4">
            <CartaoMetrica
                titulo="Faturamento hoje"
                icone="payments"
                iconeTom="text-brand"
                valor={formatCurrency(data.earningsToday, { cents: false })}
            >
                <div className="flex flex-col gap-1.5">
                    <div className="flex items-center justify-between text-[12px] text-muted">
                        <span>Meta {formatCurrency(metaFaturamentoDiaria.valorMeta, { cents: false })}</span>
                        <span className="font-bold text-ink">{percentualMeta}%</span>
                    </div>
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-2">
                        <div
                            className="h-full rounded-full bg-brand"
                            style={{ width: `${percentualMeta}%` }}
                        />
                    </div>
                </div>
            </CartaoMetrica>

            <CartaoMetrica
                titulo="Agendamentos hoje"
                icone="event_available"
                iconeTom="text-tertiary"
                valor={data.appointmentsToday}
            >
                <div className="flex items-center gap-1.5 text-[12px] font-semibold text-warning">
                    <span className="h-2 w-2 rounded-full bg-warning" />
                    <span>{legendaVagas}</span>
                </div>
            </CartaoMetrica>

            <CartaoMetrica
                titulo="Taxa de ocupação"
                icone="pie_chart"
                iconeTom="text-success"
                valor={metricasAgenda === null ? '—' : `${metricasAgenda.ocupacaoPercentual}%`}
            >
                <div className="flex items-center gap-1 text-[12px]">
                    <Icon name="arrow_upward" size={16} className="text-success" />
                    <span className="font-bold text-success">{taxaOcupacao.variacao}</span>
                    <span className="text-muted">{taxaOcupacao.comparacaoLabel}</span>
                </div>
            </CartaoMetrica>

            <CartaoMetrica
                titulo="Receita recuperada no mês"
                icone="mark_chat_read"
                iconeTom="text-whatsapp"
                valor={formatCurrency(receitaRecuperada.valor, { cents: false })}
            >
                <div className="flex items-center gap-1.5 text-[12px] text-muted">
                    <span className="h-2 w-2 rounded-full bg-whatsapp" />
                    <span>{receitaRecuperada.origemLabel}</span>
                </div>
            </CartaoMetrica>
        </div>
    );
}
