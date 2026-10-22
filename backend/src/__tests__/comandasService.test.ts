import { describe, it, expect, vi, beforeEach } from 'vitest';

const repo = vi.hoisted(() => ({
  findAppointmentForComanda: vi.fn(),
  findComandaByAppointment: vi.fn(),
  createComanda: vi.fn(),
  findComandaById: vi.fn(),
  saveDraft: vi.fn(),
  findCashSession: vi.fn(),
  closeComandaTx: vi.fn(),
  markReceiptSent: vi.fn(),
  topExtras: vi.fn(),
  findActiveServicesByIds: vi.fn(),
}));
vi.mock('../modules/whatsappAutomacoes/gatilhos.service.js', () => ({ automacoesGatilhos: { aoCancelar: vi.fn().mockResolvedValue(0), aoCriarReservaComSinal: vi.fn().mockResolvedValue(false), toleranciaSinal: vi.fn().mockResolvedValue(15), aoFecharComanda: vi.fn().mockResolvedValue(undefined) } }));
vi.mock('../modules/comandas/comandas.repository.js', () => ({ comandasRepository: repo }));
const products = vi.hoisted(() => ({ findActiveByIds: vi.fn() }));
vi.mock('../modules/products/products.repository.js', () => ({ productsRepository: products }));
const settings = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock('../modules/comandas/commissionSettings.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../modules/comandas/commissionSettings.js')>()),
  commissionSettings: settings,
}));
const receipt = vi.hoisted(() => ({ sendComandaReceipt: vi.fn() }));
vi.mock('../modules/comandas/receipt.js', () => receipt);
vi.mock('../modules/whatsapp/whatsapp.service.js', () => ({ whatsappService: { getStatus: vi.fn().mockResolvedValue({ status: 'connected' }) } }));
vi.mock('../services/scheduleSettingsService.js', () => ({ getBusinessScheduleSettings: vi.fn().mockResolvedValue({ timezone: 'America/Sao_Paulo' }) }));
vi.mock('../config/prisma.js', () => ({ prisma: { business: { findUnique: vi.fn().mockResolvedValue({ name: 'Studio Aurora' }) } } }));

const { comandasService, RECEIPT_TIMEOUT_MS } = await import('../modules/comandas/comandas.service.js');

const appt = (status = 'confirmado', deposit: number | null = null) => ({
  id: 'a1', businessId: 'b1', status, date: new Date('2026-10-13'), time: new Date('1970-01-01T10:00:00Z'), source: 'painel',
  depositAmount: deposit,
  client: { id: 'c1', name: 'Mariana Souza', phone: '83999990000' },
  professional: { id: 'p1', name: 'Camila Rocha', commissionServicePct: null, commissionProductPct: null },
  service: { id: 's1', name: 'Manutenção Fibra de Vidro', price: '110.00', durationMinutes: 90 },
});

const comanda = (over: Record<string, unknown> = {}) => ({
  id: 'k1', number: 1042, status: 'rascunho', businessId: 'b1',
  discountAmount: 0, tipAmount: 0, paymentMethod: null, closedAt: null, receiptSentAt: null,
  appointment: appt('em_atendimento', 30),
  items: [
    { id: 'i1', kind: 'servico', serviceId: 's1', productId: null, name: 'Manutenção Fibra de Vidro', unitPrice: '110.00', quantity: 1, durationMinutes: 90, isMain: true },
  ],
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.useRealTimers();
  repo.saveDraft.mockResolvedValue(true);
  settings.get.mockResolvedValue({ serviceCommissionPct: 50, productCommissionPct: 20 });
  repo.findActiveServicesByIds.mockResolvedValue([]);
  products.findActiveByIds.mockResolvedValue([]);
});

describe('abrir comanda', () => {
  it('cria em rascunho com o serviço principal e inicia o atendimento', async () => {
    repo.findAppointmentForComanda.mockResolvedValue(appt('confirmado'));
    repo.findComandaByAppointment.mockResolvedValue(null);
    repo.createComanda.mockResolvedValue({ id: 'k1' });
    repo.findComandaById.mockResolvedValue(comanda());
    const dto = await comandasService.open('a1', 'b1');
    expect(repo.createComanda).toHaveBeenCalledWith('b1', expect.objectContaining({ id: 'a1' }), { startAppointment: true });
    expect(dto.number).toBe(1042);
    expect(dto.items[0]).toMatchObject({ isMain: true, unitPrice: 110 });
    expect(dto.whatsappConnected).toBe(true);
  });

  it('devolve a comanda existente em vez de criar outra', async () => {
    repo.findAppointmentForComanda.mockResolvedValue(appt('em_atendimento'));
    repo.findComandaByAppointment.mockResolvedValue({ id: 'k1' });
    repo.findComandaById.mockResolvedValue(comanda());
    await comandasService.open('a1', 'b1');
    expect(repo.createComanda).not.toHaveBeenCalled();
  });

  it('agendamento cancelado ou faltou não abre comanda', async () => {
    repo.findAppointmentForComanda.mockResolvedValue(appt('faltou'));
    repo.findComandaByAppointment.mockResolvedValue(null);
    await expect(comandasService.open('a1', 'b1')).rejects.toThrow('Este agendamento não pode receber comanda');
  });
});

describe('salvar rascunho', () => {
  it('preço vem do banco, nunca do navegador', async () => {
    repo.findComandaById.mockResolvedValue(comanda());
    products.findActiveByIds.mockResolvedValue([{ id: 'pr1', name: 'Óleo Hidratante de Cutícula 10ml', price: '25.00' }]);
    await comandasService.save('k1', 'b1', { extras: [{ kind: 'produto', id: 'pr1', quantity: 2 }], discount: 0, tip: 10, paymentMethod: 'pix' });
    expect(repo.saveDraft).toHaveBeenCalledWith('k1', 'b1', [
      { kind: 'produto', serviceId: null, productId: 'pr1', name: 'Óleo Hidratante de Cutícula 10ml', unitPrice: 25, quantity: 2, durationMinutes: null },
    ], expect.objectContaining({ productsTotal: 50, tipAmount: 10, paymentMethod: 'pix' }));
  });

  it('produto inexistente ou de outro negócio é recusado', async () => {
    repo.findComandaById.mockResolvedValue(comanda());
    await expect(comandasService.save('k1', 'b1', { extras: [{ kind: 'produto', id: 'x', quantity: 1 }], discount: 0, tip: 0, paymentMethod: null }))
      .rejects.toThrow('Item não encontrado');
  });

  it('guarda transacional recusa se outra requisição fechou no meio (corrida)', async () => {
    repo.findComandaById.mockResolvedValue(comanda());
    repo.saveDraft.mockResolvedValue(false);
    await expect(comandasService.save('k1', 'b1', { extras: [], discount: 0, tip: 0, paymentMethod: null }))
      .rejects.toThrow('Esta comanda já foi fechada');
  });

  it('comanda fechada não aceita mais alteração', async () => {
    repo.findComandaById.mockResolvedValue(comanda({ status: 'fechada' }));
    await expect(comandasService.save('k1', 'b1', { extras: [], discount: 0, tip: 0, paymentMethod: null }))
      .rejects.toThrow('Esta comanda já foi fechada');
  });
});

describe('fechar comanda', () => {
  const entrada = { extras: [], discount: 0, tip: 0, paymentMethod: 'pix' as const };

  it('sem caixa aberto recusa com CASH_CLOSED', async () => {
    repo.findComandaById.mockResolvedValue(comanda());
    repo.findCashSession.mockResolvedValue(null);
    await expect(comandasService.close('k1', 'b1', 'u1', entrada)).rejects.toMatchObject({ statusCode: 409, code: 'CASH_CLOSED' });
  });

  it('caixa de hoje já fechado recusa com CASH_ALREADY_CLOSED (não com "não foi aberto")', async () => {
    repo.findComandaById.mockResolvedValue(comanda());
    repo.findCashSession.mockResolvedValue({ id: 'cx1', closedAt: new Date() });
    await expect(comandasService.close('k1', 'b1', 'u1', entrada)).rejects.toMatchObject({
      statusCode: 409, code: 'CASH_ALREADY_CLOSED', message: 'O caixa de hoje já foi fechado',
    });
    expect(repo.closeComandaTx).not.toHaveBeenCalled();
  });

  it('com valor a cobrar exige forma de pagamento', async () => {
    repo.findComandaById.mockResolvedValue(comanda());
    repo.findCashSession.mockResolvedValue({ id: 'cx1' });
    await expect(comandasService.close('k1', 'b1', 'u1', { ...entrada, paymentMethod: null }))
      .rejects.toThrow('Escolha a forma de pagamento');
  });

  it('fecha copiando percentuais, liga ao caixa de hoje e grava receita sem gorjeta', async () => {
    repo.findComandaById
      .mockResolvedValueOnce(comanda())
      .mockResolvedValueOnce(comanda())
      .mockResolvedValue(comanda({ status: 'fechada', closedAt: new Date() }));
    repo.findCashSession.mockResolvedValue({ id: 'cx1' });
    repo.closeComandaTx.mockResolvedValue(true);
    receipt.sendComandaReceipt.mockResolvedValue(true);

    await comandasService.close('k1', 'b1', 'u1', { ...entrada, tip: 10 });

    expect(repo.closeComandaTx).toHaveBeenCalledWith(expect.objectContaining({
      comandaId: 'k1', businessId: 'b1', userId: 'u1', cashSessionId: 'cx1',
      appointmentId: 'a1', appointmentDate: new Date('2026-10-13'),
      servicePct: 50, productPct: 20,
      calc: expect.objectContaining({ subtotal: 110, depositApplied: 30, tip: 10, totalCharged: 90, revenue: 110, commissionService: 55 }),
    }));
    expect(repo.markReceiptSent).toHaveBeenCalledWith('k1');
  });

  it('segunda pessoa fechando a mesma comanda recebe 409 e não envia comprovante', async () => {
    repo.findComandaById.mockResolvedValue(comanda());
    repo.findCashSession.mockResolvedValue({ id: 'cx1' });
    repo.closeComandaTx.mockResolvedValue(false);
    await expect(comandasService.close('k1', 'b1', 'u1', entrada)).rejects.toThrow('Esta comanda já foi fechada');
    expect(receipt.sendComandaReceipt).not.toHaveBeenCalled();
  });

  it('agendamento cancelado depois de abrir a comanda não pode ser concluído', async () => {
    repo.findComandaById.mockResolvedValue(comanda({ appointment: appt('cancelado', 30) }));
    repo.findCashSession.mockResolvedValue({ id: 'cx1' });
    await expect(comandasService.close('k1', 'b1', 'u1', entrada)).rejects.toThrow('Este agendamento não pode mais ser concluído');
    expect(repo.closeComandaTx).not.toHaveBeenCalled();
  });

  it('caixa usado é o do dia do fechamento, não o do agendamento', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-13T01:30:00-03:00'));
    repo.findComandaById.mockResolvedValue(comanda({ appointment: { ...appt('em_atendimento'), date: new Date('2026-10-12') } }));
    repo.findCashSession.mockResolvedValue(null);
    await expect(comandasService.close('k1', 'b1', 'u1', entrada)).rejects.toMatchObject({ code: 'CASH_CLOSED' });
    expect(repo.findCashSession).toHaveBeenCalledWith('b1', '2026-10-13');
  });

  it('falha no comprovante não desfaz o fechamento', async () => {
    repo.findComandaById
      .mockResolvedValueOnce(comanda()).mockResolvedValueOnce(comanda())
      .mockResolvedValue(comanda({ status: 'fechada', closedAt: new Date() }));
    repo.findCashSession.mockResolvedValue({ id: 'cx1' });
    repo.closeComandaTx.mockResolvedValue(true);
    receipt.sendComandaReceipt.mockRejectedValue(new Error('Evolution fora do ar'));
    await expect(comandasService.close('k1', 'b1', 'u1', entrada)).resolves.toMatchObject({ status: 'fechada' });
    expect(repo.markReceiptSent).not.toHaveBeenCalled();
  });
});

describe('comprovante no fechamento', () => {
  const entrada = { extras: [], discount: 0, tip: 0, paymentMethod: 'pix' as const };

  it('WhatsApp travado não segura a resposta: responde após o prazo e marca o envio quando terminar', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    repo.findComandaById
      .mockResolvedValueOnce(comanda()).mockResolvedValueOnce(comanda())
      .mockResolvedValue(comanda({ status: 'fechada', closedAt: new Date() }));
    repo.findCashSession.mockResolvedValue({ id: 'cx1', closedAt: null });
    repo.closeComandaTx.mockResolvedValue(true);
    let terminar: (v: boolean) => void = () => {};
    receipt.sendComandaReceipt.mockReturnValue(new Promise<boolean>((r) => { terminar = r; }));

    const fechamento = comandasService.close('k1', 'b1', 'u1', entrada);
    await vi.advanceTimersByTimeAsync(RECEIPT_TIMEOUT_MS);
    await expect(fechamento).resolves.toMatchObject({ status: 'fechada' });
    expect(repo.markReceiptSent).not.toHaveBeenCalled();

    terminar(true);
    await vi.waitFor(() => expect(repo.markReceiptSent).toHaveBeenCalledWith('k1'));
  });
});

describe('comanda fechada', () => {
  it('mostra o que foi gravado, mesmo que as configurações de comissão mudem depois', async () => {
    settings.get.mockResolvedValue({ serviceCommissionPct: 10, productCommissionPct: 10 });
    repo.findComandaById.mockResolvedValue(comanda({
      status: 'fechada', closedAt: new Date(), paymentMethod: 'pix',
      servicesTotal: '110.00', productsTotal: '0.00', depositApplied: '30.00', discountAmount: '0.00', tipAmount: '10.00',
      totalCharged: '90.00', commissionTotal: '65.00',
      appointment: appt('concluido', 0),
      items: [{ id: 'i1', kind: 'servico', serviceId: 's1', productId: null, name: 'X', unitPrice: '110.00', quantity: 1, durationMinutes: 90, isMain: true, commissionPct: '50.00' }],
    }));
    const dto = await comandasService.get('k1', 'b1');
    expect(dto.commission).toMatchObject({ servicePct: 50 });
    expect(dto.calc).toMatchObject({ depositApplied: 30, totalCharged: 90, commissionService: 55, commissionTotal: 65 });
  });
});

describe('atalhos', () => {
  it('devolve no máximo 3 itens extras mais usados, com preço numérico', async () => {
    repo.topExtras.mockResolvedValue([
      { kind: 'produto', id: 'pr1', name: 'Base Fortalecedora', price: '35' },
      { kind: 'servico', id: 's9', name: 'Remoção Express', price: '30' },
      { kind: 'servico', id: 's8', name: 'Nail Art Simples', price: '20' },
    ]);
    await expect(comandasService.shortcuts('b1')).resolves.toEqual([
      { kind: 'produto', id: 'pr1', name: 'Base Fortalecedora', price: 35 },
      { kind: 'servico', id: 's9', name: 'Remoção Express', price: 30 },
      { kind: 'servico', id: 's8', name: 'Nail Art Simples', price: 20 },
    ]);
    expect(repo.topExtras).toHaveBeenCalledWith('b1', 90, 3);
  });
});
