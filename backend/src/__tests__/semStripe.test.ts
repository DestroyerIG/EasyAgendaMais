import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

// A cobrança é só pelo Asaas: nenhum código, dependência ou modelo do Stripe volta ao backend.
const raiz = resolve(__dirname, '../..');

function arquivos(pasta: string): string[] {
  return readdirSync(pasta).flatMap((nome) => {
    const caminho = join(pasta, nome);
    if (statSync(caminho).isDirectory()) return nome === '__tests__' ? [] : arquivos(caminho);
    return /\.ts$/.test(nome) ? [caminho] : [];
  });
}

describe('sem Stripe', () => {
  it('nenhum arquivo do backend cita o Stripe', () => {
    const alvos = [...arquivos(join(raiz, 'src')), join(raiz, 'package.json'), join(raiz, 'prisma', 'schema.prisma')];
    const culpados = alvos.filter((f) => /stripe/i.test(readFileSync(f, 'utf-8'))).map((f) => f.slice(raiz.length + 1));
    expect(culpados).toEqual([]);
  });
});
