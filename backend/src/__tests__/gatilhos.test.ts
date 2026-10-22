import { describe, it, expect, vi, beforeEach } from 'vitest';

const regras = vi.hoisted(() => ({ obter: vi.fn() }));
const repo = vi.hoisted(() => ({
  vaga: vi.fn(), negocio: vi.fn(), nomeServico: vi.fn(), entradasCandidatas: vi.fn(),
  marcarOferecida: vi.fn(), desfazerOferta: vi.fn(), temAvaliacao: vi.fn(), agendamentoParaAvaliacao: vi.fn(),
}));
const zap = vi.hoisted(() => ({ getStatus: vi.fn(), send: vi.fn() }));
const inbox = vi.hoisted(() => ({ estaEmOptOut: vi.fn() }));
const fila = vi.hoisted(() => ({ enfileirar: vi.fn() }));
const settings = vi.hoisted(() => ({ get: vi.fn() }));

vi.mock('../modules/whatsappAutomacoes/automacoes.service.js', () => ({ automacoes: regras }));
vi.mock('../modules/whatsappAutomacoes/gatilhos.repository.js', () => ({ gatilhosRepository: repo }));
vi.mock('../modules/whatsapp/whatsapp.service.js', () => ({ whatsappService: { getStatus: zap.getStatus } }));
vi.mock('../services/whatsapp/whatsappMessageService.js', () => ({ sendWhatsAppMessage: zap.send }));
vi.mock('../modules/whatsappInbox/inbox.recorder.js', () => ({ inboxRecorder: inbox }));
vi.mock('../modules/whatsappFila/fila.service.js', () => ({ filaEnvios: fila }));
vi.mock('../services/scheduleSettingsService.js', () => ({ getBusinessScheduleSettings: settings.get }));

const { automacoesGatilhos } = await import('../modules/whatsappAutomacoes/gatilhos.service.js');

const AGORA = new Date('2026-10-21T13:00:00Z'); // 10:00 em São Paulo
const TEXTO_ESPERA = 'Vaga {data} às {horario} com {profissional} ({servico}), {primeiro_nome}!\nAgende: {link}';

const entrada = (id: string, over: Record<string, unknown> = {}) => ({
  id, clientId: `c${id}`, nome: `Cliente ${id} Silva`, phone: `8399999000${id}`, serviceId: 's1', professionalId: null,
  desiredDate: null, period: 'qualquer', duracaoServico: 60, ...over,
});

beforeEach(() => {
  vi.resetAllMocks();
  delete process.env.FRONTEND_URL;
  settings.get.mockResolvedValue({ timezone: 'America/Sao_Paulo' });
  regras.obter.mockResolvedValue({ ativa: true, texto: TEXTO_ESPERA, config: { quantas: 3 } });
  repo.vaga.mockResolvedValue({ data: '2026-10-23', hora: '14:00', serviceId: 's1', professionalId: 'p1', duracao: 60, profissional: 'Camila', clientId: 'cx' });
  repo.negocio.mockResolvedValue({ nome: 'Studio Aurora', slug: 'aurora' });
  repo.nomeServico.mockResolvedValue('Gel');
  repo.entradasCandidatas.mockResolvedValue([1, 2, 3, 4, 5].map((n) => entrada(String(n))));
  repo.marcarOferecida.mockResolvedValue(true);
  inbox.estaEmOptOut.mockResolvedValue(false);
  zap.send.mockResolvedValue(true);
  zap.getStatus.mockResolvedValue({ status: 'connected' });
});

describe('aoCancelar', () => {
  it('regra desligada: 0 e nenhum envio', async () => {
    regras.obter.mockResolvedValue({ ativa: false, texto: TEXTO_ESPERA, config: { quantas: 3 } });
    expect(await automacoesGatilhos.aoCancelar('b1', 'a1', AGORA)).toBe(0);
    expect(zap.send).not.toHaveBeenCalled();
  });

  it('vaga daqui a 30 min: 0', async () => {
    repo.vaga.mockResolvedValue({ data: '2026-10-21', hora: '10:30', serviceId: 's1', professionalId: 'p1', duracao: 60, profissional: 'Camila' });
    expect(await automacoesGatilhos.aoCancelar('b1', 'a1', AGORA)).toBe(0);
    expect(zap.send).not.toHaveBeenCalled();
  });

  it('5 compatíveis e quantas 3: avisa 3 na ordem e marca 3', async () => {
    process.env.FRONTEND_URL = 'https://app.exemplo.com';
    expect(await automacoesGatilhos.aoCancelar('b1', 'a1', AGORA)).toBe(3);
    expect(zap.send).toHaveBeenCalledTimes(3);
    expect(zap.send.mock.calls.map((c) => c[0])).toEqual(['83999990001', '83999990002', '83999990003']);
    expect(zap.send.mock.calls[0][1]).toBe('Vaga sex, 23/10 às 14:00 com Camila (Gel), Cliente!\nAgende: https://app.exemplo.com/agendar/aurora');
    expect(zap.send.mock.calls[0][2]).toEqual({ businessId: 'b1', origin: 'lista_espera' });
    expect(repo.marcarOferecida.mock.calls.map((c) => c[0])).toEqual(['1', '2', '3']);
    expect(repo.marcarOferecida).toHaveBeenCalledWith('1', 'b1', AGORA);
  });

  it('sem FRONTEND_URL a linha do link some; hoje e amanhã', async () => {
    repo.vaga.mockResolvedValue({ data: '2026-10-22', hora: '14:00', serviceId: 's1', professionalId: 'p1', duracao: 60, profissional: 'Camila' });
    await automacoesGatilhos.aoCancelar('b1', 'a1', AGORA);
    expect(zap.send.mock.calls[0][1]).toBe('Vaga amanhã às 14:00 com Camila (Gel), Cliente!');
  });

  it('consentimento revogado: pula a entrada e avisa a próxima', async () => {
    repo.entradasCandidatas.mockResolvedValue([
      entrada('1', { consentimentoRevogado: true }), entrada('2'), entrada('3'), entrada('4'),
    ]);
    expect(await automacoesGatilhos.aoCancelar('b1', 'a1', AGORA)).toBe(3);
    expect(zap.send.mock.calls.map((c) => c[0])).toEqual(['83999990002', '83999990003', '83999990004']);
    expect(repo.marcarOferecida).not.toHaveBeenCalledWith('1', 'b1', AGORA);
  });

  it('busca candidatas com o horário atual e não oferece a vaga para quem cancelou', async () => {
    repo.entradasCandidatas.mockResolvedValue([entrada('1', { clientId: 'cx' }), entrada('2')]);
    expect(await automacoesGatilhos.aoCancelar('b1', 'a1', AGORA)).toBe(1);
    expect(repo.entradasCandidatas).toHaveBeenCalledWith('b1', AGORA);
    expect(zap.send.mock.calls.map((c) => c[0])).toEqual(['83999990002']);
  });

  it('entrada já reservada por outro cancelamento não recebe de novo', async () => {
    repo.marcarOferecida.mockImplementation(async (id: string) => id !== '1');
    expect(await automacoesGatilhos.aoCancelar('b1', 'a1', AGORA)).toBe(2);
    expect(zap.send.mock.calls.map((c) => c[0])).toEqual(['83999990002', '83999990003']);
  });

  it('envio que falha desfaz a oferta e não conta; erro numa entrada não para as outras', async () => {
    zap.send.mockImplementation(async (phone: string) => {
      if (phone === '83999990001') return false;
      if (phone === '83999990002') throw new Error('caiu');
      return true;
    });
    expect(await automacoesGatilhos.aoCancelar('b1', 'a1', AGORA)).toBe(1);
    expect(repo.desfazerOferta).toHaveBeenCalledWith('1', 'b1');
  });

  it('opt-out é pulado e não conta', async () => {
    inbox.estaEmOptOut.mockImplementation(async (_b: string, phone: string) => phone === '83999990001');
    expect(await automacoesGatilhos.aoCancelar('b1', 'a1', AGORA)).toBe(2);
    expect(zap.send.mock.calls.map((c) => c[0])).toEqual(['83999990002', '83999990003']);
    expect(repo.marcarOferecida).toHaveBeenCalledTimes(2);
  });

  it('entrada incompatível (outro profissional) não recebe', async () => {
    repo.entradasCandidatas.mockResolvedValue([entrada('1', { professionalId: 'p9' }), entrada('2')]);
    expect(await automacoesGatilhos.aoCancelar('b1', 'a1', AGORA)).toBe(1);
    expect(zap.send.mock.calls[0][0]).toBe('83999990002');
  });
});

describe('aoCriarReservaComSinal', () => {
  const dados = {
    phone: '83999990000', nome: 'Mariana', servico: 'Gel', valorSinal: 45, pixPayload: '000201PIX', data: '23/10', horario: '14:00', toleranciaMin: 15,
  };
  beforeEach(() => {
    regras.obter.mockResolvedValue({ ativa: true, texto: 'Pague R$ {valor_sinal} em {prazo} min:\n{pix_copia_e_cola}', config: { toleranciaMin: 15 } });
  });

  it('envia com valor formatado e payload', async () => {
    expect(await automacoesGatilhos.aoCriarReservaComSinal('b1', 'a1', dados)).toBe(true);
    expect(zap.send).toHaveBeenCalledWith('83999990000', 'Pague R$ 45,00 em 15 min:\n000201PIX', { businessId: 'b1', origin: 'sinal_pix' });
  });

  it('regra desligada ou WhatsApp desconectado: não envia', async () => {
    regras.obter.mockResolvedValue({ ativa: false, texto: 'x', config: { toleranciaMin: 15 } });
    expect(await automacoesGatilhos.aoCriarReservaComSinal('b1', 'a1', dados)).toBe(false);
    regras.obter.mockResolvedValue({ ativa: true, texto: 'x', config: { toleranciaMin: 15 } });
    zap.getStatus.mockResolvedValue({ status: 'disconnected' });
    expect(await automacoesGatilhos.aoCriarReservaComSinal('b1', 'a1', dados)).toBe(false);
    expect(zap.send).not.toHaveBeenCalled();
  });
});

describe('aoFecharComanda', () => {
  beforeEach(() => {
    regras.obter.mockResolvedValue({ ativa: true, texto: 'Como foi no {negocio}, {primeiro_nome}?', config: { horas: 2, linkGoogle: null } });
    repo.temAvaliacao.mockResolvedValue(false);
    repo.agendamentoParaAvaliacao.mockResolvedValue({ clientId: 'c1', nome: 'Mariana Souza', phone: '83999990000', servico: 'Gel' });
  });

  it('enfileira 2h depois com origem avaliacao', async () => {
    await automacoesGatilhos.aoFecharComanda('b1', 'a1', AGORA);
    expect(fila.enfileirar).toHaveBeenCalledWith([expect.objectContaining({
      businessId: 'b1', clientId: 'c1', phone: '83999990000', body: 'Como foi no Studio Aurora, Mariana?',
      origin: 'avaliacao', appointmentId: 'a1', prioridade: 5, agendadoPara: new Date('2026-10-21T15:00:00Z'),
    })]);
  });

  it('não enfileira com regra desligada ou avaliação já existente', async () => {
    repo.temAvaliacao.mockResolvedValue(true);
    await automacoesGatilhos.aoFecharComanda('b1', 'a1', AGORA);
    regras.obter.mockResolvedValue({ ativa: false, texto: 'x', config: { horas: 2, linkGoogle: null } });
    repo.temAvaliacao.mockResolvedValue(false);
    await automacoesGatilhos.aoFecharComanda('b1', 'a1', AGORA);
    expect(fila.enfileirar).not.toHaveBeenCalled();
  });
});

describe('toleranciaSinal', () => {
  it('usa o padrão 15 sem linha salva', async () => {
    regras.obter.mockResolvedValue({ ativa: false, texto: 'x', config: { toleranciaMin: 15 } });
    expect(await automacoesGatilhos.toleranciaSinal('b1')).toBe(15);
  });
  it('usa o valor configurado e cai em 15 se falhar', async () => {
    regras.obter.mockResolvedValue({ ativa: true, texto: 'x', config: { toleranciaMin: 30 } });
    expect(await automacoesGatilhos.toleranciaSinal('b1')).toBe(30);
    regras.obter.mockRejectedValue(new Error('banco'));
    expect(await automacoesGatilhos.toleranciaSinal('b1')).toBe(15);
  });
});
