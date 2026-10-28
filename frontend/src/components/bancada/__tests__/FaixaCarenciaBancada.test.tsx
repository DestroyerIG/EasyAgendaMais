import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import type { EstadoConta } from '@/lib/conta';
import { FaixaCarenciaBancada } from '../FaixaCarenciaBancada';

const estado = { atual: null as EstadoConta | null };

describe('FaixaCarenciaBancada', () => {
  beforeEach(() => {
    estado.atual = null;
  });

  it('em carência mostra a faixa sem valores nem a palavra pagamento', () => {
    estado.atual = { tipo: 'carencia', desde: '2026-10-20', ate: '2026-10-27', diasRestantes: 3 };
    render(<FaixaCarenciaBancada estado={estado.atual} />);
    const faixa = screen.getByText('Agenda em modo restrito: só os atendimentos de hoje podem ser concluídos.');
    expect(faixa).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/pagamento|R\$/i);
  });

  it('ativa ou sem estado não mostra nada', () => {
    estado.atual = { tipo: 'ativa' };
    const { container } = render(<FaixaCarenciaBancada estado={estado.atual} />);
    expect(container).toBeEmptyDOMElement();
  });
});
