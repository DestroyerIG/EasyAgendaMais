// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { findColorViolations } from '@/lib/colorRules';
import { THEMED_PATHS } from '@/lib/themedPaths';

const collectFiles = (target: string): string[] => {
  const absolute = path.resolve(process.cwd(), target);
  if (statSync(absolute).isFile()) return [absolute];
  return readdirSync(absolute).flatMap((entry) => {
    if (entry === '__tests__') return [];
    const child = path.join(absolute, entry);
    if (statSync(child).isDirectory()) return collectFiles(path.relative(process.cwd(), child));
    return /\.(ts|tsx)$/.test(entry) ? [child] : [];
  });
};

// Pastas varridas pela cobertura: tudo que compõe o painel migrado.
const COVERAGE_ROOTS: readonly string[] = ['src/app/dashboard', 'src/components'];

// Arquivos isentos da cobertura, com o motivo de cada um.
const COVERAGE_EXEMPT: readonly string[] = [
  // PricingPlansSection: os cards visíveis na landing usam os tokens do DESIGN.md,
  // mas os modais de Pix/cupom (fluxo autenticado em /dashboard/planos) ainda usam
  // as cores antigas — fora do escopo desta migração.
  'src/components/marketing/PricingPlansSection.tsx',
  'src/components/LoadingSkeleton.tsx', // esqueleto legado das telas fora do escopo
  'src/app/termos', // página institucional: fora do escopo
  'src/app/privacidade', // página institucional: fora do escopo
  'src/app/admin', // SuperAdmin: fora do escopo
  'src/components/dev', // vitrine interna dos componentes
  'src/components/theme/ForcedDark.tsx', // só alterna a classe de tema, não pinta nada
];

const toPosix = (file: string) => path.relative(process.cwd(), file).split(path.sep).join('/');

const isListed = (relative: string, list: readonly string[]) =>
  list.some((entry) => relative === entry || relative.startsWith(`${entry}/`));

describe('conformidade com os tokens', () => {
  it('nenhum arquivo migrado usa cor fixa', () => {
    const report = THEMED_PATHS.flatMap(collectFiles).flatMap((file) =>
      findColorViolations(readFileSync(file, 'utf8')).map(
        (v) => `${path.relative(process.cwd(), file)}:${v.line} ${v.match}`,
      ),
    );
    expect(report).toEqual([]);
  });

  // Sem esta checagem uma tela nova passa despercebida só por não estar em THEMED_PATHS.
  it('toda tela do painel está em THEMED_PATHS ou isenta', () => {
    const uncovered = COVERAGE_ROOTS.flatMap(collectFiles)
      .map(toPosix)
      .filter((relative) => relative.endsWith('.tsx'))
      .filter((relative) => !isListed(relative, THEMED_PATHS) && !isListed(relative, COVERAGE_EXEMPT));
    expect(uncovered).toEqual([]);
  });
});
