import { vi, describe, it, beforeEach, expect } from 'vitest';
import express from 'express';

const comissoes = vi.hoisted(() => ({
  apuracao: vi.fn(), pagar: vi.fn(), desfazer: vi.fn(), listarAdiantamentos: vi.fn(),
  lancarAdiantamento: vi.fn(), excluirAdiantamento: vi.fn(), salvarModelo: vi.fn(),
}));
const relatorios = vi.hoisted(() => ({ visaoGeral: vi.fn(), ocupacao: vi.fn(), evolucao: vi.fn() }));

vi.mock('../config/prisma.js', () => ({ prisma: {} }));
vi.mock('../middleware/auth.js', () => ({
  authMiddleware: (req: express.Request, _res: express.Response, next: express.NextFunction) => {
    (req as unknown as { user: unknown }).user = {
      userId: 'u1', businessId: 'b1', role: req.header('x-role') ?? 'tenant_admin',
      plan: req.header('x-plan') ?? 'profissional', subscriptionStatus: 'active',
    };
    next();
  },
}));
vi.mock('../services/scheduleSettingsService.js', () => ({ getBusinessScheduleSettings: vi.fn().mockResolvedValue({ timezone: 'America/Sao_Paulo' }) }));
vi.mock('../modules/reports/comissoes.service.js', () => ({ comissoesService: comissoes }));
vi.mock('../modules/reports/relatorios.service.js', () => ({ relatoriosService: relatorios }));

const router = (await import('../modules/reports/reports.routes.js')).default;
const { errorHandler } = await import('../middleware/errorHandler.js');
const supertest = (await import('supertest')).default;

const app = express();
app.use(express.json());
app.use('/api/v1/reports', router);
app.use(errorHandler);
const request = supertest(app);

const PID = '11111111-1111-4111-8111-111111111111';

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-24T12:00:00-03:00'));
});

describe('rotas de relatórios', () => {
  it('Solo não acessa relatórios (plano)', async () => {
    const r = await request.get('/api/v1/reports/overview').set('x-plan', 'basico');
    expect(r.status).toBe(403);
    expect(relatorios.visaoGeral).not.toHaveBeenCalled();
  });

  it('sem período usa os últimos 30 dias; comissões usam a quinzena', async () => {
    relatorios.visaoGeral.mockResolvedValue({});
    comissoes.apuracao.mockResolvedValue({});
    await request.get('/api/v1/reports/overview');
    expect(relatorios.visaoGeral).toHaveBeenCalledWith('b1', { inicio: '2026-09-25', fim: '2026-10-24' });
    await request.get('/api/v1/reports/commissions');
    expect(comissoes.apuracao).toHaveBeenCalledWith('b1', { inicio: '2026-10-16', fim: '2026-10-31' }, expect.objectContaining({ plan: 'profissional' }));
  });

  it('período invertido ou maior que 366 dias → 400', async () => {
    expect((await request.get('/api/v1/reports/overview?inicio=2026-10-10&fim=2026-10-01')).status).toBe(400);
    expect((await request.get('/api/v1/reports/overview?inicio=2025-01-01&fim=2026-10-01')).status).toBe(400);
  });

  it('funcionária vê, mas não marca como pago nem lança adiantamento', async () => {
    comissoes.apuracao.mockResolvedValue({});
    expect((await request.get('/api/v1/reports/commissions').set('x-role', 'employee')).status).toBe(200);
    const corpo = { professionalId: PID, inicio: '2026-10-01', fim: '2026-10-15', forma: 'pix' };
    expect((await request.post('/api/v1/reports/commissions/payouts').set('x-role', 'employee').send(corpo)).status).toBe(403);
    expect((await request.post('/api/v1/reports/advances').set('x-role', 'employee').send({ professionalId: PID, valor: 10 })).status).toBe(403);
    expect(comissoes.pagar).not.toHaveBeenCalled();
  });

  it('marcar como pago valida forma e chama o serviço', async () => {
    comissoes.pagar.mockResolvedValue({ id: 'r1' });
    const corpo = { professionalId: PID, inicio: '2026-10-01', fim: '2026-10-15', forma: 'cheque' };
    expect((await request.post('/api/v1/reports/commissions/payouts').send(corpo)).status).toBe(400);
    const r = await request.post('/api/v1/reports/commissions/payouts').send({ ...corpo, forma: 'pix' });
    expect(r.status).toBe(200);
    expect(comissoes.pagar).toHaveBeenCalledWith('b1', 'u1', expect.anything(), expect.objectContaining({ forma: 'pix' }));
  });

  it('adiantamento com valor zero → 400; válido → 201', async () => {
    expect((await request.post('/api/v1/reports/advances').send({ professionalId: PID, valor: 0 })).status).toBe(400);
    comissoes.lancarAdiantamento.mockResolvedValue({ id: 'ad1' });
    expect((await request.post('/api/v1/reports/advances').send({ professionalId: PID, valor: 50 })).status).toBe(201);
  });

  it('CSV para o contador: BOM, ";" e decimais com vírgula', async () => {
    comissoes.apuracao.mockResolvedValue({
      periodo: { inicio: '2026-10-01', fim: '2026-10-15' }, modelo: 'salao_parceiro',
      totais: { faturamento: 150, cotaSalao: 100, cotaProfissionais: 50, gorjetas: 10 },
      itens: [{
        professional: { nome: 'Camila Rocha', cnpj: '38291821000144' }, atendimentos: 1, servicos: 100, produtos: 50, faturamento: 150,
        cotaSalao: 100, comissao: 50, gorjetas: 10, adiantamentos: 0, aPagar: 60, status: 'pendente',
      }],
    });
    const r = await request.get('/api/v1/reports/commissions/export.csv?inicio=2026-10-01&fim=2026-10-15');
    expect(r.status).toBe(200);
    expect(r.headers['content-type']).toMatch(/text\/csv/);
    expect(r.headers['content-disposition']).toContain('comissoes-2026-10-01-a-2026-10-15.csv');
    expect(r.text.charCodeAt(0)).toBe(0xfeff);
    expect(r.text).toContain('Cota do salão;Cota da profissional');
    expect(r.text).toContain('Camila Rocha;38291821000144;1;100,00;50,00;150,00;100,00;50,00;10,00;0,00;60,00;Pendente');
    expect(r.text).toContain('Lei 13.352/2016');
  });

  it('id que não é UUID → 400', async () => {
    expect((await request.delete('/api/v1/reports/commissions/payouts/abc')).status).toBe(400);
  });
});
