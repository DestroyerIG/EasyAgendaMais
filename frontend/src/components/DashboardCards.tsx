'use client';

import { MetricCard } from '@/components/ui/MetricCard';
import type { DashboardData } from '@/types';

interface DashboardCardsProps {
    data: DashboardData;
}

export function DashboardCards({ data }: DashboardCardsProps) {
    return (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4 mb-6 sm:mb-8">
            <MetricCard label="Agendamentos Hoje" value={data.appointmentsToday} />
            <MetricCard label="Ganhos do Dia" value={`R$ ${data.earningsToday.toFixed(2)}`} />
            <MetricCard label="Gastos do Dia" value={`R$ ${data.expensesToday.toFixed(2)}`} />
            <MetricCard label="Total de Clientes" value={data.totalClients} />
        </div>
    );
}
