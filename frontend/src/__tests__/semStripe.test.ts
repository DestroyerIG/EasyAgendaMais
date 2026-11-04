import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

// A cobrança é só pelo Asaas. "stripe" em minúsculas aparece só como listra visual (StatusChip etc.).
const src = resolve(__dirname, '..');

function arquivos(pasta: string): string[] {
  return readdirSync(pasta).flatMap((nome) => {
    const caminho = join(pasta, nome);
    if (statSync(caminho).isDirectory()) return nome === '__tests__' ? [] : arquivos(caminho);
    return /\.tsx?$/.test(nome) ? [caminho] : [];
  });
}

describe('sem Stripe', () => {
  it('nenhuma tela ou chamada cita o Stripe', () => {
    const culpados = arquivos(src)
      .filter((f) => /\bStripe\b|'stripe'|\/stripe\b|subscriptions\/portal/.test(readFileSync(f, 'utf-8')))
      .map((f) => f.slice(src.length + 1));
    expect(culpados).toEqual([]);
  });
});
