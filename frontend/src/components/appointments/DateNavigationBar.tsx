'use client';

import { ChevronLeft, ChevronRight } from 'lucide-react';
import { formatDate, formatDateShort, getToday, addDays } from '@/lib/dateUtils';
import { Card, Button, IconButton, Tabs, TabsList, TabsTrigger, STATUS_LABEL } from '@/components/ui';

type ViewMode = 'day' | 'week';
type StatusFilter = 'todos' | 'confirmado' | 'concluido' | 'cancelado';

interface DateNavigationBarProps {
  selectedDate: string;
  viewMode: ViewMode;
  statusFilter: StatusFilter;
  onDateChange: (date: string) => void;
  onViewModeChange: (mode: ViewMode) => void;
  onStatusFilterChange: (filter: StatusFilter) => void;
}

export function DateNavigationBar({
  selectedDate, viewMode, statusFilter,
  onDateChange, onViewModeChange, onStatusFilterChange
}: DateNavigationBarProps) {
  const step = viewMode === 'day' ? 1 : 7;

  return (
    <Card className="mb-6">
      <div className="flex flex-col items-start justify-between gap-4 md:flex-row md:items-center">
        <div className="flex items-center gap-3">
          <IconButton
            icon={ChevronLeft}
            label="Período anterior"
            variant="secondary"
            onClick={() => onDateChange(addDays(selectedDate, -step))}
          />
          <div className="min-w-[200px] text-center">
            <p className="font-semibold capitalize tabular-nums text-ink">
              {viewMode === 'day'
                ? formatDate(selectedDate)
                : `${formatDateShort(selectedDate)} — ${formatDateShort(addDays(selectedDate, 6))}`
              }
            </p>
          </div>
          <IconButton
            icon={ChevronRight}
            label="Próximo período"
            variant="secondary"
            onClick={() => onDateChange(addDays(selectedDate, step))}
          />
          <Button variant="secondary" size="sm" onClick={() => onDateChange(getToday())}>
            Hoje
          </Button>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Tabs value={viewMode} onValueChange={(value) => onViewModeChange(value as ViewMode)}>
            <TabsList>
              <TabsTrigger value="day">Dia</TabsTrigger>
              <TabsTrigger value="week">Semana</TabsTrigger>
            </TabsList>
          </Tabs>

          <Tabs value={statusFilter} onValueChange={(value) => onStatusFilterChange(value as StatusFilter)}>
            <TabsList>
              <TabsTrigger value="todos">Todos</TabsTrigger>
              <TabsTrigger value="confirmado">{STATUS_LABEL.confirmado}</TabsTrigger>
              <TabsTrigger value="concluido">{STATUS_LABEL.concluido}</TabsTrigger>
              <TabsTrigger value="cancelado">{STATUS_LABEL.cancelado}</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
      </div>
    </Card>
  );
}
