import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { TESTE_COM_CARTAO_DIAS, TESTE_SEM_CARTAO_DIAS } from '@/lib/constants';

describe('prazos do teste grátis', () => {
  it('batem com backend/src/config/trial.ts', () => {
    // Lido como texto: o build do frontend não tem a pasta backend instalada.
    const fonte = readFileSync(resolve(__dirname, '../../../../backend/src/config/trial.ts'), 'utf-8');
    expect(Number(/TESTE_SEM_CARTAO_DIAS = (\d+)/.exec(fonte)?.[1])).toBe(TESTE_SEM_CARTAO_DIAS);
    expect(Number(/TESTE_COM_CARTAO_DIAS = (\d+)/.exec(fonte)?.[1])).toBe(TESTE_COM_CARTAO_DIAS);
    expect(TESTE_SEM_CARTAO_DIAS).toBe(7);
    expect(TESTE_COM_CARTAO_DIAS).toBe(14);
  });
});
