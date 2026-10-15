'use client';

import Link from 'next/link';
import { Icon } from '@/components/ui';
import { cn } from '@/lib/cn';
import { formatCurrency } from '@/lib/formatters';
import type { HojeDto } from '@/lib/hoje';

interface DashboardCardsProps {
    /** Os quatro números do dia, todos de GET /dashboard/today (uma chamada só). */
    hoje: Pick<HojeDto, 'faturamento' | 'agendamentos' | 'ocupacao' | 'confirmadosLembrete'>;
}

const plural = (n: number, singular: string, pluralTexto: string) => (n === 1 ? singular : pluralTexto);

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
                {/* Ícone colorido no celular (hoje-mobile.html), esmaecido no computador
                    (hoje-desktop.html: os 4 ícones do cabeçalho ficam sem classe de cor,
                    herdando o `text-muted` do container) — as duas referências divergem
                    de propósito aqui, cada breakpoint segue a sua. */}
                <Icon name={icone} size={20} className={cn(iconeTom, 'lg:text-muted')} />
            </div>
            <div className="text-[32px] font-bold leading-none tabular-nums text-ink">{valor}</div>
            {children}
        </div>
    );
}

export function DashboardCards({ hoje }: DashboardCardsProps) {
    const { faturamento, agendamentos, ocupacao, confirmadosLembrete } = hoje;
    const larguraMeta = Math.max(0, Math.min(100, faturamento.percentual ?? 0));
    const livres = agendamentos.livresTarde;
    const variacao = ocupacao?.variacao ?? null;

    return (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4">
            <CartaoMetrica
                titulo="Faturamento hoje"
                icone="payments"
                iconeTom="text-brand"
                valor={formatCurrency(faturamento.valor, { cents: false })}
            >
                {faturamento.meta !== null ? (
                    <div className="flex flex-col gap-1.5">
                        <div className="flex items-center justify-between gap-2 text-[12px] text-muted">
                            <span>Meta {formatCurrency(faturamento.meta)}</span>
                            <span className="font-bold text-ink">{faturamento.percentual ?? 0}%</span>
                        </div>
                        <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-2">
                            <div className="h-full rounded-full bg-brand" style={{ width: `${larguraMeta}%` }} />
                        </div>
                    </div>
                ) : (
                    <Link
                        href="/configuracoes"
                        className="inline-flex items-center gap-1 text-[12px] font-bold text-brand-text hover:underline"
                    >
                        <Icon name="flag" size={15} />
                        Definir meta
                    </Link>
                )}
            </CartaoMetrica>

            <CartaoMetrica
                titulo="Agendamentos hoje"
                icone="event_available"
                iconeTom="text-tertiary"
                valor={agendamentos.total}
            >
                {livres > 0 ? (
                    <div className="flex items-center gap-1.5 text-[12px] font-semibold text-warning-text">
                        <span className="h-2 w-2 shrink-0 rounded-full bg-warning" />
                        <span>
                            {livres} {plural(livres, 'horário livre', 'horários livres')} à tarde
                        </span>
                    </div>
                ) : (
                    <div className="text-[12px] text-muted">Nenhum horário livre à tarde</div>
                )}
            </CartaoMetrica>

            <CartaoMetrica
                titulo="Taxa de ocupação"
                icone="pie_chart"
                iconeTom="text-success"
                valor={ocupacao === null ? '—' : `${ocupacao.percentual}%`}
            >
                {ocupacao === null ? (
                    <div className="text-[12px] text-muted">Sem expediente hoje</div>
                ) : (
                    <div className="flex flex-col gap-1.5">
                        {variacao === null ? (
                            <div className="text-[12px] text-muted">Sem histórico de {ocupacao.diaDaSemana} para comparar</div>
                        ) : variacao === 0 ? (
                            <div className="text-[12px] text-muted">Igual à média de {ocupacao.diaDaSemana}</div>
                        ) : (
                            <div className="flex items-center gap-1 text-[12px]">
                                <Icon
                                    name={variacao > 0 ? 'arrow_upward' : 'arrow_downward'}
                                    size={16}
                                    className={variacao > 0 ? 'text-success-text' : 'text-danger'}
                                />
                                <span className={cn('font-bold', variacao > 0 ? 'text-success-text' : 'text-danger')}>
                                    {variacao > 0 ? `+${variacao}` : variacao}%
                                </span>
                                <span className="text-muted">vs média de {ocupacao.diaDaSemana}</span>
                            </div>
                        )}
                        <div className="h-1 w-full overflow-hidden rounded-full bg-surface-2">
                            <div
                                className="h-full rounded-full bg-success"
                                style={{ width: `${Math.max(0, Math.min(100, ocupacao.percentual))}%` }}
                            />
                        </div>
                    </div>
                )}
            </CartaoMetrica>

            <CartaoMetrica
                titulo="Confirmados por lembrete"
                icone="mark_chat_read"
                iconeTom="text-whatsapp"
                valor={formatCurrency(confirmadosLembrete.valor, { cents: false })}
            >
                <div className="flex items-center gap-1.5 text-[12px] text-muted">
                    <span className="h-2 w-2 shrink-0 rounded-full bg-whatsapp" />
                    <span>
                        {confirmadosLembrete.quantidade === 0
                            ? 'Nenhum atendimento com lembrete neste mês'
                            : `${confirmadosLembrete.quantidade} ${plural(confirmadosLembrete.quantidade, 'atendimento', 'atendimentos')} com lembrete enviado no mês`}
                    </span>
                </div>
            </CartaoMetrica>
        </div>
    );
}
