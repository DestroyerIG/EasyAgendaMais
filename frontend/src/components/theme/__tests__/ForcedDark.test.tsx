import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ForcedDark, useForcedDarkClass } from '../ForcedDark';

function Probe() {
  return <span data-testid="probe">{useForcedDarkClass() || 'none'}</span>;
}

describe('ForcedDark', () => {
  it('aplica a classe dark e o fundo escuro ao contêiner', () => {
    const { container } = render(<ForcedDark className="min-h-screen">conteúdo</ForcedDark>);
    expect(container.firstElementChild).toHaveClass('dark', 'bg-black', 'text-white', 'min-h-screen');
  });

  it('informa aos filhos que a área é escura', () => {
    render(<ForcedDark><Probe /></ForcedDark>);
    expect(screen.getByTestId('probe')).toHaveTextContent('dark');
  });

  it('fora de uma área escura não força nada', () => {
    render(<Probe />);
    expect(screen.getByTestId('probe')).toHaveTextContent('none');
  });
});
