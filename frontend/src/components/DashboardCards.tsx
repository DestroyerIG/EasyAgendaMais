'use client';

import { Icon } from '@/components/ui';
import { conteudoDemo } from '@/lib/conteudoDemo';
import type { DashboardData } from '@/types';

interface DashboardCardsProps {
    data: DashboardData;
}

const { metaFaturamentoDiaria, agendamentosLegenda, taxaOcupacao, receitaRecuperada } = conteudoDemo.hoje;

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

export function DashboardCards({ data }: DashboardCardsProps) {
    return (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4">
            <CartaoMetrica
                titulo="Faturamento hoje"
                icone="payments"
                iconeTom="text-brand"
                valor={`R$ ${data.earningsToday.toFixed(2)}`}
            >
                <div className="flex flex-col gap-1.5">
                    <div className="flex items-center justify-between text-[12px] text-muted">
                        <span>Meta R$ {metaFaturamentoDiaria.valorMeta.toFixed(2)}</span>
                        <span className="font-bold text-ink">{metaFaturamentoDiaria.percentualAtingido}%</span>
                    </div>
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-2">
                        <div
                            className="h-full rounded-full bg-brand"
                            style={{ width: `${metaFaturamentoDiaria.percentualAtingido}%` }}
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
                    <span>{agendamentosLegenda}</span>
                </div>
            </CartaoMetrica>

            <CartaoMetrica
                titulo="Taxa de ocupação"
                icone="pie_chart"
                iconeTom="text-success"
                valor={`${taxaOcupacao.percentual}%`}
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
                valor={`R$ ${receitaRecuperada.valor.toFixed(2)}`}
            >
                <div className="flex items-center gap-1.5 text-[12px] text-muted">
                    <span className="h-2 w-2 rounded-full bg-whatsapp" />
                    <span>{receitaRecuperada.origemLabel}</span>
                </div>
            </CartaoMetrica>
        </div>
    );
}
