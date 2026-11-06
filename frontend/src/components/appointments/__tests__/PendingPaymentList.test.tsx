import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import { PendingPaymentList } from '../PendingPaymentList';
import api from '@/lib/api';
import { AxiosError, type AxiosResponse } from 'axios';

vi.mock('@/lib/api', () => ({
  default: {
    get: vi.fn().mockResolvedValue({
      data: [
        {
          id: 'apt-1',
          client_name: 'Mariana',
          client_phone: '83999990000',
          service_name: 'Manutenção',
          date: '2026-10-24T00:00:00',
          time: '14:00:00',
        },
      ],
    }),
    put: vi.fn().mockResolvedValue({ data: {} }),
  },
}));

describe('PendingPaymentList', () => {
  it('mostra cliente, serviço, data e hora do DTO da API', async () => {
    render(<PendingPaymentList />);

    expect(await screen.findByText('Mariana')).toBeInTheDocument();
    expect(screen.getByText('Manutenção · 24/10 14:00')).toBeInTheDocument();
  });

  it('confirma o pagamento ao clicar no botão', async () => {
    const user = userEvent.setup();
    render(<PendingPaymentList />);

    await waitFor(() => expect(screen.getByText('Mariana')).toBeInTheDocument());

    await user.click(screen.getByRole('button', { name: /confirmar recebimento do pix/i }));

    await waitFor(() => {
      expect(api.put).toHaveBeenCalledWith('/appointments/apt-1/status', { status: 'confirmado' });
    });
  });
});

describe('PendingPaymentList — cobrança automática', () => {
  const reserva = (id: string, automatica: boolean) => ({
    id, client_name: id === 'apt-1' ? 'Mariana' : 'Renata', service_name: 'Manutenção', date: '2026-10-24T00:00:00', time: '14:00:00',
    cobranca_automatica: automatica,
  });

  it('mostra o selo Automático só nas reservas com cobrança automática e mantém o botão manual', async () => {
    const getMock = api.get as unknown as ReturnType<typeof vi.fn>;
    getMock.mockResolvedValueOnce({ data: [reserva('apt-1', true), reserva('apt-2', false)] });
    render(<PendingPaymentList />);

    expect(await screen.findByText('Mariana')).toBeInTheDocument();
    expect(screen.getAllByText('Automático')).toHaveLength(1);
    expect(screen.getAllByRole('button', { name: /confirmar recebimento do pix/i })).toHaveLength(2);
  });
});

describe('PendingPaymentList — falha ao confirmar', () => {
  it('mostra o motivo e recarrega a lista quando a reserva já expirou (409)', async () => {
    const user = userEvent.setup();
    const getMock = api.get as unknown as ReturnType<typeof vi.fn>;
    const putMock = api.put as unknown as ReturnType<typeof vi.fn>;
    getMock.mockClear();
    putMock.mockRejectedValueOnce(
      new AxiosError('conflict', '409', undefined, undefined, {
        status: 409,
        data: { success: false, error: 'Esta reserva já expirou ou teve seu status alterado' },
      } as AxiosResponse)
    );
    render(<PendingPaymentList />);

    await waitFor(() => expect(screen.getByText('Mariana')).toBeInTheDocument());
    getMock.mockResolvedValueOnce({ data: [] }); // a reserva expirada some da lista

    await user.click(screen.getByRole('button', { name: /confirmar recebimento do pix/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Esta reserva já expirou ou teve seu status alterado');
    expect(getMock).toHaveBeenCalledTimes(2);
    expect(screen.queryByText('Mariana')).not.toBeInTheDocument();
  });
});
