import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { FaixaHoraDeAtender } from '../FaixaHoraDeAtender';
import type { Appointment } from '@/types';

const ag = (over: Partial<Appointment>): Appointment => ({
  id: 'a1', business_id: 'b', client_id: 'c', professional_id: 'p', service_id: 's',
  date: '2026-11-11', time: '14:00', status: 'confirmado', reminder_sent: false, created_at: '',
  client_name: 'Mariana', service_name: 'Corte', professional_name: 'Paula', ...over,
});

describe('FaixaHoraDeAtender', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 10, 11, 14, 3)); // 11/11/2026 14:03, hora local
  });
  afterEach(() => vi.useRealTimers());

  it('mostra quem chegou na hora, com o botão Iniciar', () => {
    const onAcao = vi.fn();
    render(<FaixaHoraDeAtender agendamentos={[ag({})]} actionLoading={null} onAcao={onAcao} />);

    expect(screen.getByText('Chegou a hora de atender')).toBeTruthy();
    expect(screen.getByText('Na hora')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Iniciar atendimento de Mariana/ }));
    expect(onAcao).toHaveBeenCalledWith(expect.objectContaining({ id: 'a1' }), 'iniciar');
  });

  it('marca como atrasado depois de 10 minutos', () => {
    vi.setSystemTime(new Date(2026, 10, 11, 14, 40));
    render(<FaixaHoraDeAtender agendamentos={[ag({})]} actionLoading={null} onAcao={vi.fn()} />);
    expect(screen.getByText('Atrasado há 40 min')).toBeTruthy();
  });

  it('não aparece quando ninguém está na hora', () => {
    const { container } = render(
      <FaixaHoraDeAtender agendamentos={[ag({ time: '16:00' }), ag({ id: 'a2', status: 'em_atendimento' })]} actionLoading={null} onAcao={vi.fn()} />,
    );
    expect(container.firstChild).toBeNull();
  });
});
