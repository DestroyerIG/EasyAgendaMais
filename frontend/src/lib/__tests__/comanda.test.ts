import { describe, it, expect } from 'vitest';
import { AxiosError, type AxiosResponse } from 'axios';
import { calcularComanda, ehCaixaFechado, ehCaixaJaFechado } from '@/lib/comanda';

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

describe('ehCaixaJaFechado', () => {
  it('reconhece o 409 CASH_ALREADY_CLOSED e não confunde com CASH_CLOSED', () => {
    const jaFechado = new AxiosError('x', '409', undefined, undefined, { status: 409, data: { errorCode: 'CASH_ALREADY_CLOSED' } } as AxiosResponse);
    const naoAberto = new AxiosError('x', '409', undefined, undefined, { status: 409, data: { errorCode: 'CASH_CLOSED' } } as AxiosResponse);
    expect(ehCaixaJaFechado(jaFechado)).toBe(true);
    expect(ehCaixaFechado(jaFechado)).toBe(false);
    expect(ehCaixaJaFechado(naoAberto)).toBe(false);
  });
});

describe('calcularComanda com clube/pacote', () => {
  const coberto = { kind: 'servico' as const, unitPrice: 110, quantity: 1, coveredValue: 85 };

  it('sessão coberta sai a R$ 0, mas o valor por sessão entra na base da comissão', () => {
    const r = calcularComanda({ ...base, items: [coberto, { kind: 'produto', unitPrice: 25, quantity: 1 }] });
    expect(r).toMatchObject({
      servicesTotal: 0, productsTotal: 25, subtotal: 25, totalCharged: 25, revenue: 25,
      serviceBase: 85, commissionService: 42.5, commissionProduct: 5, coveredTotal: 85, memberDiscount: 0,
    });
  });

  it('só a sessão coberta: nada a cobrar e o sinal não é consumido', () => {
    const r = calcularComanda({ ...base, items: [coberto], depositAvailable: 30 });
    expect(r).toMatchObject({ subtotal: 0, depositApplied: 0, totalCharged: 0, revenue: 0, commissionService: 42.5 });
  });

  it('desconto da sócia vale só sobre os itens não cobertos', () => {
    const r = calcularComanda({
      ...base, memberDiscountPct: 10,
      items: [coberto, { kind: 'servico', unitPrice: 50, quantity: 1 }, { kind: 'produto', unitPrice: 25, quantity: 1 }],
    });
    expect(r).toMatchObject({ subtotal: 75, memberDiscount: 7.5, discount: 7.5, totalCharged: 67.5, revenue: 67.5 });
  });

  it('desconto manual + sócia não passa do subtotal', () => {
    const r = calcularComanda({ ...base, memberDiscountPct: 10, discount: 19, items: [{ kind: 'produto', unitPrice: 20, quantity: 1 }] });
    expect(r).toMatchObject({ discount: 20, memberDiscount: 2, totalCharged: 0 });
  });

  it('sem cobertura nem sócia, os campos novos ficam zerados', () => {
    const r = calcularComanda({ ...base, items: [{ kind: 'servico', unitPrice: 110, quantity: 1 }] });
    expect(r).toMatchObject({ coveredTotal: 0, memberDiscount: 0, serviceBase: 110, commissionService: 55 });
  });
});
