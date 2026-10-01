'use client';

import { BarChart, Bar, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LabelList } from 'recharts';
import { Card } from '@/components/ui/Card';
import { Skeleton } from '@/components/ui/Skeleton';
import { useThemeColors } from '@/hooks/useThemeColors';
import { formatCurrency } from '@/lib/formatters';
import { cn } from '@/lib/cn';
import type { WeeklyEarning } from '@/types';

interface WeeklyChartProps {
    data: WeeklyEarning[];
    className?: string;
}

const DIAS_ABREVIADOS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

const isHoje = (dateStr: string) => new Date(dateStr).toDateString() === new Date().toDateString();

// Rótulo de cada barra (hoje-desktop.html / hoje-mobile.html): dia da semana
// abreviado, e "Hoje" para a barra do dia atual em vez do nome do dia.
const rotuloDia = (dateStr: string) => (isHoje(dateStr) ? 'Hoje' : DIAS_ABREVIADOS[new Date(dateStr).getDay()]);

// Valor em cima de cada barra (hoje-desktop.html): número compacto, sem "R$" — o
// cifrão já aparece no "Total período" ao lado do título.
const formatCompacto = (value: number) => new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 }).format(value);

export function WeeklyChart({ data, className }: WeeklyChartProps) {
    const colors = useThemeColors();
    const totalPeriodo = data.reduce((soma, dia) => soma + dia.total, 0);

    return (
        <Card className={cn(className)}>
            <div className="mb-4 flex items-center justify-between gap-3 border-b border-line pb-3">
                <div>
                    <h3 className="text-[16px] font-bold text-ink">Faturamento últimos 7 dias</h3>
                    <p className="text-[12px] text-muted">Comparativo diário da semana</p>
                </div>
                <div className="text-right">
                    <span className="text-[11px] font-semibold text-muted">Total período</span>
                    <div className="text-[18px] font-bold tabular-nums text-ink">
                        {formatCurrency(totalPeriodo, { cents: false })}
                    </div>
                </div>
            </div>
            {colors ? (
                <ResponsiveContainer width="100%" height={220}>
                    <BarChart data={data} margin={{ top: 24 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke={colors.line} vertical={false} />
                        <XAxis
                            dataKey="date"
                            stroke={colors.muted}
                            tickFormatter={rotuloDia}
                            tick={{ fontSize: 11, fontWeight: 600 }}
                            axisLine={false}
                            tickLine={false}
                        />
                        <YAxis stroke={colors.muted} tick={{ fontSize: 10 }} axisLine={false} tickLine={false} width={40} />
                        <Tooltip
                            contentStyle={{
                                backgroundColor: colors.surface,
                                border: `1px solid ${colors.line}`,
                                borderRadius: '8px',
                                color: colors.ink,
                            }}
                            labelFormatter={(date: string) => new Date(date).toLocaleDateString('pt-BR')}
                            formatter={(value: number) => [formatCurrency(value, { cents: false }), 'Faturamento']}
                        />
                        <Bar dataKey="total" radius={[8, 8, 0, 0]}>
                            {data.map((dia) => (
                                <Cell key={dia.date} fill={isHoje(dia.date) ? colors.brand : colors.line} />
                            ))}
                            <LabelList
                                dataKey="total"
                                position="top"
                                offset={8}
                                content={({ x, y, width, value, index }) => {
                                    const dia = data[index as number];
                                    const destaque = dia && isHoje(dia.date);
                                    return (
                                        <text
                                            x={Number(x) + Number(width) / 2}
                                            y={Number(y) - 8}
                                            textAnchor="middle"
                                            fontSize={11}
                                            fontWeight={700}
                                            fill={destaque ? colors.brand : colors.muted}
                                        >
                                            {formatCompacto(Number(value))}
                                        </text>
                                    );
                                }}
                            />
                        </Bar>
                    </BarChart>
                </ResponsiveContainer>
            ) : (
                <Skeleton className="h-[220px] w-full" />
            )}
        </Card>
    );
}
