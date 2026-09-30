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
    // Critical regression test for TLV overflow bug
    // Pre-fix bug: CNPJ (14 digits) + 60-char description → merchantAccountInfo = 100 chars
    // This produced "26100" + 100 chars instead of "2663" + 63 chars (with description truncated)
    //
    // This test uses structural TLV verification: after extracting the 2-digit length,
    // the next field tag should appear at exactly (4 + length) bytes from "26".
    // If the bug existed (3-digit "100" prefix), the next tag would be in the middle
    // of content, not at a field boundary — test fails. ✓

    const payload = buildPixPayload({
      pixKey: '34.865.261/0001-63', // CNPJ
      pixKeyType: 'cnpj',
      merchantName: 'Studio Aurora',
      merchantCity: 'CAMPINA GRANDE',
      amount: 30,
      description: 'A'.repeat(60),
    });

    // Find field 26 and structurally verify the TLV
    const field26Index = payload.indexOf('26');
    expect(field26Index).toBeGreaterThanOrEqual(0);

    const lengthStr = payload.slice(field26Index + 2, field26Index + 4);
    expect(lengthStr).toMatch(/^\d{2}$/); // Length field must be exactly 2 digits

    const contentLength = parseInt(lengthStr, 10);
    expect(contentLength).toBeLessThanOrEqual(99); // EMV spec: length ≤ 99

    // Structural check: the next field should start exactly at (field26Index + 4 + contentLength)
    // The next field ID (like "52", "53", etc.) should be 2 digits
    const nextFieldIndex = field26Index + 4 + contentLength;
    const nextFieldTag = payload.slice(nextFieldIndex, nextFieldIndex + 2);

    // If the bug existed: lengthStr = "10" (first 2 of "100"), nextFieldTag would be
    // in the middle of the 100-char content, not a valid 2-digit field ID
    // With the fix: nextFieldTag is "52" or similar, a valid field boundary
    expect(nextFieldTag).toMatch(/^\d{2}$/);
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
    // Regression test: field 26 respects the 99-char EMV limit under stress conditions
    // This test verifies that description truncation respects the combined GUI + key + description budget
    //
    // Uses the same structural verification as the previous test:
    // if field 26 were oversized (100+ chars), the parsed length from the first 2 digits
    // would be too small, causing the next field boundary check to fail

    const payload = buildPixPayload({
      pixKey: '34.865.261/0001-63', // CNPJ
      pixKeyType: 'cnpj',
      merchantName: 'Studio Aurora Plus Nails Design',
      merchantCity: 'CAMPINA GRANDE',
      amount: 150.99,
      description: 'A'.repeat(60),
    });

    // Structural TLV verification: find field 26 and check next field is at correct boundary
    const field26Index = payload.indexOf('26');
    expect(field26Index).toBeGreaterThanOrEqual(0);

    const lengthStr = payload.slice(field26Index + 2, field26Index + 4);
    expect(lengthStr).toMatch(/^\d{2}$/);

    const contentLength = parseInt(lengthStr, 10);
    expect(contentLength).toBeLessThanOrEqual(99);

    // Verify the field boundary is correct: next 2 bytes should be a valid field tag
    const nextFieldIndex = field26Index + 4 + contentLength;
    const nextFieldTag = payload.slice(nextFieldIndex, nextFieldIndex + 2);
    expect(nextFieldTag).toMatch(/^\d{2}$/);
  });
});
