import { describe, it, expect } from 'vitest';
import { formatDataPura, formatDurationExtenso, parseValorBR } from '../formatters';

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

describe('parseValorBR', () => {
  it('lê inteiros, milhar com ponto e decimal com vírgula', () => {
    expect(parseValorBR('1250')).toBe(1250);
    expect(parseValorBR('1.250')).toBe(1250);
    expect(parseValorBR('1.250,50')).toBe(1250.5);
    expect(parseValorBR('1250,5')).toBe(1250.5);
    expect(parseValorBR('12.345.678,90')).toBe(12345678.9);
    expect(parseValorBR('0,00')).toBe(0);
  });

  it('ponto único seguido de 1 ou 2 dígitos é decimal', () => {
    expect(parseValorBR('12.5')).toBe(12.5);
    expect(parseValorBR('12.50')).toBe(12.5);
  });

  it('ignora espaços e "R$"', () => {
    expect(parseValorBR(' R$ 1.250,00 ')).toBe(1250);
    expect(parseValorBR('r$80')).toBe(80);
  });

  it('texto inválido, vazio ou negativo devolve null', () => {
    expect(parseValorBR('')).toBeNull();
    expect(parseValorBR('   ')).toBeNull();
    expect(parseValorBR('abc')).toBeNull();
    expect(parseValorBR('1,2,3')).toBeNull();
    expect(parseValorBR('12,345')).toBeNull();
    expect(parseValorBR('1.25.0')).toBeNull();
    expect(parseValorBR('12.3456')).toBeNull();
    expect(parseValorBR('-10')).toBeNull();
    expect(parseValorBR(',50')).toBeNull();
  });
});

describe('formatDataPura', () => {
  it('formata YYYY-MM-DD sem voltar um dia por causa do fuso', () => {
    expect(formatDataPura('2026-10-14')).toBe('14/10/2026');
    expect(formatDataPura('2026-01-01')).toBe('01/01/2026');
  });
  it('devolve o texto original quando não é data pura', () => {
    expect(formatDataPura('texto')).toBe('texto');
  });
});
