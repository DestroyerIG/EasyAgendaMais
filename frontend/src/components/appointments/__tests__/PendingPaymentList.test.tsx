import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import { PendingPaymentList } from '../PendingPaymentList';
import api from '@/lib/api';

vi.mock('@/lib/api', () => ({
  default: {
    get: vi.fn().mockResolvedValue({
      data: [
        {
          id: 'apt-1',
          client: { name: 'Mariana', phone: '83999990000' },
          service: { name: 'Manutenção' },
          date: '2026-10-24',
          time: '14:00:00',
        },
      ],
    }),
    put: vi.fn().mockResolvedValue({ data: {} }),
  },
}));

describe('PendingPaymentList', () => {
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
