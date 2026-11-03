import { describe, it, expect, vi, beforeEach } from 'vitest';

const queryRaw = vi.hoisted(() => vi.fn());
vi.mock('../config/prisma.js', () => ({ prisma: { $queryRaw: queryRaw } }));

const { TESTE_SEM_CARTAO_DIAS, TESTE_COM_CARTAO_DIAS, fimDoTesteComCartao } = await import('../config/trial.js');
const { authRepository } = await import('../repositories/authRepository.js');

beforeEach(() => {
  queryRaw.mockReset();
});

describe('prazo do teste grátis', () => {
  it('7 dias sem cartão e 14 com cartão', () => {
    expect(TESTE_SEM_CARTAO_DIAS).toBe(7);
    expect(TESTE_COM_CARTAO_DIAS).toBe(14);
  });

  it('o cadastro abre o teste de 7 dias', async () => {
    queryRaw.mockResolvedValueOnce([{ id: 'b1' }]);
    await authRepository.createBusiness(null, {
      name: 'Studio', ownerName: 'Ana', email: 'a@b.c', whatsapp: '83999999999', plan: 'profissional', desiredPlan: 'basico',
    });
    const sql = queryRaw.mock.calls[0][0] as { values: unknown[] };
    expect(sql.values).toContain(TESTE_SEM_CARTAO_DIAS);
    expect(sql.values).not.toContain(14);
  });
});

describe('fimDoTesteComCartao', () => {
  const criadoEm = new Date('2026-11-01T12:00:00Z');

  it('chega a 14 dias do cadastro', () => {
    expect(fimDoTesteComCartao(criadoEm, new Date('2026-11-08T12:00:00Z'))).toEqual(new Date('2026-11-15T12:00:00Z'));
  });

  it('não encurta um teste estendido', () => {
    expect(fimDoTesteComCartao(criadoEm, new Date('2026-11-20T12:00:00Z'))).toEqual(new Date('2026-11-20T12:00:00Z'));
  });

  it('sem fim atual, conta 14 dias do cadastro', () => {
    expect(fimDoTesteComCartao(criadoEm, null)).toEqual(new Date('2026-11-15T12:00:00Z'));
  });
});
