import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { TelaCarregandoPainel, TEMPO_LIMITE_CARREGANDO_MS } from '../TelaCarregandoPainel';

describe('TelaCarregandoPainel', () => {
  afterEach(() => vi.useRealTimers());

  it('mostra a mensagem e só oferece "Tentar novamente" depois do tempo limite', () => {
    vi.useFakeTimers();
    render(<TelaCarregandoPainel />);
    expect(screen.getByRole('status')).toHaveTextContent('Abrindo seu painel…');
    expect(screen.queryByRole('button', { name: 'Tentar novamente' })).not.toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(TEMPO_LIMITE_CARREGANDO_MS);
    });
    expect(screen.getByText('Está demorando mais que o normal.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Tentar novamente' })).toBeInTheDocument();
  });

  it('aceita outra mensagem (login com Google)', () => {
    render(<TelaCarregandoPainel mensagem="Entrando com o Google…" />);
    expect(screen.getByRole('status')).toHaveTextContent('Entrando com o Google…');
  });
});
