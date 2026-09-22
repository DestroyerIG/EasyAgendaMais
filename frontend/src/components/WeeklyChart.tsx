'use client';

import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { Card } from '@/components/ui/Card';
import { Skeleton } from '@/components/ui/Skeleton';
import { useThemeColors } from '@/hooks/useThemeColors';
import type { WeeklyEarning } from '@/types';

interface WeeklyChartProps {
    data: WeeklyEarning[];
}

export function WeeklyChart({ data }: WeeklyChartProps) {
    const colors = useThemeColors();

    return (
        <Card>
            <h3 className="text-2xl font-bold text-ink mb-6">Faturamento Semanal</h3>
            {colors ? (
                <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={data}>
                        <CartesianGrid strokeDasharray="3 3" stroke={colors.line} />
                        <XAxis
                            dataKey="date"
                            stroke={colors.muted}
                            tickFormatter={(date) => new Date(date).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}
                        />
                        <YAxis stroke={colors.muted} />
                        <Tooltip
                            contentStyle={{
                                backgroundColor: colors.surface,
                                border: `1px solid ${colors.line}`,
                                borderRadius: '8px',
                                color: colors.ink,
                            }}
                            labelFormatter={(date) => new Date(date).toLocaleDateString('pt-BR')}
                            formatter={(value: number) => [`R$ ${value}`, 'Faturamento']}
                        />
                        <Bar dataKey="total" fill={colors.brand} radius={[8, 8, 0, 0]} />
                    </BarChart>
                </ResponsiveContainer>
            ) : (
                <Skeleton className="h-[300px] w-full" />
            )}
        </Card>
    );
}
