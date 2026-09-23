'use client';

import { ChevronLeft, ChevronRight } from 'lucide-react';
import { formatDate, formatDateShort, getToday, addDays } from '@/lib/dateUtils';
import { Card, Button, IconButton, STATUS_LABEL } from '@/components/ui';
import { cn } from '@/lib/cn';

type ViewMode = 'day' | 'week';
type StatusFilter = 'todos' | 'confirmado' | 'concluido' | 'cancelado';

const VIEW_MODES: { value: ViewMode; label: string }[] = [
  { value: 'day', label: 'Dia' },
  { value: 'week', label: 'Semana' },
];

const STATUS_FILTERS: { value: StatusFilter; label: string }[] = [
  { value: 'todos', label: 'Todos' },
  { value: 'confirmado', label: STATUS_LABEL.confirmado },
  { value: 'concluido', label: STATUS_LABEL.concluido },
  { value: 'cancelado', label: STATUS_LABEL.cancelado },
];

// Filtros, não abas: não existe painel para um gatilho de aba controlar.
const GROUP_CLASS = 'inline-flex max-w-full gap-1 overflow-x-auto rounded-control border border-line bg-surface-2 p-1';

function FilterButton({ label, pressed, onClick }: { label: string; pressed: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={onClick}
      className={cn(
        'inline-flex min-h-11 items-center whitespace-nowrap rounded-[8px] px-3 text-[13px] font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand lg:min-h-9',
        pressed ? 'bg-surface text-ink' : 'text-muted hover:text-ink',
      )}
    >
      {label}
    </button>
  );
}

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
          <div role="group" aria-label="Modo de visualização" className={GROUP_CLASS}>
            {VIEW_MODES.map((mode) => (
              <FilterButton
                key={mode.value}
                label={mode.label}
                pressed={viewMode === mode.value}
                onClick={() => onViewModeChange(mode.value)}
              />
            ))}
          </div>

          <div role="group" aria-label="Filtrar por status" className={GROUP_CLASS}>
            {STATUS_FILTERS.map((filter) => (
              <FilterButton
                key={filter.value}
                label={filter.label}
                pressed={statusFilter === filter.value}
                onClick={() => onStatusFilterChange(filter.value)}
              />
            ))}
          </div>
        </div>
      </div>
    </Card>
  );
}
