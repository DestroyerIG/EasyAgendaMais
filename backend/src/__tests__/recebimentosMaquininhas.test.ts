import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';

vi.mock('../config/prisma.js', () => ({ prisma: {} }));
vi.mock('../utils/logger.js', () => ({ default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }));
vi.mock('../middleware/auth.js', () => ({
  authMiddleware: (req: express.Request, _res: express.Response, next: express.NextFunction) => {
    (req as unknown as { user: unknown }).user = {
      userId: 'u1', businessId: 'b1', role: req.header('x-role') ?? 'tenant_admin', plan: 'profissional', subscriptionStatus: 'active',
    };
    next();
  },
}));
vi.mock('../modules/recebimentos/pagamentos.service.js', () => ({ pagamentosService: {} }));

const conexao = vi.hoisted(() => ({
  tokenAtivo: vi.fn(), alertarRecusa: vi.fn(), acessoRevogado: vi.fn(), marcarReconectar: vi.fn(),
}));
vi.mock('../modules/recebimentos/conexao.service.js', () => ({ conexaoService: conexao }));

const repo = vi.hoisted(() => ({ terminalPadrao: vi.fn(), definirTerminalPadrao: vi.fn() }));
vi.mock('../modules/recebimentos/recebimentos.repository.js', () => ({ recebimentosRepository: repo }));

const gw = vi.hoisted(() => ({ listarTerminais: vi.fn(), ativarPdv: vi.fn() }));
vi.mock('../modules/recebimentos/gateways/porId.js', () => ({ gatewayDe: () => gw }));
vi.mock('../modules/recebimentos/gateways/infinitePay.js', () => ({ infinitePay: {} }));

const { maquininhasService } = await import('../modules/recebimentos/maquininhas.service.js');
const { GatewayRecusou, GatewayIndisponivel, GatewayTokenInvalido } = await import('../modules/recebimentos/gateways/index.js');
const routes = (await import('../modules/recebimentos/recebimentos.routes.js')).default;
const { errorHandler } = await import('../middleware/errorHandler.js');
const supertest = (await import('supertest')).default;

const app = express();
app.use(express.json());
app.use('/api/v1/recebimentos', routes);
app.use(errorHandler);
const request = supertest(app);

const USER = { userId: 'u1', businessId: 'b1', role: 'tenant_admin' };
const T1 = 'NEWLAND_N950__ABC12345';
const T2 = 'PAX_A910__ZZ99';

beforeEach(() => {
  vi.clearAllMocks();
  conexao.tokenAtivo.mockResolvedValue({ gateway: 'mercadopago', accessToken: 'APP_USR-segredo' });
  conexao.acessoRevogado.mockResolvedValue(false);
  gw.listarTerminais.mockResolvedValue([{ id: T1, modo: 'PDV' }, { id: T2, modo: 'STANDALONE' }]);
  gw.ativarPdv.mockResolvedValue(undefined);
  repo.terminalPadrao.mockResolvedValue(T1);
});

describe('maquininhasService', () => {
  it('lista os terminais da conta com nome, modo e o padrão', async () => {
    expect(await maquininhasService.listar(USER)).toEqual({
      padrao: T1,
      terminais: [{ id: T1, nome: 'Point final 2345', modo: 'PDV' }, { id: T2, nome: 'Point final ZZ99', modo: 'STANDALONE' }],
    });
    expect(gw.listarTerminais).toHaveBeenCalledWith('APP_USR-segredo');
  });

  it('sem Mercado Pago ativo: 409 SEM_GATEWAY', async () => {
    conexao.tokenAtivo.mockResolvedValue(null);
    await expect(maquininhasService.listar(USER)).rejects.toMatchObject({ statusCode: 409, code: 'SEM_GATEWAY' });
    conexao.tokenAtivo.mockResolvedValue({ gateway: 'infinitepay', accessToken: 'x' });
    await expect(maquininhasService.listar(USER)).rejects.toMatchObject({ code: 'SEM_GATEWAY' });
  });

  it('gateway fora do ar ao listar: 502, sem vazar detalhes; acesso revogado pede reconexão', async () => {
    gw.listarTerminais.mockRejectedValue(new GatewayIndisponivel());
    await expect(maquininhasService.listar(USER)).rejects.toMatchObject({ statusCode: 502, code: 'GATEWAY_INDISPONIVEL' });
    conexao.acessoRevogado.mockResolvedValue(true);
    gw.listarTerminais.mockRejectedValue(new GatewayTokenInvalido());
    await expect(maquininhasService.listar(USER)).rejects.toMatchObject({ statusCode: 502 });
    expect(conexao.marcarReconectar).toHaveBeenCalledWith('b1', expect.any(String));
  });

  it('ativarPdv só vale para terminal da conta e relê a lista', async () => {
    const r = await maquininhasService.ativarPdv(USER, T2);
    expect(gw.ativarPdv).toHaveBeenCalledWith('APP_USR-segredo', T2);
    expect(r.terminais).toHaveLength(2);
    await expect(maquininhasService.ativarPdv(USER, 'OUTRA__SERIAL')).rejects.toMatchObject({ statusCode: 404 });
    expect(gw.ativarPdv).toHaveBeenCalledTimes(1);
  });

  it('PDV recusado (terminal sem loja ou caixa): 409 com o passo a passo, não um erro genérico', async () => {
    gw.ativarPdv.mockRejectedValue(new GatewayRecusou());
    await expect(maquininhasService.ativarPdv(USER, T2)).rejects.toMatchObject({
      statusCode: 409, code: 'PDV_INDISPONIVEL', message: expect.stringContaining('loja'),
    });
  });

  it('definirPadrao aceita só terminal da conta e aceita null para limpar', async () => {
    await maquininhasService.definirPadrao(USER, T2);
    expect(repo.definirTerminalPadrao).toHaveBeenCalledWith('b1', T2);
    await expect(maquininhasService.definirPadrao(USER, 'OUTRA__SERIAL')).rejects.toMatchObject({ statusCode: 404 });
    expect(repo.definirTerminalPadrao).toHaveBeenCalledTimes(1);
    await maquininhasService.definirPadrao(USER, null);
    expect(repo.definirTerminalPadrao).toHaveBeenLastCalledWith('b1', null);
  });
});

describe('rotas das maquininhas', () => {
  it('só o dono: outro papel recebe 403', async () => {
    for (const role of ['employee', 'professional']) {
      expect((await request.get('/api/v1/recebimentos/maquininhas').set('x-role', role)).status, role).toBe(403);
    }
    expect(gw.listarTerminais).not.toHaveBeenCalled();
  });

  it('GET lista, PUT define o padrão e POST ativa o PDV devolvendo a lista atualizada', async () => {
    const lista = await request.get('/api/v1/recebimentos/maquininhas');
    expect(lista.status).toBe(200);
    expect(lista.body.data ?? lista.body).toMatchObject({ padrao: T1 });

    const padrao = await request.put('/api/v1/recebimentos/maquininhas/padrao').send({ terminalId: T2 });
    expect(padrao.status).toBe(200);
    expect(repo.definirTerminalPadrao).toHaveBeenCalledWith('b1', T2);

    const pdv = await request.post(`/api/v1/recebimentos/maquininhas/${T2}/pdv`);
    expect(pdv.status).toBe(200);
    expect(gw.ativarPdv).toHaveBeenCalledWith('APP_USR-segredo', T2);
  });

  it('id ou corpo fora do formato: 400, sem chamar o gateway', async () => {
    expect((await request.post('/api/v1/recebimentos/maquininhas/id%20com%20espa%C3%A7o/pdv')).status).toBe(400);
    expect((await request.put('/api/v1/recebimentos/maquininhas/padrao').send({ terminalId: 'a b' })).status).toBe(400);
    expect((await request.put('/api/v1/recebimentos/maquininhas/padrao').send({})).status).toBe(400);
    expect(gw.ativarPdv).not.toHaveBeenCalled();
    expect(repo.definirTerminalPadrao).not.toHaveBeenCalled();
  });
});
