import { vi, describe, it, beforeEach, expect } from 'vitest';
import express from 'express';
import type { LinhaNegocio } from '../modules/admin/painel.rules.js';

const painel = vi.hoisted(() => ({ linhaNegocio: vi.fn(), extrasNegocio: vi.fn() }));
const adminRepo = vi.hoisted(() => ({ estenderTeste: vi.fn() }));
const audit = vi.hoisted(() => ({ logAdminAction: vi.fn(), safeLogFailure: vi.fn() }));
const estado = vi.hoisted(() => ({ invalidar: vi.fn() }));
const cobranca = vi.hoisted(() => ({ moverVencimentoDoTesteCartao: vi.fn() }));

vi.mock('../config/prisma.js', () => ({ prisma: {} }));
vi.mock('../modules/admin/painel.repository.js', () => ({ painelRepository: painel }));
vi.mock('../repositories/adminRepository.js', () => ({ adminRepository: adminRepo }));
vi.mock('../services/auditLogService.js', () => ({ auditLogService: audit }));
vi.mock('../modules/conta/estadoConta.service.js', () => ({ estadoContaService: estado }));
vi.mock('../services/billingService.js', () => ({ billingService: cobranca }));
vi.mock('../middleware/auth.js', () => ({
  authMiddleware: (req: express.Request, _res: express.Response, next: express.NextFunction) => {
    (req as unknown as { user: unknown }).user = { userId: 'u1', businessId: null, role: 'platform_admin' };
    next();
  },
}));

const router = (await import('../routes/admin.js')).default;
const { errorHandler } = await import('../middleware/errorHandler.js');
const supertest = (await import('supertest')).default;

const app = express();
app.use(express.json());
app.use('/api/v1/admin', router);
app.use(errorHandler);
const request = supertest(app);

const ID = '11111111-1111-4111-8111-111111111111';
const MS_DIA = 86_400_000;

function linha(parcial: Partial<LinhaNegocio> = {}): LinhaNegocio {
  return {
    id: ID, statusAssinatura: 'trialing', jaPagou: false,
    fimDoPeriodo: new Date(Date.now() + 2 * MS_DIA),
    ...parcial,
  } as LinhaNegocio;
}

const corpo = { confirmation: 'CONFIRM', dias: 5, reason: 'Pediu mais tempo' };
const url = `/api/v1/admin/tenants/${ID}/trial`;

beforeEach(() => {
  vi.clearAllMocks();
  painel.linhaNegocio.mockResolvedValue(linha());
  painel.extrasNegocio.mockResolvedValue({ temAssinaturaGateway: false });
  adminRepo.estenderTeste.mockResolvedValue(new Date(Date.now() + 5 * MS_DIA));
});

describe('PATCH /admin/tenants/:id/trial', () => {
  it('estende o teste em andamento e grava a auditoria TRIAL_EXTENDED', async () => {
    const res = await request.patch(url).send(corpo);
    expect(res.status).toBe(200);
    expect(res.body.data.tenantId).toBe(ID);
    expect(typeof res.body.data.fimDoTeste).toBe('string');
    expect(adminRepo.estenderTeste).toHaveBeenCalledWith(ID, 5);
    expect(audit.logAdminAction).toHaveBeenCalledWith(expect.objectContaining({
      actionType: 'TRIAL_EXTENDED',
      targetBusinessId: ID,
      details: expect.objectContaining({ dias: 5, reason: 'Pediu mais tempo' }),
    }));
  });

  it('invalida o cache do estado da conta', async () => {
    await request.patch(url).send(corpo);
    expect(estado.invalidar).toHaveBeenCalledWith(ID);
  });

  it('teste encerrado sem pagar (incomplete) também pode ser estendido', async () => {
    painel.linhaNegocio.mockResolvedValue(linha({ statusAssinatura: 'incomplete', jaPagou: false }));
    const res = await request.patch(url).send(corpo);
    expect(res.status).toBe(200);
  });

  it('incomplete de quem já pagou responde 409 sem UPDATE', async () => {
    painel.linhaNegocio.mockResolvedValue(linha({ statusAssinatura: 'incomplete', jaPagou: true }));
    const res = await request.patch(url).send(corpo);
    expect(res.status).toBe(409);
    expect(adminRepo.estenderTeste).not.toHaveBeenCalled();
  });

  it('teste com cartão: move o vencimento no Asaas antes do UPDATE', async () => {
    cobranca.moverVencimentoDoTesteCartao.mockResolvedValue(true);
    const res = await request.patch(url).send(corpo);
    expect(res.status).toBe(200);
    expect(cobranca.moverVencimentoDoTesteCartao).toHaveBeenCalledWith(expect.any(String), expect.any(Date));
    expect(cobranca.moverVencimentoDoTesteCartao.mock.invocationCallOrder[0])
      .toBeLessThan(adminRepo.estenderTeste.mock.invocationCallOrder[0]);
  });

  it('se o Asaas recusar, o teste não é estendido', async () => {
    cobranca.moverVencimentoDoTesteCartao.mockRejectedValueOnce(new Error('Asaas fora'));
    const res = await request.patch(url).send(corpo);
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(adminRepo.estenderTeste).not.toHaveBeenCalled();
  });

  it('status cru é normalizado como no detalhe: vazio sem pagamento pode ser estendido', async () => {
    painel.linhaNegocio.mockResolvedValue(linha({ statusAssinatura: ' TRIALING ' }));
    expect((await request.patch(url).send(corpo)).status).toBe(200);
    painel.linhaNegocio.mockResolvedValue(linha({ statusAssinatura: '', jaPagou: false }));
    expect((await request.patch(url).send(corpo)).status).toBe(200);
  });

  it('negócio inexistente responde 404', async () => {
    painel.linhaNegocio.mockResolvedValue(null);
    const res = await request.patch(url).send(corpo);
    expect(res.status).toBe(404);
  });

  it('dias acima de 30 responde 400', async () => {
    const res = await request.patch(url).send({ ...corpo, dias: 31 });
    expect(res.status).toBe(400);
    expect(adminRepo.estenderTeste).not.toHaveBeenCalled();
  });

  it('sem motivo responde 400', async () => {
    const res = await request.patch(url).send({ confirmation: 'CONFIRM', dias: 5 });
    expect(res.status).toBe(400);
  });

  it('falha no UPDATE grava a falha na auditoria e repassa o erro', async () => {
    adminRepo.estenderTeste.mockRejectedValue(new Error('boom'));
    const res = await request.patch(url).send(corpo);
    expect(res.status).toBe(500);
    expect(audit.safeLogFailure).toHaveBeenCalledWith(expect.objectContaining({ actionType: 'TRIAL_EXTENDED' }));
  });
});
