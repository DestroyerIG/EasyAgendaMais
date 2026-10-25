// @ts-ignore — serviço JS legado ainda não tipado
import { sendWhatsAppMessage } from '../../services/whatsapp/index.js';
import type { PaymentMethod } from './comandas.types.js';

const ROTULO_PAGAMENTO: Record<PaymentMethod, string> = {
  pix: 'Pix', debito: 'Cartão de débito', credito: 'Cartão de crédito', dinheiro: 'Dinheiro',
};
const brl = (v: number) => `R$ ${v.toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, '.')}`;

export interface DadosComprovante {
  negocio: string; numero: number; cliente: string; profissional: string;
  itens: Array<{ name: string; quantity: number; unitPrice: number; coveredValue?: number | null }>;
  calc: { depositApplied: number; discount: number; tip: number; totalCharged: number };
  paymentMethod: PaymentMethod | null;
}

export function montarComprovante(d: DadosComprovante): string {
  const primeiroNome = d.profissional.split(' ')[0];
  const linhas = [
    `*${d.negocio}* — Comanda #${d.numero}`,
    `Olá, ${d.cliente.split(' ')[0]}! Obrigado pela visita. Segue o comprovante do seu atendimento:`,
    '',
    ...d.itens.map((i) => `• ${i.quantity > 1 ? `${i.quantity}x ` : ''}${i.name} — ${i.coveredValue != null ? 'coberto pelo clube/pacote' : brl(i.unitPrice * i.quantity)}`),
    '',
  ];
  if (d.calc.depositApplied > 0) linhas.push(`Sinal Pix: -${brl(d.calc.depositApplied)}`);
  if (d.calc.discount > 0) linhas.push(`Desconto: -${brl(d.calc.discount)}`);
  if (d.calc.tip > 0) linhas.push(`Gorjeta para ${primeiroNome}: ${brl(d.calc.tip)}`);
  const forma = d.paymentMethod ? ` (${ROTULO_PAGAMENTO[d.paymentMethod]})` : '';
  linhas.push(`*Total pago: ${brl(d.calc.totalCharged)}${forma}*`);
  return linhas.join('\n');
}

export async function sendComandaReceipt(businessId: string, phone: string, dados: DadosComprovante): Promise<boolean> {
  return Boolean(await sendWhatsAppMessage(phone, montarComprovante(dados), { businessId, origin: 'pix_recibo' }));
}
