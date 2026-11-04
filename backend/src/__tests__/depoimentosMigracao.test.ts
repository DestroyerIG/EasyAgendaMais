import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const sql = readFileSync(
  resolve(process.cwd(), 'prisma/migrations/20261105120000_depoimentos/migration.sql'),
  'utf-8',
);

describe('migração de depoimentos', () => {
  it('liga RLS nas duas tabelas', () => {
    expect(sql).toContain('ALTER TABLE public.depoimentos ENABLE ROW LEVEL SECURITY;');
    expect(sql).toContain('ALTER TABLE public.depoimento_pedidos ENABLE ROW LEVEL SECURITY;');
  });
});
