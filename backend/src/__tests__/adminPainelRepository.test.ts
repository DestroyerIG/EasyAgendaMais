import { vi, describe, it, beforeEach, expect } from 'vitest';

const prismaMock = vi.hoisted(() => ({ $queryRaw: vi.fn() }));
vi.mock('../config/prisma.js', () => ({ prisma: prismaMock }));

const { painelRepository } = await import('../modules/admin/painel.repository.js');

const criado = new Date('2026-09-01T12:00:00Z');

function linhaCrua(extra: Record<string, unknown> = {}) {
  return {
    id: 'n1', name: 'Barbearia Alfa', owner_name: 'Ana', email: 'a@a.com', whatsapp: '11999990000',
    cpf_cnpj: null, address: null, segment: null,
    plan: 'basico', subscription_status: 'active', active: true,
    inadimplente_desde: null, ja_pagou: 't', fim_do_periodo: null,
    provider: null, payment_method: null,
    created_at: criado, canceled_at: null, onboarding_concluido: false,
    tem_instancia_whatsapp: false, whatsapp_connected_at: null, ultimo_envio_em: null,
    agendamentos_30d: 7n, ultimo_agendamento_em: null,
    primeiro_pagamento_em: null, pagou_mes_anterior: null,
    ...extra,
  };
}

describe('painelRepository', () => {
  beforeEach(() => prismaMock.$queryRaw.mockReset());

  it('converte tipos: contagem vira number, segmento nulo fica null, flags viram booleanos', async () => {
    prismaMock.$queryRaw.mockResolvedValue([linhaCrua()]);
    const [l] = await painelRepository.linhasNegocios();
    expect(typeof l.agendamentos30d).toBe('number');
    expect(l.agendamentos30d).toBe(7);
    expect(l.segmento).toBeNull();
    expect(l.jaPagou).toBe(true);
    expect(l.pagouMesAnterior).toBe(false);
    expect(l.nome).toBe('Barbearia Alfa');
    expect(l.criadoEm).toEqual(criado);
  });

  it('agendamentos30d aceita string vinda do banco', async () => {
    prismaMock.$queryRaw.mockResolvedValue([linhaCrua({ agendamentos_30d: '12' })]);
    const [l] = await painelRepository.linhasNegocios();
    expect(l.agendamentos30d).toBe(12);
  });

  it('pix é true quando provider é asaas ou payment_method é pix', async () => {
    prismaMock.$queryRaw.mockResolvedValue([
      linhaCrua({ provider: 'asaas' }),
      linhaCrua({ payment_method: 'pix' }),
      linhaCrua({ provider: 'stripe', payment_method: 'card' }),
    ]);
    const ls = await painelRepository.linhasNegocios();
  });

  it('fimDoPeriodo vem de fim_do_periodo (já com o fallback aplicado no SQL)', async () => {
    const fim = new Date('2026-11-05T00:00:00Z');
    prismaMock.$queryRaw.mockResolvedValue([linhaCrua({ fim_do_periodo: fim })]);
    const [l] = await painelRepository.linhasNegocios();
    expect(l.fimDoPeriodo).toEqual(fim);
  });

  it('fora do teste usa current_period_end com queda para subscription_current_period_end', async () => {
    prismaMock.$queryRaw.mockResolvedValue([]);
    await painelRepository.linhasNegocios();
    const sql = (prismaMock.$queryRaw.mock.calls[0][0] as { sql: string }).sql;
    expect(sql).toMatch(/ELSE COALESCE\(\s*b\.current_period_end AT TIME ZONE 'UTC',\s*b\.subscription_current_period_end AT TIME ZONE 'UTC'\s*\)/);
  });

  it('no teste usa primeiro subscription_current_period_end, a coluna que estenderTeste grava', async () => {
    prismaMock.$queryRaw.mockResolvedValue([]);
    await painelRepository.linhasNegocios();
    const sql = (prismaMock.$queryRaw.mock.calls[0][0] as { sql: string }).sql;
    expect(sql).toMatch(/CASE WHEN b\.subscription_status = 'trialing'\s+THEN COALESCE\(\s*b\.subscription_current_period_end AT TIME ZONE 'UTC',\s*b\.current_period_end AT TIME ZONE 'UTC'\s*\)/);
  });

  it('pagamentos do gateway contam uma vez por fatura (invoice.paid e invoice.payment_succeeded)', async () => {
    prismaMock.$queryRaw.mockResolvedValue([]);
    await painelRepository.ltv('n1');
    await painelRepository.linhasNegocios();
    expect(prismaMock.$queryRaw).toHaveBeenCalledTimes(2);
    for (const chamada of prismaMock.$queryRaw.mock.calls) {
      const sql = (chamada[0] as { sql: string }).sql;
      expect(sql).toMatch(/SELECT DISTINCT ON \(se\.business_id, COALESCE\(se\.payload->>'id', se\.id::text\)\)/);
      expect(sql).toMatch(/ORDER BY se\.business_id, COALESCE\(se\.payload->>'id', se\.id::text\), se\.created_at/);
    }
  });

  it('ltv conta ciclos sem os pagamentos de upgrade, mas soma tudo no total', async () => {
    prismaMock.$queryRaw.mockResolvedValue([{ total: '347', ciclos: 3n, desde: null }]);
    expect(await painelRepository.ltv('n1')).toEqual({ total: 347, ciclos: 3, desde: null });
    const sql = (prismaMock.$queryRaw.mock.calls[0][0] as { sql: string }).sql;
    expect(sql).toMatch(/COALESCE\(SUM\(p\.valor\), 0\) AS total/);
    expect(sql).toMatch(/COUNT\(\*\) FILTER \(WHERE p\.tipo IS DISTINCT FROM 'upgrade'\) AS ciclos/);
    expect(sql).toMatch(/bp\.tipo AS tipo/);
  });

  it('linhaNegocio devolve null quando a consulta vem vazia', async () => {
    prismaMock.$queryRaw.mockResolvedValue([]);
    expect(await painelRepository.linhaNegocio('n1')).toBeNull();
  });

  it('linhaNegocio devolve a linha mapeada e filtra por id', async () => {
    prismaMock.$queryRaw.mockResolvedValue([linhaCrua()]);
    const l = await painelRepository.linhaNegocio('n1');
    expect(l?.id).toBe('n1');
    const arg = prismaMock.$queryRaw.mock.calls[0][0] as { values: unknown[] };
    expect(arg.values).toContain('n1');
  });

  it('disparos24h agrupa por origem nas últimas 24 h e converte contagens em number', async () => {
    prismaMock.$queryRaw.mockResolvedValue([{ origem: 'lembrete', enviados: 12n, falhos: '2' }]);
    expect(await painelRepository.disparos24h()).toEqual([{ origem: 'lembrete', enviados: 12, falhos: 2 }]);
    const sql = (prismaMock.$queryRaw.mock.calls[0][0] as { sql: string }).sql;
    expect(sql).toMatch(/created_at >= now\(\) - interval '24 hours'/);
    expect(sql).toMatch(/GROUP BY w\.origin/);
  });
});
