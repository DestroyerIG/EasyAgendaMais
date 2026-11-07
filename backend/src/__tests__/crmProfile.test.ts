import { describe, it, expect, vi, beforeEach } from 'vitest';
vi.mock('../modules/whatsappAvatar/avatar.service.js', () => ({ avatares: { urlsPara: vi.fn().mockResolvedValue(new Map()), processar: vi.fn().mockResolvedValue({ buscados: 0 }) } }));

const repo = vi.hoisted(() => ({
  clientePerfil: vi.fn(), visitasDoCliente: vi.fn(), agendamentosDoCliente: vi.fn(), ficha: vi.fn(), salvarFicha: vi.fn(),
  registrarConsentimento: vi.fn(), ownerName: vi.fn(), configuracao: vi.fn(), salvarConfiguracao: vi.fn(),
}));
vi.mock('../modules/crm/crm.repository.js', () => ({ crmRepository: repo }));
const recebimentos = vi.hoisted(() => ({ reservasComSinalNoCartao: vi.fn() }));
vi.mock('../modules/recebimentos/recebimentos.repository.js', () => ({ recebimentosRepository: recebimentos }));
vi.mock('../services/scheduleSettingsService.js', () => ({ getBusinessScheduleSettings: vi.fn().mockResolvedValue({ timezone: 'America/Sao_Paulo' }) }));

const { crmService: crmProfileService } = await import('../modules/crm/crm.service.js');

const perfil = (over: Record<string, unknown> = {}) => ({
  id: 'c1', name: 'Ana', phone: '83999990000', email: null, birthDate: null, notes: null,
  createdAt: '2026-01-10T12:00:00.000Z', tags: [{ id: 't1', name: 'VIP', color: 'brand' }], consentimento: null, ...over,
});
const vis = (date: string, receita: number) => ({ date, receita, servico: 'Corte', profissional: 'Camila' });
const agenda = (over: Record<string, unknown> = {}) => ({
  id: 'a1', date: '2026-10-01', time: '14:00', status: 'concluido', source: 'painel', reminderSent: false, depositAmount: null,
  createdAt: '2026-09-28T10:00:00.000Z', finishedAt: '2026-10-01T15:00:00.000Z', servico: 'Corte', servicePrice: 80, profissional: 'Camila',
  comanda: null, avaliacao: null, ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-14T12:00:00-03:00'));
  repo.clientePerfil.mockResolvedValue(perfil());
  repo.visitasDoCliente.mockResolvedValue([]);
  repo.agendamentosDoCliente.mockResolvedValue([]);
  repo.ficha.mockResolvedValue(null);
  recebimentos.reservasComSinalNoCartao.mockResolvedValue(new Set());
  repo.ownerName.mockResolvedValue('Dona Bia');
  repo.configuracao.mockResolvedValue({ segment: 'unhas', dailyRevenueGoal: null });
  repo.salvarFicha.mockImplementation(async (a: Record<string, unknown>) => ({ ...a, updatedAt: '2026-10-14T15:00:00.000Z' }));
});

describe('crmService.profile', () => {
  it('calcula indicadores do perfil', async () => {
    repo.visitasDoCliente.mockResolvedValue([vis('2025-12-20', 100), vis('2026-09-10', 100), vis('2026-10-10', 160)]);
    repo.agendamentosDoCliente.mockResolvedValue([agenda({ id: 'x', status: 'faltou' }), agenda({ id: 'y', status: 'cancelado' }), agenda({ id: 'z' })]);
    const p = await crmProfileService.profile('b1', 'c1');
    expect(p.indicadores.visitasNoAno).toBe(2);
    expect(p.indicadores.ticketMedio).toBe(120);
    expect(p.indicadores.cicloMedio).toBe(Math.round((264 + 30) / 2));
    expect(p.indicadores.faltasECancelamentos).toBe(2);
    expect(p.indicadores.ultimaVisita).toMatchObject({ date: '2026-10-10', diasAtras: 4 });
    expect(p.fase).toBe('recorrente');
    expect(p.etiquetas).toEqual([{ id: 't1', name: 'VIP', color: 'brand' }]);
  });

  it('consentimento sem registro é nao_informado', async () => {
    const p = await crmProfileService.profile('b1', 'c1');
    expect(p.consentimento).toEqual({ estado: 'nao_informado', desde: null, canal: null });
  });

  it('ficha inexistente devolve fields vazio e campos do segmento do negócio', async () => {
    const p = await crmProfileService.profile('b1', 'c1');
    expect(p.fichaTecnica).toMatchObject({ allergies: null, fields: {}, customFields: [], updatedAt: null, updatedBy: null, segmento: 'unhas' });
    expect(p.fichaTecnica.campos.map((c) => c.key)).toEqual(['formato', 'comprimento', 'cor', 'curvatura', 'aplicacao']);
  });

  it('ficha existente mostra o dono do negócio como updatedBy', async () => {
    repo.ficha.mockResolvedValue({ allergies: 'Acetona', fields: { cor: 'Nude' }, customFields: [{ label: 'Pet', value: 'Rex' }], updatedAt: '2026-10-01T10:00:00.000Z' });
    const p = await crmProfileService.profile('b1', 'c1');
    expect(p.fichaTecnica).toMatchObject({ allergies: 'Acetona', fields: { cor: 'Nude' }, updatedBy: 'Dona Bia' });
  });

  it('cliente de outro negócio vira NotFoundError', async () => {
    repo.clientePerfil.mockResolvedValue(null);
    await expect(crmProfileService.profile('outro', 'c1')).rejects.toMatchObject({ statusCode: 404, message: 'Cliente não encontrada' });
    await expect(crmProfileService.timeline('outro', 'c1', 'todos')).rejects.toMatchObject({ statusCode: 404, message: 'Cliente não encontrada' });
  });
});

describe('crmService.saveTechnicalSheet', () => {
  const base = { allergies: null, fields: {}, customFields: [] };

  it('rejeita chave fora do modelo do segmento', async () => {
    await expect(crmProfileService.saveTechnicalSheet('b1', 'u1', 'c1', { ...base, fields: { tecnica: 'x' } }))
      .rejects.toMatchObject({ statusCode: 400, message: 'Campo desconhecido para o segmento' });
    expect(repo.salvarFicha).not.toHaveBeenCalled();
  });

  it('rejeita opção inválida em campo de opções', async () => {
    await expect(crmProfileService.saveTechnicalSheet('b1', 'u1', 'c1', { ...base, fields: { formato: 'Triangular' } }))
      .rejects.toMatchObject({ statusCode: 400 });
  });

  it('grava updatedBy do usuário e devolve o DTO', async () => {
    const r = await crmProfileService.saveTechnicalSheet('b1', 'u1', 'c1', { allergies: 'Látex', fields: { formato: 'Amendoado' }, customFields: [{ label: 'Pet', value: 'Rex' }] });
    expect(repo.salvarFicha).toHaveBeenCalledWith(expect.objectContaining({ businessId: 'b1', clientId: 'c1', updatedBy: 'u1', allergies: 'Látex' }));
    expect(r).toMatchObject({ allergies: 'Látex', fields: { formato: 'Amendoado' }, updatedBy: 'Dona Bia', segmento: 'unhas' });
  });
});

describe('crmService.timeline', () => {
  it('ordena do mais recente e usa o valor da comanda fechada; filtro financeiro', async () => {
    repo.agendamentosDoCliente.mockResolvedValue([
      agenda({ comanda: { totalCharged: 70, depositApplied: 20, itens: ['Corte', 'Pomada'] } }),
      agenda({ id: 'a2', date: '2026-08-01', status: 'confirmado', source: 'publico', depositAmount: 20, createdAt: '2026-07-30T10:00:00.000Z', finishedAt: null }),
    ]);
    const todos = await crmProfileService.timeline('b1', 'c1', 'todos');
    const datas = todos.map((e) => e.data);
    expect(datas).toEqual([...datas].sort().reverse());
    const concl = todos.find((e) => e.tipo === 'concluido')!;
    expect(concl).toMatchObject({ titulo: 'Atendimento concluído com Camila', valor: 90, descricao: 'Corte, Pomada' });
    expect(todos.find((e) => e.tipo === 'agendado')!.titulo).toBe('Agendamento para 01/10 às 14:00 · Corte com Camila');
    expect(todos.at(-1)!.tipo).toBe('cadastro');
    const fin = await crmProfileService.timeline('b1', 'c1', 'financeiro');
    expect(fin.map((e) => e.tipo).sort()).toEqual(['concluido', 'sinal_pix']);
    expect(fin.find((e) => e.tipo === 'sinal_pix')).toMatchObject({ titulo: 'Sinal Pix de R$ 20,00 pago na reserva online', valor: 20 });
  });

  it('concluído sem comanda usa o preço do serviço; avaliação e lembrete aparecem', async () => {
    repo.agendamentosDoCliente.mockResolvedValue([
      agenda({ reminderSent: true, avaliacao: { rating: 5, comment: 'Amei', createdAt: '2026-10-02T10:00:00.000Z' } }),
    ]);
    const todos = await crmProfileService.timeline('b1', 'c1', 'todos');
    expect(todos.find((e) => e.tipo === 'concluido')!.valor).toBe(80);
    expect(todos.find((e) => e.tipo === 'avaliacao')).toMatchObject({ titulo: 'Avaliação 5 estrelas', descricao: 'Amei', nota: 5 });
    expect(todos.find((e) => e.tipo === 'lembrete')).toMatchObject({ titulo: 'Lembrete automático enviado pelo WhatsApp', data: '2026-09-30T17:00:00.000Z' });
    const ag = await crmProfileService.timeline('b1', 'c1', 'agendamentos');
    expect(ag.map((e) => e.tipo).sort()).toEqual(['agendado', 'concluido', 'lembrete']);
  });

  it('converte horário do agendamento para instante UTC real e ordena corretamente', async () => {
    repo.agendamentosDoCliente.mockResolvedValue([
      agenda({ id: 'k', status: 'cancelado', date: '2026-10-14', time: '14:00', finishedAt: null, createdAt: '2026-10-10T10:00:00.000Z' }),
      agenda({ id: 'n', status: 'confirmado', date: '2026-10-20', time: '10:00', finishedAt: null, createdAt: '2026-10-14T16:30:00.000Z' }),
    ]);
    const todos = await crmProfileService.timeline('b1', 'c1', 'todos');
    const canc = todos.find((e) => e.tipo === 'cancelado')!;
    expect(canc.data).toBe('2026-10-14T17:00:00.000Z');
    const reserva = todos.find((e) => e.titulo.includes('20/10'))!;
    expect(reserva.data).toBe('2026-10-14T16:30:00.000Z');
    expect(todos.indexOf(canc)).toBeLessThan(todos.indexOf(reserva));
  });

  it('sinal pago no cartão aparece como "Sinal no cartão", numa consulta só', async () => {
    repo.agendamentosDoCliente.mockResolvedValue([
      agenda({ id: 'a2', status: 'confirmado', source: 'publico', depositAmount: 20, finishedAt: null }),
      agenda({ id: 'a3', status: 'confirmado', source: 'publico', depositAmount: 15, finishedAt: null }),
    ]);
    recebimentos.reservasComSinalNoCartao.mockResolvedValue(new Set(['a2']));
    const todos = await crmProfileService.timeline('b1', 'c1', 'todos');
    expect(recebimentos.reservasComSinalNoCartao).toHaveBeenCalledTimes(1);
    expect(recebimentos.reservasComSinalNoCartao).toHaveBeenCalledWith('b1', expect.arrayContaining(['a2', 'a3']));
    const sinais = todos.filter((e) => e.tipo === 'sinal_pix').map((e) => e.titulo).sort();
    expect(sinais).toEqual(['Sinal Pix de R$ 15,00 pago na reserva online', 'Sinal no cartão de R$ 20,00 pago na reserva online']);
  });

  it('sinal Pix não aparece para reserva pública cancelada', async () => {
    repo.agendamentosDoCliente.mockResolvedValue([agenda({ status: 'cancelado', source: 'publico', depositAmount: 20, finishedAt: null })]);
    const todos = await crmProfileService.timeline('b1', 'c1', 'todos');
    expect(todos.some((e) => e.tipo === 'sinal_pix')).toBe(false);
    expect(todos.some((e) => e.tipo === 'cancelado' && e.titulo === 'Agendamento cancelado')).toBe(true);
  });
});

describe('crmService outro negócio', () => {
  it('saveTechnicalSheet e setConsent lançam NotFoundError', async () => {
    repo.clientePerfil.mockResolvedValue(null);
    await expect(crmProfileService.saveTechnicalSheet('outro', 'u1', 'c1', { allergies: null, fields: {}, customFields: [] }))
      .rejects.toMatchObject({ statusCode: 404, message: 'Cliente não encontrada' });
    await expect(crmProfileService.setConsent('outro', 'u1', 'c1', true))
      .rejects.toMatchObject({ statusCode: 404, message: 'Cliente não encontrada' });
    expect(repo.salvarFicha).not.toHaveBeenCalled();
    expect(repo.registrarConsentimento).not.toHaveBeenCalled();
  });
});

describe('crmService.setConsent', () => {
  it('revogar grava granted=false e o profile passa a revogado', async () => {
    repo.registrarConsentimento.mockResolvedValue({ granted: false, channel: 'painel', grantedAt: '2026-10-14T15:00:00.000Z' });
    const r = await crmProfileService.setConsent('b1', 'u1', 'c1', false);
    expect(repo.registrarConsentimento).toHaveBeenCalledWith({ businessId: 'b1', clientId: 'c1', granted: false, channel: 'painel', recordedBy: 'u1' });
    expect(r).toEqual({ estado: 'revogado', desde: '2026-10-14T15:00:00.000Z', canal: 'painel' });
    repo.clientePerfil.mockResolvedValue(perfil({ consentimento: { granted: false, channel: 'painel', grantedAt: '2026-10-14T15:00:00.000Z' } }));
    expect((await crmProfileService.profile('b1', 'c1')).consentimento.estado).toBe('revogado');
  });
});

describe('crmService.crm-settings', () => {
  it('meta 0 é rejeitada e null remove a meta', async () => {
    await expect(crmProfileService.saveSettings('b1', { segment: 'unhas', dailyRevenueGoal: 0 })).rejects.toMatchObject({ statusCode: 400 });
    expect(repo.salvarConfiguracao).not.toHaveBeenCalled();
    repo.salvarConfiguracao.mockResolvedValue({ segment: 'cabelo', dailyRevenueGoal: null });
    const r = await crmProfileService.saveSettings('b1', { segment: 'cabelo', dailyRevenueGoal: null });
    expect(repo.salvarConfiguracao).toHaveBeenCalledWith('b1', { segment: 'cabelo', dailyRevenueGoal: null });
    expect(r).toEqual({ segment: 'cabelo', dailyRevenueGoal: null });
  });
});
