'use client';

/**
 * Barra de datas e filtros da Agenda (agenda-desktop.html, agenda-mobile.html).
 *
 * Tudo aqui é dado real: a data selecionada, o modo de visualização e o filtro de
 * status são os mesmos valores e handlers de antes. Só a forma mudou.
 * Cada arquivo de referência escreve a data de um jeito ("Terça, 17 de Setembro" no
 * computador, "Terça, 17 de set." no celular), então cada largura mostra a sua — com
 * o ano, que o DESIGN.md exige e os dois arquivos esquecem.
 */

import { formatDateShort, getToday, addDays } from '@/lib/dateUtils';
import { Icon, STATUS_LABEL } from '@/components/ui';
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

const DIAS_DA_SEMANA = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];

const comData = (dateStr: string) => new Date(`${dateStr}T12:00:00`);

/** "Terça, 17 de setembro de 2026" (agenda-desktop.html, com o ano do DESIGN.md). */
export function formatarDataAgenda(dateStr: string): string {
  const data = comData(dateStr);
  if (Number.isNaN(data.getTime())) return dateStr;
  const mes = data.toLocaleDateString('pt-BR', { month: 'long' });
  return `${DIAS_DA_SEMANA[data.getDay()]}, ${data.getDate()} de ${mes} de ${data.getFullYear()}`;
}

/** "Terça, 17 de set." (agenda-mobile.html). */
export function formatarDataAgendaCurta(dateStr: string): string {
  const data = comData(dateStr);
  if (Number.isNaN(data.getTime())) return dateStr;
  const mes = data.toLocaleDateString('pt-BR', { month: 'short' });
  return `${DIAS_DA_SEMANA[data.getDay()]}, ${data.getDate()} de ${mes}`;
}

// Filtros, não abas: não existe painel para um gatilho de aba controlar.
const GROUP_CLASS = 'inline-flex max-w-full items-center gap-1 overflow-x-auto rounded-control bg-surface-2 p-1';

function FilterButton({ label, pressed, onClick }: { label: string; pressed: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={onClick}
      className={cn(
        'inline-flex min-h-11 items-center whitespace-nowrap rounded-[8px] px-3.5 text-[13px] font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand lg:min-h-8',
        pressed ? 'bg-surface font-bold text-ink shadow-sm' : 'text-muted hover:text-ink',
      )}
    >
      {label}
    </button>
  );
}

const SETA_CLASS =
  'inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-[8px] text-ink transition-colors hover:bg-surface focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand lg:h-8 lg:w-8';

interface DateNavigationBarProps {
  selectedDate: string;
  viewMode: ViewMode;
  statusFilter: StatusFilter;
  onDateChange: (date: string) => void;
  onViewModeChange: (mode: ViewMode) => void;
  onStatusFilterChange: (filter: StatusFilter) => void;
  onNovoAgendamento: () => void;
}

export function DateNavigationBar({
  selectedDate, viewMode, statusFilter,
  onDateChange, onViewModeChange, onStatusFilterChange, onNovoAgendamento,
}: DateNavigationBarProps) {
  const step = viewMode === 'day' ? 1 : 7;
  const rotuloSemana = `${formatDateShort(selectedDate)} — ${formatDateShort(addDays(selectedDate, 6))}`;

  return (
    <div className="flex flex-col gap-4 rounded-card border border-line bg-surface p-4 xl:flex-row xl:items-center xl:justify-between">
      <div className="flex flex-wrap items-center gap-3 lg:gap-4">
        <div className="flex items-center gap-1.5 rounded-control bg-surface-2 p-1">
          <button
            type="button"
            title="Dia anterior"
            aria-label="Período anterior"
            onClick={() => onDateChange(addDays(selectedDate, -step))}
            className={SETA_CLASS}
          >
            <Icon name="chevron_left" size={18} />
          </button>
          <button
            type="button"
            onClick={() => onDateChange(getToday())}
            className="inline-flex min-h-11 items-center rounded-[8px] px-2.5 text-[13px] font-bold text-ink transition-colors hover:bg-surface focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand lg:min-h-8"
          >
            Hoje
          </button>
          <button
            type="button"
            title="Próximo dia"
            aria-label="Próximo período"
            onClick={() => onDateChange(addDays(selectedDate, step))}
            className={SETA_CLASS}
          >
            <Icon name="chevron_right" size={18} />
          </button>
          <div className="mx-1 hidden h-4 w-px bg-line lg:block" />
          <div className="flex items-center gap-2 px-2 py-1 text-[17px] font-semibold text-ink">
            <Icon name="calendar_today" size={20} className="text-brand" />
            {viewMode === 'week' ? (
              <span className="tabular-nums">{rotuloSemana}</span>
            ) : (
              <>
                <span className="lg:hidden">{formatarDataAgendaCurta(selectedDate)}</span>
                <span className="hidden lg:inline">{formatarDataAgenda(selectedDate)}</span>
              </>
            )}
          </div>
        </div>

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

      <button
        type="button"
        onClick={onNovoAgendamento}
        className="inline-flex min-h-11 items-center justify-center gap-2 rounded-control bg-brand px-4 text-[13px] font-bold text-on-brand shadow-sm transition-transform hover:brightness-105 active:scale-[0.98] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
      >
        <Icon name="add" size={18} />
        Novo agendamento
      </button>
    </div>
  );
}
