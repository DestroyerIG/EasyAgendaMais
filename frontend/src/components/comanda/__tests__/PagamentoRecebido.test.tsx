import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

const api = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));
vi.mock('@/lib/api', () => ({ default: api }));

const { PagamentoRecebido } = await import('../PagamentoRecebido');

describe('PagamentoRecebido', () => {
  it('agradece e diz que a página pode ser fechada', () => {
    render(<PagamentoRecebido />);
    expect(screen.getByRole('heading', { name: /pagamento recebido/i })).toBeInTheDocument();
    expect(screen.getByText(/obrigado/i)).toBeInTheDocument();
    expect(screen.getByText(/pode fechar esta página/i)).toBeInTheDocument();
  });

  it('não depende de login nem chama a API (o cliente que paga não tem conta)', () => {
    render(<PagamentoRecebido />);
    expect(api.get).not.toHaveBeenCalled();
    expect(api.post).not.toHaveBeenCalled();
  });
});
