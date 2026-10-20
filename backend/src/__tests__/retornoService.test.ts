import { describe, it, expect, vi, beforeEach } from 'vitest';

const crm = vi.hoisted(() => ({ clientes: vi.fn(), visitas: vi.fn() }));
const today = vi.hoisted(() => ({ clientesComAgendamentoFuturo: vi.fn(), profissionaisAtivas: vi.fn() }));
const vagas = vi.hoisted(() => ({ proximasVagas: vi.fn() }));
const fila = vi.hoisted(() => ({ ultimosPorCliente: vi.fn() }));
const inbox = vi.hoisted(() => ({ estaEmOptOut: vi.fn() }));
const neg = vi.hoisted(() => ({ negocio: vi.fn() }));
vi.mock('../modules/crm/crm.repository.js', () => ({ crmRepository: crm }));
vi.mock('../modules/dashboard/today.repository.js', () => ({ todayRepository: today }));
vi.mock('../modules/dashboard/today.service.js', () => vagas);
vi.mock('../modules/whatsappFila/fila.service.js', async (orig) => ({ ...(await orig<object>()), filaEnvios: fila }));
vi.mock('../modules/whatsappInbox/inbox.recorder.js', () => ({ inboxRecorder: inbox }));
vi.mock('../modules/whatsappRetorno/retorno.repository.js', () => ({ retornoRepository: neg }));
vi.mock('../services/scheduleSettingsService.js', () => ({ getBusinessScheduleSettings: vi.fn(async () => ({ timezone: 'America/Sao_Paulo' })) }));

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

beforeEach(() => {
  vi.clearAllMocks();
  clientes = [cli('c1', 'Beatriz Lima')];
  vis = new Map([['c1', visitas(39)]]);
  crm.clientes.mockImplementation(async () => clientes);
  crm.visitas.mockImplementation(async () => vis);
  today.clientesComAgendamentoFuturo.mockResolvedValue(new Set());
  today.profissionaisAtivas.mockResolvedValue([{ id: 'p1', name: 'Camila', almoco: null }]);
  vagas.proximasVagas.mockResolvedValue([
    { data: '2026-10-21', inicio: '14:30', profissional: 'Camila', professionalId: 'p1' },
  ]);
  fila.ultimosPorCliente.mockResolvedValue(new Map());
  inbox.estaEmOptOut.mockResolvedValue(false);
  neg.negocio.mockResolvedValue({ nome: 'Studio Aurora', slug: 'aurora', whatsapp: '83988887777' });
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
    expect(r.itens[0].encaixes).toEqual([expect.objectContaining({ curto: 'Qua 14:30', inicio: '2026-10-21T17:30:00.000Z' })]);
    expect(r.itens[0].texto).toContain('já completou 39 dias');
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
  it('ultimoConviteEm só do último enviado; envio é o último de qualquer status', async () => {
    const enviado = { id: 'e1', clientId: 'c1', status: 'enviado', motivo: null, agendadoPara: '2026-10-15T12:00:00.000Z', enviadoEm: '2026-10-15T12:01:00.000Z' };
    const falhou = { id: 'e2', clientId: 'c1', status: 'falhou', motivo: 'x', agendadoPara: '2026-10-19T12:00:00.000Z', enviadoEm: '2026-10-19T12:01:00.000Z' };
    fila.ultimosPorCliente.mockImplementation(async () => new Map([['c1', falhou]]));
    let r = await listar();
    expect(r.itens[0].envio).toEqual(falhou);
    expect(r.itens[0].ultimoConviteEm).toBeNull();
    fila.ultimosPorCliente.mockImplementation(async () => new Map([['c1', enviado]]));
    r = await listar();
    expect(r.itens[0].ultimoConviteEm).toBe('2026-10-15T12:01:00.000Z');
    expect(fila.ultimosPorCliente).toHaveBeenCalledWith('b1', 'retorno', ['c1']);
  });
});

describe('encaixes', () => {
  it('pede vagas da profissional da última visita com a duração do serviço', async () => {
    await listar();
    expect(vagas.proximasVagas).toHaveBeenCalledWith('b1', AGORA, 2, { professionalId: 'p1', duracaoMinima: 60 });
  });
  it('profissional inativa: qualquer uma', async () => {
    today.profissionaisAtivas.mockResolvedValue([{ id: 'p9', name: 'Outra', almoco: null }]);
    await listar();
    expect(vagas.proximasVagas).toHaveBeenCalledWith('b1', AGORA, 2, { professionalId: undefined, duracaoMinima: 60 });
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
    vagas.proximasVagas.mockImplementation(async (_b: string, _a: Date, _l: number, o: { professionalId?: string }) =>
      o.professionalId === 'p1' ? [{ data: '2026-10-21', inicio: '14:30', profissional: 'Camila', professionalId: 'p1' }] : []);
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
