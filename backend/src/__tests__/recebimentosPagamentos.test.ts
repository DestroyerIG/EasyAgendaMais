import { vi, describe, it, beforeEach, afterEach, expect } from 'vitest';
import express from 'express';

// Banco em memória: o repositório real roda contra ele, com transação que desfaz de verdade e
// índice único em (gateway, pagamentoExternoId). Assim os testes cobrem a regra, não um mock dela.
const banco = vi.hoisted(() => {
  type Linha = Record<string, any>;
  const estado: { cobrancas: Linha[]; reservas: Linha[] } = { cobrancas: [], reservas: [] };

  const casaCondicao = (v: any, c: any): boolean => {
    if (c === null || typeof c !== 'object' || c instanceof Date) return v === c;
    if ('not' in c && v === c.not) return false;
    if ('in' in c && !c.in.includes(v)) return false;
    if ('gt' in c && !(v !== null && v > c.gt)) return false;
    if ('gte' in c && !(v !== null && v >= c.gte)) return false;
    if ('lt' in c && !(v !== null && v < c.lt)) return false;
    return true;
  };
  const casa = (l: Linha, where: Linha): boolean => Object.entries(where).every(([k, c]) =>
    (k === 'OR' ? (c as Linha[]).some((w) => casa(l, w)) : casaCondicao(l[k], c)));
  const comReserva = (c: Linha | undefined) =>
    (c ? { ...c, appointment: { ...estado.reservas.find((r) => r.id === c.appointmentId) } } : null);

  const checarUnico = (id: string | null, dados: Linha) => {
    if (!dados.pagamentoExternoId) return;
    const dono = estado.cobrancas.find((c) => c.id !== id && c.pagamentoExternoId === dados.pagamentoExternoId);
    if (dono) throw Object.assign(new Error('Unique constraint'), { code: 'P2002' });
  };

  const db: Linha = {
    cobrancaSinal: {
      findUnique: async ({ where }: Linha) => comReserva(estado.cobrancas.find((c) => casa(c, where))),
      findUniqueOrThrow: async ({ where }: Linha) => comReserva(estado.cobrancas.find((c) => casa(c, where))),
      findFirst: async ({ where }: Linha) => comReserva(estado.cobrancas.find((c) => casa(c, where))),
      findMany: async ({ where }: Linha) => estado.cobrancas.filter((c) => casa(c, where)).map(comReserva),
      count: async ({ where }: Linha) => estado.cobrancas.filter((c) => casa(c, where)).length,
      updateMany: async ({ where, data }: Linha) => {
        const alvo = estado.cobrancas.filter((c) => casa(c, where));
        for (const c of alvo) { checarUnico(c.id, data); Object.assign(c, data); }
        return { count: alvo.length };
      },
      create: async ({ data }: Linha) => {
        checarUnico(null, data);
        const nova = { id: `extra-${estado.cobrancas.length}`, ...data };
        estado.cobrancas.push(nova);
        return nova;
      },
    },
    appointment: {
      updateMany: async ({ where, data }: Linha) => {
        const alvo = estado.reservas.filter((r) => casa(r, where));
        for (const r of alvo) Object.assign(r, data);
        return { count: alvo.length };
      },
    },
    $executeRaw: vi.fn(async () => 0),
  };

  // Uma transação de cada vez, como as linhas travadas do Postgres fariam nestes casos.
  let fila: Promise<unknown> = Promise.resolve();
  db.$transaction = (fn: (tx: Linha) => Promise<unknown>) => {
    const rodar = async () => {
      const copia = structuredClone(estado);
      try {
        return await fn(db);
      } catch (e) {
        estado.cobrancas = copia.cobrancas;
        estado.reservas = copia.reservas;
        throw e;
      }
    };
    const r = fila.then(rodar, rodar);
    fila = r.catch(() => undefined);
    return r;
  };
  return { estado, db };
});

vi.mock('../config/prisma.js', () => ({ prisma: banco.db }));

const log = vi.hoisted(() => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }));
vi.mock('../utils/logger.js', () => ({ default: log }));

const whats = vi.hoisted(() => ({ sendWhatsAppMessage: vi.fn() }));
vi.mock('../services/whatsapp/index.js', () => whats);

const notif = vi.hoisted(() => ({ notify: vi.fn() }));
vi.mock('../modules/notifications/notifications.service.js', () => ({ notificationsService: notif }));

const sinal = vi.hoisted(() => ({ avisarSinalConfirmado: vi.fn() }));
vi.mock('../modules/appointments/sinalConfirmado.js', async (orig) => ({
  ...(await orig<typeof import('../modules/appointments/sinalConfirmado.js')>()), ...sinal,
}));

const apptRepo = vi.hoisted(() => ({ hasConflict: vi.fn(), findById: vi.fn(), updateStatus: vi.fn(), softDelete: vi.fn() }));
vi.mock('../modules/appointments/appointments.repository.js', () => ({ appointmentsPrismaRepository: apptRepo }));

const gw = vi.hoisted(() => ({ referenciaDoRecurso: vi.fn(), buscarPorReferencia: vi.fn(), conta: vi.fn() }));
const conexao = vi.hoisted(() => ({
  tokenAtivo: vi.fn(), porContaExterna: vi.fn(), marcarReconectar: vi.fn(),
  // Mesma regra do serviço real: só a conta do gateway prova que o acesso caiu.
  acessoRevogado: vi.fn(async (_b: string, _g: string, accessToken: string) => {
    try { await gw.conta(accessToken); return false; } catch (e) { return (e as Error).name === 'GatewayTokenInvalido'; }
  }),
}));
vi.mock('../modules/recebimentos/conexao.service.js', () => ({ conexaoService: conexao }));

vi.mock('../modules/recebimentos/gateways/index.js', async (orig) => ({
  ...(await orig<typeof import('../modules/recebimentos/gateways/index.js')>()), gateways: { mercadopago: gw },
}));

const gatilhos = vi.hoisted(() => ({ aoCancelar: vi.fn() }));
vi.mock('../modules/whatsappAutomacoes/gatilhos.service.js', () => ({ automacoesGatilhos: gatilhos }));
vi.mock('../modules/googleAgenda/googleAgenda.service.js', () => ({ googleAgendaService: { sincronizarSaida: vi.fn() } }));
vi.mock('../modules/clube/clube.service.js', () => ({ clubeService: { aoFaltar: vi.fn() } }));
const agenda = vi.hoisted(() => ({ generateAvailableTimeSlots: vi.fn(), getBusinessScheduleSettings: vi.fn() }));
vi.mock('../services/scheduleSettingsService.js', () => agenda);

const { pagamentosService } = await import('../modules/recebimentos/pagamentos.service.js');
const { recebimentosRepository } = await import('../modules/recebimentos/recebimentos.repository.js');
const { publicBookingRepository } = await import('../modules/publicBooking/publicBooking.repository.js');
const { appointmentsService } = await import('../modules/appointments/appointments.service.js');
const { GatewayIndisponivel, GatewayTokenInvalido } = await import('../modules/recebimentos/gateways/index.js');
const routes = (await import('../modules/recebimentos/recebimentos.routes.js')).default;
const supertest = (await import('supertest')).default;

const app = express();
app.use(express.json());
app.use('/api/v1/recebimentos', routes);
const request = supertest(app);

const COB = '11111111-1111-4111-8111-111111111111';
const COB2 = '22222222-2222-4222-8222-222222222222';
const MINUTO = 60_000;
const ENVS = ['MERCADOPAGO_CLIENT_ID', 'MERCADOPAGO_CLIENT_SECRET', 'MERCADOPAGO_REDIRECT_URI', 'RECEBIMENTOS_TOKEN_KEY'];
const AVISO_CLIENTE = 'O negócio vai entrar em contato com você sobre o seu sinal';

const emMinutos = (m: number) => new Date(Date.now() + m * MINUTO);

function reserva(extra: Record<string, unknown> = {}) {
  const r = {
    id: 'a1', businessId: 'b1', professionalId: 'p1', status: 'aguardando_pagamento', expiresAt: emMinutos(10),
    date: new Date('2099-11-10T00:00:00Z'), time: new Date('1970-01-01T10:00:00Z'),
    client: { name: 'Mariana Souza', phone: '5511999999999' }, service: { name: 'Manicure' }, ...extra,
  };
  banco.estado.reservas.push(r);
  return r;
}

function cobranca(extra: Record<string, unknown> = {}) {
  const c = {
    id: COB, businessId: 'b1', appointmentId: 'a1', gateway: 'mercadopago', forma: 'pix', valor: '30.00', situacao: 'pendente',
    pagamentoExternoId: null, formaPaga: null, pagoEm: null, venceEm: emMinutos(10), idExterno: 'ext-1', ...extra,
  };
  banco.estado.cobrancas.push(c);
  return c;
}

const pagamento = (extra: Record<string, unknown> = {}) => ({
  id: '555', status: 'approved', valor: 30, referencia: COB, formaPaga: 'pix', ...extra,
});

const aviso = { contaId: '999', tipo: 'payment' as const, recursoId: '555' };
const lerCobranca = (id = COB) => banco.estado.cobrancas.find((c) => c.id === id)!;
const lerReserva = () => banco.estado.reservas[0]!;
const alertas = () => notif.notify.mock.calls.filter((c) => c[1].type === 'recebimento_alerta');

beforeEach(() => {
  vi.clearAllMocks();
  banco.estado.cobrancas = [];
  banco.estado.reservas = [];
  for (const v of ENVS) process.env[v] = 'x';
  conexao.porContaExterna.mockResolvedValue({ businessId: 'b1' });
  conexao.tokenAtivo.mockResolvedValue({ gateway: 'mercadopago', accessToken: 'APP_USR-segredo' });
  conexao.marcarReconectar.mockResolvedValue(undefined);
  gw.referenciaDoRecurso.mockResolvedValue(COB);
  gw.buscarPorReferencia.mockResolvedValue([pagamento()]);
  gw.conta.mockRejectedValue(new GatewayTokenInvalido());
  agenda.getBusinessScheduleSettings.mockResolvedValue({ timezone: 'America/Sao_Paulo' });
  apptRepo.hasConflict.mockResolvedValue(false);
  apptRepo.findById.mockImplementation(async (id: string) => banco.estado.reservas.find((r) => r.id === id) ?? null);
  gatilhos.aoCancelar.mockResolvedValue(undefined);
  notif.notify.mockResolvedValue(undefined);
  whats.sendWhatsAppMessage.mockResolvedValue(true);
  sinal.avisarSinalConfirmado.mockResolvedValue(undefined);
});
afterEach(() => { for (const v of ENVS) delete process.env[v]; vi.restoreAllMocks(); });

describe('processarAviso', () => {
  it('pagamento aprovado dentro do prazo confirma e avisa uma vez', async () => {
    reserva(); cobranca();
    await pagamentosService.processarAviso(aviso);

    expect(gw.referenciaDoRecurso).toHaveBeenCalledWith('APP_USR-segredo', { tipo: 'payment', id: '555' });
    expect(gw.buscarPorReferencia).toHaveBeenCalledWith('APP_USR-segredo', COB);
    expect(lerReserva().status).toBe('confirmado');
    expect(lerCobranca()).toMatchObject({ situacao: 'paga', pagamentoExternoId: '555', formaPaga: 'pix' });
    expect(lerCobranca().pagoEm).toBeInstanceOf(Date);
    expect(sinal.avisarSinalConfirmado).toHaveBeenCalledTimes(1);
    expect(sinal.avisarSinalConfirmado.mock.calls[0]![0]).toMatchObject({ id: 'a1', client: { name: 'Mariana Souza' } });
  });

  it('o aviso não é prova: pagamento que a busca devolve como pending não confirma', async () => {
    reserva(); cobranca();
    gw.buscarPorReferencia.mockResolvedValue([pagamento({ status: 'pending' })]);
    await pagamentosService.processarAviso(aviso);

    expect(lerReserva().status).toBe('aguardando_pagamento');
    expect(lerCobranca().situacao).toBe('pendente');
    expect(sinal.avisarSinalConfirmado).not.toHaveBeenCalled();
  });

  it('valor diferente do da cobrança não confirma e deixa rastro no log, sem o token', async () => {
    reserva(); cobranca();
    gw.buscarPorReferencia.mockResolvedValue([pagamento({ valor: 29.99 })]);
    await pagamentosService.processarAviso(aviso);

    expect(lerReserva().status).toBe('aguardando_pagamento');
    expect(log.warn).toHaveBeenCalledWith({ cobrancaId: COB, pagamentoId: '555' }, expect.any(String));
    expect(JSON.stringify(log.warn.mock.calls)).not.toContain('APP_USR-segredo');
  });

  it('valor igual não registra divergência', async () => {
    reserva(); cobranca();
    await pagamentosService.processarAviso(aviso);
    expect(log.warn).not.toHaveBeenCalled();
  });

  it('user_id sem conexão não faz nada, registra warn e não lança', async () => {
    reserva(); cobranca();
    conexao.porContaExterna.mockResolvedValue(null);
    await expect(pagamentosService.processarAviso(aviso)).resolves.toBeUndefined();

    expect(gw.referenciaDoRecurso).not.toHaveBeenCalled();
    expect(lerReserva().status).toBe('aguardando_pagamento');
    expect(log.warn).toHaveBeenCalled();
  });

  it('tokenAtivo nulo no aviso não confirma, registra warn e não lança', async () => {
    reserva(); cobranca();
    conexao.tokenAtivo.mockResolvedValue(null);
    await expect(pagamentosService.processarAviso(aviso)).resolves.toBeUndefined();

    expect(gw.referenciaDoRecurso).not.toHaveBeenCalled();
    expect(log.warn).toHaveBeenCalled();
  });

  it('referência de cobrança de outro negócio não confirma', async () => {
    reserva({ businessId: 'b2' }); cobranca({ businessId: 'b2' });
    await pagamentosService.processarAviso(aviso);

    expect(gw.buscarPorReferencia).not.toHaveBeenCalled();
    expect(lerReserva().status).toBe('aguardando_pagamento');
    expect(lerCobranca().situacao).toBe('pendente');
  });

  it.each(['nao-e-uuid', 'pedido-loja-123'])('referência que não é UUID (%s) é ignorada', async (ref) => {
    reserva(); cobranca();
    gw.referenciaDoRecurso.mockResolvedValue(ref);
    await expect(pagamentosService.processarAviso(aviso)).resolves.toBeUndefined();
    expect(gw.buscarPorReferencia).not.toHaveBeenCalled();
  });

  it('recurso sem referência é ignorado', async () => {
    reserva(); cobranca();
    gw.referenciaDoRecurso.mockResolvedValue(null);
    await pagamentosService.processarAviso(aviso);
    expect(gw.buscarPorReferencia).not.toHaveBeenCalled();
  });

  it('aviso order e rotina veem o mesmo pagamento: nenhum alerta de duplicidade', async () => {
    reserva(); cobranca();
    await pagamentosService.processarAviso({ ...aviso, tipo: 'order', recursoId: 'ORD01ABC' });
    await pagamentosService.processarCobranca(COB);

    expect(gw.referenciaDoRecurso).toHaveBeenCalledWith('APP_USR-segredo', { tipo: 'order', id: 'ORD01ABC' });
    expect(sinal.avisarSinalConfirmado).toHaveBeenCalledTimes(1);
    expect(alertas()).toHaveLength(0);
  });

  it('dois avisos simultâneos avisam uma vez só', async () => {
    reserva(); cobranca();
    const espiao = vi.spyOn(recebimentosRepository, 'marcarPagaEConfirmar');
    await Promise.all([pagamentosService.processarAviso(aviso), pagamentosService.processarAviso(aviso)]);

    expect(espiao).toHaveBeenCalledTimes(2);
    expect(await espiao.mock.results[0]!.value).toEqual({ confirmou: true });
    expect(await espiao.mock.results[1]!.value).toEqual({ confirmou: false });
    expect(sinal.avisarSinalConfirmado).toHaveBeenCalledTimes(1);
  });

  it('P2002 no pagamento externo é repetição: não confirma, não avisa, não lança', async () => {
    reserva(); cobranca();
    cobranca({ id: COB2, appointmentId: 'outra', situacao: 'paga', pagamentoExternoId: '555' });
    await expect(pagamentosService.processarCobranca(COB)).resolves.toBeUndefined();

    expect(lerCobranca().situacao).toBe('pendente');
    expect(lerReserva().status).toBe('aguardando_pagamento');
    expect(sinal.avisarSinalConfirmado).not.toHaveBeenCalled();
    expect(alertas()).toHaveLength(0);
  });

  it('GatewayTokenInvalido na referência e na conta chama marcarReconectar', async () => {
    reserva(); cobranca();
    gw.referenciaDoRecurso.mockRejectedValue(new GatewayTokenInvalido());
    await expect(pagamentosService.processarAviso(aviso)).resolves.toBeUndefined();
    expect(gw.conta).toHaveBeenCalledWith('APP_USR-segredo');
    expect(conexao.marcarReconectar).toHaveBeenCalledWith('b1', expect.any(String));
  });

  it('401 num id escolhido por quem avisou não desliga a conexão se a conta responde', async () => {
    reserva(); cobranca();
    gw.referenciaDoRecurso.mockRejectedValue(new GatewayTokenInvalido());
    gw.conta.mockResolvedValue({ id: '999', nome: 'Studio' });
    await expect(pagamentosService.processarAviso(aviso)).resolves.toBeUndefined();
    expect(conexao.marcarReconectar).not.toHaveBeenCalled();
  });

  it('conta indisponível na confirmação não desliga a conexão', async () => {
    reserva(); cobranca();
    gw.referenciaDoRecurso.mockRejectedValue(new GatewayTokenInvalido());
    gw.conta.mockRejectedValue(new GatewayIndisponivel());
    await expect(pagamentosService.processarAviso(aviso)).resolves.toBeUndefined();
    expect(conexao.marcarReconectar).not.toHaveBeenCalled();
  });

  it('nunca lança, mesmo com o banco fora do ar', async () => {
    conexao.porContaExterna.mockRejectedValue(new Error('banco fora'));
    await expect(pagamentosService.processarAviso(aviso)).resolves.toBeUndefined();
  });

  it('sem a configuração de recebimentos nada é chamado', async () => {
    delete process.env['RECEBIMENTOS_TOKEN_KEY'];
    await pagamentosService.processarAviso(aviso);
    expect(conexao.porContaExterna).not.toHaveBeenCalled();
  });

  it('o token não aparece em nenhum log', async () => {
    reserva(); cobranca();
    gw.buscarPorReferencia.mockRejectedValue(new GatewayIndisponivel());
    await pagamentosService.processarAviso(aviso);
    expect(JSON.stringify([log.info.mock.calls, log.warn.mock.calls, log.error.mock.calls])).not.toContain('APP_USR-segredo');
  });
});

describe('processarCobranca', () => {
  it('cobrança inexistente não faz nada', async () => {
    await expect(pagamentosService.processarCobranca(COB)).resolves.toBeUndefined();
    expect(conexao.tokenAtivo).not.toHaveBeenCalled();
  });

  it('sem nenhum pagamento não faz nada', async () => {
    reserva(); cobranca();
    gw.buscarPorReferencia.mockResolvedValue([]);
    await pagamentosService.processarCobranca(COB);
    expect(lerCobranca().situacao).toBe('pendente');
  });

  it('tokenAtivo nulo não confirma, registra warn e não lança', async () => {
    reserva(); cobranca();
    conexao.tokenAtivo.mockResolvedValue(null);
    await expect(pagamentosService.processarCobranca(COB)).resolves.toBeUndefined();

    expect(gw.buscarPorReferencia).not.toHaveBeenCalled();
    expect(lerReserva().status).toBe('aguardando_pagamento');
    expect(log.warn).toHaveBeenCalled();
  });

  it('GatewayTokenInvalido na busca chama marcarReconectar', async () => {
    reserva(); cobranca();
    gw.buscarPorReferencia.mockRejectedValue(new GatewayTokenInvalido());
    await expect(pagamentosService.processarCobranca(COB)).resolves.toBeUndefined();
    expect(conexao.marcarReconectar).toHaveBeenCalledWith('b1', expect.any(String));
  });

  it('gateway indisponível não marca reconexão e tenta de novo depois', async () => {
    reserva(); cobranca();
    gw.buscarPorReferencia.mockRejectedValue(new GatewayIndisponivel());
    await expect(pagamentosService.processarCobranca(COB)).resolves.toBeUndefined();
    expect(conexao.marcarReconectar).not.toHaveBeenCalled();
  });

  it('pagamento recusado marca a cobrança como recusada', async () => {
    reserva(); cobranca();
    gw.buscarPorReferencia.mockResolvedValue([pagamento({ status: 'rejected' })]);
    await pagamentosService.processarCobranca(COB);
    expect(lerCobranca().situacao).toBe('recusada');
    expect(lerReserva().status).toBe('aguardando_pagamento');
  });

  it.each([
    ['recusado antes', [pagamento({ id: '1', status: 'rejected' }), pagamento({ id: '2' })]],
    ['recusado depois', [pagamento({ id: '2' }), pagamento({ id: '1', status: 'rejected' })]],
  ])('aprovado tem prioridade sobre recusado (%s)', async (_n, lista) => {
    reserva(); cobranca();
    gw.buscarPorReferencia.mockResolvedValue(lista);
    await pagamentosService.processarCobranca(COB);

    expect(lerCobranca()).toMatchObject({ situacao: 'paga', pagamentoExternoId: '2' });
    expect(lerReserva().status).toBe('confirmado');
    expect(sinal.avisarSinalConfirmado).toHaveBeenCalledTimes(1);
  });

  it('com aprovado que não confirmou, o recusado não muda a cobrança', async () => {
    reserva(); cobranca();
    gw.buscarPorReferencia.mockResolvedValue([pagamento({ id: '1', status: 'rejected' }), pagamento({ id: '2', valor: 1 })]);
    await pagamentosService.processarCobranca(COB);
    expect(lerCobranca().situacao).toBe('pendente');
  });

  it('cartão recusado pode ser pago na segunda tentativa', async () => {
    reserva(); cobranca({ situacao: 'recusada' });
    await pagamentosService.processarCobranca(COB);
    expect(lerReserva().status).toBe('confirmado');
    expect(sinal.avisarSinalConfirmado).toHaveBeenCalledTimes(1);
  });

  it('recusa nunca apaga a marca de vencimento da cobrança expirada', async () => {
    reserva({ status: 'cancelado', expiresAt: emMinutos(-10) }); cobranca({ situacao: 'expirada' });
    gw.buscarPorReferencia.mockResolvedValue([pagamento({ status: 'rejected' })]);
    await pagamentosService.processarCobranca(COB);
    expect(lerCobranca().situacao).toBe('expirada');
  });
});

describe('marcarPagaEConfirmar', () => {
  it('reserva vencida: desfaz a marca de paga e devolve confirmou false', async () => {
    reserva({ expiresAt: emMinutos(-1) }); cobranca();
    await expect(recebimentosRepository.marcarPagaEConfirmar(COB, pagamento() as never)).resolves.toEqual({ confirmou: false });
    expect(lerCobranca()).toMatchObject({ situacao: 'pendente', pagamentoExternoId: null, pagoEm: null });
    expect(lerReserva().status).toBe('aguardando_pagamento');
  });

  it('reserva que deixou de aguardar pagamento: desfaz a marca de paga', async () => {
    reserva({ status: 'confirmado' }); cobranca();
    await expect(recebimentosRepository.marcarPagaEConfirmar(COB, pagamento() as never)).resolves.toEqual({ confirmou: false });
    expect(lerCobranca().situacao).toBe('pendente');
  });

  it('cobrança já paga não muda nada', async () => {
    reserva(); cobranca({ situacao: 'paga', pagamentoExternoId: '1' });
    await expect(recebimentosRepository.marcarPagaEConfirmar(COB, pagamento() as never)).resolves.toEqual({ confirmou: false });
    expect(lerCobranca().pagamentoExternoId).toBe('1');
    expect(lerReserva().status).toBe('aguardando_pagamento');
  });

  it('erro que não é repetição continua lançando e desfaz a marca', async () => {
    reserva(); cobranca();
    vi.spyOn(banco.db.appointment, 'updateMany').mockRejectedValueOnce(new Error('banco fora'));
    await expect(recebimentosRepository.marcarPagaEConfirmar(COB, pagamento() as never)).rejects.toThrow('banco fora');
    expect(lerCobranca().situacao).toBe('pendente');
  });

  it('a rodada seguinte decide reativar quando a reserva venceu no meio do caminho', async () => {
    reserva({ expiresAt: emMinutos(-1) }); cobranca();
    await recebimentosRepository.marcarPagaEConfirmar(COB, pagamento() as never);
    await pagamentosService.processarCobranca(COB);

    expect(lerReserva()).toMatchObject({ status: 'confirmado', expiresAt: null });
    expect(sinal.avisarSinalConfirmado).toHaveBeenCalledTimes(1);
  });
});

describe('expirarReserva', () => {
  const agora = () => new Date();

  it('cancela a reserva vencida e marca as cobranças pendente e recusada como expirada', async () => {
    reserva({ expiresAt: emMinutos(-1) }); cobranca(); cobranca({ id: COB2, situacao: 'recusada' });
    cobranca({ id: 'c-paga', situacao: 'paga', pagamentoExternoId: '1' });
    await expect(recebimentosRepository.expirarReserva('a1', agora())).resolves.toBe(true);

    expect(lerReserva().status).toBe('cancelado');
    expect(lerCobranca().situacao).toBe('expirada');
    expect(lerCobranca(COB2).situacao).toBe('expirada');
    expect(lerCobranca('c-paga').situacao).toBe('paga');
  });

  it('cartão recusado e aprovado depois do vencimento, com horário livre: reativa', async () => {
    reserva({ expiresAt: emMinutos(-1) }); cobranca({ situacao: 'recusada' });
    await recebimentosRepository.expirarReserva('a1', agora());
    await pagamentosService.processarCobranca(COB);

    expect(lerReserva()).toMatchObject({ status: 'confirmado', expiresAt: null });
    expect(sinal.avisarSinalConfirmado).toHaveBeenCalledTimes(1);
    expect(alertas()).toHaveLength(0);
  });

  it.each([
    ['cancelada por pessoa', { status: 'cancelado', expiresAt: emMinutos(-1) }],
    ['confirmada', { status: 'confirmado', expiresAt: emMinutos(-1) }],
    ['ainda no prazo', { expiresAt: emMinutos(5) }],
  ])('reserva %s: desfaz a marca de expirada, que só vale para vencimento', async (_n, r) => {
    reserva(r); cobranca();
    await expect(recebimentosRepository.expirarReserva('a1', agora())).resolves.toBe(false);
    expect(lerCobranca().situacao).toBe('pendente');
  });
});

describe('reativar', () => {
  it('reserva vencida ainda aguardando, horário livre: confirma, zera expiresAt e avisa', async () => {
    reserva({ expiresAt: emMinutos(-5) }); cobranca();
    const trava = vi.spyOn(publicBookingRepository, 'withProfessionalDayLock');
    await pagamentosService.processarCobranca(COB);

    expect(trava).toHaveBeenCalledWith('p1', '2099-11-10', expect.any(Function));
    expect(banco.db.$executeRaw).toHaveBeenCalled();
    expect(apptRepo.hasConflict).toHaveBeenCalledWith('b1', 'p1', '2099-11-10', '10:00:00', 'a1', banco.db);
    expect(lerReserva()).toMatchObject({ status: 'confirmado', expiresAt: null });
    expect(lerCobranca()).toMatchObject({ situacao: 'paga', pagamentoExternoId: '555' });
    expect(sinal.avisarSinalConfirmado).toHaveBeenCalledTimes(1);
  });

  it('reserva cancelada por vencimento, horário livre: confirma', async () => {
    reserva({ status: 'cancelado', expiresAt: emMinutos(-20) }); cobranca({ situacao: 'expirada' });
    await pagamentosService.processarCobranca(COB);

    expect(lerReserva()).toMatchObject({ status: 'confirmado', expiresAt: null });
    expect(lerCobranca().situacao).toBe('paga');
    expect(sinal.avisarSinalConfirmado).toHaveBeenCalledTimes(1);
  });

  it('horário ocupado: cobrança paga, reserva mantida, alerta com nome e valor e mensagem ao cliente', async () => {
    reserva({ status: 'cancelado', expiresAt: emMinutos(-20) }); cobranca({ situacao: 'expirada' });
    apptRepo.hasConflict.mockResolvedValue(true);
    await pagamentosService.processarCobranca(COB);

    expect(lerCobranca()).toMatchObject({ situacao: 'paga', pagamentoExternoId: '555' });
    expect(lerReserva().status).toBe('cancelado');
    expect(sinal.avisarSinalConfirmado).not.toHaveBeenCalled();
    expect(alertas()).toHaveLength(1);
    const texto = alertas()[0]![1].description;
    expect(alertas()[0]![0]).toBe('b1');
    expect(texto).toContain('Mariana Souza');
    expect(texto).toContain('30,00');
    expect(texto).toContain('Mercado Pago');
    expect(whats.sendWhatsAppMessage).toHaveBeenCalledTimes(1);
    expect(whats.sendWhatsAppMessage.mock.calls[0]![0]).toBe('5511999999999');
    expect(whats.sendWhatsAppMessage.mock.calls[0]![1]).toContain(AVISO_CLIENTE);
    expect(whats.sendWhatsAppMessage.mock.calls[0]![2]).toMatchObject({ businessId: 'b1' });
  });

  it('pagamento aprovado depois do horário da reserva cai no caminho de ocupado', async () => {
    reserva({ status: 'cancelado', expiresAt: emMinutos(-20), date: new Date('2020-01-10T00:00:00Z') });
    cobranca({ situacao: 'expirada' });
    await pagamentosService.processarCobranca(COB);

    expect(agenda.getBusinessScheduleSettings).toHaveBeenCalledWith('b1');
    expect(lerReserva().status).toBe('cancelado');
    expect(lerCobranca()).toMatchObject({ situacao: 'paga', pagamentoExternoId: '555' });
    expect(sinal.avisarSinalConfirmado).not.toHaveBeenCalled();
    expect(alertas()).toHaveLength(1);
    expect(alertas()[0]![1].description).toContain('devolva se for o caso');
    expect(whats.sendWhatsAppMessage.mock.calls[0]![1]).toContain(AVISO_CLIENTE);
  });

  it('ao reativar, a cobrança irmã perde a marca expirada e não reverte um cancelamento feito depois', async () => {
    reserva({ status: 'cancelado', expiresAt: emMinutos(-20) });
    cobranca({ situacao: 'expirada' });
    cobranca({ id: COB2, situacao: 'expirada' });
    await pagamentosService.processarCobranca(COB);

    expect(lerReserva().status).toBe('confirmado');
    expect(lerCobranca(COB2).situacao).toBe('recusada');

    // Pessoa cancela, a primeira é devolvida e a irmã é paga tarde.
    lerReserva().status = 'cancelado';
    lerCobranca().situacao = 'devolvida';
    gw.buscarPorReferencia.mockResolvedValue([pagamento({ id: '556', referencia: COB2 })]);
    await pagamentosService.processarCobranca(COB2);

    expect(lerReserva().status).toBe('cancelado');
    expect(lerCobranca(COB2).situacao).toBe('paga');
    expect(alertas()).toHaveLength(1);
  });

  it('com horário ocupado, a cobrança irmã continua expirada', async () => {
    reserva({ status: 'cancelado', expiresAt: emMinutos(-20) });
    cobranca({ situacao: 'expirada' });
    cobranca({ id: COB2, situacao: 'expirada' });
    apptRepo.hasConflict.mockResolvedValue(true);
    await pagamentosService.processarCobranca(COB);
    expect(lerCobranca(COB2).situacao).toBe('expirada');
  });

  it('reativação desfeita devolve a marca expirada da cobrança irmã', async () => {
    reserva({ status: 'cancelado', expiresAt: emMinutos(-20) });
    cobranca({ situacao: 'expirada' });
    cobranca({ id: COB2, situacao: 'expirada' });
    vi.spyOn(banco.db.appointment, 'updateMany').mockResolvedValueOnce({ count: 0 });
    await pagamentosService.processarCobranca(COB);

    expect(lerCobranca().situacao).toBe('expirada');
    expect(lerCobranca(COB2).situacao).toBe('expirada');
  });

  it('horário ocupado com repetição do aviso: alerta uma vez só', async () => {
    reserva({ expiresAt: emMinutos(-5) }); cobranca();
    apptRepo.hasConflict.mockResolvedValue(true);
    await pagamentosService.processarCobranca(COB);
    await pagamentosService.processarCobranca(COB);

    expect(lerReserva().status).toBe('aguardando_pagamento');
    expect(alertas()).toHaveLength(1);
    expect(whats.sendWhatsAppMessage).toHaveBeenCalledTimes(1);
  });

  it('dois processamentos simultâneos reativam e avisam uma vez', async () => {
    reserva({ status: 'cancelado', expiresAt: emMinutos(-20) }); cobranca({ situacao: 'expirada' });
    await Promise.all([pagamentosService.processarCobranca(COB), pagamentosService.processarCobranca(COB)]);
    expect(sinal.avisarSinalConfirmado).toHaveBeenCalledTimes(1);
    expect(alertas()).toHaveLength(0);
  });

  it('pessoa cancela enquanto a rotina espera a trava: nada é revertido nem avisado', async () => {
    reserva({ expiresAt: emMinutos(-5) }); cobranca();
    const original = publicBookingRepository.withProfessionalDayLock.bind(publicBookingRepository);
    vi.spyOn(publicBookingRepository, 'withProfessionalDayLock').mockImplementation(async (p, d, fn) => {
      lerReserva().status = 'cancelado';
      return original(p, d, fn);
    });
    await pagamentosService.processarCobranca(COB);

    expect(lerReserva().status).toBe('cancelado');
    expect(lerCobranca().situacao).toBe('pendente');
    expect(sinal.avisarSinalConfirmado).not.toHaveBeenCalled();
    expect(alertas()).toHaveLength(0);
  });

  it('reserva muda entre a conferência e a gravação: desfaz a marca de paga', async () => {
    reserva({ expiresAt: emMinutos(-5) }); cobranca();
    apptRepo.hasConflict.mockImplementation(async () => { lerReserva().status = 'cancelado'; return false; });
    await pagamentosService.processarCobranca(COB);

    expect(lerCobranca().situacao).toBe('pendente');
    expect(sinal.avisarSinalConfirmado).not.toHaveBeenCalled();
    expect(alertas()).toHaveLength(0);
  });

  it('P2002 ao gravar é repetição: nada de aviso', async () => {
    reserva({ expiresAt: emMinutos(-5) }); cobranca();
    cobranca({ id: COB2, appointmentId: 'outra', situacao: 'devolvida', pagamentoExternoId: '555' });
    await expect(pagamentosService.processarCobranca(COB)).resolves.toBeUndefined();

    expect(lerReserva().status).toBe('aguardando_pagamento');
    expect(sinal.avisarSinalConfirmado).not.toHaveBeenCalled();
    expect(alertas()).toHaveLength(0);
  });
});

describe('alertar_atrasado', () => {
  it('cancelamento feito por pessoa nunca é revertido: grava paga, alerta uma vez e fala com o cliente', async () => {
    reserva({ status: 'cancelado' }); cobranca();
    await pagamentosService.processarCobranca(COB);
    await pagamentosService.processarCobranca(COB);

    expect(lerReserva().status).toBe('cancelado');
    expect(lerCobranca()).toMatchObject({ situacao: 'paga', pagamentoExternoId: '555' });
    expect(apptRepo.hasConflict).not.toHaveBeenCalled();
    expect(alertas()).toHaveLength(1);
    expect(alertas()[0]![1].description).toContain('Mariana Souza');
    expect(whats.sendWhatsAppMessage).toHaveBeenCalledTimes(1);
    expect(whats.sendWhatsAppMessage.mock.calls[0]![1]).toContain(AVISO_CLIENTE);
  });
});

describe('alertar_duplicado', () => {
  it('reserva já confirmada: grava a cobrança como paga, alerta e não mexe na reserva', async () => {
    reserva({ status: 'confirmado' }); cobranca();
    await pagamentosService.processarCobranca(COB);
    await pagamentosService.processarCobranca(COB);

    expect(lerCobranca()).toMatchObject({ situacao: 'paga', pagamentoExternoId: '555' });
    expect(lerReserva().status).toBe('confirmado');
    expect(alertas()).toHaveLength(1);
    expect(alertas()[0]![1].description).toContain('Mariana Souza');
    expect(alertas()[0]![1].description).toContain('30,00');
    expect(sinal.avisarSinalConfirmado).not.toHaveBeenCalled();
    expect(whats.sendWhatsAppMessage).not.toHaveBeenCalled();
  });

  it('outra cobrança da reserva já paga: a segunda fica paga e alerta', async () => {
    reserva(); cobranca();
    cobranca({ id: COB2, situacao: 'paga', pagamentoExternoId: '111' });
    await pagamentosService.processarCobranca(COB);

    expect(lerCobranca()).toMatchObject({ situacao: 'paga', pagamentoExternoId: '555' });
    expect(lerCobranca(COB2).pagamentoExternoId).toBe('111');
    expect(lerReserva().status).toBe('aguardando_pagamento');
    expect(alertas()).toHaveLength(1);
  });

  it('dois pagamentos aprovados na mesma cobrança: confirma pelo primeiro, registra o segundo e alerta uma vez', async () => {
    reserva(); cobranca({ forma: 'cartao' });
    gw.buscarPorReferencia.mockResolvedValue([pagamento({ id: '1' }), pagamento({ id: '2' })]);
    await pagamentosService.processarCobranca(COB);
    await pagamentosService.processarCobranca(COB);
    await pagamentosService.processarCobranca(COB);

    expect(lerCobranca()).toMatchObject({ situacao: 'paga', pagamentoExternoId: '1' });
    const extra = banco.estado.cobrancas.find((c) => c.pagamentoExternoId === '2');
    expect(extra).toMatchObject({ situacao: 'paga', appointmentId: 'a1', businessId: 'b1', forma: 'cartao', valor: '30.00' });
    expect(sinal.avisarSinalConfirmado).toHaveBeenCalledTimes(1);
    expect(alertas()).toHaveLength(1);
  });
});

describe('devolução e contestação', () => {
  it.each([
    ['refunded', 'devolvida'],
    ['charged_back', 'contestada'],
  ])('%s marca %s, notifica uma vez e não cancela a reserva', async (status, situacao) => {
    reserva({ status: 'confirmado' }); cobranca({ situacao: 'paga', pagamentoExternoId: '555' });
    gw.buscarPorReferencia.mockResolvedValue([pagamento({ status })]);
    await pagamentosService.processarCobranca(COB);
    await pagamentosService.processarCobranca(COB);

    expect(lerCobranca().situacao).toBe(situacao);
    expect(lerReserva().status).toBe('confirmado');
    expect(alertas()).toHaveLength(1);
    expect(alertas()[0]![1].description).toContain('Mariana Souza');
  });

  it('devolução de outro pagamento da mesma referência não muda a cobrança paga', async () => {
    reserva({ status: 'confirmado' }); cobranca({ situacao: 'paga', pagamentoExternoId: '555' });
    gw.buscarPorReferencia.mockResolvedValue([pagamento(), pagamento({ id: '777', status: 'refunded' })]);
    await pagamentosService.processarCobranca(COB);

    expect(lerCobranca().situacao).toBe('paga');
    expect(alertas()).toHaveLength(0);
  });

  it('devolução sem linha paga com aquele pagamento não muda nada nem alerta', async () => {
    reserva(); cobranca();
    gw.buscarPorReferencia.mockResolvedValue([pagamento({ status: 'refunded' })]);
    await pagamentosService.processarCobranca(COB);

    expect(lerCobranca().situacao).toBe('pendente');
    expect(alertas()).toHaveLength(0);
  });

  it.each([
    ['refunded', 'devolvida'],
    ['charged_back', 'contestada'],
  ])('%s do repetido com a cobrança principal já devolvida marca %s, e o lembrete não pede devolução', async (status, situacao) => {
    reserva({ status: 'confirmado' }); cobranca({ situacao: 'devolvida', pagamentoExternoId: '1' });
    cobranca({ id: 'extra', situacao: 'paga', pagamentoExternoId: '2', venceEm: null });
    gw.buscarPorReferencia.mockResolvedValue([pagamento({ id: '1', status: 'refunded' }), pagamento({ id: '2', status })]);
    await pagamentosService.processarCobranca(COB);
    await pagamentosService.processarCobranca(COB);

    expect(lerCobranca('extra').situacao).toBe(situacao);
    expect(alertas()).toHaveLength(1);

    await recebimentosRepository.lembrarDevolucaoAoCancelar('b1', 'a1');
    expect(alertas()).toHaveLength(1);
  });

  it('devolução do pagamento repetido marca só o registro dele', async () => {
    reserva({ status: 'confirmado' }); cobranca({ situacao: 'paga', pagamentoExternoId: '1' });
    cobranca({ id: 'extra', situacao: 'paga', pagamentoExternoId: '2', venceEm: null });
    gw.buscarPorReferencia.mockResolvedValue([pagamento({ id: '1' }), pagamento({ id: '2', status: 'refunded' })]);
    await pagamentosService.processarCobranca(COB);

    expect(lerCobranca().situacao).toBe('paga');
    expect(lerCobranca('extra').situacao).toBe('devolvida');
    expect(alertas()).toHaveLength(1);
  });
});

describe('conferirPendentes', () => {
  const agora = new Date('2026-11-10T12:00:00Z');
  const aos = (m: number) => new Date(agora.getTime() + m * MINUTO);

  it('consulta pendente, expirada e recusada com vence_em até 30 minutos atrás', async () => {
    reserva();
    cobranca({ id: 'c-pendente', venceEm: aos(5) });
    cobranca({ id: 'c-expirada', situacao: 'expirada', venceEm: aos(-29) });
    cobranca({ id: 'c-recusada', situacao: 'recusada', venceEm: aos(-30) });
    cobranca({ id: 'c-antiga', venceEm: aos(-31) });
    cobranca({ id: 'c-paga', situacao: 'paga', venceEm: aos(5) });
    cobranca({ id: 'c-devolvida', situacao: 'devolvida', venceEm: aos(5) });
    cobranca({ id: 'c-sem-prazo', venceEm: null });
    gw.buscarPorReferencia.mockResolvedValue([]);
    await pagamentosService.conferirPendentes(agora);

    expect(gw.buscarPorReferencia.mock.calls.map((c) => c[1]).sort()).toEqual(['c-expirada', 'c-pendente', 'c-recusada']);
    expect(gw.referenciaDoRecurso).not.toHaveBeenCalled();
  });

  it('cartão vencido há horas é conferido a cada 15 minutos, por até 24 horas', async () => {
    reserva();
    cobranca({ id: 'c-cartao', forma: 'cartao', situacao: 'expirada', venceEm: aos(-6 * 60) });
    cobranca({ id: 'c-cartao-velho', forma: 'cartao', situacao: 'expirada', venceEm: aos(-25 * 60) });
    cobranca({ id: 'c-pix', situacao: 'expirada', venceEm: aos(-6 * 60) });
    gw.buscarPorReferencia.mockResolvedValue([]);
    await pagamentosService.conferirPendentes(agora);
    expect(gw.buscarPorReferencia.mock.calls.map((c) => c[1])).toEqual(['c-cartao']);
    gw.buscarPorReferencia.mockClear();
    await pagamentosService.conferirPendentes(aos(1));
    expect(gw.buscarPorReferencia).not.toHaveBeenCalled();
  });

  it('confirma pelo caminho comum', async () => {
    reserva(); cobranca({ venceEm: emMinutos(5) });
    await pagamentosService.conferirPendentes();
    expect(lerReserva().status).toBe('confirmado');
    expect(sinal.avisarSinalConfirmado).toHaveBeenCalledTimes(1);
  });

  it('pula negócios sem conexão e segue com os demais', async () => {
    reserva(); reserva({ id: 'a2', businessId: 'b2' });
    cobranca({ id: COB2, businessId: 'b2', appointmentId: 'a2', venceEm: emMinutos(5) });
    cobranca({ venceEm: emMinutos(5) });
    conexao.tokenAtivo.mockImplementation(async (b: string) => (b === 'b1' ? { gateway: 'mercadopago', accessToken: 't' } : null));
    await expect(pagamentosService.conferirPendentes()).resolves.toBeUndefined();

    expect(gw.buscarPorReferencia).toHaveBeenCalledTimes(1);
    expect(gw.buscarPorReferencia).toHaveBeenCalledWith('t', COB);
    expect(sinal.avisarSinalConfirmado).toHaveBeenCalledTimes(1);
  });

  it('falha numa cobrança não impede as outras', async () => {
    reserva(); reserva({ id: 'a2' });
    cobranca({ id: COB2, appointmentId: 'a2', venceEm: emMinutos(5) });
    cobranca({ venceEm: emMinutos(5) });
    gw.buscarPorReferencia.mockRejectedValueOnce(new Error('inesperado'));
    await expect(pagamentosService.conferirPendentes()).resolves.toBeUndefined();
    expect(gw.buscarPorReferencia).toHaveBeenCalledTimes(2);
    expect(lerCobranca().situacao).toBe('paga');
  });

  it('sem a configuração de recebimentos nada é chamado', async () => {
    delete process.env['MERCADOPAGO_CLIENT_ID'];
    reserva(); cobranca({ venceEm: emMinutos(5) });
    await pagamentosService.conferirPendentes();
    expect(conexao.tokenAtivo).not.toHaveBeenCalled();
  });
});

describe('conferirAoReconectar', () => {
  it('confere as cobranças do negócio vencidas nos últimos 7 dias, e só elas', async () => {
    const agora = new Date('2026-11-10T12:00:00Z');
    const dias = (d: number) => new Date(agora.getTime() - d * 24 * 60 * MINUTO);
    reserva();
    cobranca({ id: 'c-2d', situacao: 'expirada', venceEm: dias(2) });
    cobranca({ id: 'c-8d', situacao: 'expirada', venceEm: dias(8) });
    cobranca({ id: 'c-outro', businessId: 'b2', situacao: 'expirada', venceEm: dias(1) });
    cobranca({ id: 'c-orfa', situacao: 'expirada', venceEm: dias(1), idExterno: null });
    cobranca({ id: 'c-paga', situacao: 'paga', venceEm: dias(1) });
    gw.buscarPorReferencia.mockResolvedValue([]);
    await pagamentosService.conferirAoReconectar('b1', agora);
    expect(gw.buscarPorReferencia.mock.calls.map((c) => c[1])).toEqual(['c-2d']);
  });
});

describe('POST /webhook/mercadopago', () => {
  const URL_WEBHOOK = '/api/v1/recebimentos/webhook/mercadopago';
  let processar: ReturnType<typeof vi.spyOn>;
  beforeEach(() => { processar = vi.spyOn(pagamentosService, 'processarAviso').mockResolvedValue(undefined); });

  it('responde 200 antes de processar', async () => {
    processar.mockReturnValue(new Promise<void>(() => undefined));
    const r = await request.post(URL_WEBHOOK).send({ type: 'payment', user_id: '999', data: { id: '555' } });
    expect(r.status).toBe(200);
    expect(processar).toHaveBeenCalledTimes(1);
  });

  it('user_id numérico vira texto', async () => {
    await request.post(URL_WEBHOOK).send({ type: 'order', user_id: 999, data: { id: 'ORD01' } });
    expect(processar).toHaveBeenCalledWith({ contaId: '999', tipo: 'order', recursoId: 'ORD01' });
  });

  it('lê data.id da query', async () => {
    await request.post(`${URL_WEBHOOK}?data.id=555&type=payment`).send({ type: 'payment', user_id: 999 });
    expect(processar).toHaveBeenCalledWith({ contaId: '999', tipo: 'payment', recursoId: '555' });
  });

  it('data.id numérico vira texto', async () => {
    await request.post(URL_WEBHOOK).send({ type: 'payment', user_id: 999, data: { id: 555 } });
    expect(processar).toHaveBeenCalledWith({ contaId: '999', tipo: 'payment', recursoId: '555' });
  });

  it.each([
    ['tipo diferente', { type: 'plan', user_id: 999, data: { id: '1' } }],
    ['sem user_id', { type: 'payment', data: { id: '1' } }],
    ['sem data.id', { type: 'payment', user_id: 999 }],
    ['id que não é texto nem número', { type: 'payment', user_id: 999, data: { id: { x: 1 } } }],
    ['corpo vazio', {}],
    ['payment com letras', { type: 'payment', user_id: 999, data: { id: 'texto-recebido' } }],
    ['payment longo demais', { type: 'payment', user_id: 999, data: { id: '1'.repeat(65) } }],
    ['order com símbolos', { type: 'order', user_id: 999, data: { id: 'ORD/../texto-recebido' } }],
    ['order longo demais', { type: 'order', user_id: 999, data: { id: 'A'.repeat(65) } }],
    ['user_id com letras', { type: 'payment', user_id: 'texto-recebido', data: { id: '1' } }],
    ['user_id longo demais', { type: 'payment', user_id: '9'.repeat(65), data: { id: '1' } }],
  ])('%s: responde 200 sem chamar o serviço e sem registrar o texto', async (_n, corpo) => {
    const r = await request.post(URL_WEBHOOK).send(corpo);
    expect(r.status).toBe(200);
    expect(processar).not.toHaveBeenCalled();
    expect(JSON.stringify([log.info.mock.calls, log.warn.mock.calls, log.error.mock.calls])).not.toContain('texto-recebido');
  });

  it('aceita ids no tamanho máximo', async () => {
    await request.post(URL_WEBHOOK).send({ type: 'order', user_id: '9'.repeat(64), data: { id: 'A'.repeat(64) } });
    expect(processar).toHaveBeenCalledTimes(1);
  });

  // Por último: consome o limite do IP, que vale para a janela inteira.
  it('acima de 300 pedidos por minuto responde 200 e não processa', async () => {
    const corpo = { type: 'payment', user_id: 999, data: { id: '555' } };
    for (let i = 0; i < 300; i += 1) await request.post(URL_WEBHOOK).send(corpo);
    processar.mockClear();

    const r = await request.post(URL_WEBHOOK).send(corpo);
    expect(r.status).toBe(200);
    expect(processar).not.toHaveBeenCalled();
  }, 30_000);
});

describe('cancelamento de reserva com sinal pago', () => {
  const cancelada = (extra: Record<string, unknown> = {}) => ({
    id: 'a1', businessId: 'b1', professionalId: 'p1', status: 'confirmado', client: { name: 'Mariana Souza' }, service: { name: 'Manicure' },
    date: new Date('2026-11-10T00:00:00Z'), time: new Date('1970-01-01T10:00:00Z'), ...extra,
  });

  beforeEach(() => {
    apptRepo.findById.mockResolvedValue(cancelada());
    apptRepo.updateStatus.mockResolvedValue(cancelada({ status: 'cancelado' }));
    apptRepo.softDelete.mockResolvedValue(true);
  });

  it('notifica recebimento_alerta com o lembrete de devolver', async () => {
    reserva({ status: 'confirmado' }); cobranca({ situacao: 'paga', pagamentoExternoId: '555' });
    await appointmentsService.updateStatus('a1', 'b1', 'cancelado');

    await vi.waitFor(() => expect(alertas()).toHaveLength(1));
    const texto = alertas()[0]![1].description;
    expect(alertas()[0]![0]).toBe('b1');
    expect(texto).toContain('Mariana Souza');
    expect(texto).toContain('30,00');
    expect(texto).toContain('devolv');
  });

  it('sem cobrança paga não notifica', async () => {
    reserva({ status: 'confirmado' }); cobranca({ situacao: 'expirada' });
    const espiao = vi.spyOn(recebimentosRepository, 'lembrarDevolucaoAoCancelar');
    await appointmentsService.updateStatus('a1', 'b1', 'cancelado');

    await expect(espiao.mock.results[0]!.value).resolves.toBeUndefined();
    expect(alertas()).toHaveLength(0);
  });

  it('falha no lembrete não derruba o cancelamento', async () => {
    vi.spyOn(recebimentosRepository, 'lembrarDevolucaoAoCancelar').mockRejectedValue(new Error('banco fora'));
    await expect(appointmentsService.updateStatus('a1', 'b1', 'cancelado')).resolves.toBeTruthy();
  });

  it('outras transições não lembram', async () => {
    const espiao = vi.spyOn(recebimentosRepository, 'lembrarDevolucaoAoCancelar');
    apptRepo.updateStatus.mockResolvedValue(cancelada({ status: 'em_atendimento' }));
    await appointmentsService.updateStatus('a1', 'b1', 'em_atendimento');
    expect(espiao).not.toHaveBeenCalled();
  });

  it('cancelar pela exclusão também lembra', async () => {
    reserva({ status: 'confirmado' }); cobranca({ situacao: 'paga', pagamentoExternoId: '555' });
    await appointmentsService.delete('a1', 'b1');
    await vi.waitFor(() => expect(alertas()).toHaveLength(1));
  });
});
