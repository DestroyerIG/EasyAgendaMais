import { describe, it, expect } from 'vitest';
import { formatDurationExtenso } from '../formatters';

describe('formatDurationExtenso', () => {
  it('menos de 1 hora fica só em minutos', () => {
    expect(formatDurationExtenso(30)).toBe('30 min');
    expect(formatDurationExtenso(45)).toBe('45 min');
  });

  it('hora cheia não mostra "e 0 min"', () => {
    expect(formatDurationExtenso(60)).toBe('1 hora');
    expect(formatDurationExtenso(120)).toBe('2 horas');
  });

  it('hora e minutos combina os dois, no plural certo', () => {
    expect(formatDurationExtenso(80)).toBe('1 hora e 20 min');
    expect(formatDurationExtenso(150)).toBe('2 horas e 30 min');
  });
});
