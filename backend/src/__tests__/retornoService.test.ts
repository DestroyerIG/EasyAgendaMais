import { describe, it, expect, vi, beforeEach } from 'vitest';
vi.mock('../modules/whatsappAvatar/avatar.service.js', () => ({ avatares: { urlsPara: vi.fn().mockResolvedValue(new Map()), processar: vi.fn().mockResolvedValue({ buscados: 0 }) } }));

const crm = vi.hoisted(() => ({ clientes: vi.fn(), visitas: vi.fn() }));
const today = vi.hoisted(() => ({ clientesComAgendamentoFuturo: vi.fn(), profissionaisAtivas: vi.fn(), agendamentosNasDatas: vi.fn() }));
const fila = vi.hoisted(() => ({ ultimosPorCliente: vi.fn(), ultimosEnviadosPorCliente: vi.fn(), enfileirar: vi.fn(), previsoes: vi.fn() }));
const zap = vi.hoisted(() => ({ getStatus: vi.fn(), send: vi.fn() }));
const inbox = vi.hoisted(() => ({ estaEmOptOut: vi.fn() }));
const neg = vi.hoisted(() => ({ negocio: vi.fn() }));
vi.mock('../modules/crm/crm.repository.js', () => ({ crmRepository: crm }));
vi.mock('../modules/dashboard/today.repository.js', () => ({ todayRepository: today }));
vi.mock('../modules/whatsappFila/fila.service.js', async (orig) => ({ ...(await orig<object>()), filaEnvios: fila }));
vi.mock('../modules/whatsapp/whatsapp.service.js', () => ({ whatsappService: { getStatus: zap.getStatus } }));
vi.mock('../services/whatsapp/whatsappMessageService.js', () => ({ sendWhatsAppMessage: zap.send }));
vi.mock('../modules/whatsappInbox/inbox.recorder.js', () => ({ inboxRecorder: inbox }));
vi.mock('../modules/whatsappRetorno/retorno.repository.js', () => ({ retornoRepository: neg }));
vi.mock('../services/scheduleSettingsService.js', () => ({ getBusinessScheduleSettings: vi.fn(async () => ({
  timezone: 'America/Sao_Paulo', openingTime: '09:00', closingTime: '18:00',
  diasAbertos: { dom: true, seg: true, ter: true, qua: true, qui: true, sex: true, sab: true },
})) }));

const { retornoService } = await import('../modules/whatsappRetorno/retorno.service.js');

const AGORA = new Date('2026-10-20T13:00:00Z'); // hoje = 2026-10-20
const dias = (n: number) => new Date(AGORA.getTime() - n * 86_400_000).toISOString().slice(0, 10);
/** Duas visitas separadas por `ciclo` dias, a última há `atras` dias. */
const visitas = (atras: number, ciclo = 21, extra: Record<string, unknown> = {}) => [
  { date: dias(atras + ciclo), receita: 100, servico: 'Gel', profissional: 'Camila', professionalId: 'p1', duracao: 60 },
  { date: dias(atras), receita: 150, servico: 'Gel', profissional: 'Camila', professionalId: 'p1', duracao: 60, ...extra },
];
const cli = (id: string, name: string, over: Record<string, unknown> = {}) =>
  ({ id, name, phone: '83999990000', active: true, consentimento: 'consentido', ...over });

let clientes: ReturnType<typeof cli>[];
let vis: Map<string, unknown[]>;
let agenda: unknown[];
/** Agendamento (quarta 21/10 é o dia em jogo) ocupando [hh:mm, +dur) da profissional. */
const SEMANA = ['2026-10-20', '2026-10-21', '2026-10-22', '2026-10-23', '2026-10-24', '2026-10-25', '2026-10-26'];
const ocupa = (data: string, time: string, dur: number, professionalId = 'p1') => ({
  id: `a${data}${time}${professionalId}`, professionalId, status: 'confirmado', expiresAt: null,
  date: new Date(`${data}T00:00:00Z`), time: new Date(`1970-01-01T${time}:00Z`), service: { durationMinutes: dur },
});
/** Tira o expediente inteiro (09-18) de uma profissional em todos os dias menos nos dados abaixo. */
const fechar = (professionalId: string, dias: string[]) => dias.map((d) => ocupa(d, '09:00', 540, professionalId));

beforeEach(() => {
  vi.clearAllMocks();
  clientes = [cli('c1', 'Beatriz Lima')];
  vis = new Map([['c1', visitas(39)]]);
  crm.clientes.mockImplementation(async () => clientes);
  crm.visitas.mockImplementation(async () => vis);
  today.clientesComAgendamentoFuturo.mockResolvedValue(new Set());
  today.profissionaisAtivas.mockResolvedValue([{ id: 'p1', name: 'Camila', almoco: null }]);
  agenda = [];
  today.agendamentosNasDatas.mockImplementation(async () => agenda);
  fila.ultimosPorCliente.mockResolvedValue(new Map());
  fila.ultimosEnviadosPorCliente.mockResolvedValue(new Map());
  fila.previsoes.mockResolvedValue(new Map());
  inbox.estaEmOptOut.mockResolvedValue(false);
  neg.negocio.mockResolvedValue({ nome: 'Studio Aurora', slug: 'aurora', whatsapp: '83988887777' });
  fila.enfileirar.mockImplementation(async (itens: Array<{ clientId: string }>) =>
    itens.map((i) => ({ id: `e-${i.clientId}`, clientId: i.clientId, status: 'na_fila', motivo: null, agendadoPara: AGORA.toISOString(), enviadoEm: null })));
  zap.getStatus.mockResolvedValue({ status: 'connected' });
  zap.send.mockResolvedValue(true);
  process.env.FRONTEND_URL = 'https://x';
});

const listar = (f = {}, incluirLink = true) => retornoService.listar('b1', f, AGORA, incluirLink);

describe('quem aparece', () => {
  it('ativa, 39 dias, ciclo 21: atraso 18', async () => {
    const r = await listar();
    expect(r.itens).toHaveLength(1);
    expect(r.itens[0]).toMatchObject({
      cliente: { id: 'c1', nome: 'Beatriz Lima' }, atrasoDias: 18, ultimaVisitaHaDias: 39, cicloDias: 21,
      servico: 'Gel', profissional: 'Camila', professionalId: 'p1', valorUltimaVisita: 150, podeReceber: true, motivoBloqueio: null,
    });
    expect(r.itens[0].encaixes.map((e) => e.curto)).toEqual(['Ter 10:00', 'Qua 09:00']);
    expect(r.itens[0].encaixes[1].inicio).toBe('2026-10-21T12:00:00.000Z');
    expect(r.itens[0].texto).toContain('já faz *39* dias');
  });
  it('não entra: inativa, >120 dias, não vencido, com agendamento futuro', async () => {
    clientes = [cli('a', 'A', { active: false }), cli('bb', 'B'), cli('ccc', 'C'), cli('dddd', 'D')];
    vis = new Map([['a', visitas(39)], ['bb', visitas(121, 30)], ['ccc', visitas(10)], ['dddd', visitas(39)]]);
    today.clientesComAgendamentoFuturo.mockResolvedValue(new Set(['dddd']));
    expect((await listar()).itens).toEqual([]);
  });
  it('ordem por atraso desc, empate por nome', async () => {
    clientes = [cli('a', 'Zuleide'), cli('bb', 'Ana'), cli('ccc', 'Maria')];
    vis = new Map([['a', visitas(39)], ['bb', visitas(39)], ['ccc', visitas(60)]]);
    expect((await listar()).itens.map((i) => i.cliente.nome)).toEqual(['Maria', 'Ana', 'Zuleide']);
  });
});

describe('quem pode receber', () => {
  it('consentimento revogado', async () => {
    clientes = [cli('c1', 'Beatriz', { consentimento: 'revogado' })];
    expect((await listar()).itens[0]).toMatchObject({ podeReceber: false, motivoBloqueio: 'Consentimento revogado' });
  });
  it('opt-out', async () => {
    inbox.estaEmOptOut.mockResolvedValue(true);
    expect((await listar()).itens[0]).toMatchObject({ podeReceber: false, motivoBloqueio: 'Pediu para não receber mensagens' });
  });
});

describe('fila', () => {
  it('envio é o último de qualquer status; ultimoConviteEm é o último enviado', async () => {
    const falhou = { id: 'e2', clientId: 'c1', status: 'falhou', motivo: 'x', agendadoPara: '2026-10-19T12:00:00.000Z', enviadoEm: '2026-10-19T12:01:00.000Z', previstoHora: null };
    fila.ultimosPorCliente.mockImplementation(async () => new Map([['c1', falhou]]));
    fila.ultimosEnviadosPorCliente.mockImplementation(async () => new Map([['c1', new Date('2026-10-15T12:01:00.000Z')]]));
    const r = await listar();
    expect(r.itens[0].envio).toEqual(falhou);
    expect(r.itens[0].ultimoConviteEm).toBe('2026-10-15T12:01:00.000Z');
    expect(fila.ultimosEnviadosPorCliente).toHaveBeenCalledWith('b1', 'retorno', ['c1']);
  });
  it('sem enviado: ultimoConviteEm null', async () => {
    expect((await listar()).itens[0].ultimoConviteEm).toBeNull();
  });
});

describe('previsão de envio', () => {
  const naFila = { id: 'e9', clientId: 'c1', status: 'na_fila', motivo: null, agendadoPara: AGORA.toISOString(), enviadoEm: null, previstoHora: null };
  it('item na_fila ganha previstoHora no fuso do negócio, calculada pela posição na fila', async () => {
    fila.ultimosPorCliente.mockImplementation(async () => new Map([['c1', naFila]]));
    fila.previsoes.mockResolvedValue(new Map([['e9', new Date('2026-10-21T11:00:00Z')]])); // 08:00 em São Paulo
    const r = await listar();
    expect(fila.previsoes).toHaveBeenCalledWith('b1', 'America/Sao_Paulo', AGORA);
    expect(r.itens[0].envio?.previstoHora).toBe('08:00');
  });
  it('sem item na fila não calcula previsão e previstoHora fica null', async () => {
    const enviado = { ...naFila, status: 'enviado' };
    fila.ultimosPorCliente.mockImplementation(async () => new Map([['c1', enviado]]));
    const r = await listar();
    expect(fila.previsoes).not.toHaveBeenCalled();
    expect(r.itens[0].envio?.previstoHora).toBeNull();
  });
});

describe('encaixes', () => {
  it('só vagas da profissional da última visita, com duração suficiente', async () => {
    today.profissionaisAtivas.mockResolvedValue([{ id: 'p1', name: 'Camila', almoco: null }, { id: 'p2', name: 'Bruna', almoco: null }]);
    // p1: hoje só sobram 30 min (10:00-10:30) antes de um bloco até o fim; amanhã livre
    agenda = [ocupa('2026-10-20', '10:30', 450)];
    const r = await listar();
    // duração do serviço = 60: a janela de 30 min de hoje não serve
    expect(r.itens[0].encaixes.map((e) => e.curto)).toEqual(['Qua 09:00', 'Qui 09:00']);
  });
  it('profissional inativa: qualquer uma', async () => {
    today.profissionaisAtivas.mockResolvedValue([{ id: 'p9', name: 'Outra', almoco: null }]);
    const r = await listar();
    expect(r.itens[0].encaixes.map((e) => e.curto)).toEqual(['Ter 10:00', 'Qua 09:00']);
  });
  it('carrega profissionais e agendamentos uma vez só, para 3 clientes', async () => {
    clientes = [cli('a', 'Ana'), cli('bb', 'Bia'), cli('ccc', 'Cris')];
    vis = new Map([['a', visitas(39)], ['bb', visitas(40)], ['ccc', visitas(41)]]);
    const r = await listar();
    expect(r.itens).toHaveLength(3);
    expect(today.profissionaisAtivas).toHaveBeenCalledTimes(1);
    expect(today.agendamentosNasDatas).toHaveBeenCalledTimes(1);
  });
});

describe('filtros e resumo', () => {
  beforeEach(() => {
    clientes = [cli('a', 'Ana'), cli('bb', 'Bia')];
    vis = new Map([['a', visitas(39)], ['bb', visitas(50, 21, { professionalId: 'p2', profissional: 'Bruna' })]]);
    today.profissionaisAtivas.mockResolvedValue([{ id: 'p1', name: 'Camila', almoco: null }, { id: 'p2', name: 'Bruna', almoco: null }]);
  });
  it('professionalId filtra pela profissional da última visita', async () => {
    const r = await listar({ professionalId: 'p2' });
    expect(r.itens.map((i) => i.cliente.id)).toEqual(['bb']);
  });
  it('somenteComEncaixe remove quem não tem encaixe', async () => {
    agenda = fechar('p2', SEMANA); // Bruna sem nenhuma vaga na semana
    const r = await listar({ somenteComEncaixe: true });
    expect(r.itens.map((i) => i.cliente.id)).toEqual(['a']);
    expect(r.resumo).toEqual({ recuperacaoEstimada: 150, oportunidades: 1 });
  });
  it('recuperação = soma da última visita dos itens filtrados', async () => {
    expect((await listar()).resumo).toEqual({ recuperacaoEstimada: 300, oportunidades: 2 });
  });
});

describe('link', () => {
  it('com slug', async () => {
    const r = await listar();
    expect(r.linkAgendamento).toBe('https://x/agendar/aurora');
    expect(r.numeroNegocio).toBe('83988887777');
    expect(r.itens[0].texto).toContain('https://x/agendar/aurora');
  });
  it('incluirLink=false tira do texto', async () => {
    expect((await listar({}, false)).itens[0].texto).not.toContain('agendar/aurora');
  });
  it('sem slug', async () => {
    neg.negocio.mockResolvedValue({ nome: 'Studio Aurora', slug: null, whatsapp: '83988887777' });
    const r = await listar();
    expect(r.linkAgendamento).toBeNull();
    expect(r.itens[0].texto).not.toContain('Se preferir, agende');
  });
});

describe('sem FRONTEND_URL', () => {
  it('linkAgendamento null e convite sem link', async () => {
    delete process.env.FRONTEND_URL;
    const r = await listar();
    expect(r.linkAgendamento).toBeNull();
    expect(r.itens[0].texto).not.toContain('/agendar/');
  });
});

describe('enviar', () => {
  const tres = () => {
    clientes = [cli('c1', 'Ana'), cli('c2', 'Bia', { consentimento: 'revogado' }), cli('c3', 'Cris')];
    vis = new Map([['c1', visitas(39)], ['c2', visitas(40)], ['c3', visitas(41)]]);
  };
  const enviar = (input: Record<string, unknown>) =>
    retornoService.enviar('b1', { incluirLink: true, ...input } as never, AGORA);

  it('lote de 3 com 1 revogada: 2 na fila com o mesmo loteId e 1 recusado', async () => {
    tres();
    const r = await enviar({ itens: [{ clientId: 'c1' }, { clientId: 'c2' }, { clientId: 'c3' }] });
    const enviados = fila.enfileirar.mock.calls[0][0];
    expect(enviados.map((i: { clientId: string }) => i.clientId)).toEqual(['c1', 'c3']);
    expect(enviados[0].loteId).toBeTruthy();
    expect(enviados[0].loteId).toBe(enviados[1].loteId);
    expect(enviados.every((i: { origin: string }) => i.origin === 'retorno')).toBe(true);
    expect(r.envios).toHaveLength(2);
    expect(r.recusados).toEqual([{ clientId: 'c2', motivo: 'Consentimento revogado' }]);
  });
  it('cliente fora da lista é recusada', async () => {
    const r = await enviar({ itens: [{ clientId: 'zzz' }] });
    expect(fila.enfileirar).not.toHaveBeenCalled();
    expect(r.recusados).toEqual([{ clientId: 'zzz', motivo: 'Cliente fora da lista' }]);
  });
  it('texto editado chega à fila; sem edição usa o montado; 1 item agenda para agora sem lote', async () => {
    const montado = (await listar()).itens[0].texto;
    await enviar({ itens: [{ clientId: 'c1', texto: 'Oi, volta!' }] });
    const um = fila.enfileirar.mock.calls[0][0][0];
    expect(um.body).toBe('Oi, volta!');
    expect(um.agendadoPara).toEqual(AGORA);
    expect(um.loteId).toBeNull();
    expect(um.phone).toBe('83999990000');
    await enviar({ itens: [{ clientId: 'c1' }] });
    expect(fila.enfileirar.mock.calls[1][0][0].body).toBe(montado);
  });
  it('mesma cliente duas vezes gera 1 envio', async () => {
    await enviar({ itens: [{ clientId: 'c1' }, { clientId: 'c1' }] });
    expect(fila.enfileirar.mock.calls[0][0]).toHaveLength(1);
  });
});

describe('testar', () => {
  it('desconectado: 409 com a mensagem', async () => {
    zap.getStatus.mockResolvedValue({ status: 'disconnected' });
    await expect(retornoService.testar('b1', { clientId: 'c1', incluirLink: true }, AGORA))
      .rejects.toMatchObject({ statusCode: 409, message: 'WhatsApp desconectado. Reconecte na aba Conexão.' });
  });
  it('sem número do negócio: erro de validação', async () => {
    neg.negocio.mockResolvedValue({ nome: 'Studio Aurora', slug: 'aurora', whatsapp: null });
    await expect(retornoService.testar('b1', { clientId: 'c1', incluirLink: true }, AGORA))
      .rejects.toMatchObject({ message: 'Cadastre o número do negócio' });
  });
  it('ok: envia o texto montado para o número do negócio', async () => {
    const texto = (await listar()).itens[0].texto;
    const r = await retornoService.testar('b1', { clientId: 'c1', incluirLink: true }, AGORA);
    expect(r).toEqual({ enviado: true, para: '83988887777' });
    expect(zap.send).toHaveBeenCalledWith('83988887777', texto, { businessId: 'b1', origin: 'sistema' });
  });
  it('falha no envio: 502', async () => {
    zap.send.mockResolvedValue(false);
    await expect(retornoService.testar('b1', { clientId: 'c1', incluirLink: true }, AGORA))
      .rejects.toMatchObject({ statusCode: 502, message: 'Não foi possível enviar o teste. Tente de novo.' });
  });
});

describe('schemas', () => {
  it('somenteComEncaixe "true"/"false" e incluirLink padrão', async () => {
    const { FiltrosRetorno, EnviarRetornoSchema } = await import('../modules/whatsappRetorno/retorno.types.js');
    expect(FiltrosRetorno.parse({ somenteComEncaixe: 'true' }).somenteComEncaixe).toBe(true);
    expect(FiltrosRetorno.parse({ somenteComEncaixe: 'false' }).somenteComEncaixe).toBe(false);
    const id = '3f0c6a52-6a0e-4a52-9d7e-0d3a4b1f2c11';
    expect(EnviarRetornoSchema.parse({ itens: [{ clientId: id }] }).incluirLink).toBe(true);
    expect(EnviarRetornoSchema.parse({ itens: [{ clientId: id, texto: '  Oi  ' }] }).itens[0].texto).toBe('Oi');
    expect(EnviarRetornoSchema.safeParse({ itens: [] }).success).toBe(false);
  });
});

describe('listarParaRotina: radar por N dias sem vir', () => {
  it('entra quem está há pelo menos N dias sem vir, mesmo sem ter vencido o ciclo; a tela continua pelo ciclo', async () => {
    clientes = [cli('c1', 'Ana'), cli('c2', 'Bia'), cli('c3', 'Carla')];
    vis = new Map<string, unknown[]>([
      ['c1', visitas(21, 30)], // ciclo de 30 ainda não venceu
      ['c2', visitas(15, 30)], // menos de N dias
      ['c3', [visitas(25)[1]]], // uma visita só (sem ciclo)
    ]);
    const radar = await retornoService.listarParaRotina('b1', AGORA, { minDiasSemVir: 21 });
    expect(radar.itens.map((i) => i.cliente.id)).toEqual(['c3', 'c1']);
    expect(radar.itens[0]).toMatchObject({ ultimaVisitaHaDias: 25, atrasoDias: 4 });
    const tela = await listar();
    expect(tela.itens.map((i) => i.cliente.id)).toEqual([]);
  });

  it('sem opção: mesma lista da tela (ciclo vencido)', async () => {
    const radar = await retornoService.listarParaRotina('b1', AGORA);
    expect(radar.itens.map((i) => i.cliente.id)).toEqual(['c1']);
  });
});
