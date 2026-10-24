import { describe, it, expect, vi, beforeEach } from 'vitest';

const repo = vi.hoisted(() => ({
  opcoes: vi.fn(), listar: vi.fn(), buscar: vi.fn(), criar: vi.fn(), atualizarRascunho: vi.fn(),
  marcarAgendada: vi.fn(), voltarRascunho: vi.fn(), gravarTotal: vi.fn(), marcarCancelada: vi.fn(),
}));
const filaRepo = vi.hoisted(() => ({ cancelarDoLote: vi.fn(), contagemDoLote: vi.fn(), itensDoLote: vi.fn() }));
const fila = vi.hoisted(() => ({ enfileirar: vi.fn(), enfileirarLote: vi.fn() }));
const TX = vi.hoisted(() => ({ tx: true }));
const db = vi.hoisted(() => ({ $transaction: vi.fn() }));
const publico = vi.hoisted(() => ({ montar: vi.fn(), previa: vi.fn() }));

vi.mock('../config/prisma.js', () => ({ prisma: db }));
const log = vi.hoisted(() => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }));
vi.mock('../utils/logger.js', () => ({ default: log }));
vi.mock('../modules/whatsappCampanhas/campanhas.repository.js', () => ({ campanhasRepository: repo }));
vi.mock('../modules/whatsappFila/fila.repository.js', () => ({ filaRepository: filaRepo }));
vi.mock('../modules/whatsappFila/fila.service.js', () => ({ filaEnvios: fila }));
vi.mock('../modules/whatsappCampanhas/publico.service.js', () => ({ publicoService: publico }));
vi.mock('../services/scheduleSettingsService.js', () => ({ getBusinessScheduleSettings: vi.fn(async () => ({ timezone: 'America/Sao_Paulo' })) }));

const { campanhasService } = await import('../modules/whatsappCampanhas/campanhas.service.js');
const { RODAPE_SAIR } = await import('../modules/whatsappCampanhas/campanhas.types.js');
const { AppError, NotFoundError } = await import('../utils/errors.js');

const AGORA = new Date('2026-10-20T13:00:00Z'); // 10:00 em São Paulo
const INICIO = new Date('2026-10-22T13:00:00Z'); // 22/10 10:00 em São Paulo
const ID = '11111111-1111-4111-8111-111111111111';

const INPUT = {
  segmento: 'em_risco' as const, professionalId: null, serviceId: null,
  nome: 'Volta', texto: 'Oi {primeiro_nome}!', data: '2026-10-22', hora: '10:00', cadencia: 25 as const,
  acao: 'agendar' as const,
};

const linha = (over: Record<string, unknown> = {}) => ({
  id: ID, businessId: 'b1', nome: 'Volta', segmento: 'em_risco', professionalId: null, serviceId: null,
  texto: 'Oi {primeiro_nome}!', inicioEm: INICIO, cadencia: 25, status: 'rascunho', total: 0,
  createdBy: 'u1', createdAt: new Date('2026-10-20T12:00:00Z'), updatedAt: new Date(), ...over,
});

const contagem = (over: Record<string, number> = {}) =>
  ({ na_fila: 0, enviando: 0, enviado: 0, falhou: 0, pulado: 0, cancelado: 0, ...over });

const eleg = (id: string, nome: string) => ({ id, nome, telefone: `8399999000${id.slice(-1)}`, vars: { primeiro_nome: nome } });
const envio = (clientId: string, loteId: string) => ({ id: `e-${clientId}`, clientId, loteId, status: 'na_fila' });
type ItemLote = { clientId: string; phone: string; body: string };
/** enfileirarLote devolve só os itens deste lote; `fora` simula quem já estava na fila de outra campanha. */
const loteCom = (fora: string[] = []) => async (l: { loteId: string }, itens: ItemLote[]) =>
  itens.filter((i) => !fora.includes(i.clientId)).map((i) => envio(i.clientId, l.loteId));

beforeEach(() => {
  vi.clearAllMocks();
  repo.criar.mockResolvedValue(linha());
  repo.buscar.mockResolvedValue(linha({ status: 'agendada' }));
  repo.marcarAgendada.mockResolvedValue(1);
  repo.voltarRascunho.mockResolvedValue(undefined);
  repo.gravarTotal.mockResolvedValue(undefined);
  repo.marcarCancelada.mockResolvedValue(1);
  filaRepo.contagemDoLote.mockImplementation(async (_b: string, ids: string[]) => new Map(ids.map((i) => [i, contagem()])));
  filaRepo.cancelarDoLote.mockResolvedValue(0);
  publico.montar.mockResolvedValue({ elegiveis: [eleg('c1', 'Ana'), eleg('c2', 'Bia'), eleg('c3', 'Carla')], selecionadas: 3, resguardadas: 0 });
  fila.enfileirarLote.mockImplementation(loteCom());
  db.$transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn(TX));
});

describe('campanhasService.salvar (agendar)', () => {
  it('enfileira as 3 elegíveis em lote com origem, prioridade, lote, início e rodapé', async () => {
    const r = await campanhasService.salvar('b1', 'u1', INPUT, undefined, AGORA);
    expect(fila.enfileirar).not.toHaveBeenCalled();
    expect(fila.enfileirarLote).toHaveBeenCalledTimes(1);
    const [lote, itens] = fila.enfileirarLote.mock.calls[0];
    expect(lote).toEqual({ businessId: 'b1', loteId: ID, origin: 'campanha', agendadoPara: INICIO, prioridade: 9 });
    expect(itens).toHaveLength(3);
    for (const i of itens) expect(i.body.endsWith(RODAPE_SAIR)).toBe(true);
    expect(itens.map((i: ItemLote) => i.clientId)).toEqual(['c1', 'c2', 'c3']);
    expect(itens[0]).toEqual({ clientId: 'c1', phone: '83999990001', body: `Oi Ana!\n\n${RODAPE_SAIR}` });
    // O público é montado com a cadência da campanha (para os horários livres de cada cliente).
    expect(publico.montar).toHaveBeenCalledWith('b1', { segmento: 'em_risco', professionalId: null, serviceId: null }, INICIO, 25, AGORA);
    expect(repo.marcarAgendada).toHaveBeenCalledWith('b1', ID);
    expect(repo.gravarTotal).toHaveBeenCalledWith('b1', ID, 3);
    expect(r.jaNaFila).toBe(0);
    expect(r.campanha).toMatchObject({ id: ID, status: 'agendada', total: 3, data: '2026-10-22', hora: '10:00' });
  });

  it('cliente já na fila de outra campanha conta em jaNaFila', async () => {
    fila.enfileirarLote.mockImplementation(loteCom(['c2']));
    const r = await campanhasService.salvar('b1', 'u1', INPUT, undefined, AGORA);
    expect(repo.gravarTotal).toHaveBeenCalledWith('b1', ID, 2);
    expect(r.campanha.total).toBe(2);
    expect(r.jaNaFila).toBe(1);
  });

  it('marcarAgendada devolve 0 → 409 e não enfileira', async () => {
    repo.marcarAgendada.mockResolvedValue(0);
    await expect(campanhasService.salvar('b1', 'u1', INPUT, undefined, AGORA))
      .rejects.toMatchObject({ statusCode: 409, message: 'Esta campanha já foi agendada' });
    expect(fila.enfileirarLote).not.toHaveBeenCalled();
  });

  it('enfileirar lança → cancela o lote, volta a rascunho e sobe 500 genérico com o id do rascunho', async () => {
    const original = new Error('banco caiu');
    fila.enfileirarLote.mockRejectedValue(original);
    const err = await campanhasService.salvar('b1', 'u1', INPUT, undefined, AGORA).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(AppError);
    expect(err).toMatchObject({ statusCode: 500, message: 'Não foi possível agendar a campanha.', details: [{ campanhaId: ID }] });
    expect(log.error).toHaveBeenCalledWith(expect.objectContaining({ err: original, campanhaId: ID }), expect.any(String));
    expect(filaRepo.cancelarDoLote).toHaveBeenCalledWith('b1', ID, 'Campanha cancelada');
    expect(repo.voltarRascunho).toHaveBeenCalledWith('b1', ID);
  });

  it('AppError de outra classe depois do rascunho mantém a classe e ganha o id do rascunho', async () => {
    publico.montar.mockRejectedValue(new NotFoundError('Profissional'));
    await expect(campanhasService.salvar('b1', 'u1', INPUT, undefined, AGORA)).rejects.toMatchObject({
      statusCode: 404, message: 'Profissional não encontrada', details: [{ campanhaId: ID }],
    });
    expect(repo.voltarRascunho).toHaveBeenCalledWith('b1', ID);
  });

  it('público sem elegíveis → 400 com o id do rascunho e campanha em rascunho', async () => {
    publico.montar.mockResolvedValue({ elegiveis: [], selecionadas: 2, resguardadas: 2 });
    await expect(campanhasService.salvar('b1', 'u1', INPUT, undefined, AGORA)).rejects.toMatchObject({
      statusCode: 400, message: 'Nenhuma cliente pode receber esta campanha', details: [{ campanhaId: ID }],
    });
    expect(repo.voltarRascunho).toHaveBeenCalledWith('b1', ID);
    expect(fila.enfileirarLote).not.toHaveBeenCalled();
  });

  it('montar lança → volta a rascunho e o erro sobe com o id do rascunho', async () => {
    publico.montar.mockRejectedValue(new Error('crm fora'));
    await expect(campanhasService.salvar('b1', 'u1', INPUT, undefined, AGORA)).rejects.toMatchObject({
      statusCode: 500, details: [{ campanhaId: ID }],
    });
    expect(repo.voltarRascunho).toHaveBeenCalledWith('b1', ID);
    expect(fila.enfileirarLote).not.toHaveBeenCalled();
  });

  it('gravarTotal lança → cancela o lote e volta a rascunho', async () => {
    repo.gravarTotal.mockRejectedValue(new Error('banco caiu'));
    await expect(campanhasService.salvar('b1', 'u1', INPUT, undefined, AGORA)).rejects.toMatchObject({
      statusCode: 500, message: 'Não foi possível agendar a campanha.', details: [{ campanhaId: ID }],
    });
    expect(filaRepo.cancelarDoLote).toHaveBeenCalledWith('b1', ID, 'Campanha cancelada');
    expect(repo.voltarRascunho).toHaveBeenCalledWith('b1', ID);
  });

  it('falha ao desfazer não esconde o erro original', async () => {
    const original = new Error('banco caiu');
    fila.enfileirarLote.mockRejectedValue(original);
    filaRepo.cancelarDoLote.mockRejectedValue(new Error('outra falha'));
    await expect(campanhasService.salvar('b1', 'u1', INPUT, undefined, AGORA)).rejects.toMatchObject({
      statusCode: 500, details: [{ campanhaId: ID }],
    });
    expect(log.error).toHaveBeenCalledWith(expect.objectContaining({ err: original }), expect.any(String));
    expect(repo.voltarRascunho).toHaveBeenCalledWith('b1', ID);
  });

  it('todas já na fila de outra campanha → cancela o lote, volta a rascunho e 400', async () => {
    fila.enfileirarLote.mockImplementation(loteCom(['c1', 'c2', 'c3']));
    await expect(campanhasService.salvar('b1', 'u1', INPUT, undefined, AGORA)).rejects.toMatchObject({
      statusCode: 400, message: 'Todas as clientes deste público já estão na fila de outra campanha', details: [{ campanhaId: ID }],
    });
    expect(filaRepo.cancelarDoLote).toHaveBeenCalledWith('b1', ID, 'Campanha cancelada');
    expect(repo.voltarRascunho).toHaveBeenCalledWith('b1', ID);
    expect(repo.gravarTotal).not.toHaveBeenCalled();
  });

  it('horário fora da janela → 400 antes de gravar', async () => {
    await expect(campanhasService.salvar('b1', 'u1', { ...INPUT, hora: '20:00' }, undefined, AGORA))
      .rejects.toMatchObject({ statusCode: 400 });
    expect(repo.criar).not.toHaveBeenCalled();
  });

  it.each(['agendar', 'rascunho'] as const)('data impossível (%s) → 400 "Data inválida"', async (acao) => {
    await expect(campanhasService.salvar('b1', 'u1', { ...INPUT, data: '2026-02-31', acao }, undefined, AGORA))
      .rejects.toMatchObject({ statusCode: 400, message: 'Data inválida' });
    expect(repo.criar).not.toHaveBeenCalled();
  });
});

describe('campanhasService.salvar (rascunho e edição)', () => {
  it('rascunho grava sem validar o início nem enfileirar', async () => {
    const r = await campanhasService.salvar('b1', 'u1', { ...INPUT, acao: 'rascunho', hora: '21:00', data: '2026-10-01' }, undefined, AGORA);
    expect(repo.criar).toHaveBeenCalledWith(expect.objectContaining({
      businessId: 'b1', createdBy: 'u1', status: 'rascunho', inicioEm: new Date('2026-10-02T00:00:00Z'),
    }));
    expect(fila.enfileirarLote).not.toHaveBeenCalled();
    expect(r).toMatchObject({ jaNaFila: 0, campanha: { status: 'rascunho' } });
  });

  it('PUT de campanha agendada → 409', async () => {
    repo.buscar.mockResolvedValue(linha({ status: 'agendada' }));
    await expect(campanhasService.salvar('b1', 'u1', { ...INPUT, acao: 'rascunho' }, ID, AGORA))
      .rejects.toMatchObject({ statusCode: 409, message: 'Só rascunhos podem ser editados' });
    expect(repo.atualizarRascunho).not.toHaveBeenCalled();
  });

  it('PUT de rascunho atualiza e agenda', async () => {
    repo.buscar.mockResolvedValue(linha());
    repo.atualizarRascunho.mockResolvedValue(linha());
    const r = await campanhasService.salvar('b1', 'u1', INPUT, ID, AGORA);
    expect(repo.atualizarRascunho).toHaveBeenCalledWith('b1', ID, expect.objectContaining({ nome: 'Volta' }));
    expect(repo.criar).not.toHaveBeenCalled();
    expect(r.campanha.total).toBe(3);
  });

  it('PUT de campanha inexistente → 404', async () => {
    repo.buscar.mockResolvedValue(null);
    await expect(campanhasService.salvar('b1', 'u1', INPUT, ID, AGORA)).rejects.toMatchObject({ statusCode: 404, message: 'Campanha não encontrada' });
  });
});

describe('campanhasService.cancelar', () => {
  it('agendada → cancela o lote e devolve cancelada', async () => {
    repo.buscar
      .mockResolvedValueOnce(linha({ status: 'agendada', total: 3 }))
      .mockResolvedValueOnce(linha({ status: 'cancelada', total: 3 }));
    filaRepo.contagemDoLote.mockResolvedValue(new Map([[ID, contagem({ na_fila: 3 })]]));
    const r = await campanhasService.cancelar('b1', ID, AGORA);
    // As duas gravações na mesma transação.
    expect(db.$transaction).toHaveBeenCalledTimes(1);
    expect(repo.marcarCancelada).toHaveBeenCalledWith('b1', ID, TX);
    expect(filaRepo.cancelarDoLote).toHaveBeenCalledWith('b1', ID, 'Campanha cancelada', TX);
    expect(r.status).toBe('cancelada');
  });

  it('marcarCancelada devolve 0 → 409 e o lote não é tocado', async () => {
    repo.marcarCancelada.mockResolvedValue(0);
    await expect(campanhasService.cancelar('b1', ID, AGORA)).rejects.toMatchObject({ statusCode: 409, message: 'Esta campanha não está agendada' });
    expect(filaRepo.cancelarDoLote).not.toHaveBeenCalled();
  });

  it('cancelarDoLote lança → a transação falha e o erro sobe', async () => {
    filaRepo.cancelarDoLote.mockRejectedValue(new Error('banco caiu'));
    await expect(campanhasService.cancelar('b1', ID, AGORA)).rejects.toThrow('banco caiu');
    expect(repo.marcarCancelada).toHaveBeenCalledWith('b1', ID, TX);
  });

  it('concluída → 409 sem mudar o status', async () => {
    repo.buscar.mockResolvedValue(linha({ status: 'agendada', inicioEm: new Date('2026-10-19T13:00:00Z'), total: 3 }));
    filaRepo.contagemDoLote.mockResolvedValue(new Map([[ID, contagem({ enviado: 3 })]]));
    await expect(campanhasService.cancelar('b1', ID, AGORA)).rejects.toMatchObject({ statusCode: 409, message: 'Esta campanha já foi concluída' });
    expect(repo.marcarCancelada).not.toHaveBeenCalled();
    expect(filaRepo.cancelarDoLote).not.toHaveBeenCalled();
  });

  it('rascunho → 409', async () => {
    repo.buscar.mockResolvedValue(linha({ status: 'rascunho' }));
    await expect(campanhasService.cancelar('b1', ID, AGORA)).rejects.toMatchObject({ statusCode: 409, message: 'Esta campanha não está agendada' });
    expect(filaRepo.cancelarDoLote).not.toHaveBeenCalled();
  });
});

describe('campanhasService.listar e detalhes', () => {
  it('agendada com início passado: 2 restantes → enviando; 0 restantes → concluida', async () => {
    const passado = new Date('2026-10-19T13:00:00Z');
    repo.listar.mockResolvedValue([
      linha({ id: 'a', status: 'agendada', inicioEm: passado, total: 3 }),
      linha({ id: 'b', status: 'agendada', inicioEm: passado, total: 3 }),
    ]);
    filaRepo.contagemDoLote.mockResolvedValue(new Map([
      ['a', contagem({ na_fila: 1, enviando: 1, enviado: 1 })],
      ['b', contagem({ enviado: 2, pulado: 1 })],
    ]));
    const r = await campanhasService.listar('b1', AGORA);
    expect(repo.listar).toHaveBeenCalledWith('b1');
    expect(r.map((c) => [c.id, c.status, c.enviadas])).toEqual([['a', 'enviando', 1], ['b', 'concluida', 2]]);
  });

  it('detalhes de campanha inexistente → 404', async () => {
    repo.buscar.mockResolvedValue(null);
    await expect(campanhasService.detalhes('b1', ID, AGORA)).rejects.toMatchObject({ statusCode: 404, message: 'Campanha não encontrada' });
  });

  it('detalhes traz contagem e itens com o nome da cliente', async () => {
    filaRepo.contagemDoLote.mockResolvedValue(new Map([[ID, contagem({ na_fila: 1, enviado: 1, pulado: 1 })]]));
    filaRepo.itensDoLote.mockResolvedValue([
      { id: 'e1', phone: '83999990001', status: 'enviado', reason: null, sentAt: new Date('2026-10-22T13:01:00Z'), client: { name: 'Ana' } },
      { id: 'e2', phone: '83999990002', status: 'na_fila', reason: null, sentAt: null, client: null },
    ]);
    const r = await campanhasService.detalhes('b1', ID, AGORA);
    expect(r.contagem).toEqual({ enviadas: 1, naFila: 1, puladas: 1, falhas: 0, canceladas: 0 });
    expect(r.itens).toEqual([
      { id: 'e1', nome: 'Ana', telefone: '83999990001', status: 'enviado', motivo: null, enviadoEm: '2026-10-22T13:01:00.000Z' },
      { id: 'e2', nome: '', telefone: '83999990002', status: 'na_fila', motivo: null, enviadoEm: null },
    ]);
  });
});
