import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { EstadoConta } from '@/lib/conta';
import { FaixaCarenciaBancada } from '../FaixaCarenciaBancada';

const estado = vi.hoisted(() => ({ atual: null as EstadoConta | null }));
vi.mock('@/hooks/useEstadoConta', () => ({ useEstadoConta: () => ({ estado: estado.atual, recarregar: vi.fn() }) }));

describe('FaixaCarenciaBancada', () => {
  beforeEach(() => {
    estado.atual = null;
  });

  it('em carência mostra a faixa sem valores nem a palavra pagamento', () => {
    estado.atual = { tipo: 'carencia', desde: '2026-10-20', ate: '2026-10-27', diasRestantes: 3 };
    render(<FaixaCarenciaBancada />);
    const faixa = screen.getByText('Agenda em modo restrito: só os atendimentos de hoje podem ser concluídos.');
    expect(faixa).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/pagamento|R\$/i);
  });

  it('ativa ou sem estado não mostra nada', () => {
    estado.atual = { tipo: 'ativa' };
    const { container } = render(<FaixaCarenciaBancada />);
    expect(container).toBeEmptyDOMElement();
  });
});
