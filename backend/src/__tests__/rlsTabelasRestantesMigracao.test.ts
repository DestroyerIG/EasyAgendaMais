import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const sql = readFileSync(
  resolve(process.cwd(), 'prisma/migrations/20261106120000_rls_tabelas_restantes/migration.sql'),
  'utf-8',
);

const TABELAS = [
  'repasses',
  'adiantamentos',
  'repasse_adiantamentos',
  'clube_ofertas',
  'clube_oferta_servicos',
  'clube_oferta_profissionais',
  'clube_contratos',
  'clube_cobrancas',
  'clube_usos',
  'profissional_convites',
  'push_inscricoes',
  'google_agenda_conexoes',
  'google_agenda_eventos',
  'google_agenda_ocupado',
];

describe('migração do RLS nas tabelas restantes', () => {
  it.each(TABELAS)('liga o RLS em %s', (tabela) => {
    expect(sql).toContain(`ALTER TABLE public.${tabela} ENABLE ROW LEVEL SECURITY;`);
  });

  it('não cria policy, para negar tudo aos papéis públicos', () => {
    expect(sql).not.toMatch(/CREATE POLICY/i);
  });
});
