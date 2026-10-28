'use client';

/**
 * Barra de datas e filtros da Agenda (agenda-desktop.html, agenda-mobile.html).
 *
 * Tudo aqui é dado real: a data selecionada, o modo de visualização, o filtro de
 * status e a lista de profissionais com a contagem de atendimentos. Os valores e
 * handlers de data, modo e status são os mesmos de antes; só a forma mudou.
 * Cada arquivo de referência escreve a data de um jeito ("Terça, 17 de Setembro" no
 * computador, "Terça, 17 de set." no celular) e arruma a linha de outro (o celular
 * espalha a linha inteira, o computador junta tudo numa pílula), então cada largura
 * recebe a sua escrita e a sua ordem. A data leva o ano, que o DESIGN.md exige e os
 * dois arquivos esquecem.
 */

import { useBloqueadoNaCarencia } from '@/hooks/useBloqueadoNaCarencia';
import { formatDateShort, getToday, addDays } from '@/lib/dateUtils';
import { Avatar, Icon, STATUS_LABEL } from '@/components/ui';
import { cn } from '@/lib/cn';
import { useVocabulario } from '@/hooks/useVocabulario';

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

export const primeiroNome = (nome: string) => nome.trim().split(/\s+/)[0] || nome;

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

// Botão da linha de data: 44px com fundo próprio no celular (agenda-mobile.html),
// 32px encostado no fundo da pílula no computador (agenda-desktop.html).
const SETA_CLASS =
  'inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-[8px] bg-surface text-ink shadow-sm transition-transform active:scale-95 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand lg:h-8 lg:w-8 lg:bg-transparent lg:shadow-none lg:transition-colors lg:hover:bg-surface';

export interface ProfissionalChip {
  id: string;
  nome: string;
  total: number;
  /** Tom da pessoa, na ordem das colunas da linha do tempo. */
  tom: { fundo: string; texto: string };
}

export interface ChipsProfissionalProps {
  profissionais: ProfissionalChip[];
  totalGeral: number;
  ativo: string | null;
  onChange: (id: string | null) => void;
  /** Fileira do computador: chips pequenos, sem contagem (agenda-desktop.html). */
  compacto?: boolean;
  /** A contagem é do dia; no modo Semana ela sai (a referência é de um dia só). */
  mostrarContagem?: boolean;
  className?: string;
}

/**
 * Chips de profissional: "Todas" mais uma por pessoa com atendimento no período.
 * Filtram a lista já carregada — não refazem chamada nem mudam o que o servidor devolve.
 */
export function ChipsProfissional({
  profissionais,
  totalGeral,
  ativo,
  onChange,
  compacto = false,
  mostrarContagem,
  className,
}: ChipsProfissionalProps) {
  const { prof } = useVocabulario();
  if (profissionais.length === 0) return null;
  const comContagem = mostrarContagem ?? !compacto;

  const base = compacto
    ? 'inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1.5 text-[13px] transition-all active:scale-95 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand'
    : 'inline-flex h-11 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full pl-1.5 pr-3 text-[13px] transition-transform active:scale-95 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand';
  const ativoClass = compacto ? 'bg-ink font-bold text-surface' : 'bg-brand font-bold text-on-brand';
  const inativoClass = 'bg-surface-2 text-ink hover:bg-line/60';

  return (
    <div
      role="group"
      aria-label={`Filtrar por ${prof.s}`}
      className={cn('flex items-center gap-1.5 overflow-x-auto', className)}
    >
      <button
        type="button"
        aria-pressed={ativo === null}
        onClick={() => onChange(null)}
        className={cn(
          base,
          compacto && 'px-3',
          ativo === null ? ativoClass : inativoClass,
        )}
      >
        {!compacto && (
          <span
            className={cn(
              'flex h-7 w-7 items-center justify-center rounded-full',
              ativo === null ? 'bg-on-brand/15' : 'bg-surface/60',
            )}
          >
            <Icon name="group" size={18} />
          </span>
        )}
        <span className="tabular-nums">Todas{comContagem ? ` (${totalGeral})` : ''}</span>
      </button>

      {profissionais.map((profissional) => {
        const selecionado = ativo === profissional.id;
        return (
          <button
            key={profissional.id}
            type="button"
            aria-pressed={selecionado}
            onClick={() => onChange(selecionado ? null : profissional.id)}
            className={cn(base, selecionado ? ativoClass : inativoClass)}
          >
            {/* Decorativo: o nome já está escrito ao lado, então o avatar sai da
                leitura do leitor de tela para não repetir a pessoa duas vezes. */}
            <span aria-hidden="true" className="flex shrink-0">
              <Avatar
                name={compacto ? primeiroNome(profissional.nome) : profissional.nome}
                size={compacto ? 20 : 32}
                className={cn(
                  'font-bold',
                  compacto ? 'text-[10px]' : 'text-[11px]',
                  profissional.tom.fundo,
                  profissional.tom.texto,
                )}
              />
            </span>
            <span className="tabular-nums">
              {primeiroNome(profissional.nome)}
              {comContagem ? ` (${profissional.total})` : ''}
            </span>
          </button>
        );
      })}
    </div>
  );
}

interface DateNavigationBarProps {
  selectedDate: string;
  viewMode: ViewMode;
  statusFilter: StatusFilter;
  profissionais: ProfissionalChip[];
  totalAgendamentos: number;
  profissionalFiltro: string | null;
  onDateChange: (date: string) => void;
  onViewModeChange: (mode: ViewMode) => void;
  onStatusFilterChange: (filter: StatusFilter) => void;
  onProfissionalFiltroChange: (id: string | null) => void;
  onNovoAgendamento: () => void;
}

export function DateNavigationBar({
  selectedDate, viewMode, statusFilter, profissionais, totalAgendamentos, profissionalFiltro,
  onDateChange, onViewModeChange, onStatusFilterChange, onProfissionalFiltroChange, onNovoAgendamento,
}: DateNavigationBarProps) {
  const { bloqueado, dica } = useBloqueadoNaCarencia();
  const step = viewMode === 'day' ? 1 : 7;
  const rotuloSemana = `${formatDateShort(selectedDate)} — ${formatDateShort(addDays(selectedDate, 6))}`;

  return (
    <div className="flex flex-col gap-3 rounded-card border border-line bg-surface p-4 lg:gap-4 xl:flex-row xl:items-center xl:justify-between">
      <div className="flex flex-col gap-3 lg:flex-row lg:flex-wrap lg:items-center lg:gap-4">
        {/* Uma linha só, em duas arrumações: espalhada no celular (seta, data ao centro,
            "Hoje" + seta à direita) e em pílula na ordem do computador. */}
        <div className="flex w-full items-center gap-1.5 rounded-control bg-surface-2 p-2 lg:w-auto lg:p-1">
          <button
            type="button"
            title="Dia anterior"
            aria-label="Período anterior"
            onClick={() => onDateChange(addDays(selectedDate, -step))}
            className={cn(SETA_CLASS, 'order-1')}
          >
            <Icon name="chevron_left" size={20} />
          </button>

          <div className="order-2 flex flex-1 items-center justify-center gap-2 px-1 text-[17px] font-semibold tracking-tight text-ink lg:order-5 lg:flex-none lg:justify-start lg:px-2">
            <Icon name="calendar_today" size={20} className="shrink-0 text-brand" />
            {viewMode === 'week' ? (
              <span className="tabular-nums">{rotuloSemana}</span>
            ) : (
              <>
                <span className="lg:hidden">{formatarDataAgendaCurta(selectedDate)}</span>
                <span className="hidden lg:inline">{formatarDataAgenda(selectedDate)}</span>
              </>
            )}
          </div>

          <button
            type="button"
            onClick={() => onDateChange(getToday())}
            className="order-3 inline-flex h-11 shrink-0 items-center rounded-[8px] bg-surface px-3 text-[13px] font-bold text-ink shadow-sm transition-transform active:scale-95 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand lg:order-2 lg:h-8 lg:bg-transparent lg:px-2.5 lg:shadow-none lg:transition-colors lg:hover:bg-surface"
          >
            Hoje
          </button>

          <button
            type="button"
            title="Próximo dia"
            aria-label="Próximo período"
            onClick={() => onDateChange(addDays(selectedDate, step))}
            className={cn(SETA_CLASS, 'order-4 lg:order-3')}
          >
            <Icon name="chevron_right" size={20} />
          </button>

          <div className="order-5 mx-1 hidden h-4 w-px bg-line lg:order-4 lg:block" />
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

        {/* Chips de profissional do computador; no celular eles ficam na fileira
            deslizante logo abaixo desta barra (agenda-mobile.html). */}
        <ChipsProfissional
          compacto
          profissionais={profissionais}
          totalGeral={totalAgendamentos}
          ativo={profissionalFiltro}
          onChange={onProfissionalFiltroChange}
          className="hidden border-l border-line pl-4 lg:flex"
        />
      </div>

      <button
        type="button"
        onClick={onNovoAgendamento}
        disabled={bloqueado}
        title={dica}
        className="disabled:cursor-not-allowed disabled:opacity-50 inline-flex min-h-11 items-center justify-center gap-2 rounded-control bg-brand px-4 text-[13px] font-bold text-on-brand shadow-sm transition-transform hover:brightness-105 active:scale-[0.98] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
      >
        <Icon name="add" size={18} />
        Novo agendamento
      </button>
    </div>
  );
}
