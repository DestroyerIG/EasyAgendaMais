'use client';

import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer
} from 'recharts';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Card, Skeleton } from '@/components/ui';
import { useThemeColors } from '@/hooks/useThemeColors';

interface FinanceChartProps {
  data: Array<{ date: string; earnings: number; expenses: number }>;
}

function safeFormatDate(dateStr: string, formatStr: string) {
  try {
    if (!dateStr) return '---';
    const date = new Date(dateStr.includes('T') ? dateStr : `${dateStr}T12:00:00`);
    if (isNaN(date.getTime())) return '';
    return format(date, formatStr, { locale: ptBR });
  } catch {
    return '';
  }
}

export function FinanceChart({ data }: FinanceChartProps) {
  const colors = useThemeColors();

  return (
    <Card>
      <div className="mb-6 flex items-center justify-between">
        <h3 className="text-[15px] font-bold text-ink">Gráfico de crescimento</h3>
        <div className="flex gap-4">
          <div className="flex items-center gap-2">
            <div className="h-3 w-3 rounded-full bg-success" />
            <span className="text-xs font-bold text-muted">Ganhos</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="h-3 w-3 rounded-full bg-danger" />
            <span className="text-xs font-bold text-muted">Gastos</span>
          </div>
        </div>
      </div>
      {colors ? (
        <div className="h-[350px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data}>
              <defs>
                <linearGradient id="colorEarnings" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={colors.success} stopOpacity={0.3} />
                  <stop offset="95%" stopColor={colors.success} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke={colors.line} vertical={false} />
              <XAxis
                dataKey="date"
                stroke={colors.muted}
                fontSize={12}
                tickFormatter={(val) => safeFormatDate(val, 'dd/MM')}
              />
              <YAxis stroke={colors.muted} fontSize={12} tickFormatter={(val) => `R$ ${val}`} />
              <Tooltip
                contentStyle={{ backgroundColor: colors.surface, border: `1px solid ${colors.line}`, borderRadius: '12px' }}
                labelStyle={{ color: colors.muted, marginBottom: '8px', fontWeight: 'bold' }}
              />
              <Area type="monotone" dataKey="earnings" name="Ganhos" stroke={colors.success} strokeWidth={3} fillOpacity={1} fill="url(#colorEarnings)" />
              <Area type="monotone" dataKey="expenses" name="Gastos" stroke={colors.danger} strokeWidth={2} fillOpacity={0} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <Skeleton className="h-[350px] w-full" />
      )}
    </Card>
  );
}
