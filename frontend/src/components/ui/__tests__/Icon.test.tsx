import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Icon } from '../Icon';

describe('Icon', () => {
  it('renderiza o nome do símbolo como conteúdo e esconde de leitores de tela', () => {
    render(<Icon name="today" />);
    const icon = screen.getByText('today');
    expect(icon).toHaveAttribute('aria-hidden', 'true');
    expect(icon).toHaveClass('material-symbols-outlined');
  });

  it('aplica tamanho e preenchimento', () => {
    render(<Icon name="loyalty" size={24} filled />);
    const icon = screen.getByText('loyalty');
    expect(icon).toHaveClass('fill');
    expect(icon).toHaveStyle({ fontSize: '24px' });
  });
});
