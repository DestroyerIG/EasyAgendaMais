import { describe, it, expect } from 'vitest';
import { saudacaoPorHora, formatarDataPorExtenso } from '../SaudacaoDia';

describe('saudacaoPorHora', () => {
  it('madrugada e manhã (0h a 11h59) dizem Bom dia', () => {
    expect(saudacaoPorHora(0)).toBe('Bom dia');
    expect(saudacaoPorHora(5)).toBe('Bom dia');
    expect(saudacaoPorHora(11)).toBe('Bom dia');
  });

  it('tarde (12h a 17h59) diz Boa tarde', () => {
    expect(saudacaoPorHora(12)).toBe('Boa tarde');
    expect(saudacaoPorHora(17)).toBe('Boa tarde');
  });

  it('noite (18h em diante) diz Boa noite', () => {
    expect(saudacaoPorHora(18)).toBe('Boa noite');
    expect(saudacaoPorHora(23)).toBe('Boa noite');
  });
});

describe('formatarDataPorExtenso', () => {
  it('escreve no formato "dia da semana, dia de mês de ano", sem sufixo -feira', () => {
    // 17 de setembro de 2026 é uma quinta-feira.
    const data = new Date(2026, 8, 17);
    expect(formatarDataPorExtenso(data)).toBe('quinta, 17 de setembro de 2026');
  });

  it('não usa zero à esquerda no dia', () => {
    const data = new Date(2026, 8, 3);
    expect(formatarDataPorExtenso(data)).toBe('quinta, 3 de setembro de 2026');
  });
});
