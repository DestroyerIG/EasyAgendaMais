import { describe, it, expect } from 'vitest';
import { caminhoSeguro } from '../proxy';

describe('caminhoSeguro (BFF)', () => {
  it('aceita caminhos normais com ids', () => {
    expect(caminhoSeguro('/clients/3f2a1b4c-0000-4000-8000-000000000000')).toBe(true);
    expect(caminhoSeguro('/public/meu-salao/appointments')).toBe(true);
  });

  it('recusa segmentos . e .. em qualquer forma', () => {
    expect(caminhoSeguro('/clients/../admin/tenants')).toBe(false);
    expect(caminhoSeguro('/clients/%2e%2e/admin')).toBe(false);
    expect(caminhoSeguro('/clients/%2E%2E%2Fadmin')).toBe(true); // "/" codificado não vira segmento, o fetch mantém %2F
    expect(caminhoSeguro('/clients/./x')).toBe(false);
  });

  it('recusa escape malformado, barra invertida e caminho sem barra inicial', () => {
    expect(caminhoSeguro('/clients/%E0%A4%A')).toBe(false);
    expect(caminhoSeguro('/clients/a%5Cb')).toBe(false);
    expect(caminhoSeguro('clients/x')).toBe(false);
  });
});
