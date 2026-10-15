import { describe, it, expect, vi, beforeEach } from 'vitest';

const repo = vi.hoisted(() => ({ clientes: vi.fn(), visitas: vi.fn(), profissionaisPorCliente: vi.fn() }));
vi.mock('../modules/crm/crm.repository.js', () => ({ crmRepository: repo }));
vi.mock('../services/scheduleSettingsService.js', () => ({ getBusinessScheduleSettings: vi.fn().mockResolvedValue({ timezone: 'America/Sao_Paulo' }) }));

const { crmService } = await import('../modules/crm/crm.service.js');

const cliente = (id: string, name: string, over: Record<string, unknown> = {}) => ({
  id, name, phone: '83999990000', email: null, birthDate: null, createdAt: '2026-01-01T00:00:00.000Z', active: true,
  tags: [], consentimento: 'nao_informado', ...over,
});
const vis = (date: string, receita = 100) => ({ date, receita, servico: 'Corte', profissional: 'Camila' });

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-14T12:00:00-03:00'));
  repo.clientes.mockResolvedValue([
    cliente('a', 'Ana', { tags: [{ id: 't1', name: 'VIP Cílios', color: 'brand' }] }),
    cliente('b', 'Bia'),
    cliente('c', 'Carla'),
  ]);
  repo.visitas.mockResolvedValue(new Map([
    ['a', [vis('2026-09-20', 150), vis('2026-10-10', 150)]],
    ['b', [vis('2026-05-01')]],
  ]));
  repo.profissionaisPorCliente.mockResolvedValue(new Map([['a', new Set(['p1'])], ['b', new Set(['p2'])]]));
});

describe('crmService.insights', () => {
  it('calcula fase, LTV e conta por fase', async () => {
    const r = await crmService.insights('b1', { page: 1, pageSize: 10, ordem: 'ultima_visita' } as never);
    expect(r.total).toBe(3);
    expect(r.contagemPorFase).toMatchObject({ todas: 3, recorrente: 1, perdido: 1, novo: 1 });
    expect(r.itens[0]).toMatchObject({ id: 'a', fase: 'recorrente', ltv: 300, atendimentos: 2 });
    expect(r.itens.at(-1)).toMatchObject({ id: 'c', fase: 'novo', ultimaVisita: null }); // sem visita vai para o fim
  });

  it('filtra por fase, etiqueta, profissional e busca (sem acento)', async () => {
    expect((await crmService.insights('b1', { page: 1, pageSize: 10, ordem: 'nome', fase: 'perdido' } as never)).itens.map((c) => c.id)).toEqual(['b']);
    expect((await crmService.insights('b1', { page: 1, pageSize: 10, ordem: 'nome', etiqueta: 't1' } as never)).itens.map((c) => c.id)).toEqual(['a']);
    expect((await crmService.insights('b1', { page: 1, pageSize: 10, ordem: 'nome', profissional: 'p2' } as never)).itens.map((c) => c.id)).toEqual(['b']);
    expect((await crmService.insights('b1', { page: 1, pageSize: 10, ordem: 'nome', busca: 'CARLA' } as never)).itens.map((c) => c.id)).toEqual(['c']);
  });

  it('pagina', async () => {
    const r = await crmService.insights('b1', { page: 2, pageSize: 2, ordem: 'nome' } as never);
    expect(r.itens.map((c) => c.id)).toEqual(['c']);
    expect(r.total).toBe(3);
  });
});

describe('crmService.fases', () => {
  it('monta as 5 colunas com contagem e LTV, e os KPIs', async () => {
    const r = await crmService.fases('b1');
    expect(r.colunas.map((c) => c.fase)).toEqual(['novo', 'recorrente', 'fiel', 'em_risco', 'perdido']);
    expect(r.colunas.find((c) => c.fase === 'recorrente')).toMatchObject({ contagem: 1, ltvTotal: 300 });
    expect(r.kpis).toMatchObject({ ativas: 1, ltvMedio: 200 }); // ativas = visita nos últimos 120 dias; LTV médio entre quem tem visita
  });
});

describe('crmService.exportCsv', () => {
  it('começa com BOM e cabeçalho', async () => {
    const csv = await crmService.exportCsv('b1');
    expect(csv.startsWith('﻿Nome;Telefone;E-mail;Aniversário;Fase;Última visita;Ciclo médio (dias);LTV;Atendimentos;Etiquetas;Consentimento WhatsApp\r\n')).toBe(true);
    expect(csv).toContain('Ana;83999990000;;;Recorrente;10/10/2026;20;300,00;2;VIP Cílios;Não informado');
  });
});
