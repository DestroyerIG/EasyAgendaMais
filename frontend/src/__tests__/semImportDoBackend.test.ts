import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

// O build do frontend (CI e Vercel) não instala o backend: um import de código do backend,
// mesmo em teste, faz o type-check do next build seguir para lá e quebrar.
const src = resolve(__dirname, '..');

function arquivos(pasta: string): string[] {
  return readdirSync(pasta).flatMap((nome) => {
    const caminho = join(pasta, nome);
    if (statSync(caminho).isDirectory()) return arquivos(caminho);
    return /\.tsx?$/.test(nome) ? [caminho] : [];
  });
}

describe('fronteira com o backend', () => {
  it('nenhum arquivo do frontend importa código do backend', () => {
    const culpados = arquivos(src).filter((f) => /from ['"](\.\.\/)+backend\//.test(readFileSync(f, 'utf-8')));
    expect(culpados).toEqual([]);
  });
});
