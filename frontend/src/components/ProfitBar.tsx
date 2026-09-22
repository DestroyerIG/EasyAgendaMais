'use client';

import { Card } from '@/components/ui/Card';
import { Skeleton } from '@/components/ui/Skeleton';
import { useThemeColors } from '@/hooks/useThemeColors';
import type { DashboardData } from '@/types';

interface ProfitBarProps {
    data: DashboardData;
}

export function ProfitBar({ data }: ProfitBarProps) {
    const colors = useThemeColors();
    const profitPercentage = data.earningsToday > 0
        ? Math.max(0, Math.min(100, (data.profitToday / data.earningsToday) * 100))
        : 0;
    const isPositive = data.profitToday >= 0;

    return (
        <Card className="mb-6 sm:mb-8">
            {colors ? (
                <>
                    <div className="flex items-center justify-between mb-6">
                        <h3 className="text-2xl font-bold text-ink">Lucro do Dia</h3>
                        <span
                            className="text-3xl font-bold"
                            style={{ color: isPositive ? colors.success : colors.danger }}
                        >
                            R$ {data.profitToday.toFixed(2)}
                        </span>
                    </div>
                    <div
                        className="h-1 bg-surface-2 rounded-full overflow-hidden"
                        role="progressbar"
                        aria-valuenow={Math.round(profitPercentage)}
                        aria-valuemin={0}
                        aria-valuemax={100}
                        aria-label={`Margem de lucro: ${Math.round(profitPercentage)}%`}
                    >
                        <div
                            className="h-full rounded-full transition-all duration-500"
                            style={{ width: `${profitPercentage}%`, backgroundColor: isPositive ? colors.success : colors.danger }}
                        />
                    </div>
                </>
            ) : (
                <>
                    <div className="flex items-center justify-between mb-6">
                        <Skeleton className="h-7 w-40" />
                        <Skeleton className="h-9 w-32" />
                    </div>
                    <Skeleton className="h-1 w-full" />
                </>
            )}
        </Card>
    );
}
