import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { RoiCalculator, calcularPerda } from '../RoiCalculator';

describe('calculadora de faltas', () => {
  it('calcula a perda e o valor recuperável', () => {
    expect(calcularPerda(3, 120)).toEqual({ prejuizoMensal: 1440, recuperado: 1296 });
  });

  it('mostra a conta e as premissas na tela', () => {
    render(<RoiCalculator />);
    expect(screen.getByText(/Como calculamos: faltas por semana × 4 semanas × ticket médio/)).toBeInTheDocument();
    expect(screen.getByText(/9 em cada 10 faltas/)).toBeInTheDocument();
    expect(screen.getByText(/É uma estimativa, não uma garantia/)).toBeInTheDocument();
    expect(screen.getByText(/Você pode recuperar até/)).toBeInTheDocument();
  });

  it('não tem controle que fica fora da conta', () => {
    render(<RoiCalculator />);
    expect(screen.queryByText('Atendimentos por dia')).toBeNull();
  });
});
