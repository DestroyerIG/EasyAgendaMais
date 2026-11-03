import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CATALOGO_PLANOS } from '@/lib/planCatalog';

// O recurso se chama "Hora de voltar" em todas as telas; "Radar de Retorno" era o nome do Stitch.
const src = resolve(__dirname, '..');

function arquivos(pasta: string): string[] {
  return readdirSync(pasta).flatMap((nome) => {
    const caminho = join(pasta, nome);
    if (statSync(caminho).isDirectory()) return nome === '__tests__' ? [] : arquivos(caminho);
    return /\.tsx?$/.test(nome) ? [caminho] : [];
  });
}

describe('nome do recurso de retorno', () => {
  it('nenhuma tela usa "Radar de Retorno"', () => {
    const culpados = arquivos(src).filter((f) => /radar de retorno/i.test(readFileSync(f, 'utf-8')));
    expect(culpados).toEqual([]);
  });

  it('a matriz de planos chama o recurso só de "Hora de voltar"', () => {
    expect(CATALOGO_PLANOS.matriz.find((r) => r.id === 'retorno')?.titulo).toBe('Hora de voltar');
  });
});
