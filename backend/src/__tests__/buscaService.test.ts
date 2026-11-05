import { describe, it, expect, vi, beforeEach } from 'vitest';

const repo = vi.hoisted(() => ({ clientesAtivos: vi.fn(), agendamentosFuturos: vi.fn(), agendamentosPassados: vi.fn() }));
vi.mock('../modules/busca/busca.repository.js', () => ({ buscaRepository: repo }));
vi.mock('../services/scheduleSettingsService.js', () => ({ getBusinessScheduleSettings: vi.fn().mockResolvedValue({ timezone: 'America/Fortaleza' }) }));

const { buscaService } = await import('../modules/busca/busca.service.js');

const cliente = (id: string, name: string, over: Record<string, unknown> = {}) => ({
  id, name, phone: '83999990000', email: null, ...over,
});
const agenda = (id: string) => ({
  id, data: '2026-11-06', hora: '14:30', status: 'confirmado', clienteNome: 'Ana', servicoNome: 'Corte', profissionalNome: 'Camila',
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-11-05T12:00:00-03:00'));
  repo.clientesAtivos.mockResolvedValue([]);
  repo.agendamentosFuturos.mockResolvedValue([]);
  repo.agendamentosPassados.mockResolvedValue([]);
});

describe('buscaService.buscar', () => {
  it('acha por nome sem acento e sem diferenciar maiúscula', async () => {
    repo.clientesAtivos.mockResolvedValue([cliente('1', 'José Lima'), cliente('2', 'Bia')]);
    const r = await buscaService.buscar('b1', 'JOSE');
    expect(r.clientes.map((c) => c.id)).toEqual(['1']);
  });

  it('acha por parte do telefone', async () => {
    repo.clientesAtivos.mockResolvedValue([cliente('1', 'Bia')]);
    expect((await buscaService.buscar('b1', '9999')).clientes).toHaveLength(1);
  });

  it('acha telefone digitado com máscara', async () => {
    repo.clientesAtivos.mockResolvedValue([cliente('1', 'Bia')]);
    expect((await buscaService.buscar('b1', '(83) 9999')).clientes).toHaveLength(1);
  });

  it('acha por e-mail e aceita cliente sem e-mail', async () => {
    repo.clientesAtivos.mockResolvedValue([cliente('1', 'Bia', { email: 'bia@exemplo.com' }), cliente('2', 'Carla', { email: null })]);
    const r = await buscaService.buscar('b1', 'exemplo');
    expect(r.clientes.map((c) => c.id)).toEqual(['1']);
  });

  it('não usa telefone com menos de 3 dígitos', async () => {
    repo.clientesAtivos.mockResolvedValue([cliente('1', 'Bia')]);
    expect((await buscaService.buscar('b1', '99')).clientes).toEqual([]);
  });

  it('quem começa com o termo vem antes, depois alfabética', async () => {
    repo.clientesAtivos.mockResolvedValue([
      cliente('1', 'Mariana'), cliente('2', 'Ana Souza'), cliente('3', 'Ana Lima'),
    ]);
    const r = await buscaService.buscar('b1', 'ana');
    expect(r.clientes.map((c) => c.nome)).toEqual(['Ana Lima', 'Ana Souza', 'Mariana']);
  });

  it('devolve só id, nome e telefone do cliente', async () => {
    repo.clientesAtivos.mockResolvedValue([cliente('1', 'Bia', { email: 'bia@x.com' })]);
    const r = await buscaService.buscar('b1', 'bia');
    expect(r.clientes[0]).toEqual({ id: '1', nome: 'Bia', telefone: '83999990000' });
  });

  it('corta em 5 clientes', async () => {
    repo.clientesAtivos.mockResolvedValue(Array.from({ length: 8 }, (_, i) => cliente(String(i), `Ana ${i}`)));
    expect((await buscaService.buscar('b1', 'ana')).clientes).toHaveLength(5);
  });

  it('devolve futuros antes dos passados e corta em 5', async () => {
    repo.clientesAtivos.mockResolvedValue([cliente('1', 'Ana')]);
    repo.agendamentosFuturos.mockResolvedValue([agenda('f1'), agenda('f2'), agenda('f3')]);
    repo.agendamentosPassados.mockResolvedValue([agenda('p1'), agenda('p2'), agenda('p3'), agenda('p4')]);
    const r = await buscaService.buscar('b1', 'ana');
    expect(r.agendamentos.map((a) => a.id)).toEqual(['f1', 'f2', 'f3', 'p1', 'p2']);
    expect(repo.agendamentosFuturos).toHaveBeenCalledWith('b1', ['1'], '2026-11-05');
    expect(repo.agendamentosPassados).toHaveBeenCalledWith('b1', ['1'], '2026-11-05');
  });

  it('consulta agendamentos com no máximo 50 clientes', async () => {
    repo.clientesAtivos.mockResolvedValue(Array.from({ length: 60 }, (_, i) => cliente(String(i), `Ana ${String(i).padStart(2, '0')}`)));
    await buscaService.buscar('b1', 'ana');
    expect(repo.agendamentosFuturos.mock.calls[0][1]).toHaveLength(50);
    expect(repo.agendamentosPassados.mock.calls[0][1]).toHaveLength(50);
  });

  it('sem cliente encontrada não consulta agendamentos', async () => {
    repo.clientesAtivos.mockResolvedValue([cliente('1', 'Bia')]);
    const r = await buscaService.buscar('b1', 'zzz');
    expect(r).toEqual({ clientes: [], agendamentos: [] });
    expect(repo.agendamentosFuturos).not.toHaveBeenCalled();
    expect(repo.agendamentosPassados).not.toHaveBeenCalled();
  });

  it('termo só com símbolos devolve vazio', async () => {
    repo.clientesAtivos.mockResolvedValue([cliente('1', 'Bia (VIP)', { email: 'a()@x.com' })]);
    expect(await buscaService.buscar('b1', '()')).toEqual({ clientes: [], agendamentos: [] });
  });
});
