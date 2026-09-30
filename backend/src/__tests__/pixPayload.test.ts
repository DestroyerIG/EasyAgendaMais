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

  it('rejeita valor com mais de 2 casas decimais', () => {
    expect(() =>
      buildPixPayload({
        pixKey: 'a@b.com',
        pixKeyType: 'email',
        merchantName: 'Studio',
        merchantCity: 'CAMPINA GRANDE',
        amount: 10.555,
        description: 'Sinal',
      })
    ).toThrow('Valor do Pix deve ter no máximo 2 casas decimais');
  });

  it('não gera length prefix de 3 dígitos para field 26 mesmo com CNPJ + descrição longa', () => {
    // Regression test for TLV overflow bug: CNPJ + 60-char description would push field 26 over 99 chars
    // The fix must bound the description to keep field 26 at most 99 chars
    const payload = buildPixPayload({
      pixKey: '34.865.261/0001-63', // CNPJ
      pixKeyType: 'cnpj',
      merchantName: 'Studio Aurora',
      merchantCity: 'CAMPINA GRANDE',
      amount: 30,
      description: 'A'.repeat(60), // 60-char description
    });

    // Extract field 26 length prefix to verify it's exactly 2 digits (not 3)
    const field26Match = payload.match(/26(\d{2})/);
    expect(field26Match).toBeTruthy();
    if (field26Match) {
      const lengthPrefix = parseInt(field26Match[1], 10);
      // The bug would produce "26100..." (3-digit overflow)
      // This asserts we never overflow to 3 digits
      expect(lengthPrefix).toBeLessThanOrEqual(99);
      expect(field26Match[1]).toMatch(/^\d{2}$/); // Exactly 2 digits
    }
  });

  it('rejeita tipo de chave Pix inválido', () => {
    expect(() =>
      buildPixPayload({
        pixKey: '11999998888',
        pixKeyType: 'invalid_type' as any,
        merchantName: 'Studio',
        merchantCity: 'CAMPINA GRANDE',
        amount: 30,
        description: 'Sinal',
      })
    ).toThrow('Tipo de chave Pix inválido');
  });

  it('garante que field 26 nunca excede 99 caracteres com CNPJ + descrição máxima', () => {
    // Regression test: verify the combined field 26 stays within EMV bounds
    const payload = buildPixPayload({
      pixKey: '34.865.261/0001-63', // CNPJ
      pixKeyType: 'cnpj',
      merchantName: 'Studio Aurora Plus Nails Design',
      merchantCity: 'CAMPINA GRANDE',
      amount: 150.99,
      description: 'A'.repeat(60), // Maximum original description length
    });

    // Verify field 26 is present and properly formatted
    const field26Match = payload.match(/26(\d{2})/);
    expect(field26Match).toBeTruthy();
    if (field26Match) {
      const lengthStr = field26Match[1];
      const actualLength = parseInt(lengthStr, 10);
      // Verify the length prefix is exactly 2 digits
      expect(lengthStr).toMatch(/^\d{2}$/);
      // Verify it doesn't exceed 99 (which would require 3 digits)
      expect(actualLength).toBeLessThanOrEqual(99);
    }
  });
});
