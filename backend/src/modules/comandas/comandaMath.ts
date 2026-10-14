/**
 * Cálculo da comanda, em centavos inteiros. Função pura: o serviço de comandas a usa
 * para gravar e o frontend tem uma cópia (frontend/src/lib/comanda.ts) para a prévia.
 * Qualquer mudança aqui precisa ser repetida lá — os dois têm os mesmos testes.
 */
export interface ComandaItemInput { kind: 'servico' | 'produto'; unitPrice: number; quantity: number }
export interface ComandaCalcInput {
  items: ComandaItemInput[];
  depositAvailable: number;
  discount: number;
  tip: number;
  serviceCommissionPct: number;
  productCommissionPct: number;
}
export interface ComandaCalc {
  servicesTotal: number; productsTotal: number; subtotal: number;
  depositApplied: number; discount: number; tip: number; totalCharged: number;
  revenue: number;
  commissionService: number; commissionProduct: number; commissionTotal: number;
  houseRetention: number;
  serviceBase: number; productBase: number;
}

export const toCents = (v: number): number => Math.round((Number(v) || 0) * 100);
export const fromCents = (c: number): number => c / 100;
const pos = (c: number) => Math.max(0, c);
// half-up em centavos: percentuais podem ter 2 casas (ex.: 33,33%)
const pctOf = (cents: number, pct: number) => Math.floor((cents * Math.round(pct * 100)) / 10000 + 0.5);

export function calcularComanda(input: ComandaCalcInput): ComandaCalc {
  let services = 0;
  let products = 0;
  for (const item of input.items) {
    const linha = toCents(item.unitPrice) * Math.max(1, Math.floor(item.quantity));
    if (item.kind === 'servico') services += linha; else products += linha;
  }
  const subtotal = services + products;
  const depositApplied = Math.min(pos(toCents(input.depositAvailable)), subtotal);
  const discount = Math.min(pos(toCents(input.discount)), subtotal - depositApplied);
  const tip = pos(toCents(input.tip));
  const totalCharged = subtotal - depositApplied - discount + tip;
  const revenue = subtotal - discount;

  const descontoServico = subtotal > 0 ? Math.round((discount * services) / subtotal) : 0;
  const serviceBase = services - descontoServico;
  const productBase = products - (discount - descontoServico);

  const commissionService = pctOf(serviceBase, input.serviceCommissionPct);
  const commissionProduct = pctOf(productBase, input.productCommissionPct);
  const commissionTotal = commissionService + commissionProduct + tip;
  const houseRetention = revenue - commissionService - commissionProduct;

  return {
    servicesTotal: fromCents(services),
    productsTotal: fromCents(products),
    subtotal: fromCents(subtotal),
    depositApplied: fromCents(depositApplied),
    discount: fromCents(discount),
    tip: fromCents(tip),
    totalCharged: fromCents(totalCharged),
    revenue: fromCents(revenue),
    commissionService: fromCents(commissionService),
    commissionProduct: fromCents(commissionProduct),
    commissionTotal: fromCents(commissionTotal),
    houseRetention: fromCents(houseRetention),
    serviceBase: fromCents(serviceBase),
    productBase: fromCents(productBase),
  };
}
