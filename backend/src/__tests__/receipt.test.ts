import { describe, it, expect, vi } from 'vitest';
vi.mock('../services/whatsapp/index.js', () => ({ sendWhatsAppMessage: vi.fn() }));
const { montarComprovante } = await import('../modules/comandas/receipt.js');

describe('montarComprovante', () => {
  it('lista itens, sinal, desconto, gorjeta, total e forma de pagamento, sem falar em recibo fiscal', () => {
    const texto = montarComprovante({
      negocio: 'Studio Aurora', numero: 1042, cliente: 'Mariana Souza', profissional: 'Camila Rocha',
      itens: [{ name: 'Manutenção Fibra de Vidro', quantity: 1, unitPrice: 110 }, { name: 'Óleo Hidratante', quantity: 2, unitPrice: 25 }],
      calc: { depositApplied: 30, discount: 5, tip: 10, totalCharged: 135 },
      paymentMethod: 'pix',
    });
    expect(texto).toContain('Comanda #1042');
    expect(texto).toContain('Manutenção Fibra de Vidro');
    expect(texto).toContain('2x Óleo Hidratante');
    expect(texto).toContain('Sinal Pix: -R$ 30,00');
    expect(texto).toContain('Desconto: -R$ 5,00');
    expect(texto).toContain('Gorjeta para Camila: R$ 10,00');
    expect(texto).toContain('Total pago: R$ 135,00 (Pix)');
    expect(texto.toLowerCase()).not.toContain('fiscal');
  });

  it('formata milhar com ponto', () => {
    const texto = montarComprovante({
      negocio: 'X', numero: 1, cliente: 'Ana', profissional: 'Bia',
      itens: [{ name: 'Pacote', quantity: 1, unitPrice: 1250 }],
      calc: { depositApplied: 0, discount: 0, tip: 0, totalCharged: 1250 }, paymentMethod: 'credito',
    });
    expect(texto).toContain('Total pago: R$ 1.250,00 (Cartão de crédito)');
  });
});
