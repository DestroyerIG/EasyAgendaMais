import { vi, describe, it, beforeEach, afterEach, expect } from 'vitest';

const db = vi.hoisted(() => ({
  user: { findMany: vi.fn(), findFirst: vi.fn() },
  pushInscricao: { findMany: vi.fn(), delete: vi.fn(), update: vi.fn(), upsert: vi.fn(), deleteMany: vi.fn() },
}));
vi.mock('../config/prisma.js', () => ({ prisma: db }));
const wp = vi.hoisted(() => ({ setVapidDetails: vi.fn(), sendNotification: vi.fn() }));
vi.mock('web-push', () => ({ default: wp }));

const { pushService } = await import('../modules/push/push.service.js');

const inscricao = (id: string) => ({ id, endpoint: `https://push.test/${id}`, p256dh: 'k', auth: 'a' });
const comChaves = () => {
  process.env.VAPID_PUBLIC_KEY = 'pub';
  process.env.VAPID_PRIVATE_KEY = 'priv';
  process.env.VAPID_SUBJECT = 'mailto:suporte@easyagenda.test';
};

beforeEach(() => {
  vi.clearAllMocks();
  db.pushInscricao.delete.mockResolvedValue({});
  db.pushInscricao.update.mockResolvedValue({});
});
afterEach(() => {
  process.env.VAPID_PUBLIC_KEY = '';
  process.env.VAPID_PRIVATE_KEY = '';
  process.env.VAPID_SUBJECT = '';
});

describe('pushService', () => {
  it('sem as chaves VAPID não consulta nem envia nada', async () => {
    expect(pushService.configurado()).toBe(false);
    expect(pushService.chavePublica()).toBeNull();
    expect(await pushService.paraEquipe('b1', { titulo: 'Oi' })).toBe(0);
    expect(await pushService.paraProfissional('b1', 'p1', { titulo: 'Oi' })).toBe(0);
    expect(db.user.findMany).not.toHaveBeenCalled();
    expect(db.user.findFirst).not.toHaveBeenCalled();
    expect(wp.sendNotification).not.toHaveBeenCalled();
  });

  it('equipe: só dona e recepção não bloqueadas; o payload leva título, corpo e link', async () => {
    comChaves();
    db.user.findMany.mockResolvedValue([{ id: 'u1' }, { id: 'u2' }]);
    db.pushInscricao.findMany.mockResolvedValue([inscricao('i1'), inscricao('i2')]);
    wp.sendNotification.mockResolvedValue({});
    expect(await pushService.paraEquipe('b1', { titulo: 'Comanda pronta', corpo: 'Ana', link: '/caixa' })).toBe(2);
    expect(db.user.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { businessId: 'b1', blocked: false, role: { in: ['tenant_admin', 'employee'] } },
    }));
    expect(wp.setVapidDetails).toHaveBeenCalledWith('mailto:suporte@easyagenda.test', 'pub', 'priv');
    const [, corpo] = wp.sendNotification.mock.calls[0]!;
    expect(JSON.parse(corpo as string)).toMatchObject({ titulo: 'Comanda pronta', corpo: 'Ana', link: '/caixa' });
  });

  it('410/404 apaga a inscrição; outro erro só marca e não derruba', async () => {
    comChaves();
    db.user.findFirst.mockResolvedValue({ id: 'u9' });
    db.pushInscricao.findMany.mockResolvedValue([inscricao('i1'), inscricao('i2'), inscricao('i3')]);
    wp.sendNotification
      .mockRejectedValueOnce(Object.assign(new Error('gone'), { statusCode: 410 }))
      .mockRejectedValueOnce(Object.assign(new Error('boom'), { statusCode: 500 }))
      .mockResolvedValueOnce({});
    expect(await pushService.paraProfissional('b1', 'p1', { titulo: 'Novo agendamento' })).toBe(1);
    expect(db.pushInscricao.delete).toHaveBeenCalledWith({ where: { id: 'i1' } });
    expect(db.pushInscricao.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'i2' } }));
  });

  it('profissional sem login: nada enviado', async () => {
    comChaves();
    db.user.findFirst.mockResolvedValue(null);
    expect(await pushService.paraProfissional('b1', 'p1', { titulo: 'X' })).toBe(0);
    expect(db.pushInscricao.findMany).not.toHaveBeenCalled();
  });

  it('erro do banco vira 0, nunca exceção', async () => {
    comChaves();
    db.user.findMany.mockRejectedValue(new Error('db fora'));
    await expect(pushService.paraEquipe('b1', { titulo: 'X' })).resolves.toBe(0);
  });

  it('inscrever passa o aparelho para quem entrou (upsert pelo endpoint)', async () => {
    await pushService.inscrever('u2', { endpoint: 'https://push.test/e', keys: { p256dh: 'k', auth: 'a' } }, 'Safari');
    expect(db.pushInscricao.upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { endpoint: 'https://push.test/e' }, update: expect.objectContaining({ userId: 'u2' }),
    }));
  });
});
