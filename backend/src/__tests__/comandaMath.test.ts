import { describe, it, expect } from 'vitest';
import { calcularComanda } from '../modules/comandas/comandaMath.js';

const base = { depositAvailable: 0, discount: 0, tip: 0, serviceCommissionPct: 50, productCommissionPct: 20 };

describe('calcularComanda', () => {
  it('reproduz a comanda do Stitch (R$ 110 serviço, R$ 25 produto, sinal 30, gorjeta 10)', () => {
    const r = calcularComanda({
      ...base,
      items: [{ kind: 'servico', unitPrice: 110, quantity: 1 }, { kind: 'produto', unitPrice: 25, quantity: 1 }],
      depositAvailable: 30,
      tip: 10,
    });
    expect(r).toMatchObject({
      servicesTotal: 110, productsTotal: 25, subtotal: 135, depositApplied: 30,
      totalCharged: 115, revenue: 135,
      commissionService: 55, commissionProduct: 5, commissionTotal: 70, houseRetention: 75,
    });
  });

  it('quantidade multiplica o preço do produto', () => {
    const r = calcularComanda({ ...base, items: [{ kind: 'produto', unitPrice: 12.5, quantity: 3 }] });
    expect(r.productsTotal).toBe(37.5);
  });

  it('sinal maior que o subtotal não deixa total negativo', () => {
    const r = calcularComanda({ ...base, items: [{ kind: 'servico', unitPrice: 20, quantity: 1 }], depositAvailable: 30 });
    expect(r.depositApplied).toBe(20);
    expect(r.totalCharged).toBe(0);
  });

  it('desconto fica limitado ao que sobra depois do sinal', () => {
    const r = calcularComanda({ ...base, items: [{ kind: 'servico', unitPrice: 100, quantity: 1 }], depositAvailable: 30, discount: 90 });
    expect(r.discount).toBe(70);
    expect(r.totalCharged).toBe(0);
    expect(r.revenue).toBe(30);
  });

  it('desconto é rateado entre serviço e produto antes da comissão', () => {
    const r = calcularComanda({
      ...base,
      items: [{ kind: 'servico', unitPrice: 80, quantity: 1 }, { kind: 'produto', unitPrice: 20, quantity: 1 }],
      discount: 10,
    });
    expect(r.serviceBase).toBe(72);
    expect(r.productBase).toBe(18);
    expect(r.commissionService).toBe(36);
    expect(r.commissionProduct).toBe(3.6);
  });

  it('gorjeta vai inteira para a profissional e fica fora do faturamento', () => {
    const r = calcularComanda({ ...base, items: [{ kind: 'servico', unitPrice: 50, quantity: 1 }], tip: 15 });
    expect(r.revenue).toBe(50);
    expect(r.totalCharged).toBe(65);
    expect(r.commissionTotal).toBe(25 + 15);
    expect(r.houseRetention).toBe(25);
  });

  it('arredonda centavos half-up', () => {
    const r = calcularComanda({ ...base, serviceCommissionPct: 33.33, items: [{ kind: 'servico', unitPrice: 10.01, quantity: 1 }] });
    expect(r.commissionService).toBe(3.34);
  });

  it('comanda vazia dá tudo zero', () => {
    const r = calcularComanda({ ...base, items: [] });
    expect(r.totalCharged).toBe(0);
    expect(r.commissionTotal).toBe(0);
  });

  it('nunca aceita valores negativos de entrada', () => {
    const r = calcularComanda({ ...base, items: [{ kind: 'servico', unitPrice: 50, quantity: 1 }], discount: -10, tip: -5 });
    expect(r.discount).toBe(0);
    expect(r.tip).toBe(0);
  });
});
