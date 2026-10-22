import { describe, it, expect, vi, beforeEach } from 'vitest';

const regras = vi.hoisted(() => ({ obter: vi.fn() }));
const repo = vi.hoisted(() => ({
  negociosComRegraAtiva: vi.fn(), negocio: vi.fn(), agendamentosDoDia: vi.fn(), marcarConfirmacaoEnviada: vi.fn(),
  marcarLembreteEnviado: vi.fn(), aniversariantesDoDia: vi.fn(), clientesComEnvioDesde: vi.fn(), existeLote: vi.fn(),
}));
const fila = vi.hoisted(() => ({ enfileirar: vi.fn() }));
const retorno = vi.hoisted(() => ({ listarParaRotina: vi.fn() }));
const inbox = vi.hoisted(() => ({ estaEmOptOut: vi.fn() }));
const zap = vi.hoisted(() => ({ send: vi.fn() }));
const settings = vi.hoisted(() => ({ get: vi.fn() }));

vi.mock('../utils/logger.js', () => ({ default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }));
vi.mock('../modules/whatsappAutomacoes/automacoes.service.js', () => ({ automacoes: regras }));
vi.mock('../modules/whatsappAutomacoes/rotinas.repository.js', () => ({ rotinasRepository: repo }));
vi.mock('../modules/whatsappFila/fila.service.js', () => ({ filaEnvios: fila }));
vi.mock('../modules/whatsappRetorno/retorno.service.js', () => ({ retornoService: retorno }));
vi.mock('../modules/whatsappInbox/inbox.recorder.js', () => ({ inboxRecorder: inbox }));
vi.mock('../services/whatsapp/whatsappMessageService.js', () => ({ sendWhatsAppMessage: zap.send }));
vi.mock('../services/scheduleSettingsService.js', () => ({ getBusinessScheduleSettings: settings.get }));

const { automacoesRotinas, limparTravasDiarias } = await import('../modules/whatsappAutomacoes/rotinas.service.js');

/** Hoje é 2026-10-21 em São Paulo (UTC-3). */
const local = (hhmm: string) => new Date(`2026-10-21T${hhmm}:00-03:00`);

const ag = (id: string, over: Record<string, unknown> = {}) => ({
  id, clientId: `c${id}`, nome: 'Mariana Souza', phone: `8399999000${id}`, servico: 'Gel', profissional: 'Camila',
  hora: '14:00', createdAt: new Date('2026-10-10T12:00:00Z'), consentimentoRevogado: false, ...over,
});

const dto = (over: Record<string, unknown>) => ({ id: 'e1', clientId: 'c1', appointmentId: null, status: 'na_fila', ...over });

beforeEach(() => {
  vi.resetAllMocks();
  limparTravasDiarias();
  delete process.env.FRONTEND_URL;
  settings.get.mockResolvedValue({ timezone: 'America/Sao_Paulo' });
  repo.negociosComRegraAtiva.mockResolvedValue(['b1']);
  repo.negocio.mockResolvedValue({ nome: 'Studio Aurora', slug: 'aurora', endereco: 'Rua das Flores, 123' });
  repo.marcarConfirmacaoEnviada.mockResolvedValue(true);
  repo.clientesComEnvioDesde.mockResolvedValue(new Set());
  repo.existeLote.mockResolvedValue(false);
  inbox.estaEmOptOut.mockResolvedValue(false);
  zap.send.mockResolvedValue(true);
  fila.enfileirar.mockImplementation(async (itens: Array<{ clientId: string; appointmentId?: string }>) =>
    itens.map((i, n) => dto({ id: `e${n}`, clientId: i.clientId, appointmentId: i.appointmentId ?? null })));
});

describe('confirmacoes', () => {
  beforeEach(() => {
    regras.obter.mockResolvedValue({ ativa: true, texto: 'Oi {primeiro_nome}! {servico} {data} às {horario} com {profissional}.', config: { hora: '09:00' } });
    repo.agendamentosDoDia.mockResolvedValue([ag('1')]);
  });

  it('antes da hora configurada (08:59 locais): 0 e nada enfileirado', async () => {
    expect(await automacoesRotinas.confirmacoes(local('08:59'))).toBe(0);
    expect(fila.enfileirar).not.toHaveBeenCalled();
  });

  it('às 09:05 locais: enfileira com prioridade 1 e grava confirmationSentAt', async () => {
    const agora = local('09:05');
    expect(await automacoesRotinas.confirmacoes(agora)).toBe(1);
    expect(repo.agendamentosDoDia).toHaveBeenCalledWith('b1', '2026-10-22', 'confirmacao');
    expect(fila.enfileirar).toHaveBeenCalledWith([{
      businessId: 'b1', clientId: 'c1', phone: '83999990001', body: 'Oi Mariana! Gel amanhã às 14:00 com Camila.',
      origin: 'confirmacao', agendadoPara: agora, prioridade: 1, appointmentId: '1',
    }]);
    expect(repo.marcarConfirmacaoEnviada).toHaveBeenCalledWith('b1', '1', agora);
  });

  it('às 22:00 locais (01:00Z do dia seguinte), amanhã é o dia local seguinte', async () => {
    const agora = local('22:00');
    expect(agora.toISOString()).toBe('2026-10-22T01:00:00.000Z');
    expect(await automacoesRotinas.confirmacoes(agora)).toBe(1);
    expect(repo.agendamentosDoDia).toHaveBeenCalledWith('b1', '2026-10-22', 'confirmacao');
  });

  it('agendamento criado 3h antes do horário: não enfileira', async () => {
    repo.agendamentosDoDia.mockResolvedValue([ag('1', { createdAt: new Date('2026-10-22T14:00:00Z') })]); // 11:00 locais de amanhã
    expect(await automacoesRotinas.confirmacoes(local('09:05'))).toBe(0);
    expect(fila.enfileirar).not.toHaveBeenCalled();
  });

  it('a fila devolveu o item de outro agendamento da cliente: não grava', async () => {
    fila.enfileirar.mockResolvedValue([dto({ appointmentId: 'outro' })]);
    expect(await automacoesRotinas.confirmacoes(local('09:05'))).toBe(0);
    expect(repo.marcarConfirmacaoEnviada).not.toHaveBeenCalled();
  });

  it('regra desligada: nada', async () => {
    regras.obter.mockResolvedValue({ ativa: false, texto: 'x', config: { hora: '09:00' } });
    expect(await automacoesRotinas.confirmacoes(local('10:00'))).toBe(0);
    expect(repo.agendamentosDoDia).not.toHaveBeenCalled();
  });
});

describe('aniversarios', () => {
  beforeEach(() => {
    regras.obter.mockResolvedValue({ ativa: true, texto: 'Parabéns, {primeiro_nome}! {presente}\nAgende: {link}', config: { presente: 'R$ 20 OFF' } });
    repo.aniversariantesDoDia.mockResolvedValue([
      { id: 'c1', nome: 'Ana Lima', phone: '83911110001', birthDate: new Date('1990-10-21T00:00:00Z') },
      { id: 'c2', nome: 'Bia Melo', phone: '83911110002', birthDate: new Date('1992-10-21T00:00:00Z') },
      { id: 'c3', nome: 'Carla Dias', phone: '83911110003', birthDate: new Date('1992-10-22T00:00:00Z') },
    ]);
  });

  it('antes das 08:00 locais: nada', async () => {
    expect(await automacoesRotinas.aniversarios(local('07:59'))).toBe(0);
    expect(fila.enfileirar).not.toHaveBeenCalled();
  });

  it('quem já recebeu aniversário neste ano não entra de novo', async () => {
    repo.clientesComEnvioDesde.mockResolvedValue(new Set(['c1']));
    const agora = local('08:10');
    expect(await automacoesRotinas.aniversarios(agora)).toBe(1);
    const [, origem, desde, ids] = repo.clientesComEnvioDesde.mock.calls[0];
    expect(origem).toBe('aniversario');
    expect(desde).toEqual(new Date('2026-01-01T03:00:00Z'));
    expect(ids).toEqual(['c1', 'c2']);
    expect(fila.enfileirar).toHaveBeenCalledWith([{
      businessId: 'b1', clientId: 'c2', phone: '83911110002', origin: 'aniversario', prioridade: 5, agendadoPara: agora,
      body: 'Parabéns, Bia! R$ 20 OFF',
    }]);
  });
});

describe('aniversarios: filtro no banco e trava diária', () => {
  beforeEach(() => {
    regras.obter.mockResolvedValue({ ativa: true, texto: 'Parabéns, {primeiro_nome}!', config: { presente: 'R$ 20 OFF' } });
    repo.aniversariantesDoDia.mockResolvedValue([]);
  });

  it('pede ao banco o mês e o dia locais', async () => {
    await automacoesRotinas.aniversarios(local('08:10'));
    expect(repo.aniversariantesDoDia).toHaveBeenCalledWith('b1', 10, 21, false);
  });

  it('28/02 de ano não bissexto inclui quem nasceu em 29/02', async () => {
    repo.aniversariantesDoDia.mockResolvedValue([{ id: 'c1', nome: 'Ana', phone: '83911110001', birthDate: new Date('2000-02-29T00:00:00Z') }]);
    expect(await automacoesRotinas.aniversarios(new Date('2027-02-28T12:00:00Z'))).toBe(1);
    expect(repo.aniversariantesDoDia).toHaveBeenCalledWith('b1', 2, 28, true);
  });

  it('depois de uma rodada completa, não consulta de novo no mesmo dia', async () => {
    await automacoesRotinas.aniversarios(local('08:10'));
    await automacoesRotinas.aniversarios(local('08:25'));
    expect(repo.aniversariantesDoDia).toHaveBeenCalledTimes(1);
    await automacoesRotinas.aniversarios(new Date('2026-10-22T11:10:00Z'));
    expect(repo.aniversariantesDoDia).toHaveBeenCalledTimes(2);
  });

  it('rodada com erro não trava o dia', async () => {
    repo.aniversariantesDoDia.mockRejectedValueOnce(new Error('banco'));
    expect(await automacoesRotinas.aniversarios(local('08:10'))).toBe(0);
    await automacoesRotinas.aniversarios(local('08:25'));
    expect(repo.aniversariantesDoDia).toHaveBeenCalledTimes(2);
  });
});

describe('radarRetorno', () => {
  const AGORA = local('09:30');
  const op = (n: number, over: Record<string, unknown> = {}) => ({
    cliente: { id: `c${n}`, nome: `Cliente${n} Silva`, telefone: `839999${String(n).padStart(5, '0')}`, avatarUrl: null },
    servico: 'Gel', profissional: 'Camila', ultimaVisitaHaDias: 30, podeReceber: true, ultimoConviteEm: null, envio: null,
    encaixes: [{ longo: 'Quinta-feira (22/out) às 14:00' }, { longo: 'Sexta-feira (23/out) às 10:00' }], ...over,
  });
  const lista = (itens: unknown[]) => ({ itens, linkAgendamento: 'https://app/agendar/aurora', negocioNome: 'Studio Aurora' });

  beforeEach(() => {
    regras.obter.mockResolvedValue({
      ativa: true, texto: 'Oi {primeiro_nome}! {dias} dias do {ultimo_servico}. {horarios_livres}. {link_agenda}',
      config: { modo: 'ciclo', dias: 21 },
    });
    retorno.listarParaRotina.mockResolvedValue(lista([op(1)]));
  });

  it('monta o texto da regra com encaixes e link, origem retorno', async () => {
    expect(await automacoesRotinas.radarRetorno(AGORA)).toBe(1);
    const [[itens]] = fila.enfileirar.mock.calls;
    expect(itens[0]).toMatchObject({
      businessId: 'b1', clientId: 'c1', origin: 'retorno', prioridade: 5,
      body: 'Oi Cliente1! 30 dias do Gel. Quinta-feira (22/out) às 14:00 ou Sexta-feira (23/out) às 10:00. https://app/agendar/aurora',
    });
  });

  it('antes das 09:00 locais: nada', async () => {
    expect(await automacoesRotinas.radarRetorno(local('08:59'))).toBe(0);
    expect(retorno.listarParaRotina).not.toHaveBeenCalled();
  });

  it('rodando duas vezes no mesmo dia, a segunda não enfileira', async () => {
    const lotes = new Set<string>();
    repo.existeLote.mockImplementation(async (_b: string, lote: string) => lotes.has(lote));
    fila.enfileirar.mockImplementation(async (itens: Array<{ clientId: string; loteId: string }>) => {
      for (const i of itens) lotes.add(i.loteId);
      return itens.map((i) => dto({ clientId: i.clientId }));
    });
    expect(await automacoesRotinas.radarRetorno(AGORA)).toBe(1);
    expect(await automacoesRotinas.radarRetorno(local('09:45'))).toBe(0);
    expect(fila.enfileirar).toHaveBeenCalledTimes(1);
    // No dia seguinte o lote é outro.
    expect(await automacoesRotinas.radarRetorno(new Date('2026-10-22T12:30:00Z'))).toBe(1);
  });

  it('sem elegíveis, trava o dia: a lista não é remontada', async () => {
    retorno.listarParaRotina.mockResolvedValue(lista([]));
    expect(await automacoesRotinas.radarRetorno(AGORA)).toBe(0);
    expect(await automacoesRotinas.radarRetorno(local('09:45'))).toBe(0);
    expect(retorno.listarParaRotina).toHaveBeenCalledTimes(1);
  });

  it('erro na montagem da lista não trava o dia', async () => {
    retorno.listarParaRotina.mockRejectedValueOnce(new Error('crm'));
    expect(await automacoesRotinas.radarRetorno(AGORA)).toBe(0);
    expect(await automacoesRotinas.radarRetorno(local('09:45'))).toBe(1);
  });

  it('40 elegíveis: enfileira 30', async () => {
    retorno.listarParaRotina.mockResolvedValue(lista(Array.from({ length: 40 }, (_, i) => op(i + 1))));
    expect(await automacoesRotinas.radarRetorno(AGORA)).toBe(30);
    expect(fila.enfileirar.mock.calls[0][0]).toHaveLength(30);
  });

  it('tira quem não pode receber, quem já está na fila e quem recebeu retorno nos últimos 30 dias', async () => {
    retorno.listarParaRotina.mockResolvedValue(lista([
      op(1, { podeReceber: false }),
      op(2, { envio: { status: 'na_fila' } }),
      op(3, { ultimoConviteEm: new Date(AGORA.getTime() - 10 * 86_400_000).toISOString() }),
      op(4, { ultimoConviteEm: new Date(AGORA.getTime() - 31 * 86_400_000).toISOString() }),
    ]));
    expect(await automacoesRotinas.radarRetorno(AGORA)).toBe(1);
    expect(fila.enfileirar.mock.calls[0][0].map((i: { clientId: string }) => i.clientId)).toEqual(['c4']);
  });

  it('modo ciclo: lista da Hora de voltar sem mínimo de dias', async () => {
    await automacoesRotinas.radarRetorno(AGORA);
    expect(retorno.listarParaRotina).toHaveBeenCalledWith('b1', AGORA, {});
  });

  it('modo dias: pede a lista por dias sem vir (em vez do ciclo) e confere >= config.dias', async () => {
    regras.obter.mockResolvedValue({ ativa: true, texto: 'x', config: { modo: 'dias', dias: 45 } });
    await automacoesRotinas.radarRetorno(AGORA);
    expect(retorno.listarParaRotina).toHaveBeenCalledWith('b1', AGORA, { minDiasSemVir: 45 });
    limparTravasDiarias();
    fila.enfileirar.mockClear();
    retorno.listarParaRotina.mockResolvedValue(lista([op(1, { ultimaVisitaHaDias: 44 }), op(2, { ultimaVisitaHaDias: 45 })]));
    expect(await automacoesRotinas.radarRetorno(AGORA)).toBe(1);
    expect(fila.enfileirar.mock.calls[0][0][0].clientId).toBe('c2');
  });
});

describe('lembretesVespera', () => {
  beforeEach(() => {
    regras.obter.mockResolvedValue({
      ativa: true, texto: 'Seu horário amanhã é às {horario}. Estamos na {endereco}. Trajeto: {link_mapa}', config: { modo: 'vespera', hora: '18:00' },
    });
    repo.agendamentosDoDia.mockResolvedValue([ag('1')]);
    repo.marcarLembreteEnviado.mockResolvedValue(true);
  });

  it('às 18:00 locais enfileira (prioridade 1, agendamento) com endereço e mapa e marca reminderSent', async () => {
    const agora = local('18:00');
    expect(await automacoesRotinas.lembretesVespera(agora)).toBe(1);
    expect(repo.negociosComRegraAtiva).toHaveBeenCalledWith('lembrete');
    expect(repo.agendamentosDoDia).toHaveBeenCalledWith('b1', '2026-10-22', 'lembrete');
    expect(fila.enfileirar).toHaveBeenCalledWith([{
      businessId: 'b1', clientId: 'c1', phone: '83999990001',
      body: 'Seu horário amanhã é às 14:00. Estamos na Rua das Flores, 123. Trajeto: https://www.google.com/maps/search/?api=1&query=Rua%20das%20Flores%2C%20123',
      origin: 'lembrete', agendadoPara: agora, prioridade: 1, appointmentId: '1',
    }]);
    expect(zap.send).not.toHaveBeenCalled();
    expect(repo.marcarLembreteEnviado).toHaveBeenCalledWith('b1', '1');
  });

  it('às 17:59 locais: nada', async () => {
    expect(await automacoesRotinas.lembretesVespera(local('17:59'))).toBe(0);
    expect(fila.enfileirar).not.toHaveBeenCalled();
  });

  it('regra desligada: nada', async () => {
    regras.obter.mockResolvedValue({ ativa: false, texto: 'x', config: { modo: 'vespera', hora: '18:00' } });
    expect(await automacoesRotinas.lembretesVespera(local('19:00'))).toBe(0);
    expect(fila.enfileirar).not.toHaveBeenCalled();
    expect(repo.marcarLembreteEnviado).not.toHaveBeenCalled();
  });

  it('modo 2h: a véspera não enfileira', async () => {
    regras.obter.mockResolvedValue({ ativa: true, texto: 'x', config: { modo: '2h', hora: '18:00' } });
    expect(await automacoesRotinas.lembretesVespera(local('19:00'))).toBe(0);
    expect(fila.enfileirar).not.toHaveBeenCalled();
  });

  it('opt-out e consentimento ficam com a fila (que pula com motivo): todos são enfileirados uma vez', async () => {
    repo.agendamentosDoDia.mockResolvedValue([ag('1'), ag('2', { consentimentoRevogado: true })]);
    expect(await automacoesRotinas.lembretesVespera(local('18:30'))).toBe(2);
    expect(fila.enfileirar).toHaveBeenCalledTimes(2);
    expect(inbox.estaEmOptOut).not.toHaveBeenCalled();
    expect(repo.marcarLembreteEnviado.mock.calls).toEqual([['b1', '1'], ['b1', '2']]);
  });

  it('a fila devolveu o item de outro agendamento da cliente: não marca (tenta na próxima rodada)', async () => {
    fila.enfileirar.mockResolvedValue([dto({ appointmentId: 'outro' })]);
    expect(await automacoesRotinas.lembretesVespera(local('18:00'))).toBe(0);
    expect(repo.marcarLembreteEnviado).not.toHaveBeenCalled();
  });

  it('erro ao enfileirar um não para os outros', async () => {
    repo.agendamentosDoDia.mockResolvedValue([ag('1'), ag('2')]);
    fila.enfileirar.mockRejectedValueOnce(new Error('banco'));
    expect(await automacoesRotinas.lembretesVespera(local('18:00'))).toBe(1);
    expect(repo.marcarLembreteEnviado.mock.calls).toEqual([['b1', '2']]);
  });

  it('negócio sem endereço: a linha do endereço some', async () => {
    regras.obter.mockResolvedValue({
      ativa: true, texto: 'Amanhã às {horario}.\nEstamos na {endereco}.\nMapa: {link_mapa}', config: { modo: 'vespera', hora: '18:00' },
    });
    repo.negocio.mockResolvedValue({ nome: 'Studio Aurora', slug: null, endereco: null });
    await automacoesRotinas.lembretesVespera(local('18:00'));
    expect(fila.enfileirar.mock.calls[0][0][0].body).toBe('Amanhã às 14:00.');
  });
});
