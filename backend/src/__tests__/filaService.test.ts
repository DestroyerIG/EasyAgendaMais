import { describe, it, expect, vi, beforeEach } from 'vitest';

const repo = vi.hoisted(() => ({
  naFilaDoCliente: vi.fn(), criar: vi.fn(), negociosComVencidos: vi.fn(), ultimoEnviado: vi.fn(),
  contarEnviadosDesde: vi.fn(), proximoVencido: vi.fn(), reservar: vi.fn(), atualizar: vi.fn(),
  consentimentoRevogado: vi.fn(), interromper: vi.fn(), recentesPorCliente: vi.fn(),
}));
vi.mock('../modules/whatsappFila/fila.repository.js', () => ({ filaRepository: repo }));
const envio = vi.hoisted(() => ({ sendWhatsAppMessage: vi.fn() }));
vi.mock('../services/whatsapp/whatsappMessageService.js', () => envio);
const rec = vi.hoisted(() => ({ inboxRecorder: { estaEmOptOut: vi.fn() } }));
vi.mock('../modules/whatsappInbox/inbox.recorder.js', () => rec);
const wa = vi.hoisted(() => ({ whatsappService: { getStatus: vi.fn() } }));
vi.mock('../modules/whatsapp/whatsapp.service.js', () => wa);
vi.mock('../services/scheduleSettingsService.js', () => ({ getBusinessScheduleSettings: vi.fn(async () => ({ timezone: 'America/Sao_Paulo' })) }));

const { filaEnvios } = await import('../modules/whatsappFila/fila.service.js');

const AGORA = new Date('2026-10-20T15:00:00Z'); // 12:00 local
const linha = (o: Record<string, unknown> = {}) => ({
  id: 'e1', businessId: 'b1', clientId: 'c1', phone: '5583999990000', phoneKey: '8399990000', body: 'Oi', origin: 'retorno',
  scheduledFor: new Date('2026-10-20T14:00:00Z'), status: 'na_fila', reason: null, sentAt: null, intervalAfterS: null, batchId: null,
  createdAt: new Date('2026-10-20T13:00:00Z'), ...o,
});

beforeEach(() => {
  vi.clearAllMocks();
  repo.negociosComVencidos.mockResolvedValue(['b1']);
  repo.ultimoEnviado.mockResolvedValue(null);
  repo.contarEnviadosDesde.mockResolvedValue(0);
  repo.proximoVencido.mockResolvedValue(linha());
  repo.reservar.mockResolvedValue(true);
  repo.atualizar.mockResolvedValue(undefined);
  repo.interromper.mockResolvedValue(0);
  repo.consentimentoRevogado.mockResolvedValue(false);
  rec.inboxRecorder.estaEmOptOut.mockResolvedValue(false);
  wa.whatsappService.getStatus.mockResolvedValue({ status: 'connected' });
  envio.sendWhatsAppMessage.mockResolvedValue(true);
});

describe('enfileirar', () => {
  it('não duplica a mesma cliente com a mesma origem', async () => {
    let existente: ReturnType<typeof linha> | null = null;
    repo.naFilaDoCliente.mockImplementation(async () => existente);
    repo.criar.mockImplementation(async () => { existente = linha(); return existente; });
    const item = { businessId: 'b1', clientId: 'c1', phone: '5583999990000', body: 'Oi', origin: 'retorno' as const };
    const a = await filaEnvios.enfileirar([item]);
    const b = await filaEnvios.enfileirar([item]);
    expect(repo.criar).toHaveBeenCalledTimes(1);
    expect(a[0].id).toBe(b[0].id);
    expect(b[0].status).toBe('na_fila');
  });
});

describe('processar', () => {
  it('envia só 1 por negócio e grava enviado com intervalo 45–90', async () => {
    const r = await filaEnvios.processar(AGORA);
    expect(r).toEqual({ enviados: 1, pulados: 0, falhas: 0 });
    expect(repo.proximoVencido).toHaveBeenCalledTimes(1);
    expect(envio.sendWhatsAppMessage).toHaveBeenCalledWith('5583999990000', 'Oi', { businessId: 'b1', origin: 'retorno' });
    const [, id, dados] = repo.atualizar.mock.calls[0];
    expect(id).toBe('e1');
    expect(dados.status).toBe('enviado');
    expect(dados.sentAt).toEqual(AGORA);
    expect(dados.intervalAfterS).toBeGreaterThanOrEqual(45);
    expect(dados.intervalAfterS).toBeLessThanOrEqual(90);
  });

  it('não envia se outra rotina reservou a linha', async () => {
    repo.reservar.mockResolvedValue(false);
    const r = await filaEnvios.processar(AGORA);
    expect(r).toEqual({ enviados: 0, pulados: 0, falhas: 0 });
    expect(envio.sendWhatsAppMessage).not.toHaveBeenCalled();
  });

  it('opt-out na hora pula', async () => {
    rec.inboxRecorder.estaEmOptOut.mockResolvedValue(true);
    const r = await filaEnvios.processar(AGORA);
    expect(r.pulados).toBe(1);
    expect(envio.sendWhatsAppMessage).not.toHaveBeenCalled();
    expect(repo.atualizar).toHaveBeenCalledWith('b1', 'e1', { status: 'pulado', reason: 'Pediu para não receber mensagens', sentAt: null });
  });

  it('consentimento revogado pula', async () => {
    repo.consentimentoRevogado.mockResolvedValue(true);
    const r = await filaEnvios.processar(AGORA);
    expect(r.pulados).toBe(1);
    expect(envio.sendWhatsAppMessage).not.toHaveBeenCalled();
    expect(repo.atualizar).toHaveBeenCalledWith('b1', 'e1', { status: 'pulado', reason: 'Consentimento revogado', sentAt: null });
  });

  it('telefone inválido pula', async () => {
    repo.proximoVencido.mockResolvedValue(linha({ phone: 'abc' }));
    const r = await filaEnvios.processar(AGORA);
    expect(r.pulados).toBe(1);
    expect(repo.atualizar).toHaveBeenCalledWith('b1', 'e1', { status: 'pulado', reason: 'Telefone inválido', sentAt: null });
  });

  it('desconectado: nada muda', async () => {
    wa.whatsappService.getStatus.mockResolvedValue({ status: 'disconnected' });
    const r = await filaEnvios.processar(AGORA);
    expect(r).toEqual({ enviados: 0, pulados: 0, falhas: 0 });
    expect(repo.reservar).not.toHaveBeenCalled();
    expect(repo.atualizar).not.toHaveBeenCalled();
  });

  it('provedor devolve false: falhou', async () => {
    envio.sendWhatsAppMessage.mockResolvedValue(false);
    const r = await filaEnvios.processar(AGORA);
    expect(r.falhas).toBe(1);
    expect(repo.atualizar).toHaveBeenCalledWith('b1', 'e1', { status: 'falhou', reason: 'O WhatsApp não aceitou o envio' });
  });

  it('checagem pré-envio lança após a reserva: volta para na_fila e nada é enviado', async () => {
    rec.inboxRecorder.estaEmOptOut.mockRejectedValue(new Error('banco fora'));
    const r = await filaEnvios.processar(AGORA);
    expect(r).toEqual({ enviados: 0, pulados: 0, falhas: 0 });
    expect(envio.sendWhatsAppMessage).not.toHaveBeenCalled();
    expect(repo.atualizar).toHaveBeenCalledWith('b1', 'e1', { status: 'na_fila', reason: null, sentAt: null });
  });

  it('reaper: só reservas com mais de 10 min viram falhou (nunca voltam para a fila)', async () => {
    repo.negociosComVencidos.mockResolvedValue([]);
    await filaEnvios.processar(AGORA);
    expect(repo.interromper).toHaveBeenCalledWith(new Date(AGORA.getTime() - 600_000), 'Envio interrompido; confira na conversa antes de reenviar');
  });

  it('fora da janela: nada sai', async () => {
    const r = await filaEnvios.processar(new Date('2026-10-20T23:30:00Z'));
    expect(r).toEqual({ enviados: 0, pulados: 0, falhas: 0 });
    expect(envio.sendWhatsAppMessage).not.toHaveBeenCalled();
  });

  it('25 na última hora: nada sai', async () => {
    repo.contarEnviadosDesde.mockResolvedValue(25);
    await filaEnvios.processar(AGORA);
    expect(envio.sendWhatsAppMessage).not.toHaveBeenCalled();
  });

  it('respeita o intervalo desde o último envio', async () => {
    repo.ultimoEnviado.mockResolvedValue({ sentAt: new Date(AGORA.getTime() - 10_000), intervalAfterS: 60 });
    await filaEnvios.processar(AGORA);
    expect(envio.sendWhatsAppMessage).not.toHaveBeenCalled();
  });

  it('dois negócios enviam 1 cada no mesmo tick', async () => {
    repo.negociosComVencidos.mockResolvedValue(['b1', 'b2']);
    repo.proximoVencido.mockImplementation(async (b: string) => linha({ id: `e-${b}`, businessId: b }));
    const r = await filaEnvios.processar(AGORA);
    expect(r.enviados).toBe(2);
    expect(envio.sendWhatsAppMessage).toHaveBeenCalledWith('5583999990000', 'Oi', { businessId: 'b2', origin: 'retorno' });
  });
});

describe('ultimosPorCliente', () => {
  it('devolve o mais recente de cada cliente', async () => {
    repo.recentesPorCliente.mockResolvedValue([
      linha({ id: 'n', clientId: 'c1', createdAt: new Date('2026-10-20T13:00:00Z') }),
      linha({ id: 'v', clientId: 'c1', createdAt: new Date('2026-10-10T13:00:00Z') }),
      linha({ id: 'o', clientId: 'c2', status: 'enviado', sentAt: new Date('2026-10-19T13:00:00Z') }),
    ]);
    const m = await filaEnvios.ultimosPorCliente('b1', 'retorno', ['c1', 'c2']);
    expect(m.get('c1')?.id).toBe('n');
    expect(m.get('c2')?.enviadoEm).toBe('2026-10-19T13:00:00.000Z');
  });
});
