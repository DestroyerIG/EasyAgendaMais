import { describe, it, expect, vi, beforeEach } from 'vitest';

const repo = vi.hoisted(() => ({
  findSession: vi.fn(), createSession: vi.fn(), closeSession: vi.fn(), reopenSession: vi.fn(), addMovement: vi.fn(),
  findClosedComandas: vi.fn(), findAppointmentsByStatus: vi.fn(), findExpenses: vi.fn(),
  findMovements: vi.fn(), ownerName: vi.fn(),
}));
vi.mock('../modules/cash/cash.repository.js', () => ({ cashRepository: repo }));
vi.mock('../services/scheduleSettingsService.js', () => ({ getBusinessScheduleSettings: vi.fn().mockResolvedValue({ timezone: 'America/Sao_Paulo' }) }));

const { cashService, calcularGaveta } = await import('../modules/cash/cash.service.js');

const sessao = (over: Record<string, unknown> = {}) => ({
  id: 'cx1', openedAt: new Date('2026-10-13T07:45:00-03:00'), openingBalance: '150', closedAt: null,
  countedBalance: null, expectedBalance: null, difference: null, ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-13T12:00:00-03:00'));
  repo.ownerName.mockResolvedValue('Carla');
  repo.findClosedComandas.mockResolvedValue([]);
  repo.findAppointmentsByStatus.mockResolvedValue([]);
  repo.findExpenses.mockResolvedValue([]);
  repo.findMovements.mockResolvedValue([]);
});

describe('calcularGaveta', () => {
  it('fundo + entradas em dinheiro + suprimentos − sangrias − despesas em dinheiro', () => {
    expect(calcularGaveta({ fundoInicial: 150, entradasDinheiro: 120, suprimentos: 50, sangrias: 100, saidasDinheiro: 40 }).esperado).toBe(180);
  });
});

describe('cashService.open', () => {
  it('abre o caixa de hoje', async () => {
    repo.createSession.mockResolvedValue({ id: 'cx1' });
    repo.findSession.mockResolvedValue(sessao());
    await cashService.open('b1', 'u1', 150);
    expect(repo.createSession).toHaveBeenCalledWith('b1', '2026-10-13', 'u1', 150);
  });

  it('abrir duas vezes no mesmo dia dá 409', async () => {
    repo.createSession.mockRejectedValue(Object.assign(new Error('unique'), { code: 'P2002' }));
    await expect(cashService.open('b1', 'u1', 150)).rejects.toThrow('O caixa de hoje já está aberto');
  });

  it('abrir de novo depois de fechado avisa que já foi fechado', async () => {
    repo.createSession.mockRejectedValue(Object.assign(new Error('unique'), { code: 'P2002' }));
    repo.findSession.mockResolvedValue(sessao({ closedAt: new Date() }));
    await expect(cashService.open('b1', 'u1', 150)).rejects.toThrow('O caixa de hoje já foi fechado');
  });

  it('caixa de ontem esquecido aberto não impede abrir o de hoje', async () => {
    repo.createSession.mockResolvedValue({ id: 'cx2' });
    repo.findSession.mockResolvedValue(sessao({ id: 'cx2', openingBalance: '0' }));
    await expect(cashService.open('b1', 'u1', 0)).resolves.toBeDefined();
    expect(repo.createSession).toHaveBeenCalledWith('b1', '2026-10-13', 'u1', 0);
  });
});

describe('cashService.addMovement', () => {
  it('sem caixa aberto hoje recusa', async () => {
    repo.findSession.mockResolvedValue(null);
    await expect(cashService.addMovement('b1', 'u1', { kind: 'sangria', amount: 50, description: 'Cofre' }))
      .rejects.toThrow('Abra o caixa de hoje antes de registrar movimentos');
  });

  it('caixa já fechado recusa', async () => {
    repo.findSession.mockResolvedValue(sessao({ closedAt: new Date() }));
    await expect(cashService.addMovement('b1', 'u1', { kind: 'sangria', amount: 50, description: 'Cofre' }))
      .rejects.toThrow('O caixa de hoje já foi fechado');
  });

  it('registra sangria no caixa aberto', async () => {
    repo.findSession.mockResolvedValue(sessao());
    await cashService.addMovement('b1', 'u1', { kind: 'sangria', amount: 50, description: 'Cofre' });
    expect(repo.addMovement).toHaveBeenCalledWith('cx1', 'b1', 'u1', { kind: 'sangria', amount: 50, description: 'Cofre' });
  });
});

describe('cashService.getDay', () => {
  it('soma formas de pagamento, separa sinais Pix e monta a gaveta', async () => {
    repo.findSession.mockResolvedValue(sessao());
    repo.findClosedComandas.mockResolvedValue([
      { id: 'k1', number: 1042, paymentMethod: 'pix', totalCharged: '115', depositApplied: '0', appointment: { id: 'a1', time: new Date('1970-01-01T10:00:00Z') }, client: { name: 'Mariana', phone: '1' }, professional: { name: 'Camila' }, items: [{ name: 'Manutenção' }] },
      { id: 'k2', number: 1043, paymentMethod: 'dinheiro', totalCharged: '120', depositApplied: '0', appointment: { id: 'a2', time: new Date('1970-01-01T13:15:00Z') }, client: { name: 'Renata', phone: '2' }, professional: { name: 'Camila' }, items: [{ name: 'Pé & mão' }] },
      { id: 'k3', number: 1044, paymentMethod: 'debito', totalCharged: '75', depositApplied: '30', appointment: { id: 'a3', time: new Date('1970-01-01T12:00:00Z') }, client: { name: 'Juliana', phone: '3' }, professional: { name: 'Bruna' }, items: [{ name: 'Sobrancelha' }, { name: 'Buço' }] },
    ]);
    repo.findAppointmentsByStatus.mockImplementation(async (_b: string, _d: string, status: string) =>
      status === 'faltou'
        ? [{ id: 'a9', time: new Date('1970-01-01T12:30:00Z'), client: { name: 'Camila Prado', phone: '9' }, professional: { name: 'Paula' }, service: { name: 'Corte', price: '140' } }]
        : []);
    repo.findExpenses.mockResolvedValue([
      { id: 'e1', description: 'Luvas', category: 'Materiais', amount: '80', paymentMethod: 'debito', createdAt: new Date() },
      { id: 'e2', description: 'Café', category: 'Copa', amount: '40', paymentMethod: 'dinheiro', createdAt: new Date() },
    ]);
    repo.findMovements.mockResolvedValue([{ id: 'm1', kind: 'sangria', amount: '50', description: 'Cofre', createdAt: new Date() }]);

    const dia = await cashService.getDay('b1');

    expect(dia.responsavel).toBe('Carla');
    expect(dia.isToday).toBe(true);
    expect(dia.comandasResumo).toEqual({ total: 4, fechadas: 3, abertas: 0, falta: 1 });
    expect(dia.formas).toEqual([
      { chave: 'pix', valor: 115, quantidade: 1 },
      { chave: 'sinal_pix', valor: 30, quantidade: 1 },
      { chave: 'debito', valor: 75, quantidade: 1 },
      { chave: 'credito', valor: 0, quantidade: 0 },
      { chave: 'dinheiro', valor: 120, quantidade: 1 },
    ]);
    expect(dia.totals).toEqual({ entradas: 340, entradasQtd: 4, saidas: 120, saidasQtd: 2, saldo: 220 });
    expect(dia.gaveta).toEqual({ fundoInicial: 150, entradasDinheiro: 120, suprimentos: 0, sangrias: 50, saidasDinheiro: 40, esperado: 180 });
    expect(dia.linhas.map((l) => l.hora)).toEqual(['10:00', '12:00', '12:30', '13:15']);
    expect(dia.linhas.find((l) => l.numero === 1044)).toMatchObject({ servicos: 'Sobrancelha + Buço', total: 105, depositApplied: 30 });
    expect(dia.linhas.find((l) => l.status === 'Falta')).toMatchObject({ cliente: 'Camila Prado', total: 140, pagamento: 'faltou' });
  });

  it('sinal de quem faltou entra em Sinais Pix do dia', async () => {
    repo.findSession.mockResolvedValue(sessao());
    repo.findAppointmentsByStatus.mockImplementation(async (_b: string, _d: string, status: string) =>
      status === 'faltou'
        ? [{ id: 'a9', time: new Date('1970-01-01T12:30:00Z'), depositAmount: '40', client: { name: 'Ana', phone: '9' }, professional: { name: 'Paula' }, service: { name: 'Corte', price: '140' } }]
        : []);
    const dia = await cashService.getDay('b1');
    expect(dia.formas.find((f) => f.chave === 'sinal_pix')).toEqual({ chave: 'sinal_pix', valor: 40, quantidade: 1 });
    expect(dia.totals.entradas).toBe(40);
    expect(dia.linhas[0]).toMatchObject({ status: 'Falta', depositApplied: 40 });
  });

  it('dia sem caixa aberto devolve session null e totais zerados', async () => {
    repo.findSession.mockResolvedValue(null);
    const dia = await cashService.getDay('b1');
    expect(dia.session).toBeNull();
    expect(dia.totals.entradas).toBe(0);
    expect(repo.findClosedComandas).not.toHaveBeenCalled();
  });

  it('consulta de data passada marca isToday false', async () => {
    repo.findSession.mockResolvedValue(null);
    const dia = await cashService.getDay('b1', '2026-10-10');
    expect(dia.isToday).toBe(false);
    expect(repo.findSession).toHaveBeenCalledWith('b1', '2026-10-10');
  });
});

describe('cashService.close', () => {
  it('grava esperado, contado e diferença', async () => {
    repo.findSession.mockResolvedValue(sessao());
    repo.closeSession.mockResolvedValue(true);
    await cashService.close('b1', 'u1', { countedBalance: 145 });
    expect(repo.closeSession).toHaveBeenCalledWith('cx1', 'u1', { countedBalance: 145, expectedBalance: 150, difference: -5, notes: null });
  });

  it('fecha o caixa de uma data passada esquecido aberto', async () => {
    repo.findSession.mockResolvedValue(sessao({ id: 'cx0', openingBalance: '0' }));
    repo.closeSession.mockResolvedValue(true);
    await cashService.close('b1', 'u1', { countedBalance: 0, date: '2026-10-12' });
    expect(repo.findSession).toHaveBeenCalledWith('b1', '2026-10-12');
  });

  it('fechar duas vezes dá 409', async () => {
    repo.findSession.mockResolvedValue(sessao({ closedAt: new Date() }));
    await expect(cashService.close('b1', 'u1', { countedBalance: 0 })).rejects.toThrow('Este caixa já foi fechado');
  });
});

describe('cashService.reopen', () => {
  it('reabre o caixa de hoje fechado e devolve o dia aberto', async () => {
    repo.findSession.mockResolvedValueOnce(sessao({ closedAt: new Date(), countedBalance: '150', expectedBalance: '150', difference: '0' }))
      .mockResolvedValue(sessao());
    repo.reopenSession.mockResolvedValue(true);
    const dia = await cashService.reopen('b1');
    expect(repo.findSession).toHaveBeenCalledWith('b1', '2026-10-13');
    expect(repo.reopenSession).toHaveBeenCalledWith('cx1');
    expect(dia.session).toMatchObject({ closedAt: null, countedBalance: null, difference: null });
  });

  it('caixa ainda aberto não reabre (409)', async () => {
    repo.findSession.mockResolvedValue(sessao());
    await expect(cashService.reopen('b1')).rejects.toMatchObject({ statusCode: 409, message: 'O caixa de hoje já está aberto' });
    expect(repo.reopenSession).not.toHaveBeenCalled();
  });

  it('sem caixa hoje não reabre (409)', async () => {
    repo.findSession.mockResolvedValue(null);
    await expect(cashService.reopen('b1')).rejects.toMatchObject({ statusCode: 409, message: 'O caixa de hoje ainda não foi aberto' });
  });
});

describe('addExpenseSchema', () => {
  it('aceita forma de pagamento válida e recusa inválida', async () => {
    const { addExpenseSchema } = await import('../validators/schemas/financeSchemas.js');
    const base = { description: 'Café', category: 'Copa', amount: 40, date: '2026-10-13' };
    expect(addExpenseSchema.safeParse({ ...base, paymentMethod: 'dinheiro' }).success).toBe(true);
    expect(addExpenseSchema.safeParse({ ...base, paymentMethod: 'cheque' }).success).toBe(false);
    expect(addExpenseSchema.safeParse(base).success).toBe(true);
  });
});
