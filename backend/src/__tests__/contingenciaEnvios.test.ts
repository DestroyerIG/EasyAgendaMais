import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ORIGENS_NA_CARENCIA } from '../config/contingencia.js';

// Envios automáticos durante a contingência: a fila, as rotinas e o lembrete de 2 h param para
// conta bloqueada; na carência só saem as origens que cobram compromissos que já existiam.

const estado = vi.hoisted(() => ({ doNegocio: vi.fn() }));
const db = vi.hoisted(() => ({
  whatsappEnvio: { findFirst: vi.fn() },
  appointment: { findMany: vi.fn(), update: vi.fn() },
}));
const repo = vi.hoisted(() => ({
  negociosComVencidos: vi.fn(), ultimoEnviado: vi.fn(), contarEnviadosDesde: vi.fn(), cadenciasEmEnvio: vi.fn(),
  contarEnviadosDoLoteDesde: vi.fn(), proximoVencido: vi.fn(), reservar: vi.fn(), atualizar: vi.fn(), interromper: vi.fn(),
}));
const rotinasRepo = vi.hoisted(() => ({ negociosComRegraAtiva: vi.fn(), negocio: vi.fn() }));
const regras = vi.hoisted(() => ({ obter: vi.fn() }));
const wa = vi.hoisted(() => ({ getStatus: vi.fn() }));
const zap = vi.hoisted(() => ({ send: vi.fn() }));
const inbox = vi.hoisted(() => ({ estaEmOptOut: vi.fn(), estaEmOptOutOuFalha: vi.fn() }));
const gatRepo = vi.hoisted(() => ({
  vaga: vi.fn(), negocio: vi.fn(), nomeServico: vi.fn(), entradasCandidatas: vi.fn(), marcarOferecida: vi.fn(), desfazerOferta: vi.fn(),
}));
const log = vi.hoisted(() => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn(), fatal: vi.fn() }));

vi.mock('../modules/conta/estadoConta.service.js', () => ({ estadoContaService: estado }));
vi.mock('../config/prisma.js', () => ({ prisma: db }));
vi.mock('../utils/logger.js', () => ({ default: log }));
vi.mock('../modules/whatsappFila/fila.repository.js', () => ({ filaRepository: repo }));
vi.mock('../modules/whatsappAutomacoes/rotinas.repository.js', () => ({ rotinasRepository: rotinasRepo }));
vi.mock('../modules/whatsappAutomacoes/automacoes.service.js', () => ({ automacoes: regras }));
vi.mock('../modules/whatsappAutomacoes/gatilhos.repository.js', () => ({ gatilhosRepository: gatRepo }));
vi.mock('../modules/whatsapp/whatsapp.service.js', () => ({ whatsappService: wa }));
vi.mock('../modules/whatsappInbox/inbox.recorder.js', () => ({ inboxRecorder: inbox }));
vi.mock('../services/whatsapp/whatsappMessageService.js', () => ({ sendWhatsAppMessage: zap.send }));
vi.mock('../services/whatsapp/index.js', () => ({ sendWhatsAppMessage: zap.send }));
vi.mock('../services/scheduleSettingsService.js', () => ({
  getBusinessScheduleSettings: vi.fn(async () => ({ timezone: 'America/Sao_Paulo' })),
}));
vi.mock('../repositories/subscriptionRepository.js', () => ({ subscriptionRepository: { expireOneTimeSubscriptions: vi.fn() } }));

const { filaEnvios } = await import('../modules/whatsappFila/fila.service.js');
const { filaRepository: repoReal } = await vi.importActual<typeof import('../modules/whatsappFila/fila.repository.js')>(
  '../modules/whatsappFila/fila.repository.js',
);
const { automacoesRotinas, limparTravasDiarias } = await import('../modules/whatsappAutomacoes/rotinas.service.js');
const { runReminderJob } = await import('../services/cronService.js');
const { automacoesGatilhos } = await import('../modules/whatsappAutomacoes/gatilhos.service.js');
const { podeEnviarOrigem } = await import('../modules/conta/estadoConta.rules.js');

const AGORA = new Date('2026-10-20T15:00:00Z'); // 12:00 em São Paulo

const ATIVA = { tipo: 'ativa' } as const;
const CARENCIA = { tipo: 'carencia', desde: new Date('2026-10-18T00:00:00Z'), ate: new Date('2026-10-25T00:00:00Z'), diasRestantes: 5 } as const;
const BLOQUEADA = { tipo: 'bloqueada', motivo: 'cobranca' } as const;
const porNegocio: Record<string, unknown> = { bAtiva: ATIVA, bCarencia: CARENCIA, bBloqueada: BLOQUEADA };

beforeEach(() => {
  vi.clearAllMocks();
  limparTravasDiarias();
  estado.doNegocio.mockImplementation(async (id: string) => {
    if (id === 'bErro') throw new Error('banco fora');
    return porNegocio[id] ?? ATIVA;
  });
  repo.interromper.mockResolvedValue(0);
  repo.ultimoEnviado.mockResolvedValue(null);
  repo.contarEnviadosDesde.mockResolvedValue(0);
  repo.cadenciasEmEnvio.mockResolvedValue([]);
  repo.contarEnviadosDoLoteDesde.mockResolvedValue(new Map());
  repo.proximoVencido.mockResolvedValue(null);
  wa.getStatus.mockResolvedValue({ status: 'connected' });
  regras.obter.mockResolvedValue({ ativa: false, config: {}, texto: '' });
  rotinasRepo.negociosComRegraAtiva.mockResolvedValue(['bAtiva', 'bCarencia', 'bBloqueada', 'bErro']);
  rotinasRepo.negocio.mockResolvedValue({ nome: 'Studio', slug: null, endereco: null });
  inbox.estaEmOptOut.mockResolvedValue(false);
  zap.send.mockResolvedValue(true);
  db.appointment.update.mockResolvedValue({});
  db.whatsappEnvio.findFirst.mockResolvedValue(null);
});

describe('fila: processar por estado da conta', () => {
  it('bloqueada: não procura item na fila nem envia', async () => {
    repo.negociosComVencidos.mockResolvedValue(['bBloqueada']);
    const r = await filaEnvios.processar(AGORA);
    expect(r).toEqual({ enviados: 0, pulados: 0, falhas: 0 });
    expect(repo.proximoVencido).not.toHaveBeenCalled();
    expect(repo.reservar).not.toHaveBeenCalled();
    expect(repo.atualizar).not.toHaveBeenCalled();
    expect(zap.send).not.toHaveBeenCalled();
  });

  it('carência: procura só as origens liberadas na carência', async () => {
    repo.negociosComVencidos.mockResolvedValue(['bCarencia']);
    await filaEnvios.processar(AGORA);
    expect(repo.proximoVencido).toHaveBeenCalledTimes(1);
    expect(repo.proximoVencido.mock.calls[0][3]).toEqual({ semCampanhas: false, apenasOrigens: [...ORIGENS_NA_CARENCIA] });
  });

  it('ativa: procura sem filtro de origem', async () => {
    repo.negociosComVencidos.mockResolvedValue(['bAtiva']);
    await filaEnvios.processar(AGORA);
    expect(repo.proximoVencido).toHaveBeenCalledTimes(1);
    expect(repo.proximoVencido.mock.calls[0][3]).toEqual({ semCampanhas: false });
  });

  it('estado ilegível: pula o negócio nesta rodada (nunca envia às cegas) e segue com os outros', async () => {
    repo.negociosComVencidos.mockResolvedValue(['bErro', 'bAtiva']);
    await filaEnvios.processar(AGORA);
    expect(repo.proximoVencido).toHaveBeenCalledTimes(1);
    expect(repo.proximoVencido.mock.calls[0][0]).toBe('bAtiva');
    expect(log.warn).toHaveBeenCalledWith(expect.objectContaining({ businessId: 'bErro' }), expect.any(String));
  });
});

describe('fila: proximoVencido com apenasOrigens', () => {
  const base = { businessId: 'b1', status: 'na_fila', scheduledFor: { lte: AGORA } };

  it('monta origin in junto com o filtro de lote', async () => {
    await repoReal.proximoVencido('b1', AGORA, ['L1'], { apenasOrigens: ['lembrete', 'clube'] });
    expect(db.whatsappEnvio.findFirst.mock.calls[0][0].where).toEqual({
      ...base, origin: { in: ['lembrete', 'clube'] }, OR: [{ batchId: null }, { batchId: { notIn: ['L1'] } }],
    });
  });

  it('com semCampanhas, junta as duas condições na mesma chave origin', async () => {
    await repoReal.proximoVencido('b1', AGORA, [], { semCampanhas: true, apenasOrigens: ['lembrete', 'campanha'] });
    expect(db.whatsappEnvio.findFirst.mock.calls[0][0].where).toEqual({
      ...base, origin: { in: ['lembrete', 'campanha'], not: 'campanha' },
    });
  });

  it('sem apenasOrigens o filtro antigo não muda', async () => {
    await repoReal.proximoVencido('b1', AGORA, [], { semCampanhas: true });
    await repoReal.proximoVencido('b1', AGORA);
    expect(db.whatsappEnvio.findFirst.mock.calls[0][0].where).toEqual({ ...base, origin: { not: 'campanha' } });
    expect(db.whatsappEnvio.findFirst.mock.calls[1][0].where).toEqual(base);
  });
});

describe('rotinas por estado da conta', () => {
  const rodou = () => regras.obter.mock.calls.map((c) => c[0]);

  // Rotina -> origem que ela grava na fila. Liberada na carência só se a origem está em ORIGENS_NA_CARENCIA.
  const casos = [
    { rotina: 'confirmacoes', origem: 'confirmacao' },
    { rotina: 'lembretesVespera', origem: 'lembrete' },
    { rotina: 'radarRetorno', origem: 'retorno' },
    { rotina: 'aniversarios', origem: 'aniversario' },
  ] as const;

  it('toda rotina exportada está classificada', () => {
    expect(Object.keys(automacoesRotinas).sort()).toEqual(casos.map((c) => c.rotina).sort());
  });

  it('confirmacoes e lembretesVespera rodam na carência', () => {
    expect(ORIGENS_NA_CARENCIA).toContain('confirmacao');
    expect(ORIGENS_NA_CARENCIA).toContain('lembrete');
  });

  for (const { rotina, origem } of casos) {
    const naCarencia = (ORIGENS_NA_CARENCIA as readonly string[]).includes(origem);
    it(`${rotina} (${origem}): ${naCarencia ? 'roda' : 'pula'} na carência, pula a bloqueada e a de estado ilegível`, async () => {
      await automacoesRotinas[rotina](AGORA);
      expect(rodou()).toEqual(naCarencia ? ['bAtiva', 'bCarencia'] : ['bAtiva']);
    });
  }

  it('radarRetorno e aniversarios pulam a carência', async () => {
    await automacoesRotinas.radarRetorno(AGORA);
    await automacoesRotinas.aniversarios(AGORA);
    expect(rodou()).not.toContain('bCarencia');
    expect(rodou()).not.toContain('bBloqueada');
  });

  it('estado ilegível registra aviso', async () => {
    await automacoesRotinas.confirmacoes(AGORA);
    expect(log.warn).toHaveBeenCalledWith(expect.objectContaining({ businessId: 'bErro' }), expect.any(String));
  });
});

describe('lembrete de 2 h por estado da conta', () => {
  const ag = (id: string, businessId: string) => ({
    id, businessId, time: new Date('1970-01-01T14:00:00.000Z'),
    client: { phone: '5583999990000', name: 'Mariana', consents: [] },
    service: { name: 'Gel' }, professional: { name: 'Paula' },
  });

  beforeEach(() => {
    rotinasRepo.negociosComRegraAtiva.mockResolvedValue([]); // a véspera, que roda depois, não interessa aqui
    regras.obter.mockResolvedValue({ ativa: true, config: { modo: '2h' }, texto: 'Oi {nome}' });
  });

  it('envia o da carência e o da ativa; não envia o da bloqueada nem o de estado ilegível', async () => {
    db.appointment.findMany.mockResolvedValue([
      ag('a1', 'bCarencia'), ag('a2', 'bBloqueada'), ag('a3', 'bAtiva'), ag('a4', 'bErro'),
    ]);
    await runReminderJob(AGORA);
    const negocios = zap.send.mock.calls.map((c) => c[2].businessId);
    expect(negocios).toEqual(['bCarencia', 'bAtiva']);
    expect(db.appointment.update).toHaveBeenCalledTimes(2);
    expect(db.appointment.update).not.toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'a2' } }));
    expect(log.warn).toHaveBeenCalledWith(expect.objectContaining({ businessId: 'bErro' }), expect.any(String));
  });
});

describe('podeEnviarOrigem: regra única dos envios automáticos', () => {
  it('ativa envia qualquer origem; bloqueada nenhuma; carência só as de ORIGENS_NA_CARENCIA', () => {
    for (const origem of ['lembrete', 'confirmacao', 'pix_recibo', 'sinal_pix', 'clube', 'lista_espera', 'retorno', 'aniversario', 'avaliacao', 'campanha']) {
      expect(podeEnviarOrigem(ATIVA, origem)).toBe(true);
      expect(podeEnviarOrigem(BLOQUEADA, origem)).toBe(false);
      expect(podeEnviarOrigem(CARENCIA, origem)).toBe((ORIGENS_NA_CARENCIA as readonly string[]).includes(origem));
    }
  });
});

describe('gatilhos por estado da conta', () => {
  beforeEach(() => {
    regras.obter.mockResolvedValue({ ativa: true, texto: 'Vaga {horario}', config: { quantas: 3 } });
    gatRepo.vaga.mockResolvedValue({ data: '2026-10-23', hora: '14:00', serviceId: 's1', professionalId: 'p1', duracao: 60, profissional: 'Camila', clientId: 'cx' });
    gatRepo.negocio.mockResolvedValue({ nome: 'Studio', slug: null });
    gatRepo.nomeServico.mockResolvedValue('Gel');
    gatRepo.entradasCandidatas.mockResolvedValue([{
      id: 'e1', clientId: 'c1', nome: 'Ana Silva', phone: '83999990001', serviceId: 's1', professionalId: null,
      desiredDate: null, period: 'qualquer', duracaoServico: 60, consentimentoRevogado: false,
    }]);
    gatRepo.marcarOferecida.mockResolvedValue(true);
  });

  it('aoCancelar (lista_espera): avisa na ativa', async () => {
    expect(await automacoesGatilhos.aoCancelar('bAtiva', 'ag1', AGORA)).toBe(1);
    expect(zap.send).toHaveBeenCalledTimes(1);
  });

  it.each(['bCarencia', 'bBloqueada', 'bErro'])('aoCancelar (lista_espera): não avisa em %s nem reserva a entrada', async (b) => {
    expect(await automacoesGatilhos.aoCancelar(b, 'ag1', AGORA)).toBe(0);
    expect(zap.send).not.toHaveBeenCalled();
    expect(gatRepo.marcarOferecida).not.toHaveBeenCalled();
  });

  it('aoCancelar com estado ilegível registra aviso', async () => {
    await automacoesGatilhos.aoCancelar('bErro', 'ag1', AGORA);
    expect(log.warn).toHaveBeenCalledWith(expect.objectContaining({ businessId: 'bErro' }), expect.any(String));
  });

  const sinal = { phone: '83999990001', nome: 'Ana', servico: 'Gel', valorSinal: 20, pixPayload: 'pix', data: '23/10', horario: '14:00', toleranciaMin: 15 };

  it.each([['bAtiva', true], ['bCarencia', true], ['bBloqueada', false], ['bErro', false]] as const)(
    'aoCriarReservaComSinal (sinal_pix) em %s envia: %s', async (b, envia) => {
      regras.obter.mockResolvedValue({ ativa: true, texto: 'Pix {valor_sinal}', config: {} });
      expect(await automacoesGatilhos.aoCriarReservaComSinal(b, 'ag1', sinal)).toBe(envia);
      expect(zap.send).toHaveBeenCalledTimes(envia ? 1 : 0);
    },
  );
});
