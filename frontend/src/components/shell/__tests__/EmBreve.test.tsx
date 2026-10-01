import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import ClubePage from '@/app/dashboard/clube/page';
import RelatoriosPage from '@/app/dashboard/relatorios/page';

describe('telas "em breve"', () => {
  it('Clube e pacotes mostra o título e a frase', () => {
    render(<ClubePage />);
    expect(screen.getByRole('heading', { name: 'Clube e pacotes' })).toBeInTheDocument();
    expect(
      screen.getByText('Assinaturas, pacotes de sessões e benefícios para clientes fiéis chegam em breve.'),
    ).toBeInTheDocument();
  });

  it('Relatórios mostra o título e a frase', () => {
    render(<RelatoriosPage />);
    expect(screen.getByRole('heading', { name: 'Relatórios' })).toBeInTheDocument();
    expect(
      screen.getByText('Relatórios de faturamento, ocupação e desempenho da equipe chegam em breve.'),
    ).toBeInTheDocument();
  });
});
