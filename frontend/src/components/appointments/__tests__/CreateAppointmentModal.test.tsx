import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { CreateAppointmentModal } from '../CreateAppointmentModal';

describe('CreateAppointmentModal', () => {
  it('abre com profissional, data e horário pré-preenchidos', async () => {
    const onLoadSlots = vi.fn();
    render(<CreateAppointmentModal isOpen onClose={vi.fn()} clients={[]} professionals={[{ id: 'p1', name: 'Camila', business_id: 'b', photo: null, active: true, created_at: '' }]}
      services={[]} availableSlots={['10:00', '10:30']} slotsLoading={false} onLoadSlots={onLoadSlots} onSubmit={vi.fn()}
      inicial={{ professionalId: 'p1', date: '2026-10-14', time: '10:00' }} />);
    expect(onLoadSlots).toHaveBeenCalledWith('p1', '2026-10-14', '');
    expect(screen.getByLabelText(/profissional/i)).toHaveValue('p1');
    expect(screen.getByLabelText('Data')).toHaveValue('2026-10-14');
    expect(await screen.findByRole('button', { name: '10:00' })).toHaveClass('bg-brand');
  });

  it('sem inicial, abre vazio e não busca horários', () => {
    const onLoadSlots = vi.fn();
    render(<CreateAppointmentModal isOpen onClose={vi.fn()} clients={[]} professionals={[]}
      services={[]} availableSlots={[]} slotsLoading={false} onLoadSlots={onLoadSlots} onSubmit={vi.fn()} />);
    expect(onLoadSlots).not.toHaveBeenCalled();
    expect(screen.getByLabelText(/profissional/i)).toHaveValue('');
  });
});
