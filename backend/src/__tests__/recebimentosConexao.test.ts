import { vi, describe, it, beforeEach, afterEach, expect } from 'vitest';
import express from 'express';
import { randomBytes } from 'node:crypto';

vi.mock('../config/prisma.js', () => ({ prisma: {} }));
vi.mock('../utils/logger.js', () => ({ default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }));

const repo = vi.hoisted(() => ({
  usuario: vi.fn(), conexaoDoNegocio: vi.fn(), conexaoPorContaExterna: vi.fn(), conexoesAtivas: vi.fn(),
  salvarConexao: vi.fn(), atualizarConexao: vi.fn(), reservarAlerta: vi.fn(), apagarConexao: vi.fn(),
  ultimaConfirmacaoEm: vi.fn(), reservasPendentes: vi.fn(), contaEmOutroNegocio: vi.fn(), marcarReconectar: vi.fn(),
}));
vi.mock('../modules/recebimentos/recebimentos.repository.js', () => ({ recebimentosRepository: repo }));

const gw = vi.hoisted(() => ({
  urlAutorizacao: vi.fn((estado: string, desafio: string) => `https://auth.mercadopago.test/authorization?state=${estado}&code_challenge=${desafio}`),
  trocarCodigo: vi.fn(), renovar: vi.fn(), conta: vi.fn(),
}));
vi.mock('../modules/recebimentos/gateways/index.js', async (orig) => ({
  ...(await orig<typeof import('../modules/recebimentos/gateways/index.js')>()), gateways: { mercadopago: gw },
}));

const notif = vi.hoisted(() => ({ notify: vi.fn() }));
vi.mock('../modules/notifications/notifications.service.js', () => ({ notificationsService: notif }));
vi.mock('../middleware/auth.js', () => ({
  authMiddleware: (req: express.Request, _res: express.Response, next: express.NextFunction) => {
    (req as unknown as { user: unknown }).user = {
      userId: req.header('x-user') ?? 'u1', businessId: 'b1', role: req.header('x-role') ?? 'tenant_admin',
      plan: 'profissional', subscriptionStatus: 'active',
    };
    next();
  },
}));

const rules = await import('../modules/recebimentos/recebimentos.rules.js');
const { conexaoService } = await import('../modules/recebimentos/conexao.service.js');
const { GatewayIndisponivel, GatewayTokenInvalido } = await import('../modules/recebimentos/gateways/index.js');
const { decifrarCom } = await import('../utils/cifra.js');
const routes = (await import('../modules/recebimentos/recebimentos.routes.js')).default;
const { errorHandler } = await import('../middleware/errorHandler.js');
const supertest = (await import('supertest')).default;

const app = express();
app.use(express.json());
app.use('/api/v1/recebimentos', routes);
app.use(errorHandler);
const request = supertest(app);

const ENVS = ['MERCADOPAGO_CLIENT_ID', 'MERCADOPAGO_CLIENT_SECRET', 'MERCADOPAGO_REDIRECT_URI', 'RECEBIMENTOS_TOKEN_KEY'];
const TELA = 'https://app.test/dashboard/configuracoes/recebimentos/mercadopago';
const dono = { userId: 'u1', businessId: 'b1', role: 'tenant_admin' };
const tokens = { accessToken: 'APP_USR-acesso-secreto', refreshToken: 'TG-refresh-secreto', expiraEm: new Date('2027-05-01T00:00:00Z'), contaId: '999' };
const DIA = 24 * 60 * 60 * 1000;

const conexao = (extra: Record<string, unknown> = {}) => ({
  id: 'c1', businessId: 'b1', gateway: 'mercadopago', situacao: 'ativa', contaExternaId: '999', contaNome: 'Studio Aurora',
  accessTokenCifrado: 'x', refreshTokenCifrado: 'y', tokenExpiraEm: new Date('2027-05-01T00:00:00Z'),
  aceitaPix: true, aceitaCartao: false, aceiteCartaoEm: null, ultimoAlertaEm: null, ...extra,
});

/** Percorre conectar + callback e devolve o `t` da URL de confirmação. */
async function tokenPendente(userId = 'u1') {
  const estado = rules.assinarEstado(userId, 'mercadopago');
  gw.trocarCodigo.mockResolvedValue(tokens);
  const url = await conexaoService.callback('mercadopago', 'codigo', estado);
  return new URL(url).searchParams.get('t')!;
}

describe('Recebimentos: conexão', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.MERCADOPAGO_CLIENT_ID = 'cid';
    process.env.MERCADOPAGO_CLIENT_SECRET = 'segredo';
    process.env.MERCADOPAGO_REDIRECT_URI = 'https://api.test/api/v1/recebimentos/mercadopago/callback';
    process.env.RECEBIMENTOS_TOKEN_KEY = randomBytes(32).toString('base64');
    process.env.FRONTEND_URL = 'https://app.test';
    repo.usuario.mockResolvedValue({ id: 'u1', businessId: 'b1', role: 'tenant_admin' });
    repo.salvarConexao.mockImplementation(async (d: Record<string, unknown>) => ({ id: 'c1', ...d }));
    repo.conexaoDoNegocio.mockResolvedValue(null);
    repo.contaEmOutroNegocio.mockResolvedValue(false);
    repo.marcarReconectar.mockResolvedValue(true);
    repo.ultimaConfirmacaoEm.mockResolvedValue(null);
    repo.reservasPendentes.mockResolvedValue(0);
    gw.conta.mockResolvedValue({ id: '999', nome: 'Studio Aurora' });
  });
  afterEach(() => { for (const v of ENVS) delete process.env[v]; });

  describe('conectarUrl', () => {
    it('devolve 404 sem configuração', async () => {
      for (const v of ENVS) delete process.env[v];
      const r = await request.get('/api/v1/recebimentos/mercadopago/conectar');
      expect(r.status).toBe(404);
    });

    it('inclui o code_challenge derivado do nonce do estado', async () => {
      const r = await request.get('/api/v1/recebimentos/mercadopago/conectar');
      expect(r.status).toBe(200);
      const url = new URL(r.body.data.url);
      const estado = url.searchParams.get('state')!;
      const desafio = url.searchParams.get('code_challenge')!;
      expect(desafio).toBeTruthy();
      const lido = rules.lerEstado(estado)!;
      expect(rules.desafioPkce(rules.verificadorPkce(lido.nonce))).toBe(desafio);
    });

    it('recusa gateway desconhecido', async () => {
      const r = await request.get('/api/v1/recebimentos/outro/conectar');
      expect(r.status).toBe(400);
    });
  });

  describe('callback', () => {
    it('estado inválido redireciona para o erro e não lança', async () => {
      await expect(conexaoService.callback('mercadopago', 'codigo', 'lixo')).resolves.toBe(`${TELA}?recebimento=erro`);
      expect(gw.trocarCodigo).not.toHaveBeenCalled();
    });

    it('sem código redireciona para o erro', async () => {
      const estado = rules.assinarEstado('u1', 'mercadopago');
      await expect(conexaoService.callback('mercadopago', undefined, estado)).resolves.toBe(`${TELA}?recebimento=erro`);
    });

    it('falha na troca redireciona para o erro', async () => {
      gw.trocarCodigo.mockRejectedValue(new Error('invalid_grant'));
      const estado = rules.assinarEstado('u1', 'mercadopago');
      await expect(conexaoService.callback('mercadopago', 'codigo', estado)).resolves.toBe(`${TELA}?recebimento=erro`);
    });

    it('usa o verificador PKCE do nonce na troca', async () => {
      const estado = rules.assinarEstado('u1', 'mercadopago');
      const nonce = rules.nonceDoEstado(estado);
      gw.trocarCodigo.mockResolvedValue(tokens);
      await conexaoService.callback('mercadopago', 'codigo', estado);
      expect(gw.trocarCodigo).toHaveBeenCalledWith('codigo', rules.verificadorPkce(nonce));
    });

    it('válido redireciona para confirmar, sem token na URL', async () => {
      gw.trocarCodigo.mockResolvedValue(tokens);
      const estado = rules.assinarEstado('u1', 'mercadopago');
      const url = await conexaoService.callback('mercadopago', 'codigo', estado);
      expect(url.startsWith(`${TELA}?recebimento=confirmar&t=`)).toBe(true);
      expect(url).not.toContain(tokens.accessToken);
      expect(url).not.toContain(tokens.refreshToken);
    });

    it('rota pública redireciona com 302', async () => {
      const r = await request.get('/api/v1/recebimentos/mercadopago/callback?code=a&state=lixo');
      expect(r.status).toBe(302);
      expect(r.headers.location).toBe(`${TELA}?recebimento=erro`);
    });
  });

  describe('confirmar', () => {
    it('recusa quando o usuário logado é outro', async () => {
      const t = await tokenPendente('u1');
      const r = await request.post('/api/v1/recebimentos/mercadopago/confirmar').set('x-user', 'u2').send({ t });
      expect(r.status).toBe(403);
      expect(repo.salvarConexao).not.toHaveBeenCalled();
    });

    it('grava os tokens cifrados', async () => {
      const t = await tokenPendente('u1');
      const r = await request.post('/api/v1/recebimentos/mercadopago/confirmar').send({ t });
      expect(r.status).toBe(200);
      const salvo = repo.salvarConexao.mock.calls[0][0];
      expect(salvo.accessTokenCifrado).not.toBe(tokens.accessToken);
      expect(salvo.refreshTokenCifrado).not.toBe(tokens.refreshToken);
      expect(decifrarCom(rules.chaveRecebimentos(), salvo.accessTokenCifrado)).toBe(tokens.accessToken);
      expect(decifrarCom(rules.chaveRecebimentos(), salvo.refreshTokenCifrado)).toBe(tokens.refreshToken);
      expect(salvo).toMatchObject({ businessId: 'b1', gateway: 'mercadopago', contaExternaId: '999', contaNome: 'Studio Aurora' });
      expect(JSON.stringify(r.body)).not.toContain(tokens.accessToken);
    });

    it('recusa conta já conectada a outro negócio', async () => {
      repo.contaEmOutroNegocio.mockResolvedValue(true);
      const t = await tokenPendente('u1');
      const r = await request.post('/api/v1/recebimentos/mercadopago/confirmar').send({ t });
      expect(r.status).toBe(409);
      expect(JSON.stringify(r.body)).toContain('já está conectada a outro negócio');
      expect(repo.contaEmOutroNegocio).toHaveBeenCalledWith('mercadopago', '999', 'b1');
      expect(repo.salvarConexao).not.toHaveBeenCalled();
    });

    it('reconectar a mesma conta no mesmo negócio é permitido', async () => {
      const t = await tokenPendente('u1');
      const r = await request.post('/api/v1/recebimentos/mercadopago/confirmar').send({ t });
      expect(r.status).toBe(200);
      expect(repo.salvarConexao).toHaveBeenCalledTimes(1);
    });

    it('uso único: o mesmo t não confirma duas vezes', async () => {
      const t = await tokenPendente('u1');
      await conexaoService.confirmar(dono, 'mercadopago', t);
      await expect(conexaoService.confirmar(dono, 'mercadopago', t)).rejects.toMatchObject({ statusCode: 404 });
    });
  });

  describe('verConexao', () => {
    it('nunca devolve campo com token', async () => {
      repo.conexaoDoNegocio.mockResolvedValue(conexao({ aceiteCartaoEm: new Date('2026-11-01T00:00:00Z') }));
      repo.ultimaConfirmacaoEm.mockResolvedValue(new Date('2026-11-05T10:00:00Z'));
      repo.reservasPendentes.mockResolvedValue(2);
      const estado = await conexaoService.verConexao(dono);
      expect(JSON.stringify(estado)).not.toMatch(/token/i);
      expect(estado.conexao).toMatchObject({
        gateway: 'mercadopago', situacao: 'ativa', contaNome: 'Studio Aurora', aceitaPix: true, aceitaCartao: false,
        aceiteCartaoEm: '2026-11-01T00:00:00.000Z', ultimaConfirmacaoEm: '2026-11-05T10:00:00.000Z', reservasPendentes: 2,
      });
    });

    it('sem configuração e sem conexão', async () => {
      expect(await conexaoService.verConexao(dono)).toEqual({ configurado: true, conexao: null });
      for (const v of ENVS) delete process.env[v];
      expect(await conexaoService.verConexao(dono)).toEqual({ configurado: false, conexao: null });
    });

    it('situação diferente de ativa vira precisa_reconectar', async () => {
      repo.conexaoDoNegocio.mockResolvedValue(conexao({ situacao: 'precisa_reconectar' }));
      expect((await conexaoService.verConexao(dono)).conexao?.situacao).toBe('precisa_reconectar');
    });
  });

  describe('formas', () => {
    beforeEach(() => repo.conexaoDoNegocio.mockResolvedValue(conexao()));

    it('recusa as duas desligadas', async () => {
      const r = await request.put('/api/v1/recebimentos/mercadopago/formas').send({ aceitaPix: false, aceitaCartao: false });
      expect(r.status).toBe(400);
      expect(repo.atualizarConexao).not.toHaveBeenCalled();
    });

    it('recusa ligar cartão sem aceite nem aceite salvo', async () => {
      const r = await request.put('/api/v1/recebimentos/mercadopago/formas').send({ aceitaPix: true, aceitaCartao: true });
      expect(r.status).toBe(400);
      expect(repo.atualizarConexao).not.toHaveBeenCalled();
    });

    it('liga o cartão com aceite e grava a data do aceite', async () => {
      const r = await request.put('/api/v1/recebimentos/mercadopago/formas').send({ aceitaPix: true, aceitaCartao: true, aceiteCartao: true });
      expect(r.status).toBe(200);
      expect(repo.atualizarConexao).toHaveBeenCalledWith('c1', expect.objectContaining({ aceitaCartao: true, aceiteCartaoEm: expect.any(Date) }));
    });

    it('liga o cartão com aceite já salvo, sem pedir de novo', async () => {
      const antigo = new Date('2026-10-01T00:00:00Z');
      repo.conexaoDoNegocio.mockResolvedValue(conexao({ aceiteCartaoEm: antigo }));
      await conexaoService.definirFormas(dono, 'mercadopago', { aceitaPix: false, aceitaCartao: true });
      const patch = repo.atualizarConexao.mock.calls[0][1];
      expect(patch).toEqual({ aceitaPix: false, aceitaCartao: true });
    });

    it('sem conexão devolve 404', async () => {
      repo.conexaoDoNegocio.mockResolvedValue(null);
      const r = await request.put('/api/v1/recebimentos/mercadopago/formas').send({ aceitaPix: true, aceitaCartao: false });
      expect(r.status).toBe(404);
    });
  });

  describe('formas disponíveis para o cliente', () => {
    it('sem conexão ativa devolve só Pix', async () => {
      expect(await conexaoService.formas('b1')).toEqual(['pix']);
      repo.conexaoDoNegocio.mockResolvedValue(conexao({ situacao: 'precisa_reconectar', aceitaCartao: true }));
      expect(await conexaoService.formas('b1')).toEqual(['pix']);
    });

    it('devolve as formas ligadas e nunca lança', async () => {
      repo.conexaoDoNegocio.mockResolvedValue(conexao({ aceitaCartao: true }));
      expect(await conexaoService.formas('b1')).toEqual(['pix', 'cartao']);
      repo.conexaoDoNegocio.mockRejectedValue(new Error('banco fora'));
      expect(await conexaoService.formas('b1')).toEqual(['pix']);
    });
  });

  describe('tokenAtivo', () => {
    it('decifra o token da conexão ativa e devolve null sem ela', async () => {
      expect(await conexaoService.tokenAtivo('b1')).toBeNull();
      const { cifrarCom } = await import('../utils/cifra.js');
      repo.conexaoDoNegocio.mockResolvedValue(conexao({ accessTokenCifrado: cifrarCom(rules.chaveRecebimentos(), 'APP_USR-1') }));
      expect(await conexaoService.tokenAtivo('b1')).toEqual({ gateway: 'mercadopago', accessToken: 'APP_USR-1' });
      repo.conexaoDoNegocio.mockResolvedValue(conexao({ situacao: 'precisa_reconectar' }));
      expect(await conexaoService.tokenAtivo('b1')).toBeNull();
    });
  });

  describe('tokenAtivo: renovação na hora', () => {
    const agora = new Date('2027-04-10T00:00:00Z');
    const comToken = async (expira: Date) => {
      const { cifrarCom } = await import('../utils/cifra.js');
      const chave = rules.chaveRecebimentos();
      repo.conexaoDoNegocio.mockResolvedValue(conexao({
        tokenExpiraEm: expira, accessTokenCifrado: cifrarCom(chave, 'APP_USR-atual'), refreshTokenCifrado: cifrarCom(chave, 'TG-atual'),
      }));
    };

    it('perto de vencer: renova, grava cifrado e devolve o novo', async () => {
      await comToken(new Date(agora.getTime() + 10 * DIA));
      gw.renovar.mockResolvedValue({ accessToken: 'APP_USR-novo', refreshToken: 'TG-novo', expiraEm: new Date('2027-10-01T00:00:00Z'), contaId: '999' });
      expect(await conexaoService.tokenAtivo('b1', agora)).toEqual({ gateway: 'mercadopago', accessToken: 'APP_USR-novo' });
      expect(gw.renovar).toHaveBeenCalledWith('TG-atual');
      const patch = repo.atualizarConexao.mock.calls[0][1];
      expect(decifrarCom(rules.chaveRecebimentos(), patch.accessTokenCifrado)).toBe('APP_USR-novo');
      expect(decifrarCom(rules.chaveRecebimentos(), patch.refreshTokenCifrado)).toBe('TG-novo');
    });

    it('longe do vencimento: não renova', async () => {
      await comToken(new Date(agora.getTime() + 90 * DIA));
      expect(await conexaoService.tokenAtivo('b1', agora)).toEqual({ gateway: 'mercadopago', accessToken: 'APP_USR-atual' });
      expect(gw.renovar).not.toHaveBeenCalled();
    });

    it('GatewayTokenInvalido: marca reconectar, notifica e devolve null', async () => {
      await comToken(new Date(agora.getTime() + 10 * DIA));
      gw.renovar.mockRejectedValue(new GatewayTokenInvalido());
      expect(await conexaoService.tokenAtivo('b1', agora)).toBeNull();
      expect(repo.marcarReconectar).toHaveBeenCalledWith('b1');
      expect(notif.notify).toHaveBeenCalledTimes(1);
    });

    it('GatewayIndisponivel: devolve o token atual se ainda não venceu', async () => {
      await comToken(new Date(agora.getTime() + 10 * DIA));
      gw.renovar.mockRejectedValue(new GatewayIndisponivel());
      expect(await conexaoService.tokenAtivo('b1', agora)).toEqual({ gateway: 'mercadopago', accessToken: 'APP_USR-atual' });
      expect(repo.atualizarConexao).not.toHaveBeenCalled();
    });

    it('GatewayIndisponivel com token já vencido: devolve null', async () => {
      await comToken(new Date(agora.getTime() - DIA));
      gw.renovar.mockRejectedValue(new GatewayIndisponivel());
      expect(await conexaoService.tokenAtivo('b1', agora)).toBeNull();
      expect(repo.marcarReconectar).not.toHaveBeenCalled();
    });
  });

  describe('marcarReconectar', () => {
    it('não notifica quando outra chamada já trocou a situação', async () => {
      repo.marcarReconectar.mockResolvedValue(false);
      await conexaoService.marcarReconectar('b1', 'x');
      expect(notif.notify).not.toHaveBeenCalled();
    });
  });

  describe('desconectar', () => {
    it('apaga a conexão e não toca nas cobranças', async () => {
      repo.conexaoDoNegocio.mockResolvedValue(conexao());
      const r = await request.delete('/api/v1/recebimentos/mercadopago/conexao');
      expect(r.status).toBe(200);
      expect(repo.apagarConexao).toHaveBeenCalledWith('b1');
    });
  });

  describe('alertarRecusa', () => {
    it('notifica uma vez e não repete antes de 24 horas', async () => {
      repo.conexaoDoNegocio.mockResolvedValue(conexao());
      repo.reservarAlerta.mockResolvedValueOnce(true).mockResolvedValueOnce(false);
      await conexaoService.alertarRecusa('b1');
      await conexaoService.alertarRecusa('b1');
      expect(notif.notify).toHaveBeenCalledTimes(1);
      expect(notif.notify).toHaveBeenCalledWith('b1', expect.objectContaining({ type: 'recebimento_alerta' }));
      expect(repo.reservarAlerta).toHaveBeenCalledWith('c1', expect.any(Date), DIA);
    });
  });

  describe('porContaExterna', () => {
    it('devolve o negócio da conta', async () => {
      repo.conexaoPorContaExterna.mockResolvedValue({ businessId: 'b1' });
      expect(await conexaoService.porContaExterna('mercadopago', '999')).toEqual({ businessId: 'b1' });
      expect(repo.conexaoPorContaExterna).toHaveBeenCalledWith('mercadopago', '999');
    });
  });

  describe('renovarVencendo', () => {
    const agora = new Date('2027-04-10T00:00:00Z');
    const vencendo = () => {
      const chave = rules.chaveRecebimentos();
      return import('../utils/cifra.js').then(({ cifrarCom }) => conexao({
        tokenExpiraEm: new Date(agora.getTime() + 10 * DIA),
        refreshTokenCifrado: cifrarCom(chave, 'TG-antigo'), accessTokenCifrado: cifrarCom(chave, 'APP_USR-antigo'),
      }));
    };

    it('salva o novo refreshToken, cifrado', async () => {
      repo.conexoesAtivas.mockResolvedValue([await vencendo()]);
      const novo = { accessToken: 'APP_USR-novo', refreshToken: 'TG-novo', expiraEm: new Date('2027-10-01T00:00:00Z'), contaId: '999' };
      gw.renovar.mockResolvedValue(novo);
      await conexaoService.renovarVencendo(agora);
      expect(gw.renovar).toHaveBeenCalledWith('TG-antigo');
      const patch = repo.atualizarConexao.mock.calls[0][1];
      expect(decifrarCom(rules.chaveRecebimentos(), patch.refreshTokenCifrado)).toBe('TG-novo');
      expect(decifrarCom(rules.chaveRecebimentos(), patch.accessTokenCifrado)).toBe('APP_USR-novo');
      expect(patch.tokenExpiraEm).toEqual(novo.expiraEm);
    });

    it('não renova quem ainda tem mais de 30 dias', async () => {
      repo.conexoesAtivas.mockResolvedValue([conexao({ tokenExpiraEm: new Date(agora.getTime() + 60 * DIA) })]);
      await conexaoService.renovarVencendo(agora);
      expect(gw.renovar).not.toHaveBeenCalled();
    });

    it('GatewayTokenInvalido marca precisa_reconectar e notifica', async () => {
      repo.conexoesAtivas.mockResolvedValue([await vencendo()]);
      repo.conexaoDoNegocio.mockResolvedValue(conexao());
      gw.renovar.mockRejectedValue(new GatewayTokenInvalido());
      await conexaoService.renovarVencendo(agora);
      expect(repo.marcarReconectar).toHaveBeenCalledWith('b1');
      expect(notif.notify).toHaveBeenCalledWith('b1', expect.objectContaining({ type: 'recebimento_alerta' }));
    });

    it('GatewayIndisponivel não muda nada', async () => {
      repo.conexoesAtivas.mockResolvedValue([await vencendo()]);
      gw.renovar.mockRejectedValue(new GatewayIndisponivel());
      await conexaoService.renovarVencendo(agora);
      expect(repo.atualizarConexao).not.toHaveBeenCalled();
      expect(notif.notify).not.toHaveBeenCalled();
    });

    it('uma conexão com erro não impede as outras', async () => {
      const a = await vencendo();
      repo.conexoesAtivas.mockResolvedValue([{ ...a, id: 'c0', businessId: 'b0' }, a]);
      gw.renovar.mockRejectedValueOnce(new GatewayIndisponivel())
        .mockResolvedValueOnce({ accessToken: 'n', refreshToken: 'r', expiraEm: new Date('2027-10-01T00:00:00Z'), contaId: '999' });
      await conexaoService.renovarVencendo(agora);
      expect(repo.atualizarConexao).toHaveBeenCalledTimes(1);
      expect(repo.atualizarConexao.mock.calls[0][0]).toBe('c1');
    });
  });

  describe('papéis', () => {
    const chamadas: Array<[string, string, object?]> = [
      ['get', '/api/v1/recebimentos/conexoes'],
      ['get', '/api/v1/recebimentos/mercadopago/conectar'],
      ['post', '/api/v1/recebimentos/mercadopago/confirmar', { t: 'a'.repeat(30) }],
      ['put', '/api/v1/recebimentos/mercadopago/formas', { aceitaPix: true, aceitaCartao: false }],
      ['delete', '/api/v1/recebimentos/mercadopago/conexao'],
    ];
    for (const papel of ['employee', 'professional']) {
      it(`${papel} recebe 403 nas rotas do dono`, async () => {
        for (const [metodo, caminho, corpo] of chamadas) {
          const r = await (request as unknown as Record<string, (p: string) => supertest.Test>)[metodo](caminho).set('x-role', papel).send(corpo);
          expect(r.status, `${metodo} ${caminho}`).toBe(403);
        }
      });
    }
  });
});
