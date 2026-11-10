import { vi, describe, it, beforeEach, expect } from 'vitest';
import express from 'express';

vi.mock('../config/prisma.js', () => ({ prisma: {} }));

const repo = vi.hoisted(() => ({
  estado: vi.fn(), salvarNegocio: vi.fn(), salvarHorarios: vi.fn(), salvarServicos: vi.fn(), concluir: vi.fn(),
  dispensarPrimeirosPassos: vi.fn(), slugEmUso: vi.fn(), resumo: vi.fn(),
}));
vi.mock('../modules/onboarding/onboarding.repository.js', () => ({ onboardingRepository: repo }));
vi.mock('../middleware/auth.js', () => ({
  authMiddleware: (req: express.Request, _res: express.Response, next: express.NextFunction) => {
    (req as unknown as { user: unknown }).user = { userId: 'u1', businessId: 'b1', role: req.header('x-role') ?? 'tenant_admin' };
    next();
  },
}));

const rules = await import('../modules/onboarding/onboarding.rules.js');
const { onboardingService } = await import('../modules/onboarding/onboarding.service.js');
const { CATALOGO } = await import('../modules/onboarding/onboarding.catalogo.js');
const routes = await import('../modules/onboarding/onboarding.routes.js');
const { errorHandler } = await import('../middleware/errorHandler.js');
const supertest = (await import('supertest')).default;

const app = express();
app.use(express.json());
app.use('/api/v1/onboarding', routes.default);
app.use(errorHandler);
const request = supertest(app);

const t = (hhmm: string) => new Date(`1970-01-01T${hhmm}:00.000Z`);
const negocio = (over: Record<string, unknown> = {}) => ({
  name: 'Studio Aurora', ownerName: 'Camila Rocha', slug: null, pixKey: null, logoUrl: null, brandColor: null, galleryPhotos: [],
  whatsappConnectedAt: null, onboardingEtapa: 1, onboardingConcluidoEm: null, primeirosPassosDispensadoEm: null,
  settings: { segment: 'outro', modoEquipe: null, diasAbertos: ['seg', 'ter'], openingTime: t('09:00'), closingTime: t('18:00'), slotIntervalMinutes: 30 },
  professionals: [], services: [], ...over,
});
const horarios = { diasAbertos: ['seg', 'ter', 'qua'], abertura: '09:00', fechamento: '18:00', intervaloMinutos: 30, pausa: { inicio: '12:00', fim: '13:00' } };
const servico = (over: Record<string, unknown> = {}) => ({ nome: 'Manicure', duracaoMinutos: 45, preco: 35, sinalPct: null, ...over });

beforeEach(() => {
  vi.clearAllMocks();
  repo.estado.mockResolvedValue(negocio());
  repo.slugEmUso.mockResolvedValue(false);
});

describe('regras do onboarding', () => {
  it('etapas 1 a 3 bloqueiam o painel; 4 e 5 não', () => {
    expect(rules.estadoOnboarding({ onboardingEtapa: 1, onboardingConcluidoEm: null })).toEqual({ pendente: true, bloqueante: true, etapa: 1 });
    expect(rules.estadoOnboarding({ onboardingEtapa: 3, onboardingConcluidoEm: null }).bloqueante).toBe(true);
    expect(rules.estadoOnboarding({ onboardingEtapa: 4, onboardingConcluidoEm: null })).toEqual({ pendente: true, bloqueante: false, etapa: 4 });
    expect(rules.estadoOnboarding({ onboardingEtapa: 6, onboardingConcluidoEm: new Date() })).toEqual({ pendente: false, bloqueante: false, etapa: 6 });
  });

  it('salvar avança sem voltar o progresso', () => {
    expect(rules.etapaDepoisDe(1, 1)).toBe(2);
    expect(rules.etapaDepoisDe(4, 1)).toBe(4);
    expect(rules.etapaDepoisDe(3, 3)).toBe(4);
  });

  it('horários: fechamento depois da abertura e pausa dentro do expediente', () => {
    expect(rules.errosDosHorarios(horarios as never)).toEqual([]);
    expect(rules.errosDosHorarios({ ...horarios, fechamento: '08:00' } as never)).toContain('O fechamento precisa ser depois da abertura.');
    expect(rules.errosDosHorarios({ ...horarios, pausa: { inicio: '13:00', fim: '12:00' } } as never)).toContain('O fim da pausa precisa ser depois do início.');
    expect(rules.errosDosHorarios({ ...horarios, pausa: { inicio: '18:00', fim: '19:00' } } as never)).toContain('A pausa precisa ficar dentro do horário de atendimento.');
  });

  it('slug a partir do nome', () => {
    expect(rules.slugDoNome('Studio Aurora')).toBe('studio-aurora');
    expect(rules.slugDoNome('Barbearia do Zé & Cia.')).toBe('barbearia-do-ze-cia');
    expect(rules.slugDoNome('AB')).toBe('ab-negocio');
  });

  it('primeiros passos: página, WhatsApp e Pix só quando há sinal', () => {
    expect(rules.primeirosPassos({ slug: null, whatsappConectado: false, temChavePix: false, temSinal: false }).map((p) => p.id)).toEqual(['pagina', 'whatsapp']);
    expect(rules.primeirosPassos({ slug: 'x', whatsappConectado: true, temChavePix: false, temSinal: true }).map((p) => p.id)).toEqual(['pix']);
    expect(rules.primeirosPassos({ slug: 'x', whatsappConectado: true, temChavePix: false, temSinal: true })[0]!.href).toBe('/configuracoes/recebimentos');
    expect(rules.primeirosPassos({ slug: 'x', whatsappConectado: true, temChavePix: true, temSinal: true })).toEqual([]);
  });

  it('catálogo: todo segmento tem serviços válidos e pelo menos um marcado', () => {
    for (const lista of Object.values(CATALOGO)) {
      expect(lista.some((s) => s.marcado)).toBe(true);
      for (const s of lista) {
        expect(s.preco).toBeGreaterThan(0);
        expect(s.duracaoMinutos).toBeGreaterThanOrEqual(10);
        expect(s.duracaoMinutos).toBeLessThanOrEqual(300);
      }
    }
  });
});

describe('serviço do onboarding', () => {
  it('antes da etapa 1 não mostra segmento marcado e sugere o endereço livre', async () => {
    repo.slugEmUso.mockImplementation(async (s: string) => s === 'studio-aurora');
    const dto = await onboardingService.ver('b1');
    expect(dto.negocio.segmento).toBeNull();
    expect(dto.pagina.slugSugerido).toBe('studio-aurora-2');
    expect(dto.estado.bloqueante).toBe(true);
    expect(dto.vocabulario.profissional.singular).toBe('profissional');
  });

  it('depois da etapa 1 devolve o segmento e o vocabulário dele', async () => {
    repo.estado.mockResolvedValue(negocio({ onboardingEtapa: 2, settings: { ...negocio().settings, segment: 'barbearia', modoEquipe: 'sozinha' } }));
    const dto = await onboardingService.ver('b1');
    expect(dto.negocio).toMatchObject({ segmento: 'barbearia', modoEquipe: 'sozinha' });
    expect(dto.vocabulario.profissional.singular).toBe('barbeiro');
  });

  it('horários só depois da etapa 1', async () => {
    await expect(onboardingService.salvarHorarios('b1', horarios as never)).rejects.toThrow('Conclua a etapa "Seu negócio" antes');
    expect(repo.salvarHorarios).not.toHaveBeenCalled();
  });

  it('serviço com sinal sem chave Pix é recusado', async () => {
    repo.estado.mockResolvedValue(negocio({ onboardingEtapa: 3 }));
    await expect(onboardingService.salvarServicos('b1', { servicos: [servico({ sinalPct: 30 })] } as never)).rejects.toThrow('Informe a chave Pix');
    await onboardingService.salvarServicos('b1', { servicos: [servico({ sinalPct: 30 })], chavePix: { chave: 'a@b.com', tipo: 'email' } } as never);
    expect(repo.salvarServicos).toHaveBeenCalledTimes(1);
  });

  it('concluir exige as etapas obrigatórias', async () => {
    repo.estado.mockResolvedValue(negocio({ onboardingEtapa: 3 }));
    await expect(onboardingService.concluir('b1')).rejects.toThrow('Conclua as etapas');
    repo.estado.mockResolvedValue(negocio({ onboardingEtapa: 4 }));
    await onboardingService.concluir('b1');
    expect(repo.concluir).toHaveBeenCalledWith('b1');
  });

  it('primeiros passos: nada enquanto pendente ou dispensado', async () => {
    expect(await onboardingService.primeirosPassos('b1')).toEqual([]);
    repo.estado.mockResolvedValue(negocio({ onboardingConcluidoEm: new Date(), primeirosPassosDispensadoEm: new Date() }));
    expect(await onboardingService.primeirosPassos('b1')).toEqual([]);
    repo.estado.mockResolvedValue(negocio({ onboardingConcluidoEm: new Date(), services: [{ id: 's', name: 'X', price: 10, durationMinutes: 30, depositPercentage: 30 }] }));
    expect((await onboardingService.primeirosPassos('b1')).map((p) => p.id)).toEqual(['pagina', 'whatsapp', 'pix']);
  });

  it('resumo para o /me: sem negócio usa o vocabulário padrão', async () => {
    expect(await onboardingService.resumo(null)).toMatchObject({ onboarding: null, vocabulario: { segmento: 'outro' }, logoUrl: null });
    repo.resumo.mockResolvedValue({ onboardingEtapa: 2, onboardingConcluidoEm: null, logoUrl: 'https://x.test/logo.png', settings: { segment: 'unhas' } });
    expect(await onboardingService.resumo('b1')).toMatchObject({
      onboarding: { pendente: true, bloqueante: true, etapa: 2 }, vocabulario: { profissional: { singular: 'nail designer' } },
      logoUrl: 'https://x.test/logo.png',
    });
  });
});

describe('rotas do onboarding', () => {
  it('só a dona', async () => {
    const r = await request.get('/api/v1/onboarding').set('x-role', 'employee');
    expect(r.status).toBe(403);
  });

  it('salva o negócio', async () => {
    const r = await request.put('/api/v1/onboarding/negocio').send({ segmento: 'unhas', modoEquipe: 'sozinha' });
    expect(r.status).toBe(200);
    expect(repo.salvarNegocio).toHaveBeenCalledWith('b1', { segmento: 'unhas', modoEquipe: 'sozinha' });
  });

  it('valida segmento, horários e serviços', async () => {
    expect((await request.put('/api/v1/onboarding/negocio').send({ segmento: 'tattoo', modoEquipe: 'sozinha' })).status).toBe(400);
    expect((await request.put('/api/v1/onboarding/horarios').send({ ...horarios, diasAbertos: [] })).status).toBe(400);
    expect((await request.put('/api/v1/onboarding/horarios').send({ ...horarios, intervaloMinutos: 25 })).status).toBe(400);
    expect((await request.put('/api/v1/onboarding/servicos').send({ servicos: [] })).status).toBe(400);
    expect((await request.put('/api/v1/onboarding/servicos').send({ servicos: [servico(), servico()] })).status).toBe(400);
    expect((await request.put('/api/v1/onboarding/servicos').send({ servicos: [servico()], chavePix: { chave: 'nao-e-email', tipo: 'email' } })).status).toBe(400);
  });

  it('catálogo por segmento', async () => {
    const r = await request.get('/api/v1/onboarding/catalogo?segmento=barbearia');
    expect(r.status).toBe(200);
    expect(r.body.data[0].nome).toBe('Corte de cabelo');
  });

  it('dispensa os primeiros passos', async () => {
    const r = await request.post('/api/v1/onboarding/primeiros-passos/dispensar');
    expect(r.status).toBe(200);
    expect(repo.dispensarPrimeirosPassos).toHaveBeenCalledWith('b1');
  });
});
