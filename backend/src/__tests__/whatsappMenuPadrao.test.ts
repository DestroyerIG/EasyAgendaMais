import { vi, describe, it, expect, beforeEach } from 'vitest';
import type { Segmento } from '../modules/crm/technicalSheetTemplates.js';

const mockQueryRaw = vi.hoisted(() => vi.fn());
const mockTransaction = vi.hoisted(() => vi.fn());
vi.mock('../config/prisma.js', () => ({
  prisma: { $queryRaw: mockQueryRaw, $transaction: mockTransaction, businessSettings: { findUnique: vi.fn().mockResolvedValue({ segment: 'barbearia' }) } },
}));
vi.mock('../utils/logger.js', () => ({ default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }));

const { menuPadrao, menuNaoPersonalizado } = await import('../services/whatsapp/whatsappMenuPadrao.js');
const { garantirMenuAtual, getMenuOptions } = await import('../services/whatsapp/whatsappConfigService.js');

describe('menuPadrao', () => {
  it.each([
    ['barbearia', '📅 Agendar horário', '✂️ Serviços e preços'],
    ['unhas', '📅 Agendar horário', '💅 Serviços e preços'],
    ['cilios_sobrancelhas', '📅 Agendar horário', '✨ Serviços e preços'],
    ['cabelo', '📅 Agendar horário', '💇 Serviços e preços'],
    ['estetica', '📅 Agendar procedimento', '✨ Procedimentos e preços'],
    ['outro', '📅 Agendar horário', '📋 Serviços e preços'],
  ])('%s', (seg, um, dois) => {
    const m = menuPadrao(seg as Segmento);
    expect(`${m[0].emoji} ${m[0].label}`).toBe(um);
    expect(`${m[1].emoji} ${m[1].label}`).toBe(dois);
    expect(m.slice(2).map((o) => `${o.emoji} ${o.label}`)).toEqual(
      ['🔄 Remarcar ou cancelar', '🎉 Promoções', '📱 Instagram', '💬 Falar com a equipe']);
    expect(m.map((o) => o.handler)).toEqual(['schedule', 'view_services', 'manage', 'promotions', 'instagram', 'attendant']);
  });
});

const T0 = new Date('2026-11-01T10:00:00Z');
const T1 = new Date('2026-11-02T10:00:00Z');
type Linha = { id: string; option_order: number; emoji: string; label: string; handler: string; type: string; active: boolean; created_at: Date; updated_at: Date };
const linha = (n: number, emoji: string, label: string, handler: string, extra: Partial<Linha> = {}): Linha =>
  ({ id: `id${n}-${handler}`, option_order: n, emoji, label, handler, type: 'system', active: true, created_at: T0, updated_at: T0, ...extra });

const antigo9 = (agendar = '📅'): Linha[] => [
  linha(1, agendar, 'Agendar um horário', 'schedule'),
  linha(2, '📋', 'Ver nossos serviços', 'view_services'),
  linha(3, '❌', 'Cancelar agendamento', 'cancel'),
  linha(4, '🔄', 'Reagendamento', 'reschedule'),
  linha(5, '⭐', 'Avaliação pós-atendimento', 'rating'),
  linha(6, '🎉', 'Promoções', 'promotions'),
  linha(7, '📱', 'Instagram', 'instagram'),
  linha(8, '👨‍💼', 'Falar com um humano', 'attendant'),
  linha(9, '🚪', 'Encerrar atendimento', 'end_session'),
];
const sem = (rows: Linha[], handler: string) => rows.filter((r) => r.handler !== handler);
const comoPadrao = (seg: Segmento): Linha[] => menuPadrao(seg).map((o) => linha(o.order, o.emoji, o.label, o.handler));

describe('menuNaoPersonalizado', () => {
  it('menu antigo de 9 opções', () => expect(menuNaoPersonalizado(antigo9())).toBe(true));
  it('menu antigo de 9 opções com 💈', () => expect(menuNaoPersonalizado(antigo9('💈'))).toBe(true));
  it('8 opções sem rating, com ordem compactada ou com buraco', () => {
    const oito = sem(antigo9(), 'rating');
    expect(menuNaoPersonalizado(oito)).toBe(true);
    expect(menuNaoPersonalizado(oito.map((r, i) => ({ ...r, option_order: i + 1 })))).toBe(true);
  });
  it('8 opções sem rating com 💈', () => expect(menuNaoPersonalizado(sem(antigo9('💈'), 'rating'))).toBe(true));
  it.each(['barbearia', 'unhas', 'cilios_sobrancelhas', 'cabelo', 'estetica', 'outro'])('menuPadrao de %s', (seg) => {
    expect(menuNaoPersonalizado(comoPadrao(seg as Segmento))).toBe(true);
  });
  it('opção renomeada, desligada, movida ou própria é personalizado', () => {
    const base = antigo9();
    expect(menuNaoPersonalizado(base.map((r) => (r.handler === 'instagram' ? { ...r, label: 'Nosso Insta' } : r)))).toBe(false);
    expect(menuNaoPersonalizado(base.map((r) => (r.handler === 'instagram' ? { ...r, emoji: '📸' } : r)))).toBe(false);
    expect(menuNaoPersonalizado(base.map((r) => (r.handler === 'promotions' ? { ...r, active: false } : r)))).toBe(false);
    const [a, b, ...resto] = base;
    expect(menuNaoPersonalizado([{ ...b, option_order: 1 }, { ...a, option_order: 2 }, ...resto])).toBe(false);
    expect(menuNaoPersonalizado([...base, linha(10, '🎁', 'Brinde', 'custom', { type: 'custom' })])).toBe(false);
  });
  it('lista vazia não conta', () => expect(menuNaoPersonalizado([])).toBe(false));
});

describe('garantirMenuAtual', () => {
  const tx = { $queryRaw: vi.fn(), $executeRaw: vi.fn() };
  const sqlDe = (c: unknown): string => {
    const q = c as { strings?: string[]; sql?: string };
    return (q.strings ?? [q.sql ?? '']).join(' ');
  };
  const textos = (m: ReturnType<typeof vi.fn>) => m.mock.calls.map((c) => sqlDe(c[0]));

  beforeEach(() => {
    vi.clearAllMocks();
    tx.$queryRaw.mockResolvedValue([]);
    tx.$executeRaw.mockResolvedValue(1);
    mockTransaction.mockImplementation(async (cb: (t: unknown) => unknown) => cb(tx));
  });

  it('troca o menu antigo pelo menu atual do segmento', async () => {
    mockQueryRaw.mockResolvedValueOnce(antigo9('💈'));
    await garantirMenuAtual('b1', 'barbearia');
    expect(mockTransaction).toHaveBeenCalledTimes(1);
    expect(textos(tx.$executeRaw as never).concat(textos(tx.$queryRaw as never)).join('|')).toContain('DELETE FROM whatsapp_menu_options');
    expect(tx.$executeRaw.mock.calls.filter((c) => sqlDe(c[0]).includes('INSERT'))).toHaveLength(6);
  });

  it('menu de 8 opções gravado pelo PR 1 é trocado', async () => {
    mockQueryRaw.mockResolvedValueOnce(sem(antigo9(), 'rating'));
    await garantirMenuAtual('b1', 'estetica');
    expect(mockTransaction).toHaveBeenCalledTimes(1);
    const valores = tx.$executeRaw.mock.calls.flatMap((c) => (c[0] as { values?: unknown[] }).values ?? []);
    expect(valores).toContain('Agendar procedimento');
  });

  it('menu padrão de barbearia lido com segmento estetica vira o de estética', async () => {
    mockQueryRaw.mockResolvedValueOnce(comoPadrao('barbearia'));
    await garantirMenuAtual('b1', 'estetica');
    expect(mockTransaction).toHaveBeenCalledTimes(1);
    const valores = tx.$executeRaw.mock.calls.flatMap((c) => (c[0] as { values?: unknown[] }).values ?? []);
    expect(valores).toContain('Procedimentos e preços');
  });

  it('outro com a linha de serviços tocada para ✂️ continua ✂️', async () => {
    const rows = comoPadrao('barbearia').map((r) => (r.handler === 'view_services' ? { ...r, updated_at: T1 } : r));
    mockQueryRaw.mockResolvedValueOnce(rows);
    await garantirMenuAtual('b1', 'outro');
    expect(mockTransaction).not.toHaveBeenCalled();
  });

  it('estetica renomeada para os textos de cílios continua', async () => {
    const rows = comoPadrao('cilios_sobrancelhas').map((r) => (r.handler === 'view_services' ? { ...r, updated_at: T1 } : r));
    mockQueryRaw.mockResolvedValueOnce(rows);
    await garantirMenuAtual('b1', 'estetica');
    expect(mockTransaction).not.toHaveBeenCalled();
  });

  it('menu de barbearia intocado em negócio que virou estetica troca', async () => {
    mockQueryRaw.mockResolvedValueOnce(comoPadrao('barbearia'));
    await garantirMenuAtual('b1', 'estetica');
    expect(mockTransaction).toHaveBeenCalledTimes(1);
  });

  it('menu de outro segmento com qualquer linha tocada não troca', async () => {
    const rows = comoPadrao('barbearia').map((r, i) => (i === 3 ? { ...r, updated_at: T1 } : r));
    mockQueryRaw.mockResolvedValueOnce(rows);
    await garantirMenuAtual('b1', 'estetica');
    expect(mockTransaction).not.toHaveBeenCalled();
  });

  it('menu já atual não escreve nada (segunda chamada)', async () => {
    mockQueryRaw.mockResolvedValueOnce(comoPadrao('barbearia'));
    await garantirMenuAtual('b1', 'barbearia');
    expect(mockTransaction).not.toHaveBeenCalled();
  });

  it('menu personalizado com rating perde só essa linha', async () => {
    const pers = antigo9().map((r) => (r.handler === 'instagram' ? { ...r, label: 'Nosso Insta' } : r));
    mockQueryRaw.mockResolvedValueOnce(pers);
    await garantirMenuAtual('b1', 'barbearia');
    expect(mockTransaction).toHaveBeenCalledTimes(1);
    const t = textos(tx.$executeRaw as never).concat(textos(tx.$queryRaw as never));
    expect(t).toHaveLength(1);
    expect(t[0]).toContain("handler = 'rating'");
  });

  it('menu personalizado sem rating não escreve', async () => {
    mockQueryRaw.mockResolvedValueOnce(sem(antigo9(), 'rating').map((r) => (r.handler === 'instagram' ? { ...r, label: 'X' } : r)));
    await garantirMenuAtual('b1', 'barbearia');
    expect(mockTransaction).not.toHaveBeenCalled();
  });

  it('getMenuOptions segue funcionando se garantirMenuAtual falhar', async () => {
    mockQueryRaw.mockRejectedValueOnce(new Error('falhou'));
    mockQueryRaw.mockResolvedValueOnce([linha(1, '📅', 'Agendar', 'schedule')]);
    const rows = await getMenuOptions('b1');
    expect(rows.map((r) => r.handler)).toEqual(['schedule']);
  });
});
