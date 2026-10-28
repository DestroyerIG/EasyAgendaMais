import { describe, it, expect, vi, beforeEach } from 'vitest';

const repo = vi.hoisted(() => ({
  naFilaDoCliente: vi.fn(), criar: vi.fn(), negociosComVencidos: vi.fn(), ultimoEnviado: vi.fn(),
  contarEnviadosDesde: vi.fn(), proximoVencido: vi.fn(), reservar: vi.fn(), atualizar: vi.fn(),
  idsNaFila: vi.fn(), consentimentoRevogado: vi.fn(), interromper: vi.fn(), recentesPorCliente: vi.fn(), enviadosPorCliente: vi.fn(),
  agendamentoParaEnvio: vi.fn(), desmarcarLembrete: vi.fn(),
  cadenciasEmEnvio: vi.fn(), contarEnviadosDoLoteDesde: vi.fn(),
  clientesAtivosDaOrigem: vi.fn(), criarVarios: vi.fn(), ativosDoLote: vi.fn(),
}));
vi.mock('../modules/whatsappFila/fila.repository.js', () => ({ filaRepository: repo }));
// Contingência: conta ativa (os testes de contingência ficam em contingenciaEnvios.test.ts).
vi.mock('../modules/conta/estadoConta.service.js', () => ({ estadoContaService: { doNegocio: async () => ({ tipo: 'ativa' }) } }));
const resp = vi.hoisted(() => ({ respostasRepository: { registrar: vi.fn() } }));
vi.mock('../modules/whatsappAutomacoes/respostas.repository.js', () => resp);
const hoje = vi.hoisted(() => ({ todayRepository: { clientesComAgendamentoFuturo: vi.fn() } }));
vi.mock('../modules/dashboard/today.repository.js', () => hoje);
const envio = vi.hoisted(() => ({ sendWhatsAppMessage: vi.fn() }));
vi.mock('../services/whatsapp/whatsappMessageService.js', () => envio);
const rec = vi.hoisted(() => ({ inboxRecorder: { estaEmOptOut: vi.fn(), estaEmOptOutOuFalha: vi.fn() } }));
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
  hoje.todayRepository.clientesComAgendamentoFuturo.mockResolvedValue(new Set());
  rec.inboxRecorder.estaEmOptOut.mockResolvedValue(false);
  rec.inboxRecorder.estaEmOptOutOuFalha.mockResolvedValue(false);
  wa.whatsappService.getStatus.mockResolvedValue({ status: 'connected' });
  envio.sendWhatsAppMessage.mockResolvedValue(true);
  resp.respostasRepository.registrar.mockResolvedValue(undefined);
  repo.cadenciasEmEnvio.mockResolvedValue([]);
  repo.contarEnviadosDoLoteDesde.mockResolvedValue(new Map());
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

describe('enfileirar: duplicidade', () => {
  const item = { businessId: 'b1', clientId: 'c1', phone: '5583999990000', body: 'Oi', origin: 'retorno' as const };
  it('P2002 na criação devolve o envio existente', async () => {
    repo.naFilaDoCliente.mockResolvedValueOnce(null).mockResolvedValueOnce(linha({ id: 'ja', status: 'enviando' }));
    repo.criar.mockRejectedValue(Object.assign(new Error('unique'), { code: 'P2002' }));
    const r = await filaEnvios.enfileirar([item]);
    expect(r[0].id).toBe('ja');
    expect(r[0].status).toBe('enviando');
  });
  it('outro erro na criação continua lançando', async () => {
    repo.naFilaDoCliente.mockResolvedValue(null);
    repo.criar.mockRejectedValue(new Error('banco'));
    await expect(filaEnvios.enfileirar([item])).rejects.toThrow('banco');
  });
});

describe('enfileirarLote (campanhas)', () => {
  const LOTE = { businessId: 'b1', loteId: 'L1', origin: 'campanha' as const, agendadoPara: new Date('2026-10-22T13:00:00Z'), prioridade: 9 };
  const it3 = [
    { clientId: 'c1', phone: '83999990001', body: 'Oi Ana' },
    { clientId: 'c2', phone: '83999990002', body: 'Oi Bia' },
    { clientId: 'c3', phone: '83999990003', body: 'Oi Carla' },
  ];
  beforeEach(() => {
    repo.clientesAtivosDaOrigem.mockResolvedValue(new Set());
    repo.criarVarios.mockImplementation(async (l: unknown[]) => l.length);
    repo.ativosDoLote.mockResolvedValue([]);
  });

  it('um prefetch, um createMany e uma leitura: sem ida e volta por cliente', async () => {
    repo.ativosDoLote.mockResolvedValue([linha({ id: 'x1', clientId: 'c1', batchId: 'L1', origin: 'campanha' })]);
    const r = await filaEnvios.enfileirarLote(LOTE, it3);
    expect(repo.clientesAtivosDaOrigem).toHaveBeenCalledWith('b1', 'campanha');
    expect(repo.criarVarios).toHaveBeenCalledTimes(1);
    expect(repo.ativosDoLote).toHaveBeenCalledWith('b1', 'L1');
    expect(repo.naFilaDoCliente).not.toHaveBeenCalled();
    expect(repo.criar).not.toHaveBeenCalled();
    expect(r.map((e) => [e.id, e.loteId])).toEqual([['x1', 'L1']]);
  });

  it('grava os campos de cada linha e a ordem de criação segue a ordem da entrada', async () => {
    await filaEnvios.enfileirarLote(LOTE, it3);
    const linhas = repo.criarVarios.mock.calls[0][0];
    expect(linhas).toHaveLength(3);
    expect(linhas[0]).toMatchObject({
      businessId: 'b1', clientId: 'c1', phone: '83999990001', phoneKey: '8399990001', body: 'Oi Ana', origin: 'campanha',
      scheduledFor: LOTE.agendadoPara, batchId: 'L1', priority: 9, appointmentId: null,
    });
    // createMany numa instrução só daria o mesmo created_at a todas; a fila desempata por ele.
    const t = linhas.map((l: { createdAt: Date }) => l.createdAt.getTime());
    expect(t[1]).toBeGreaterThan(t[0]);
    expect(t[2]).toBeGreaterThan(t[1]);
  });

  it('quem já está ativa na fila de campanha não é recriada', async () => {
    repo.clientesAtivosDaOrigem.mockResolvedValue(new Set(['c2']));
    await filaEnvios.enfileirarLote(LOTE, it3);
    expect(repo.criarVarios.mock.calls[0][0].map((l: { clientId: string }) => l.clientId)).toEqual(['c1', 'c3']);
  });

  it('todas já na fila: não chama o createMany', async () => {
    repo.clientesAtivosDaOrigem.mockResolvedValue(new Set(['c1', 'c2', 'c3']));
    expect(await filaEnvios.enfileirarLote(LOTE, it3)).toEqual([]);
    expect(repo.criarVarios).not.toHaveBeenCalled();
  });

  it('cliente repetida na entrada entra uma vez só', async () => {
    await filaEnvios.enfileirarLote(LOTE, [...it3, { clientId: 'c1', phone: '83999990001', body: 'Oi Ana' }]);
    expect(repo.criarVarios.mock.calls[0][0]).toHaveLength(3);
  });

  it('erro no createMany sobe', async () => {
    repo.criarVarios.mockRejectedValue(new Error('banco'));
    await expect(filaEnvios.enfileirarLote(LOTE, it3)).rejects.toThrow('banco');
  });
});

describe('processar', () => {
  it('sentAt é a hora real do envio, não o início do tick', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    try {
      vi.setSystemTime(AGORA);
      envio.sendWhatsAppMessage.mockImplementation(async () => { vi.setSystemTime(new Date(AGORA.getTime() + 50_000)); return true; });
      await filaEnvios.processar(AGORA);
      const [, , dados] = repo.atualizar.mock.calls[0];
      expect(dados.sentAt).toEqual(new Date(AGORA.getTime() + 50_000));
    } finally { vi.useRealTimers(); }
  });

  it('convite de outro dia é pulado como vencido', async () => {
    repo.proximoVencido.mockResolvedValue(linha({ createdAt: new Date('2026-10-19T13:00:00Z') }));
    const r = await filaEnvios.processar(AGORA);
    expect(r.pulados).toBe(1);
    expect(envio.sendWhatsAppMessage).not.toHaveBeenCalled();
    expect(repo.atualizar).toHaveBeenCalledWith('b1', 'e1', { status: 'pulado', reason: 'Convite vencido', sentAt: null });
  });

  it('criado hoje no fuso do negócio (ainda ontem em UTC não, mas 00:30 local) não vence', async () => {
    repo.proximoVencido.mockResolvedValue(linha({ createdAt: new Date('2026-10-20T03:30:00Z') })); // 00:30 local de 20/10
    const r = await filaEnvios.processar(AGORA);
    expect(r.enviados).toBe(1);
  });

  it('cliente que já agendou é pulada', async () => {
    hoje.todayRepository.clientesComAgendamentoFuturo.mockResolvedValue(new Set(['c1']));
    const r = await filaEnvios.processar(AGORA);
    expect(r.pulados).toBe(1);
    expect(envio.sendWhatsAppMessage).not.toHaveBeenCalled();
    expect(repo.atualizar).toHaveBeenCalledWith('b1', 'e1', { status: 'pulado', reason: 'Cliente já agendou', sentAt: null });
    expect(hoje.todayRepository.clientesComAgendamentoFuturo).toHaveBeenCalledWith('b1', '2026-10-20', AGORA, 'c1');
  });

  it('outras origens não passam pela validade', async () => {
    repo.proximoVencido.mockResolvedValue(linha({ origin: 'sistema', createdAt: new Date('2026-10-01T13:00:00Z') }));
    hoje.todayRepository.clientesComAgendamentoFuturo.mockResolvedValue(new Set(['c1']));
    const r = await filaEnvios.processar(AGORA);
    expect(r.enviados).toBe(1);
  });

  it('envia só 1 por negócio e grava enviado com intervalo 45–90', async () => {
    const r = await filaEnvios.processar(AGORA);
    expect(r).toEqual({ enviados: 1, pulados: 0, falhas: 0 });
    expect(repo.proximoVencido).toHaveBeenCalledTimes(1);
    expect(envio.sendWhatsAppMessage).toHaveBeenCalledWith('5583999990000', 'Oi', { businessId: 'b1', origin: 'retorno' });
    const [, id, dados] = repo.atualizar.mock.calls[0];
    expect(id).toBe('e1');
    expect(dados.status).toBe('enviado');
    expect(dados.sentAt).toBeInstanceOf(Date);
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
    rec.inboxRecorder.estaEmOptOutOuFalha.mockResolvedValue(true);
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
    rec.inboxRecorder.estaEmOptOutOuFalha.mockRejectedValue(new Error('banco fora'));
    const r = await filaEnvios.processar(AGORA);
    expect(r).toEqual({ enviados: 0, pulados: 0, falhas: 0 });
    expect(envio.sendWhatsAppMessage).not.toHaveBeenCalled();
    expect(repo.atualizar).toHaveBeenCalledWith('b1', 'e1', { status: 'na_fila', reason: null, sentAt: null });
  });

  it('a consulta do SAIR falha na hora do envio: usa a versão estrita, não envia e o item volta para a fila', async () => {
    // A versão tolerante devolveria false (e a mensagem sairia); a fila precisa da que lança.
    rec.inboxRecorder.estaEmOptOut.mockResolvedValue(false);
    rec.inboxRecorder.estaEmOptOutOuFalha.mockRejectedValue(new Error('banco fora'));
    const r = await filaEnvios.processar(AGORA);
    expect(rec.inboxRecorder.estaEmOptOutOuFalha).toHaveBeenCalledWith('b1', '5583999990000');
    expect(rec.inboxRecorder.estaEmOptOut).not.toHaveBeenCalled();
    expect(envio.sendWhatsAppMessage).not.toHaveBeenCalled();
    expect(r).toEqual({ enviados: 0, pulados: 0, falhas: 0 });
    expect(repo.atualizar).toHaveBeenCalledTimes(1);
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

describe('cadência das campanhas', () => {
  const camp = (o: Record<string, unknown> = {}) => linha({ origin: 'campanha', batchId: 'L1', priority: 9, ...o });

  it('sem campanha em envio: não conta por lote e não exclui lotes', async () => {
    await filaEnvios.processar(AGORA);
    expect(repo.cadenciasEmEnvio).toHaveBeenCalledWith('b1', AGORA);
    expect(repo.contarEnviadosDoLoteDesde).not.toHaveBeenCalled();
    expect(repo.proximoVencido).toHaveBeenCalledWith('b1', AGORA, [], { semCampanhas: false });
  });

  it('lote de cadência 10 com 10 enviados na última hora fica de fora e o retorno vencido sai', async () => {
    repo.cadenciasEmEnvio.mockResolvedValue([{ id: 'L1', cadencia: 10 }]);
    repo.contarEnviadosDoLoteDesde.mockResolvedValue(new Map([['L1', 10]]));
    const r = await filaEnvios.processar(AGORA);
    expect(repo.contarEnviadosDoLoteDesde).toHaveBeenCalledWith('b1', ['L1'], new Date(AGORA.getTime() - 3_600_000));
    expect(repo.proximoVencido).toHaveBeenCalledWith('b1', AGORA, ['L1'], { semCampanhas: false });
    expect(r.enviados).toBe(1);
    expect(envio.sendWhatsAppMessage).toHaveBeenCalledWith('5583999990000', 'Oi', { businessId: 'b1', origin: 'retorno' });
  });

  it('lote abaixo da cadência continua elegível', async () => {
    repo.cadenciasEmEnvio.mockResolvedValue([{ id: 'L1', cadencia: 10 }]);
    repo.contarEnviadosDoLoteDesde.mockResolvedValue(new Map([['L1', 9]]));
    await filaEnvios.processar(AGORA);
    expect(repo.proximoVencido).toHaveBeenCalledWith('b1', AGORA, [], { semCampanhas: false });
  });

  it('campanha de 60/h em envio: limite do negócio sobe para 60', async () => {
    repo.cadenciasEmEnvio.mockResolvedValue([{ id: 'L1', cadencia: 60 }]);
    repo.contarEnviadosDesde.mockResolvedValue(30);
    repo.contarEnviadosDoLoteDesde.mockResolvedValue(new Map([['L1', 30]]));
    repo.proximoVencido.mockResolvedValue(camp());
    const r = await filaEnvios.processar(AGORA);
    expect(r.enviados).toBe(1);
  });

  it('sem campanha em envio o limite do negócio continua 25', async () => {
    repo.contarEnviadosDesde.mockResolvedValue(25);
    const r = await filaEnvios.processar(AGORA);
    expect(r).toEqual({ enviados: 0, pulados: 0, falhas: 0 });
    expect(repo.proximoVencido).not.toHaveBeenCalled();
    expect(envio.sendWhatsAppMessage).not.toHaveBeenCalled();
  });

  it('negócio com 60 enviados na hora e campanha de 60/h: nada sai', async () => {
    repo.cadenciasEmEnvio.mockResolvedValue([{ id: 'L1', cadencia: 60 }]);
    repo.contarEnviadosDesde.mockResolvedValue(60);
    repo.proximoVencido.mockResolvedValue(camp());
    const r = await filaEnvios.processar(AGORA);
    expect(r).toEqual({ enviados: 0, pulados: 0, falhas: 0 });
    expect(repo.proximoVencido).not.toHaveBeenCalled();
    expect(envio.sendWhatsAppMessage).not.toHaveBeenCalled();
  });

  it('item de campanha enviado grava o intervalo da cadência (25/h: 108–180 s)', async () => {
    repo.cadenciasEmEnvio.mockResolvedValue([{ id: 'L1', cadencia: 25 }]);
    repo.contarEnviadosDoLoteDesde.mockResolvedValue(new Map([['L1', 3]]));
    repo.proximoVencido.mockResolvedValue(camp());
    const r = await filaEnvios.processar(AGORA);
    expect(r.enviados).toBe(1);
    const [, , dados] = repo.atualizar.mock.calls[0];
    expect(dados.status).toBe('enviado');
    expect(dados.intervalAfterS).toBeGreaterThanOrEqual(108);
    expect(dados.intervalAfterS).toBeLessThanOrEqual(180);
  });

  it('item de campanha de lote que não está em envio (campanha cancelada) é pulado sem enviar', async () => {
    repo.cadenciasEmEnvio.mockResolvedValue([{ id: 'L1', cadencia: 25 }]);
    repo.proximoVencido.mockResolvedValue(camp({ batchId: 'outro' }));
    const r = await filaEnvios.processar(AGORA);
    expect(r).toEqual({ enviados: 0, pulados: 1, falhas: 0 });
    expect(envio.sendWhatsAppMessage).not.toHaveBeenCalled();
    expect(repo.atualizar).toHaveBeenCalledTimes(1);
    expect(repo.atualizar).toHaveBeenCalledWith('b1', 'e1', { status: 'pulado', reason: 'Campanha cancelada', sentAt: null });
  });

  it('item de campanha órfão é pulado antes das outras checagens', async () => {
    repo.proximoVencido.mockResolvedValue(camp());
    await filaEnvios.processar(AGORA);
    expect(rec.inboxRecorder.estaEmOptOutOuFalha).not.toHaveBeenCalled();
    expect(repo.atualizar).toHaveBeenCalledWith('b1', 'e1', { status: 'pulado', reason: 'Campanha cancelada', sentAt: null });
  });

  it('checagem falha, campanha cancelada no meio: o item volta para a fila e o próximo tick o pula', async () => {
    // Tick 1: a campanha está em envio, o item é reservado e a consulta do SAIR falha (cancelarDoLote não pega 'enviando').
    repo.cadenciasEmEnvio.mockResolvedValue([{ id: 'L1', cadencia: 25 }]);
    repo.proximoVencido.mockResolvedValue(camp());
    rec.inboxRecorder.estaEmOptOutOuFalha.mockRejectedValueOnce(new Error('banco fora'));
    expect(await filaEnvios.processar(AGORA)).toEqual({ enviados: 0, pulados: 0, falhas: 0 });
    expect(repo.atualizar).toHaveBeenLastCalledWith('b1', 'e1', { status: 'na_fila', reason: null, sentAt: null });
    // Tick 2: a campanha foi cancelada e não aparece mais em envio; o item que voltou para a fila é pulado.
    repo.cadenciasEmEnvio.mockResolvedValue([]);
    expect(await filaEnvios.processar(AGORA)).toEqual({ enviados: 0, pulados: 1, falhas: 0 });
    expect(repo.atualizar).toHaveBeenLastCalledWith('b1', 'e1', { status: 'pulado', reason: 'Campanha cancelada', sentAt: null });
    expect(envio.sendWhatsAppMessage).not.toHaveBeenCalled();
  });

  it('cadenciasEmEnvio falha: o resto da fila segue com o limite padrão e as campanhas ficam de fora', async () => {
    repo.cadenciasEmEnvio.mockRejectedValue(new Error('relation whatsapp_campanhas does not exist'));
    const r = await filaEnvios.processar(AGORA);
    expect(r).toEqual({ enviados: 1, pulados: 0, falhas: 0 });
    expect(repo.proximoVencido).toHaveBeenCalledWith('b1', AGORA, [], { semCampanhas: true });
    expect(repo.contarEnviadosDoLoteDesde).not.toHaveBeenCalled();
    expect(envio.sendWhatsAppMessage).toHaveBeenCalledWith('5583999990000', 'Oi', { businessId: 'b1', origin: 'retorno' });
  });

  it('cadenciasEmEnvio falha com 25 enviados na hora: vale o limite padrão, nada sai', async () => {
    repo.cadenciasEmEnvio.mockRejectedValue(new Error('banco'));
    repo.contarEnviadosDesde.mockResolvedValue(25);
    expect(await filaEnvios.processar(AGORA)).toEqual({ enviados: 0, pulados: 0, falhas: 0 });
    expect(repo.proximoVencido).not.toHaveBeenCalled();
  });

  it('contarEnviadosDoLoteDesde falha: limite volta ao padrão e as campanhas ficam de fora', async () => {
    repo.cadenciasEmEnvio.mockResolvedValue([{ id: 'L1', cadencia: 60 }]);
    repo.contarEnviadosDoLoteDesde.mockRejectedValue(new Error('banco'));
    repo.contarEnviadosDesde.mockResolvedValue(30);
    // 30 >= 25: com a campanha de 60/h fora da conta, nada sai.
    expect(await filaEnvios.processar(AGORA)).toEqual({ enviados: 0, pulados: 0, falhas: 0 });
    expect(repo.proximoVencido).not.toHaveBeenCalled();
    repo.contarEnviadosDesde.mockResolvedValue(3);
    expect(await filaEnvios.processar(AGORA)).toEqual({ enviados: 1, pulados: 0, falhas: 0 });
    expect(repo.proximoVencido).toHaveBeenCalledWith('b1', AGORA, [], { semCampanhas: true });
  });

  it('item de campanha de telefone em opt-out é pulado', async () => {
    repo.cadenciasEmEnvio.mockResolvedValue([{ id: 'L1', cadencia: 25 }]);
    repo.proximoVencido.mockResolvedValue(camp());
    rec.inboxRecorder.estaEmOptOutOuFalha.mockResolvedValue(true);
    const r = await filaEnvios.processar(AGORA);
    expect(r.pulados).toBe(1);
    expect(envio.sendWhatsAppMessage).not.toHaveBeenCalled();
    expect(repo.atualizar).toHaveBeenCalledWith('b1', 'e1', { status: 'pulado', reason: 'Pediu para não receber mensagens', sentAt: null });
  });
});

describe('agendamento vinculado', () => {
  const conf = (o: Record<string, unknown> = {}) => linha({ origin: 'confirmacao', appointmentId: 'a1', ...o });
  const AMANHA = new Date('2026-10-21T00:00:00Z');
  const ag = (o: Record<string, unknown> = {}) => ({
    status: 'confirmado', date: new Date('2026-10-20T00:00:00Z'), time: new Date('1970-01-01T15:00:00Z'), jaAvaliou: false, ...o,
  });

  it('confirmação de agendamento cancelado é pulada', async () => {
    repo.proximoVencido.mockResolvedValue(conf());
    repo.agendamentoParaEnvio.mockResolvedValue(ag({ status: 'cancelado' }));
    const r = await filaEnvios.processar(AGORA);
    expect(r.pulados).toBe(1);
    expect(envio.sendWhatsAppMessage).not.toHaveBeenCalled();
    expect(repo.atualizar).toHaveBeenCalledWith('b1', 'e1', { status: 'pulado', reason: 'Agendamento não está mais confirmado', sentAt: null });
  });

  it('confirmação cujo agendamento não existe é pulada', async () => {
    repo.proximoVencido.mockResolvedValue(conf());
    repo.agendamentoParaEnvio.mockResolvedValue(null);
    await filaEnvios.processar(AGORA);
    expect(repo.atualizar).toHaveBeenCalledWith('b1', 'e1', expect.objectContaining({ reason: 'Agendamento não está mais confirmado' }));
  });

  it('confirmação de horário que já passou é pulada', async () => {
    repo.proximoVencido.mockResolvedValue(conf());
    repo.agendamentoParaEnvio.mockResolvedValue(ag({ time: new Date('1970-01-01T11:00:00Z') })); // 11:00 local < 12:00
    const r = await filaEnvios.processar(AGORA);
    expect(r.pulados).toBe(1);
    expect(repo.atualizar).toHaveBeenCalledWith('b1', 'e1', { status: 'pulado', reason: 'Horário já passou', sentAt: null });
  });

  it('confirmação fora da véspera (fila atrasou para o próprio dia) é pulada', async () => {
    repo.proximoVencido.mockResolvedValue(conf());
    repo.agendamentoParaEnvio.mockResolvedValue(ag({ time: new Date('1970-01-01T18:00:00Z') })); // hoje 18:00, ainda não passou
    const r = await filaEnvios.processar(AGORA);
    expect(r.pulados).toBe(1);
    expect(envio.sendWhatsAppMessage).not.toHaveBeenCalled();
    expect(repo.atualizar).toHaveBeenCalledWith('b1', 'e1', { status: 'pulado', reason: 'Confirmação fora da véspera', sentAt: null });
  });

  it('confirmação com dois dias de antecedência ainda não é véspera: pulada', async () => {
    repo.proximoVencido.mockResolvedValue(conf());
    repo.agendamentoParaEnvio.mockResolvedValue(ag({ date: new Date('2026-10-22T00:00:00Z') }));
    await filaEnvios.processar(AGORA);
    expect(repo.atualizar).toHaveBeenCalledWith('b1', 'e1', expect.objectContaining({ reason: 'Confirmação fora da véspera' }));
  });

  it('lembrete na véspera: pula agendamento não confirmado, horário passado e fora da véspera; envia sem registrar espera', async () => {
    const lemb = () => conf({ origin: 'lembrete' });
    repo.proximoVencido.mockResolvedValue(lemb());
    repo.agendamentoParaEnvio.mockResolvedValue(ag({ status: 'cancelado', date: AMANHA }));
    await filaEnvios.processar(AGORA);
    expect(repo.atualizar).toHaveBeenLastCalledWith('b1', 'e1', { status: 'pulado', reason: 'Agendamento não está mais confirmado', sentAt: null });
    repo.agendamentoParaEnvio.mockResolvedValue(ag({ time: new Date('1970-01-01T11:00:00Z') }));
    await filaEnvios.processar(AGORA);
    expect(repo.atualizar).toHaveBeenLastCalledWith('b1', 'e1', { status: 'pulado', reason: 'Horário já passou', sentAt: null });
    repo.agendamentoParaEnvio.mockResolvedValue(ag({ time: new Date('1970-01-01T18:00:00Z') }));
    await filaEnvios.processar(AGORA);
    expect(repo.atualizar).toHaveBeenLastCalledWith('b1', 'e1', { status: 'pulado', reason: 'Lembrete fora da véspera', sentAt: null });
    expect(repo.desmarcarLembrete).toHaveBeenCalledTimes(1);
    expect(repo.desmarcarLembrete).toHaveBeenCalledWith('b1', 'a1');
    expect(envio.sendWhatsAppMessage).not.toHaveBeenCalled();
    repo.agendamentoParaEnvio.mockResolvedValue(ag({ date: AMANHA }));
    const r = await filaEnvios.processar(AGORA);
    expect(r.enviados).toBe(1);
    expect(envio.sendWhatsAppMessage).toHaveBeenCalledWith('5583999990000', 'Oi', { businessId: 'b1', origin: 'lembrete' });
    expect(resp.respostasRepository.registrar).not.toHaveBeenCalled();
  });

  it('lembrete na véspera que falha ao enviar volta a ficar pendente no agendamento', async () => {
    repo.proximoVencido.mockResolvedValue(conf({ origin: 'lembrete' }));
    repo.agendamentoParaEnvio.mockResolvedValue(ag({ date: AMANHA }));
    envio.sendWhatsAppMessage.mockResolvedValue(false);
    const r = await filaEnvios.processar(AGORA);
    expect(r.falhas).toBe(1);
    expect(repo.desmarcarLembrete).toHaveBeenCalledWith('b1', 'a1');
  });

  it('confirmação que falha não mexe no lembrete do agendamento', async () => {
    repo.proximoVencido.mockResolvedValue(conf());
    repo.agendamentoParaEnvio.mockResolvedValue(ag({ date: AMANHA }));
    envio.sendWhatsAppMessage.mockResolvedValue(false);
    await filaEnvios.processar(AGORA);
    expect(repo.desmarcarLembrete).not.toHaveBeenCalled();
  });

  it('confirmação enviada registra a espera de resposta por 24h', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    try {
      vi.setSystemTime(AGORA);
      repo.proximoVencido.mockResolvedValue(conf());
      repo.agendamentoParaEnvio.mockResolvedValue(ag({ date: AMANHA }));
      const r = await filaEnvios.processar(AGORA);
      expect(r.enviados).toBe(1);
      expect(resp.respostasRepository.registrar).toHaveBeenCalledWith({
        businessId: 'b1', phoneKey: '8399990000', tipo: 'confirmacao', appointmentId: 'a1',
        expiresAt: new Date(AGORA.getTime() + 24 * 3_600_000),
      });
    } finally { vi.useRealTimers(); }
  });

  it('falha ao registrar a espera não muda o status enviado', async () => {
    repo.proximoVencido.mockResolvedValue(conf());
    repo.agendamentoParaEnvio.mockResolvedValue(ag({ date: AMANHA }));
    resp.respostasRepository.registrar.mockRejectedValue(new Error('banco'));
    const r = await filaEnvios.processar(AGORA);
    expect(r.enviados).toBe(1);
    expect(repo.atualizar).toHaveBeenCalledWith('b1', 'e1', expect.objectContaining({ status: 'enviado' }));
  });

  it('avaliação de quem já avaliou é pulada; sem avaliação envia e registra a espera', async () => {
    repo.proximoVencido.mockResolvedValue(conf({ origin: 'avaliacao' }));
    repo.agendamentoParaEnvio.mockResolvedValue(ag({ jaAvaliou: true }));
    await filaEnvios.processar(AGORA);
    expect(repo.atualizar).toHaveBeenCalledWith('b1', 'e1', { status: 'pulado', reason: 'Já avaliou', sentAt: null });
    repo.atualizar.mockClear();
    repo.agendamentoParaEnvio.mockResolvedValue(ag());
    await filaEnvios.processar(AGORA);
    expect(resp.respostasRepository.registrar).toHaveBeenCalledWith(expect.objectContaining({ tipo: 'avaliacao' }));
  });

  it('enfileirar grava prioridade (padrão normal) e agendamento', async () => {
    repo.naFilaDoCliente.mockResolvedValue(null);
    repo.criar.mockResolvedValue(linha());
    await filaEnvios.enfileirar([{ businessId: 'b1', clientId: 'c1', phone: '5583999990000', body: 'Oi', origin: 'confirmacao', prioridade: 1, appointmentId: 'a1' }]);
    await filaEnvios.enfileirar([{ businessId: 'b1', clientId: 'c1', phone: '5583999990000', body: 'Oi', origin: 'retorno' }]);
    expect(repo.criar.mock.calls[0][0]).toMatchObject({ priority: 1, appointmentId: 'a1' });
    expect(repo.criar.mock.calls[1][0]).toMatchObject({ priority: 5, appointmentId: null });
  });
});

describe('previsoes', () => {
  it('posição na fila do negócio, último envio e fuso do negócio', async () => {
    repo.idsNaFila.mockResolvedValue(['a', 'b', 'c']);
    repo.ultimoEnviado.mockResolvedValue({ sentAt: new Date(AGORA.getTime() - 10_000), intervalAfterS: 60 });
    const m = await filaEnvios.previsoes('b1', 'America/Sao_Paulo', AGORA);
    // início = último + 60 s = 15:00:50Z; 75 s por posição
    expect(m.get('a')?.toISOString()).toBe('2026-10-20T15:00:50.000Z');
    expect(m.get('b')?.toISOString()).toBe('2026-10-20T15:02:05.000Z');
    expect(m.get('c')?.toISOString()).toBe('2026-10-20T15:03:20.000Z');
  });
  it('fora da janela, a previsão vai para as 08:00 do dia seguinte', async () => {
    repo.idsNaFila.mockResolvedValue(['a']);
    repo.ultimoEnviado.mockResolvedValue(null);
    const m = await filaEnvios.previsoes('b1', 'America/Sao_Paulo', new Date('2026-10-21T00:00:00Z')); // 21:00 local
    expect(m.get('a')?.toISOString()).toBe('2026-10-21T11:00:00.000Z');
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

describe('ultimosEnviadosPorCliente', () => {
  it('devolve a data do último enviado de cada cliente', async () => {
    repo.enviadosPorCliente.mockResolvedValue([
      linha({ id: 'a', clientId: 'c1', status: 'enviado', sentAt: new Date('2026-10-18T13:00:00Z') }),
      linha({ id: 'b', clientId: 'c1', status: 'enviado', sentAt: new Date('2026-10-10T13:00:00Z') }),
      linha({ id: 'c', clientId: 'c2', status: 'enviado', sentAt: new Date('2026-10-12T13:00:00Z') }),
    ]);
    const m = await filaEnvios.ultimosEnviadosPorCliente('b1', 'retorno', ['c1', 'c2', 'c3']);
    expect(m.get('c1')?.toISOString()).toBe('2026-10-18T13:00:00.000Z');
    expect(m.get('c2')?.toISOString()).toBe('2026-10-12T13:00:00.000Z');
    expect(m.has('c3')).toBe(false);
  });
});
