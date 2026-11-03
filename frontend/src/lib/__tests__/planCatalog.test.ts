import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import { CATALOGO_PLANOS, planoDoCatalogo, rotuloEquipe } from '@/lib/planCatalog';

// O catálogo do backend é lido como texto e transpilado aqui: um import direto faria o type-check do
// next build seguir para o backend, que não tem node_modules no build do frontend (CI e Vercel).
function catalogoDoBackend(): unknown {
  const fonte = readFileSync(resolve(__dirname, '../../../../backend/src/config/planCatalog.ts'), 'utf-8');
  const { outputText } = ts.transpileModule(fonte, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } });
  const modulo = { exports: {} as { getPlanCatalog?: () => unknown } };
  new Function('module', 'exports', 'require', outputText)(modulo, modulo.exports, () => ({}));
  return modulo.exports.getPlanCatalog!();
}

describe('catálogo de planos do frontend', () => {
  it('a cópia do frontend é igual ao catálogo do backend', () => {
    expect(CATALOGO_PLANOS).toEqual(catalogoDoBackend());
  });

  it('rotuloEquipe', () => {
    expect(rotuloEquipe(null)).toBe('Profissionais ilimitadas');
    expect(rotuloEquipe(1)).toBe('1 profissional');
    expect(rotuloEquipe(5)).toBe('Até 5 profissionais');
  });

  it('nenhum plano promete suporte prioritário', () => {
    const textos = [
      ...CATALOGO_PLANOS.planos.flatMap((p) => [...p.destaques, ...p.emBreve]),
      ...CATALOGO_PLANOS.matriz.map((r) => r.titulo),
    ];
    expect(textos.some((t) => /Suporte prioritário/.test(t))).toBe(false);
  });

  it('lista de espera e campanhas aparecem no Solo', () => {
    expect(planoDoCatalogo('basico').destaques).toEqual(expect.arrayContaining(['Lista de espera', 'Campanhas']));
  });
});
