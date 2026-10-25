import { describe, it, expect } from 'vitest';
import {
  bloqueioDowngrade,
  calcularProporcional,
  direcaoTroca,
  ehReferenciaUpgrade,
  limiteProfissionaisEfetivo,
  referenciaUpgrade,
} from '../modules/billing/planChange.rules.js';
import { FEATURE_MATRIX, PLAN_CATALOG, PLAN_PRICES, getPlanCatalog, professionalLimit } from '../config/planCatalog.js';
import { asaasService } from '../integrations/asaas/service.js';

const dia = (n: number) => new Date(Date.UTC(2026, 9, n, 12));

describe('catálogo de planos', () => {
  it('é a fonte única do preço cobrado no Pix', () => {
    expect(PLAN_PRICES).toEqual({ basico: 49.9, profissional: 99.9, premium: 199.9 });
    expect(asaasService.resolvePlanValue('premium')).toBe(199.9);
  });

  it('limites de profissionais: 1, 5 e sem limite', () => {
    expect(professionalLimit('basico')).toBe(1);
    expect(professionalLimit('profissional')).toBe(5);
    expect(professionalLimit('premium')).toBe(Number.POSITIVE_INFINITY);
  });

  it('expõe os três planos em ordem e a matriz completa', () => {
    const { planos, matriz } = getPlanCatalog();
    expect(planos.map((p) => p.nome)).toEqual(['Solo', 'Equipe', 'Salão']);
    expect(planos[2]!.emBreve).toContain('Várias unidades');
    expect(planos[2]!.emBreve).not.toContain('Clube e pacotes');
    expect(matriz).toBe(FEATURE_MATRIX);
    expect(PLAN_CATALOG.premium.limiteProfissionais).toBeNull();
  });
});

describe('direcaoTroca', () => {
  it('compara pelo nível do plano', () => {
    expect(direcaoTroca('profissional', 'premium')).toBe('upgrade');
    expect(direcaoTroca('premium', 'basico')).toBe('downgrade');
    expect(direcaoTroca('basico', 'basico')).toBe('igual');
  });
});

describe('calcularProporcional', () => {
  it('cobra a diferença pelos dias restantes do ciclo, arredondando para baixo', () => {
    // Equipe → Salão: diferença 100,00; 15 de 30 dias → 50,00
    const r = calcularProporcional({ atual: 'profissional', novo: 'premium', inicio: dia(1), fim: dia(31), agora: dia(16) });
    expect(r).toEqual({ valor: 50, dias: 15, diasCiclo: 30 });
  });

  it('arredonda para baixo em centavos', () => {
    // Solo → Equipe: 50,00 × 7/30 = 11,666… → 11,66
    const r = calcularProporcional({ atual: 'basico', novo: 'profissional', inicio: dia(1), fim: dia(31), agora: dia(24) });
    expect(r.valor).toBe(11.66);
  });

  it('abaixo de R$ 5 não cobra', () => {
    const r = calcularProporcional({ atual: 'basico', novo: 'profissional', inicio: dia(1), fim: dia(31), agora: dia(29) });
    expect(r.dias).toBe(2);
    expect(r.valor).toBe(0);
  });

  it('sem início usa ciclo de 30 dias e nunca passa do ciclo', () => {
    const r = calcularProporcional({ atual: 'profissional', novo: 'premium', inicio: null, fim: dia(31), agora: dia(1) });
    expect(r.diasCiclo).toBe(30);
    expect(r.dias).toBe(30);
    expect(r.valor).toBe(100);
  });

  it('período já vencido ou sem fim não cobra', () => {
    expect(calcularProporcional({ atual: 'basico', novo: 'premium', inicio: dia(1), fim: dia(10), agora: dia(20) }).valor).toBe(0);
    expect(calcularProporcional({ atual: 'basico', novo: 'premium', inicio: null, fim: null, agora: dia(20) }).valor).toBe(0);
  });
});

describe('bloqueioDowngrade', () => {
  it('recusa com mais profissionais do que o plano novo permite', () => {
    expect(bloqueioDowngrade('basico', 3)).toBe('O plano Solo permite 1 profissional. Desative 2 profissionais antes de mudar.');
    expect(bloqueioDowngrade('profissional', 6)).toBe('O plano Equipe permite 5 profissionais. Desative 1 profissional antes de mudar.');
  });

  it('libera dentro do limite', () => {
    expect(bloqueioDowngrade('basico', 1)).toBeNull();
    expect(bloqueioDowngrade('profissional', 5)).toBeNull();
  });
});

describe('limiteProfissionaisEfetivo', () => {
  it('com downgrade agendado vale o menor limite', () => {
    expect(limiteProfissionaisEfetivo('premium', 'profissional')).toBe(5);
    expect(limiteProfissionaisEfetivo('profissional', null)).toBe(5);
  });
});

describe('referência do upgrade', () => {
  it('marca a cobrança da diferença com o plano novo', () => {
    const ref = referenciaUpgrade('b1', 'premium');
    expect(ref).toBe('business:b1:plan:premium:upgrade');
    expect(ehReferenciaUpgrade(ref)).toBe(true);
    expect(ehReferenciaUpgrade('business:b1:plan:premium')).toBe(false);
    expect(ehReferenciaUpgrade(null)).toBe(false);
  });
});
