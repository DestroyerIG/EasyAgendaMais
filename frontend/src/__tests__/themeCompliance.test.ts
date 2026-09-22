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

describe('conformidade com os tokens', () => {
  it('nenhum arquivo migrado usa cor fixa', () => {
    const report = THEMED_PATHS.flatMap(collectFiles).flatMap((file) =>
      findColorViolations(readFileSync(file, 'utf8')).map(
        (v) => `${path.relative(process.cwd(), file)}:${v.line} ${v.match}`,
      ),
    );
    expect(report).toEqual([]);
  });
});
