import { describe, it, expect } from 'vitest';
import { buildPixPayload } from '../utils/pixPayload.js';

describe('buildPixPayload', () => {
  it('gera um payload terminado em CRC16 de 4 dígitos hexadecimais maiúsculos', () => {
    const payload = buildPixPayload({
      pixKey: '11999998888',
      pixKeyType: 'telefone',
      merchantName: 'Studio Aurora',
      merchantCity: 'CAMPINA GRANDE',
      amount: 30,
      description: 'Sinal - Manutencao',
    });

    expect(payload).toMatch(/^000201/); // Payload Format Indicator obrigatório
    expect(payload.slice(-4)).toMatch(/^[0-9A-F]{4}$/);
  });

  it('formata telefone com +55 no campo da chave Pix', () => {
    const payload = buildPixPayload({
      pixKey: '11999998888',
      pixKeyType: 'telefone',
      merchantName: 'Studio Aurora',
      merchantCity: 'CAMPINA GRANDE',
      amount: 30,
      description: 'Sinal',
    });

    expect(payload).toContain('+5511999998888');
  });

  it('rejeita valor menor ou igual a zero', () => {
    expect(() =>
      buildPixPayload({
        pixKey: 'a@b.com',
        pixKeyType: 'email',
        merchantName: 'Studio',
        merchantCity: 'CAMPINA GRANDE',
        amount: 0,
        description: 'Sinal',
      })
    ).toThrow('Valor do Pix deve ser maior que zero');
  });
});
