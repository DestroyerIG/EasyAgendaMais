import { vi, describe, it, beforeEach, expect } from 'vitest';
import express from 'express';

vi.mock('../config/prisma.js', () => ({ prisma: {} }));

const repo = vi.hoisted(() => ({
  profissional: vi.fn(), acessos: vi.fn(), usuarioDoEmail: vi.fn(), negocio: vi.fn(), criarConvite: vi.fn(),
  revogarAbertos: vi.fn(), conviteDoToken: vi.fn(), aceitar: vi.fn(), definirBloqueio: vi.fn(),
  configuracao: vi.fn(), salvarConfiguracao: vi.fn(),
}));
vi.mock('../modules/equipe/equipe.repository.js', () => ({ equipeRepository: repo }));
const supa = vi.hoisted(() => ({ createConfirmedUser: vi.fn() }));
vi.mock('../services/supabaseAuthService.js', () => ({ supabaseAuthService: supa }));
const auth = vi.hoisted(() => ({ abrirSessaoConfirmada: vi.fn(), senhaPlaceholder: vi.fn(() => 'hash'), isCommonPassword: vi.fn(() => false) }));
vi.mock('../services/authService.js', () => ({ authService: auth }));
const email = vi.hoisted(() => ({
  getFrontendBaseUrl: vi.fn(() => 'https://app.test'), sendConviteProfissional: vi.fn(),
}));
vi.mock('../services/emailService.js', () => ({ emailService: email }));
vi.mock('../middleware/auth.js', () => ({
  authMiddleware: (req: express.Request, _res: express.Response, next: express.NextFunction) => {
    (req as unknown as { user: unknown }).user = {
      userId: 'u1', businessId: 'b1', role: req.header('x-role') ?? 'tenant_admin',
      plan: req.header('x-plan') ?? 'profissional', subscriptionStatus: 'active',
    };
    next();
  },
}));

const rules = await import('../modules/equipe/equipe.rules.js');
const { equipeService } = await import('../modules/equipe/equipe.service.js');
const routes = await import('../modules/equipe/equipe.routes.js');
const { errorHandler } = await import('../middleware/errorHandler.js');
const supertest = (await import('supertest')).default;

const app = express();
app.use(express.json());
app.use('/api/v1/equipe', routes.default);
app.use('/api/v1/convites', routes.conviteRoutes);
app.use(errorHandler);
const request = supertest(app);

const ID = '11111111-1111-4111-8111-111111111111';
const TOKEN = 'a'.repeat(43);
const agora = new Date('2026-10-25T12:00:00Z');
const dia = 24 * 60 * 60 * 1000;
const convite = (over: Record<string, unknown> = {}) => ({
  id: 'cv1', email: 'ana@x.com', criadoEm: agora, expiraEm: new Date(agora.getTime() + dia), aceitoEm: null, revogadoEm: null, ...over,
});
const conviteDoToken = (over: Record<string, unknown> = {}) => ({
  ...convite(), businessId: 'b1', professionalId: 'p1',
  professional: { name: 'Ana Lima', active: true, usuario: null },
  business: { name: 'Studio Aurora', plan: 'profissional', subscriptionStatus: 'active' }, ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  email.getFrontendBaseUrl.mockReturnValue('https://app.test');
  auth.senhaPlaceholder.mockReturnValue('hash');
  auth.isCommonPassword.mockReturnValue(false);
});

describe('regras do convite', () => {
  it('token aleatório e hash estável', () => {
    const t = rules.gerarToken();
    expect(t).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(rules.gerarToken()).not.toBe(t);
    expect(rules.hashToken('x')).toBe(rules.hashToken('x'));
    expect(rules.hashToken('x')).toHaveLength(64);
  });

  it('vale 7 dias', () => {
    expect(rules.expiraEm(agora).getTime() - agora.getTime()).toBe(7 * dia);
  });

  it('situação: usado, revogado, vencido, ok', () => {
    expect(rules.situacaoConvite(convite({ aceitoEm: agora }), agora)).toBe('usado');
    expect(rules.situacaoConvite(convite({ revogadoEm: agora }), agora)).toBe('revogado');
    expect(rules.situacaoConvite(convite({ expiraEm: agora }), agora)).toBe('vencido');
    expect(rules.situacaoConvite(convite(), agora)).toBe('ok');
  });

  it('estado do acesso: o login manda, depois o último convite', () => {
    const usuario = { email: 'ana@x.com', blocked: false, createdAt: agora };
    expect(rules.estadoAcesso({ usuario, convite: null }, agora).estado).toBe('ativo');
    expect(rules.estadoAcesso({ usuario: { ...usuario, blocked: true }, convite: null }, agora).estado).toBe('removido');
    expect(rules.estadoAcesso({ usuario: null, convite: null }, agora).estado).toBe('sem_acesso');
    expect(rules.estadoAcesso({ usuario: null, convite: convite({ revogadoEm: agora }) }, agora).estado).toBe('sem_acesso');
    expect(rules.estadoAcesso({ usuario: null, convite: convite() }, agora)).toMatchObject({ estado: 'convite_enviado', email: 'ana@x.com' });
    expect(rules.estadoAcesso({ usuario: null, convite: convite({ expiraEm: new Date(agora.getTime() - 1) }) }, agora).estado).toBe('convite_vencido');
  });
});

describe('equipeService', () => {
  const prof = (over: Record<string, unknown> = {}) => ({ id: 'p1', name: 'Ana Lima', active: true, usuario: null, convites: [], ...over });

  it('convida: guarda só o hash, manda o e-mail e devolve o link para copiar', async () => {
    repo.profissional.mockResolvedValueOnce(prof()).mockResolvedValueOnce(prof({ convites: [convite({ expiraEm: new Date(Date.now() + dia) })] }));
    repo.usuarioDoEmail.mockResolvedValue(null);
    repo.negocio.mockResolvedValue({ name: 'Studio Aurora' });
    email.sendConviteProfissional.mockResolvedValue({ delivered: false, mode: 'log' });
    const r = await equipeService.convidar('b1', 'u1', 'p1', 'ana@x.com');
    const dados = repo.criarConvite.mock.calls[0]![0];
    expect(dados.tokenHash).toHaveLength(64);
    expect(r.link).toMatch(/^https:\/\/app\.test\/convite\/[A-Za-z0-9_-]{43}$/);
    expect(rules.hashToken(r.link.split('/').pop()!)).toBe(dados.tokenHash);
    expect(r).toMatchObject({ estado: 'convite_enviado', emailEnviado: false });
    expect(email.sendConviteProfissional).toHaveBeenCalledWith(expect.objectContaining({ to: 'ana@x.com', negocio: 'Studio Aurora', nome: 'Ana Lima' }));
  });

  it('não convida quem já tem acesso, profissional inativa nem e-mail já usado', async () => {
    repo.profissional.mockResolvedValue(prof({ usuario: { id: 'u9', email: 'a@x.com', blocked: false, createdAt: agora } }));
    await expect(equipeService.convidar('b1', 'u1', 'p1', 'ana@x.com')).rejects.toMatchObject({ statusCode: 409 });
    repo.profissional.mockResolvedValue(prof({ active: false }));
    await expect(equipeService.convidar('b1', 'u1', 'p1', 'ana@x.com')).rejects.toMatchObject({ statusCode: 409 });
    repo.profissional.mockResolvedValue(prof());
    repo.usuarioDoEmail.mockResolvedValue({ id: 'u7' });
    await expect(equipeService.convidar('b1', 'u1', 'p1', 'ana@x.com')).rejects.toMatchObject({ statusCode: 409 });
    repo.profissional.mockResolvedValue(null);
    await expect(equipeService.convidar('b1', 'u1', 'p1', 'ana@x.com')).rejects.toMatchObject({ statusCode: 404 });
    expect(repo.criarConvite).not.toHaveBeenCalled();
  });

  it('remover acesso revoga convites e bloqueia o login; reativar desbloqueia', async () => {
    const usuario = { id: 'u9', email: 'a@x.com', blocked: false, createdAt: agora };
    repo.profissional.mockResolvedValue(prof({ usuario }));
    await equipeService.removerAcesso('b1', 'p1');
    expect(repo.revogarAbertos).toHaveBeenCalledWith('p1');
    expect(repo.definirBloqueio).toHaveBeenCalledWith('u9', true);
    repo.profissional.mockResolvedValue(prof({ usuario: { ...usuario, blocked: true } }));
    await equipeService.reativarAcesso('b1', 'p1');
    expect(repo.definirBloqueio).toHaveBeenLastCalledWith('u9', false);
  });

  it('convite vencido, revogado ou usado: 410', async () => {
    repo.conviteDoToken.mockResolvedValue(conviteDoToken({ expiraEm: new Date(Date.now() - 1) }));
    await expect(equipeService.verConvite(TOKEN)).rejects.toMatchObject({ statusCode: 410, code: 'CONVITE_INVALIDO' });
    repo.conviteDoToken.mockResolvedValue(conviteDoToken({ expiraEm: new Date(Date.now() + dia), revogadoEm: new Date() }));
    await expect(equipeService.verConvite(TOKEN)).rejects.toMatchObject({ statusCode: 410 });
    repo.conviteDoToken.mockResolvedValue(null);
    await expect(equipeService.verConvite(TOKEN)).rejects.toMatchObject({ statusCode: 410 });
  });

  it('plano Solo: o convite não abre', async () => {
    repo.conviteDoToken.mockResolvedValue(conviteDoToken({
      expiraEm: new Date(Date.now() + dia), business: { name: 'S', plan: 'basico', subscriptionStatus: 'active' },
    }));
    await expect(equipeService.verConvite(TOKEN)).rejects.toMatchObject({ statusCode: 403 });
  });

  it('aceitar cria o login confirmado e abre a sessão', async () => {
    repo.conviteDoToken.mockResolvedValue(conviteDoToken({ expiraEm: new Date(Date.now() + dia) }));
    repo.usuarioDoEmail.mockResolvedValue(null);
    supa.createConfirmedUser.mockResolvedValue({ userId: 'sup1' });
    repo.aceitar.mockResolvedValue(true);
    auth.abrirSessaoConfirmada.mockResolvedValue({ token: 't', refreshToken: 'r', user: { id: 'u9', role: 'professional' } });
    const r = await equipeService.aceitar({} as express.Response, TOKEN, 'Senha@123');
    expect(supa.createConfirmedUser).toHaveBeenCalledWith('ana@x.com', 'Senha@123');
    expect(repo.aceitar).toHaveBeenCalledWith(expect.objectContaining({ conviteId: 'cv1', professionalId: 'p1', supabaseUserId: 'sup1' }));
    expect(r).toEqual({ token: 't', refreshToken: 'r', user: { id: 'u9', role: 'professional' } });
  });

  it('aceite concorrente perdeu a corrida: 410 e sem sessão', async () => {
    repo.conviteDoToken.mockResolvedValue(conviteDoToken({ expiraEm: new Date(Date.now() + dia) }));
    repo.usuarioDoEmail.mockResolvedValue(null);
    supa.createConfirmedUser.mockResolvedValue({ userId: 'sup1' });
    repo.aceitar.mockResolvedValue(false);
    await expect(equipeService.aceitar({} as express.Response, TOKEN, 'Senha@123')).rejects.toMatchObject({ statusCode: 410 });
    expect(auth.abrirSessaoConfirmada).not.toHaveBeenCalled();
  });
});

describe('rotas da equipe', () => {
  it('só a dona, e só nos planos Equipe e Salão', async () => {
    repo.acessos.mockResolvedValue([]);
    expect((await request.get('/api/v1/equipe/acessos')).status).toBe(200);
    expect((await request.get('/api/v1/equipe/acessos').set('x-plan', 'premium')).status).toBe(200);
    expect((await request.get('/api/v1/equipe/acessos').set('x-plan', 'basico')).status).toBe(403);
    expect((await request.get('/api/v1/equipe/acessos').set('x-role', 'employee')).status).toBe(403);
    expect((await request.get('/api/v1/equipe/acessos').set('x-role', 'professional')).status).toBe(403);
    expect(repo.acessos).toHaveBeenCalledTimes(2);
  });

  it('convite exige e-mail válido e id', async () => {
    expect((await request.post(`/api/v1/equipe/profissionais/${ID}/convite`).send({ email: 'x' })).status).toBe(400);
    expect((await request.post('/api/v1/equipe/profissionais/abc/convite').send({ email: 'a@x.com' })).status).toBe(400);
  });

  it('chave "a profissional cobra"', async () => {
    repo.salvarConfiguracao.mockResolvedValue({ profissionalCobra: true });
    expect((await request.put('/api/v1/equipe/configuracao').send({ profissionalCobra: 'sim' })).status).toBe(400);
    const r = await request.put('/api/v1/equipe/configuracao').send({ profissionalCobra: true });
    expect(r.status).toBe(200);
    expect(repo.salvarConfiguracao).toHaveBeenCalledWith('b1', true);
  });

  it('aceitar: senha fraca é 400 sem tocar no Supabase', async () => {
    const r = await request.post(`/api/v1/convites/${TOKEN}/aceitar`).send({ senha: '123' });
    expect(r.status).toBe(400);
    expect(supa.createConfirmedUser).not.toHaveBeenCalled();
  });
});
