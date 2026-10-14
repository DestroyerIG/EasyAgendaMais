import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CreateAppointmentModal } from '../CreateAppointmentModal';
import type { Professional, Service } from '@/types';

const profissionais: Professional[] = [{ id: 'p1', name: 'Camila', business_id: 'b', photo: null, active: true, created_at: '' }];
const servicos: Service[] = [
  { id: 's1', business_id: 'b', name: 'Corte', price: 80, duration_minutes: 60, deposit_percentage: null, active: true, created_at: '' },
];

const base = {
  isOpen: true,
  onClose: vi.fn(),
  clients: [],
  professionals: profissionais,
  services: servicos,
  slotsLoading: false,
  onSubmit: vi.fn(),
  inicial: { professionalId: 'p1', date: '2026-10-14', time: '10:00' },
};

describe('CreateAppointmentModal', () => {
  it('abre com profissional, data e horário pré-preenchidos', async () => {
    const onLoadSlots = vi.fn();
    render(<CreateAppointmentModal isOpen onClose={vi.fn()} clients={[]} professionals={[{ id: 'p1', name: 'Camila', business_id: 'b', photo: null, active: true, created_at: '' }]}
      services={[]} availableSlots={['10:00', '10:30']} slotsLoading={false} onLoadSlots={onLoadSlots} onSubmit={vi.fn()}
      inicial={{ professionalId: 'p1', date: '2026-10-14', time: '10:00' }} />);
    expect(onLoadSlots).toHaveBeenCalledWith('p1', '2026-10-14', '');
    expect(screen.getByLabelText(/profissional/i)).toHaveValue('p1');
    expect(screen.getByLabelText('Data')).toHaveValue('2026-10-14');
  });

  it('seleciona o horário do clique quando ele chega na lista de horários disponíveis', () => {
    const { rerender } = render(<CreateAppointmentModal {...base} availableSlots={[]} onLoadSlots={vi.fn()} />);
    rerender(<CreateAppointmentModal {...base} availableSlots={['10:00', '10:30']} onLoadSlots={vi.fn()} />);
    expect(screen.getByRole('button', { name: '10:00' })).toHaveClass('bg-brand');
  });

  it('escolher o serviço recarrega os horários e mantém o horário se ele continuar disponível', async () => {
    const onLoadSlots = vi.fn();
    const { rerender } = render(<CreateAppointmentModal {...base} availableSlots={[]} onLoadSlots={onLoadSlots} />);
    rerender(<CreateAppointmentModal {...base} availableSlots={['10:00', '10:30']} onLoadSlots={onLoadSlots} />);

    await userEvent.selectOptions(screen.getByLabelText('Serviço'), 's1');
    expect(onLoadSlots).toHaveBeenLastCalledWith('p1', '2026-10-14', 's1');

    rerender(<CreateAppointmentModal {...base} availableSlots={['09:00', '10:00']} onLoadSlots={onLoadSlots} />);
    expect(screen.getByRole('button', { name: '10:00' })).toHaveClass('bg-brand');
  });

  it('escolher o serviço limpa o horário se a lista nova não tem mais ele', async () => {
    const onLoadSlots = vi.fn();
    const { rerender } = render(<CreateAppointmentModal {...base} availableSlots={[]} onLoadSlots={onLoadSlots} />);
    rerender(<CreateAppointmentModal {...base} availableSlots={['10:00', '10:30']} onLoadSlots={onLoadSlots} />);

    await userEvent.selectOptions(screen.getByLabelText('Serviço'), 's1');
    rerender(<CreateAppointmentModal {...base} availableSlots={['10:30', '11:00']} onLoadSlots={onLoadSlots} />);
    expect(screen.queryByRole('button', { name: '10:00' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '10:30' })).not.toHaveClass('bg-brand');
    // A lista seguinte trazendo 10:00 de volta não reaplica um horário já descartado.
    rerender(<CreateAppointmentModal {...base} availableSlots={['10:00', '10:30']} onLoadSlots={onLoadSlots} />);
    expect(screen.getByRole('button', { name: '10:00' })).not.toHaveClass('bg-brand');
  });

  it('sem inicial, abre vazio e não busca horários', () => {
    const onLoadSlots = vi.fn();
    render(<CreateAppointmentModal isOpen onClose={vi.fn()} clients={[]} professionals={[]}
      services={[]} availableSlots={[]} slotsLoading={false} onLoadSlots={onLoadSlots} onSubmit={vi.fn()} />);
    expect(onLoadSlots).not.toHaveBeenCalled();
    expect(screen.getByLabelText(/profissional/i)).toHaveValue('');
  });
});
