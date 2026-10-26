import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Appointment, Professional, Service } from '@/types';

const ocupado = vi.hoisted(() => vi.fn());
vi.mock('@/lib/googleAgenda', async (orig) => ({
  ...(await orig<typeof import('@/lib/googleAgenda')>()),
  googleAgendaApi: { ocupado },
}));

const { LinhaDoTempo } = await import('../LinhaDoTempo');
const { CreateAppointmentModal } = await import('../CreateAppointmentModal');
const { cruzaOcupado } = await import('@/lib/googleAgenda');

const agendamento = (id: string, professional_id: string, professional_name: string, time: string): Appointment => ({
  id, business_id: 'b1', client_id: 'c1', professional_id, service_id: 's1', date: '2026-11-10T00:00:00',
  time, status: 'confirmado', reminder_sent: false, created_at: '', client_name: 'Mariana',
  professional_name, service_name: 'Corte', service_price: 80,
});

const props = {
  duracaoPadraoMinutos: 30, actionLoading: null, onAcao: vi.fn(), onNovoAgendamento: vi.fn(),
};

const profissionais: Professional[] = [{ id: 'p1', name: 'Camila', business_id: 'b', photo: null, active: true, created_at: '' }];
const servicos: Service[] = [
  { id: 's1', business_id: 'b', name: 'Corte', price: 80, duration_minutes: 30, deposit_percentage: null, active: true, created_at: '' },
];
const modal = {
  isOpen: true, onClose: vi.fn(), clients: [], professionals: profissionais, services: servicos,
  slotsLoading: false, onLoadSlots: vi.fn(), onSubmit: vi.fn(),
  inicial: { professionalId: 'p1', date: '2026-11-10', serviceId: 's1' },
};

describe('Ocupado (Google) na agenda do painel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    ocupado.mockResolvedValue({ p1: [{ start: '15:00', end: '16:00' }] });
  });

  it('bloco Ocupado (Google) na coluna da profissional', () => {
    render(
      <LinhaDoTempo
        {...props}
        agendamentos={[agendamento('a1', 'p1', 'Camila', '09:00:00'), agendamento('a2', 'p2', 'Bia', '10:00:00')]}
        ocupadoGoogle={{ p1: [{ start: '15:00', end: '16:00' }] }}
      />,
    );
    const blocos = screen.getAllByText('Ocupado (Google)');
    expect(blocos).toHaveLength(1);
    const coluna = blocos[0].closest('[data-coluna]') as HTMLElement;
    expect(coluna).toHaveAttribute('data-coluna', 'p1');
    expect(within(coluna).queryByText(/dentista/i)).not.toBeInTheDocument();
  });

  it('cruzaOcupado', () => {
    const faixas = [{ start: '15:00', end: '16:00' }];
    expect(cruzaOcupado(faixas, '15:30', 30)).toBe(true);
    expect(cruzaOcupado(faixas, '16:00', 30)).toBe(false);
    expect(cruzaOcupado(faixas, '14:45', 30)).toBe(true);
    expect(cruzaOcupado(undefined, '15:30', 30)).toBe(false);
  });

  it('aviso ao criar por cima', async () => {
    render(<CreateAppointmentModal {...modal} availableSlots={['15:00', '15:30', '16:00']} />);
    await waitFor(() => expect(ocupado).toHaveBeenCalledWith('2026-11-10'));
    await userEvent.click(screen.getByRole('button', { name: '15:30' }));
    expect(await screen.findByText('Esse horário está ocupado no Google Agenda de Camila')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: '16:00' }));
    expect(screen.queryByText(/ocupado no Google Agenda/)).not.toBeInTheDocument();
  });

  it('sem Google não busca nada que quebre', async () => {
    ocupado.mockRejectedValue(Object.assign(new Error('404'), { response: { status: 404 } }));
    render(<CreateAppointmentModal {...modal} availableSlots={['15:30']} />);
    await userEvent.click(await screen.findByRole('button', { name: '15:30' }));
    expect(screen.queryByText(/ocupado no Google Agenda/)).not.toBeInTheDocument();
  });
});
