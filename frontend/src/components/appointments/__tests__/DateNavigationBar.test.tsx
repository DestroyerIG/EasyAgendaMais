import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DateNavigationBar, formatarDataAgenda, formatarDataAgendaCurta } from '../DateNavigationBar';

const props = {
  selectedDate: '2026-09-17',
  viewMode: 'day' as const,
  statusFilter: 'todos' as const,
  onDateChange: vi.fn(),
  onViewModeChange: vi.fn(),
  onStatusFilterChange: vi.fn(),
  onNovoAgendamento: vi.fn(),
};

describe('formatação da data da Agenda', () => {
  it('no computador escreve dia da semana, dia, mês e ano', () => {
    expect(formatarDataAgenda('2026-09-17')).toBe('Quinta, 17 de setembro de 2026');
  });

  it('no celular abrevia o mês, como o arquivo de referência', () => {
    expect(formatarDataAgendaCurta('2026-09-17')).toBe('Quinta, 17 de set.');
  });
});

describe('DateNavigationBar', () => {
  it('mostra as duas escritas da data, uma por largura', () => {
    render(<DateNavigationBar {...props} />);
    expect(screen.getByText('Quinta, 17 de setembro de 2026')).toHaveClass('hidden', 'lg:inline');
    expect(screen.getByText('Quinta, 17 de set.')).toHaveClass('lg:hidden');
  });

  it('anda um dia por vez no modo Dia', async () => {
    const onDateChange = vi.fn();
    render(<DateNavigationBar {...props} onDateChange={onDateChange} />);

    await userEvent.click(screen.getByRole('button', { name: 'Próximo período' }));
    expect(onDateChange).toHaveBeenCalledWith('2026-09-18');

    await userEvent.click(screen.getByRole('button', { name: 'Período anterior' }));
    expect(onDateChange).toHaveBeenCalledWith('2026-09-16');
  });

  it('anda uma semana por vez no modo Semana e mostra a faixa de datas', async () => {
    const onDateChange = vi.fn();
    render(<DateNavigationBar {...props} viewMode="week" onDateChange={onDateChange} />);

    expect(screen.getByText('17/09 — 23/09')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Próximo período' }));
    expect(onDateChange).toHaveBeenCalledWith('2026-09-24');
  });

  it('marca o filtro ativo com aria-pressed', () => {
    render(<DateNavigationBar {...props} statusFilter="concluido" />);

    expect(screen.getByRole('button', { name: 'Dia' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Semana' })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByRole('button', { name: 'Concluído' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Todos' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('troca o modo e o filtro pelos handlers de sempre', async () => {
    const onViewModeChange = vi.fn();
    const onStatusFilterChange = vi.fn();
    render(
      <DateNavigationBar {...props} onViewModeChange={onViewModeChange} onStatusFilterChange={onStatusFilterChange} />,
    );

    await userEvent.click(screen.getByRole('button', { name: 'Semana' }));
    expect(onViewModeChange).toHaveBeenCalledWith('week');

    await userEvent.click(screen.getByRole('button', { name: 'Cancelado' }));
    expect(onStatusFilterChange).toHaveBeenCalledWith('cancelado');
  });

  it('o botão Hoje volta para a data de hoje e o CTA abre o cadastro', async () => {
    const onDateChange = vi.fn();
    const onNovoAgendamento = vi.fn();
    render(<DateNavigationBar {...props} onDateChange={onDateChange} onNovoAgendamento={onNovoAgendamento} />);

    await userEvent.click(screen.getByRole('button', { name: 'Hoje' }));
    expect(onDateChange).toHaveBeenCalledTimes(1);

    await userEvent.click(screen.getByRole('button', { name: 'Novo agendamento' }));
    expect(onNovoAgendamento).toHaveBeenCalled();
  });
});
