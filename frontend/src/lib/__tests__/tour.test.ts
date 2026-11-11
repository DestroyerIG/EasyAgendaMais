import { describe, it, expect } from 'vitest';
import { NAV_ITEMS } from '@/lib/navigation';
import { PASSOS_TOUR, TOTAL_PASSOS_TOUR, deveAbrirTour, passoAnterior, proximoPasso } from '../tour';

describe('passos do tour', () => {
  it('abre com boas-vindas, fecha com encerramento e passa por todos os itens do menu, na ordem', () => {
    expect(PASSOS_TOUR[0]!.nav).toBeUndefined();
    expect(PASSOS_TOUR[TOTAL_PASSOS_TOUR - 1]!.nav).toBeUndefined();
    expect(PASSOS_TOUR.filter((p) => p.nav).map((p) => p.nav)).toEqual(NAV_ITEMS.map((i) => i.id));
  });

  it('ids únicos e todos com título e texto', () => {
    expect(new Set(PASSOS_TOUR.map((p) => p.id)).size).toBe(TOTAL_PASSOS_TOUR);
    for (const p of PASSOS_TOUR) {
      expect(p.titulo.length).toBeGreaterThan(0);
      expect(p.texto.length).toBeGreaterThan(0);
    }
  });

  it('avança e volta sem sair dos limites', () => {
    expect(proximoPasso(0)).toBe(1);
    expect(proximoPasso(TOTAL_PASSOS_TOUR - 1)).toBeNull();
    expect(passoAnterior(3)).toBe(2);
    expect(passoAnterior(0)).toBe(0);
  });
});

describe('quando o tour abre sozinho', () => {
  const base = { role: 'tenant_admin', onboarding: { bloqueante: false, tourPendente: true } };
  it('só para a dona que terminou o onboarding e ainda não viu o tour', () => {
    expect(deveAbrirTour(base)).toBe(true);
    expect(deveAbrirTour({ ...base, onboarding: { bloqueante: false, tourPendente: false } })).toBe(false);
    expect(deveAbrirTour({ ...base, onboarding: { bloqueante: true, tourPendente: true } })).toBe(false);
    expect(deveAbrirTour({ ...base, onboarding: null })).toBe(false);
    expect(deveAbrirTour({ ...base, role: 'employee' })).toBe(false);
    expect(deveAbrirTour(null)).toBe(false);
  });
});
