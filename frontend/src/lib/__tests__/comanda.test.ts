import { describe, it, expect } from 'vitest';
import { AxiosError, type AxiosResponse } from 'axios';
import { calcularComanda, ehCaixaFechado } from '@/lib/comanda';

const base = { depositAvailable: 0, discount: 0, tip: 0, serviceCommissionPct: 50, productCommissionPct: 20 };

describe('calcularComanda (espelho do backend)', () => {
  it('reproduz a comanda do Stitch', () => {
    const r = calcularComanda({
      ...base,
      items: [{ kind: 'servico', unitPrice: 110, quantity: 1 }, { kind: 'produto', unitPrice: 25, quantity: 1 }],
      depositAvailable: 30, tip: 10,
    });
    expect(r).toMatchObject({ subtotal: 135, totalCharged: 115, commissionTotal: 70, houseRetention: 75 });
  });
  it('sinal maior que o subtotal não deixa total negativo', () => {
    const r = calcularComanda({ ...base, items: [{ kind: 'servico', unitPrice: 20, quantity: 1 }], depositAvailable: 30 });
    expect(r.totalCharged).toBe(0);
  });
  it('desconto rateado antes da comissão', () => {
    const r = calcularComanda({ ...base, items: [{ kind: 'servico', unitPrice: 80, quantity: 1 }, { kind: 'produto', unitPrice: 20, quantity: 1 }], discount: 10 });
    expect([r.commissionService, r.commissionProduct]).toEqual([36, 3.6]);
  });
  it('arredonda half-up', () => {
    const r = calcularComanda({ ...base, serviceCommissionPct: 33.33, items: [{ kind: 'servico', unitPrice: 10.01, quantity: 1 }] });
    expect(r.commissionService).toBe(3.34);
  });
});

describe('ehCaixaFechado', () => {
  it('reconhece o 409 CASH_CLOSED do backend', () => {
    const erro = new AxiosError('x', '409', undefined, undefined, { status: 409, data: { errorCode: 'CASH_CLOSED' } } as AxiosResponse);
    expect(ehCaixaFechado(erro)).toBe(true);
  });
  it('outros erros não', () => {
    const erro = new AxiosError('x', '409', undefined, undefined, { status: 409, data: { errorCode: 'CONFLICT' } } as AxiosResponse);
    expect(ehCaixaFechado(erro)).toBe(false);
  });
});
