import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { FaixaContingencia } from '../FaixaContingencia';

describe('FaixaContingencia', () => {
  it('mostra os dias restantes e o link para regularizar', () => {
    render(<FaixaContingencia diasRestantes={4} />);
    expect(screen.getByText(/Modo contingência · 4 dias para regularizar/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Regularizar' })).toHaveAttribute('href', '/dashboard/assinatura');
  });

  it('usa o singular com um dia', () => {
    render(<FaixaContingencia diasRestantes={1} />);
    expect(screen.getByText(/Modo contingência · 1 dia para regularizar/)).toBeInTheDocument();
  });
});
