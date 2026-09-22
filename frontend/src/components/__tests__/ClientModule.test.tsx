import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import type { Client } from '@/types';

const mockApiGet = vi.hoisted(() => vi.fn());
vi.mock('@/lib/api', () => ({
  default: {
    get: (...args: unknown[]) => mockApiGet(...args),
    post: vi.fn(),
    put: vi.fn(),
  },
}));

const { ClientModule } = await import('../ClientModule');

const client: Client = {
  id: 'c1',
  business_id: 'b1',
  name: 'Maria Silva',
  phone: '11999999999',
  last_visit: null,
  total_spent: 0,
  created_at: '2024-01-01T00:00:00.000Z',
};

describe('ClientModule', () => {
  beforeEach(() => {
    mockApiGet.mockReset();
    mockApiGet.mockImplementation((url: string) => {
      if (url === '/clients') return Promise.resolve({ data: [client] });
      if (url.endsWith('/history')) return Promise.resolve({ data: [] });
      return Promise.resolve({ data: [] });
    });
  });

  it('abre o painel de detalhes ao selecionar um cliente e fecha ao clicar em fechar', async () => {
    render(<ClientModule />);

    await waitFor(() => {
      expect(mockApiGet).toHaveBeenCalledWith('/clients');
    });

    const occurrences = await screen.findAllByText('Maria Silva');
    const row = occurrences[0].closest('tr') ?? occurrences[0];
    fireEvent.click(row);

    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Fechar' }));

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
  });
});
