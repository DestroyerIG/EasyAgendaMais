import { vi, describe, it, beforeEach, afterEach, expect } from 'vitest';
import express from 'express';
import { randomBytes, createHmac } from 'node:crypto';

vi.mock('../config/prisma.js', () => ({ prisma: {} }));
vi.mock('../utils/logger.js', () => ({ default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }));

const repo = vi.hoisted(() => ({
  usuario: vi.fn(), profissionaisAtivos: vi.fn(), profissionalDoNegocio: vi.fn(), conexaoDoUsuario: vi.fn(),
  conexoesDoNegocio: vi.fn(), salvarConexao: vi.fn(), atualizarConexao: vi.fn(), apagarConexao: vi.fn(),
  conexaoPorId: vi.fn(), conexoesAtivas: vi.fn(), eventosDaConexao: vi.fn(), agendamentosDaJanela: vi.fn(),
  salvarEvento: vi.fn(), apagarEvento: vi.fn(), substituirOcupado: vi.fn(), ocupadoDoDia: vi.fn(), ocupadosDoNegocio: vi.fn(),
}));
vi.mock('../modules/googleAgenda/googleAgenda.repository.js', () => ({ googleAgendaRepository: repo }));
const api = vi.hoisted(() => ({
  urlConsentimento: vi.fn((s: string) => `https://accounts.google.com/o/oauth2/v2/auth?state=${s}`),
  trocarCodigo: vi.fn(), accessToken: vi.fn(), criarAgenda: vi.fn(), salvarEvento: vi.fn(),
  apagarEvento: vi.fn(), ocupado: vi.fn(), revogar: vi.fn(), agendaExiste: vi.fn(),
}));
vi.mock('../modules/googleAgenda/googleAgenda.api.js', async (orig) => ({
  ...(await orig<typeof import('../modules/googleAgenda/googleAgenda.api.js')>()), googleApi: api,
}));
vi.mock('../services/scheduleSettingsService.js', () => ({
  getBusinessScheduleSettings: vi.fn(async () => ({ timezone: 'America/Sao_Paulo' })),
}));
const notif = vi.hoisted(() => ({ notify: vi.fn() }));
vi.mock('../modules/notifications/notifications.service.js', () => ({ notificationsService: notif }));
const push = vi.hoisted(() => ({ paraEquipe: vi.fn(), paraProfissional: vi.fn() }));
vi.mock('../modules/push/push.service.js', () => ({ pushService: push }));
vi.mock('../middleware/auth.js', () => ({
  authMiddleware: (req: express.Request, _res: express.Response, next: express.NextFunction) => {
    (req as unknown as { user: unknown }).user = {
      userId: req.header('x-user') ?? 'u1', businessId: 'b1', role: req.header('x-role') ?? 'tenant_admin',
      plan: req.header('x-plan') ?? 'profissional', subscriptionStatus: 'active',
    };
    next();
  },
}));

const rules = await import('../modules/googleAgenda/googleAgenda.rules.js');
const { googleAgendaService } = await import('../modules/googleAgenda/googleAgenda.service.js');
const { decifrar } = await import('../modules/googleAgenda/googleAgenda.crypto.js');
const { chaveDoToken } = await import('../modules/googleAgenda/googleAgenda.crypto.js');
const routes = (await import('../modules/googleAgenda/googleAgenda.routes.js')).default;
const { errorHandler } = await import('../middleware/errorHandler.js');
const supertest = (await import('supertest')).default;

const app = express();
app.use(express.json());
app.use('/api/v1/google-agenda', routes);
app.use(errorHandler);
const request = supertest(app);

const P1 = '11111111-1111-4111-8111-111111111111';
const dona = { id: 'u1', businessId: 'b1', role: 'tenant_admin', professionalId: null, business: { name: 'Studio Aurora', plan: 'profissional' } };
const camila = { id: 'u2', businessId: 'b1', role: 'professional', professionalId: P1, business: { name: 'Studio Aurora', plan: 'profissional' } };

describe('Google Agenda: conexão', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.GOOGLE_CLIENT_ID = 'cid';
    process.env.GOOGLE_CLIENT_SECRET = 'segredo';
    process.env.GOOGLE_AGENDA_REDIRECT_URI = 'https://api.test/api/v1/google-agenda/callback';
    process.env.GOOGLE_TOKEN_KEY = randomBytes(32).toString('base64');
    process.env.FRONTEND_URL = 'https://app.test';
    api.trocarCodigo.mockResolvedValue({ refreshToken: 'r1', email: 'ana@gmail.com' });
    api.accessToken.mockResolvedValue('tok');
    api.criarAgenda.mockResolvedValue('cal1');
    repo.salvarConexao.mockImplementation(async (d: Record<string, unknown>) => ({ id: 'c1', ...d }));
    repo.profissionaisAtivos.mockResolvedValue([{ id: P1, name: 'Camila' }, { id: 'p2', name: 'Bia' }]);
    repo.conexoesDoNegocio.mockResolvedValue([]);
    vi.spyOn(googleAgendaService, 'sincronizarSaida').mockResolvedValue(undefined);
    vi.spyOn(googleAgendaService, 'atualizarOcupado').mockResolvedValue(undefined);
  });
  afterEach(() => {
    for (const v of ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'GOOGLE_AGENDA_REDIRECT_URI', 'GOOGLE_TOKEN_KEY']) delete process.env[v];
  });

  it('state repetido ou vencido é recusado', () => {
    const agora = Date.now();
    const s = rules.assinarState('u1', 'negocio', agora);
    expect(rules.lerState(s, agora)).toEqual({ userId: 'u1', para: 'negocio', origem: 'ajustes' });
    expect(rules.lerState(s, agora)).toBeNull();

    const velho = rules.assinarState('u1', 'negocio', agora);
    expect(rules.lerState(velho, agora + 11 * 60 * 1000)).toBeNull();

    const outro = rules.assinarState('u1', 'negocio', agora);
    const [carga, assinatura] = outro.split('.');
    expect(rules.lerState(`${carga}.${assinatura.slice(0, -2)}xx`, agora)).toBeNull();
  });

  /** Volta do Google e confirmação pelo navegador de quem está logado. */
  async function conectarPeloGoogle(userId: string, para: 'negocio' | 'profissional', quemConfirma = userId) {
    const volta = await request.get('/api/v1/google-agenda/callback').query({ code: 'cod', state: rules.assinarState(userId, para) });
    const t = new URL(volta.headers.location).searchParams.get('t') ?? '';
    const role = para === 'negocio' ? 'tenant_admin' : 'professional';
    return { volta, t, res: await request.post('/api/v1/google-agenda/confirmar').set('x-user', quemConfirma).set('x-role', role).send({ t }) };
  }

  it('callback troca o código e manda confirmar no navegador, sem conectar ainda', async () => {
    const res = await request.get('/api/v1/google-agenda/callback').query({ code: 'cod', state: rules.assinarState('u1', 'negocio') });
    expect(res.status).toBe(302);
    expect(res.headers.location).toMatch(/^https:\/\/app\.test\/configuracoes\?google=confirmar&t=[\w-]{20,}$/);
    expect(api.trocarCodigo).toHaveBeenCalledWith('cod');
    expect(repo.salvarConexao).not.toHaveBeenCalled();
  });

  it('confirmar cria conexão, agenda e dispara a cópia', async () => {
    repo.usuario.mockResolvedValue(dona);
    const { res } = await conectarPeloGoogle('u1', 'negocio');

    expect(res.status).toBe(200);
    expect(api.criarAgenda).toHaveBeenCalledWith('tok', 'EasyAgenda+ · Studio Aurora', 'America/Sao_Paulo');
    const salvo = repo.salvarConexao.mock.calls[0][0];
    expect(salvo).toMatchObject({ businessId: 'b1', userId: 'u1', tipo: 'negocio', googleEmail: 'ana@gmail.com', calendarioId: 'cal1' });
    expect(salvo.refreshTokenCifrado).not.toBe('r1');
    expect(decifrar(salvo.refreshTokenCifrado)).toBe('r1');
    expect(googleAgendaService.sincronizarSaida).toHaveBeenCalledWith({ conexaoId: 'c1' });
    expect(googleAgendaService.atualizarOcupado).toHaveBeenCalledWith('c1');
  });

  it('confirmar de profissional usa o nome curto e liga o professionalId do usuário', async () => {
    repo.usuario.mockResolvedValue(camila);
    const { volta } = await conectarPeloGoogle('u2', 'profissional');

    expect(volta.headers.location).toMatch(/^https:\/\/app\.test\/bancada\?google=confirmar&t=/);
    expect(api.criarAgenda).toHaveBeenCalledWith('tok', 'EasyAgenda+', 'America/Sao_Paulo');
    expect(repo.salvarConexao.mock.calls[0][0]).toMatchObject({ tipo: 'profissional', professionalId: P1 });
  });

  it('no Solo com uma profissional, a dona já vem ligada a ela', async () => {
    repo.usuario.mockResolvedValue(dona);
    repo.profissionaisAtivos.mockResolvedValue([{ id: P1, name: 'Ana' }]);
    await conectarPeloGoogle('u1', 'negocio');
    expect(repo.salvarConexao.mock.calls[0][0].professionalId).toBe(P1);

    repo.salvarConexao.mockClear();
    repo.profissionaisAtivos.mockResolvedValue([{ id: P1, name: 'Ana' }, { id: 'p2', name: 'Bia' }]);
    await conectarPeloGoogle('u1', 'negocio');
    expect(repo.salvarConexao.mock.calls[0][0].professionalId).toBeNull();
  });

  it('a conexão pedida por uma conta não é confirmada no navegador de outra', async () => {
    repo.usuario.mockResolvedValue(dona);
    const { res } = await conectarPeloGoogle('u1', 'negocio', 'u9');
    expect(res.status).toBe(403);
    expect(repo.salvarConexao).not.toHaveBeenCalled();
    expect(api.revogar).toHaveBeenCalledWith('r1');
  });

  it('confirmar duas vezes ou com t desconhecido é recusado', async () => {
    repo.usuario.mockResolvedValue(dona);
    const { t } = await conectarPeloGoogle('u1', 'negocio');
    const de_novo = await request.post('/api/v1/google-agenda/confirmar').set('x-user', 'u1').send({ t });
    expect(de_novo.status).toBe(404);
    const lixo = await request.post('/api/v1/google-agenda/confirmar').set('x-user', 'u1').send({ t: 'x'.repeat(30) });
    expect(lixo.status).toBe(404);
  });

  it('reconectar a mesma conta reaproveita a agenda e a escolha da dona', async () => {
    repo.usuario.mockResolvedValue(dona);
    repo.conexaoDoUsuario.mockResolvedValue({ id: 'c0', tipo: 'negocio', googleEmail: 'ana@gmail.com', calendarioId: 'cal-velho', professionalId: 'p2' });
    api.agendaExiste.mockResolvedValue(true);
    await conectarPeloGoogle('u1', 'negocio');
    expect(api.agendaExiste).toHaveBeenCalledWith('tok', 'cal-velho');
    expect(api.criarAgenda).not.toHaveBeenCalled();
    expect(repo.salvarConexao.mock.calls[0][0]).toMatchObject({ calendarioId: 'cal-velho', professionalId: 'p2' });
  });

  it('reconectar com a agenda apagada ou outra conta cria uma nova', async () => {
    repo.usuario.mockResolvedValue(dona);
    repo.conexaoDoUsuario.mockResolvedValue({ id: 'c0', tipo: 'negocio', googleEmail: 'ana@gmail.com', calendarioId: 'cal-velho', professionalId: null });
    api.agendaExiste.mockResolvedValue(false);
    await conectarPeloGoogle('u1', 'negocio');
    expect(api.criarAgenda).toHaveBeenCalled();

    api.criarAgenda.mockClear();
    api.agendaExiste.mockClear();
    repo.conexaoDoUsuario.mockResolvedValue({ id: 'c0', tipo: 'negocio', googleEmail: 'outra@gmail.com', calendarioId: 'cal-velho', professionalId: null });
    await conectarPeloGoogle('u1', 'negocio');
    expect(api.agendaExiste).not.toHaveBeenCalled();
    expect(api.criarAgenda).toHaveBeenCalled();
  });

  it('callback com state inválido volta com erro sem chamar o Google', async () => {
    const res = await request.get('/api/v1/google-agenda/callback').query({ code: 'cod', state: 'lixo.lixo' });
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('https://app.test/configuracoes?google=erro');
    expect(api.trocarCodigo).not.toHaveBeenCalled();
  });

  it('state leva a origem; sem origem, legado ou adulterado, vale Ajustes ou é recusado', () => {
    const agora = Date.now();
    expect(rules.lerState(rules.assinarState('u1', 'negocio', agora, 'onboarding'), agora))
      .toEqual({ userId: 'u1', para: 'negocio', origem: 'onboarding' });

    // Carga legada, assinada sem `o`.
    const legada = Buffer.from(JSON.stringify({ u: 'u1', p: 'negocio', n: 'legado1', e: agora + 60_000 })).toString('base64url');
    const assinada = `${legada}.${createHmac('sha256', chaveDoToken()).update(legada).digest('base64url')}`;
    expect(rules.lerState(assinada, agora)).toEqual({ userId: 'u1', para: 'negocio', origem: 'ajustes' });

    // `o` desconhecido, mesmo assinado: cai em Ajustes.
    const estranha = Buffer.from(JSON.stringify({ u: 'u1', p: 'negocio', o: 'x', n: 'estranho1', e: agora + 60_000 })).toString('base64url');
    const assinada2 = `${estranha}.${createHmac('sha256', chaveDoToken()).update(estranha).digest('base64url')}`;
    expect(rules.lerState(assinada2, agora)?.origem).toBe('ajustes');

    // `o` trocado sem reassinar: assinatura não confere.
    const original = rules.assinarState('u1', 'negocio', agora, 'ajustes');
    const [carga, assinatura] = original.split('.');
    const d = JSON.parse(Buffer.from(carga, 'base64url').toString('utf8'));
    const adulterada = Buffer.from(JSON.stringify({ ...d, o: 'onboarding' })).toString('base64url');
    expect(rules.lerState(`${adulterada}.${assinatura}`, agora)).toBeNull();
  });

  it('callback de origem onboarding volta para /onboarding; profissional e estado inválido não', async () => {
    const ok = await request.get('/api/v1/google-agenda/callback')
      .query({ code: 'cod', state: rules.assinarState('u1', 'negocio', Date.now(), 'onboarding') });
    expect(ok.headers.location).toMatch(/^https:\/\/app\.test\/onboarding\?google=confirmar&t=[\w-]{20,}$/);

    api.trocarCodigo.mockRejectedValueOnce(new Error('x'));
    const falha = await request.get('/api/v1/google-agenda/callback')
      .query({ code: 'cod', state: rules.assinarState('u1', 'negocio', Date.now(), 'onboarding') });
    expect(falha.headers.location).toBe('https://app.test/onboarding?google=erro');

    const prof = await request.get('/api/v1/google-agenda/callback')
      .query({ code: 'cod', state: rules.assinarState('u2', 'profissional', Date.now(), 'onboarding') });
    expect(prof.headers.location).toMatch(/^https:\/\/app\.test\/bancada\?google=confirmar/);
  });

  it('conectar leva a origem no state e recusa origem desconhecida', async () => {
    const res = await request.get('/api/v1/google-agenda/conectar').set('x-user', 'u1').set('x-role', 'tenant_admin')
      .query({ para: 'negocio', origem: 'onboarding' });
    expect(res.status).toBe(200);
    const state = new URL(res.body.data.url).searchParams.get('state') ?? '';
    expect(rules.lerState(state)?.origem).toBe('onboarding');

    const ruim = await request.get('/api/v1/google-agenda/conectar').set('x-user', 'u1').set('x-role', 'tenant_admin')
      .query({ para: 'negocio', origem: 'xis' });
    expect(ruim.status).toBe(400);
  });

  it('profissional em plano sem app fica pausada', () => {
    expect(rules.conexaoEfetiva({ tipo: 'profissional', status: 'ativa' }, 'basico')).toBe('pausada_plano');
    expect(rules.conexaoEfetiva({ tipo: 'profissional', status: 'ativa' }, 'profissional')).toBe('ativa');
    expect(rules.conexaoEfetiva({ tipo: 'negocio', status: 'ativa' }, 'basico')).toBe('ativa');
    expect(rules.conexaoEfetiva({ tipo: 'negocio', status: 'reconectar' }, 'premium')).toBe('reconectar');
  });

  it('conectar devolve a URL do Google para a dona', async () => {
    const res = await request.get('/api/v1/google-agenda/conectar').query({ para: 'negocio' });
    expect(res.status).toBe(200);
    expect(res.body.data.url).toContain('https://accounts.google.com/');
  });

  it('profissional não conecta a agenda do negócio', async () => {
    const res = await request.get('/api/v1/google-agenda/conectar').set('x-role', 'professional').query({ para: 'negocio' });
    expect(res.status).toBe(403);
  });

  it('profissional no Solo não conecta', async () => {
    const res = await request.get('/api/v1/google-agenda/conectar')
      .set('x-role', 'professional').set('x-plan', 'basico').query({ para: 'profissional' });
    expect(res.status).toBe(403);
    const ok = await request.get('/api/v1/google-agenda/conectar')
      .set('x-role', 'professional').set('x-plan', 'profissional').query({ para: 'profissional' });
    expect(ok.status).toBe(200);
  });

  it('definirProfissional recusa profissional de outro negócio', async () => {
    repo.conexaoDoUsuario.mockResolvedValue({ id: 'c1', tipo: 'negocio', businessId: 'b1' });
    repo.profissionalDoNegocio.mockResolvedValue(null);
    const res = await request.put('/api/v1/google-agenda/conexao').send({ professionalId: P1 });
    expect(res.status).toBe(404);
    expect(repo.atualizarConexao).not.toHaveBeenCalled();
  });

  it('desconectar revoga e apaga mesmo se o Google falhar', async () => {
    const { cifrar } = await import('../modules/googleAgenda/googleAgenda.crypto.js');
    repo.conexaoDoUsuario.mockResolvedValue({ id: 'c1', tipo: 'negocio', businessId: 'b1', refreshTokenCifrado: cifrar('r1') });
    api.revogar.mockRejectedValue(new Error('rede'));
    const res = await request.delete('/api/v1/google-agenda/conexao');
    expect(res.status).toBe(200);
    expect(api.revogar).toHaveBeenCalledWith('r1');
    expect(repo.apagarConexao).toHaveBeenCalledWith('c1');
  });

  it('conectar responde 404 sem configuração', async () => {
    delete process.env.GOOGLE_TOKEN_KEY;
    const res = await request.get('/api/v1/google-agenda/conectar').query({ para: 'negocio' });
    expect(res.status).toBe(404);
  });

  it('conexao informa configurado e, para a dona, a situação de cada profissional', async () => {
    repo.conexaoDoUsuario.mockResolvedValue({
      id: 'c1', tipo: 'negocio', googleEmail: 'ana@gmail.com', status: 'ativa', ultimaSyncEm: null, professionalId: null,
    });
    repo.conexoesDoNegocio.mockResolvedValue([{ tipo: 'profissional', professionalId: P1, status: 'ativa' }]);
    const res = await request.get('/api/v1/google-agenda/conexao').set('x-plan', 'basico');
    expect(res.body.data).toMatchObject({
      configurado: true,
      conexao: { tipo: 'negocio', googleEmail: 'ana@gmail.com', status: 'ativa' },
      profissionais: [
        { professionalId: P1, nome: 'Camila', status: 'pausada_plano' },
        { professionalId: 'p2', nome: 'Bia', status: null },
      ],
    });
  });

  it('ocupado do dia para a dona e a recepção, não para a profissional', async () => {
    repo.ocupadosDoNegocio.mockResolvedValue([{
      inicio: new Date('2026-11-10T18:00:00Z'), fim: new Date('2026-11-10T19:00:00Z'),
      conexao: { tipo: 'profissional', status: 'ativa', professionalId: P1, business: { plan: 'profissional' } },
    }]);
    const res = await request.get('/api/v1/google-agenda/ocupado').set('x-role', 'employee').query({ data: '2026-11-10' });
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ [P1]: [{ start: '15:00', end: '16:00' }] });
    const prof = await request.get('/api/v1/google-agenda/ocupado').set('x-role', 'professional').query({ data: '2026-11-10' });
    expect(prof.status).toBe(403);
  });

  it('avisarReconectar avisa a dona no sino (que já vai por push) e a profissional por push', async () => {
    await googleAgendaService.avisarReconectar({ id: 'c1', businessId: 'b1', tipo: 'negocio', professionalId: null });
    expect(notif.notify).toHaveBeenCalledWith('b1', expect.objectContaining({ type: 'google_agenda', link: '/configuracoes' }));
    // O notify já manda o push para a equipe: não duplica.
    expect(push.paraEquipe).not.toHaveBeenCalled();
    await googleAgendaService.avisarReconectar({ id: 'c2', businessId: 'b1', tipo: 'profissional', professionalId: P1 });
    expect(push.paraProfissional).toHaveBeenCalledWith('b1', P1, expect.objectContaining({ link: '/bancada' }));
  });
});
