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

  it('um novo endereço volta a tentar a imagem', () => {
    const { rerender } = render(<Avatar name="Camila Rocha" src="https://cdn.exemplo/a.jpg" />);
    fireEvent.error(screen.getByRole('img', { name: 'Camila Rocha' }));
    rerender(<Avatar name="Camila Rocha" src="https://cdn.exemplo/b.jpg" />);
    expect(screen.getByRole('img', { name: 'Camila Rocha' })).toHaveAttribute('src', 'https://cdn.exemplo/b.jpg');
  });
});
