import { describe, it, expect } from 'vitest';
import { splitCommission } from '../modules/comandas/commissionSplit.js';

describe('splitCommission', () => {
  it('3 linhas iguais sobre R$ 10,00 somam exatamente 10,00', () => {
    const partes = splitCommission([10000, 10000, 10000], 10);
    expect(partes).toEqual([3.33, 3.33, 3.34]);
    expect(Math.round(partes.reduce((a, b) => a + b, 0) * 100)).toBe(1000);
  });
  it('proporcional ao valor da linha, resto na última', () => {
    const partes = splitCommission([3333, 6667, 1], 5.55);
    expect(Math.round(partes.reduce((a, b) => a + b, 0) * 100)).toBe(555);
  });
  it('sem linhas ou total zero não quebra', () => {
    expect(splitCommission([], 5)).toEqual([]);
    expect(splitCommission([0, 0], 5)).toEqual([0, 0]);
  });
});
