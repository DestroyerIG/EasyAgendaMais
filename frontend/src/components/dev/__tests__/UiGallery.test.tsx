import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ThemeProvider } from '@/components/theme/ThemeProvider';
import { UiGallery } from '../UiGallery';

describe('UiGallery', () => {
  it('mostra uma seção para cada grupo de componentes', () => {
    render(
      <ThemeProvider>
        <UiGallery />
      </ThemeProvider>,
    );
    for (const heading of ['Tema', 'Botões', 'Cartões e métricas', 'Status', 'Avatares', 'Avisos', 'Formulário', 'Tabela', 'Abas', 'Menu', 'Camadas', 'Estado vazio e carregamento']) {
      expect(screen.getByRole('heading', { level: 2, name: heading })).toBeInTheDocument();
    }
  });
});
