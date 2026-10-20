import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Avatar } from '../Avatar';

describe('Avatar', () => {
  it('sem src mostra as iniciais', () => {
    render(<Avatar name="Camila Rocha" />);
    expect(screen.getByRole('img', { name: 'Camila Rocha' })).toHaveTextContent('CR');
  });

  it('com src mostra a imagem sem enviar o referenciador', () => {
    render(<Avatar name="Camila Rocha" src="https://cdn.exemplo/foto.jpg" size={48} />);
    const img = screen.getByRole('img', { name: 'Camila Rocha' });
    expect(img.tagName).toBe('IMG');
    expect(img).toHaveAttribute('src', 'https://cdn.exemplo/foto.jpg');
    expect(img).toHaveAttribute('referrerpolicy', 'no-referrer');
  });

  it('imagem que falha ao carregar cai para as iniciais', () => {
    render(<Avatar name="Camila Rocha" src="https://cdn.exemplo/expirada.jpg" />);
    fireEvent.error(screen.getByRole('img', { name: 'Camila Rocha' }));
    const depois = screen.getByRole('img', { name: 'Camila Rocha' });
    expect(depois.tagName).not.toBe('IMG');
    expect(depois).toHaveTextContent('CR');
  });

  it('com fallback, mostra-o no lugar das iniciais quando a imagem falha', () => {
    render(<Avatar name="83999990000" src="https://cdn.exemplo/x.jpg" fallback={<i data-testid="pessoa" />} />);
    fireEvent.error(screen.getByRole('img', { name: '83999990000' }));
    expect(screen.getByTestId('pessoa')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: '83999990000' })).not.toHaveTextContent('83');
  });

  it('um novo endereço volta a tentar a imagem', () => {
    const { rerender } = render(<Avatar name="Camila Rocha" src="https://cdn.exemplo/a.jpg" />);
    fireEvent.error(screen.getByRole('img', { name: 'Camila Rocha' }));
    rerender(<Avatar name="Camila Rocha" src="https://cdn.exemplo/b.jpg" />);
    expect(screen.getByRole('img', { name: 'Camila Rocha' })).toHaveAttribute('src', 'https://cdn.exemplo/b.jpg');
  });
});
