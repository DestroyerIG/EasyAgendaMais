import { describe, it, expect, vi, beforeEach } from 'vitest';

const storage = vi.hoisted(() => ({ upload: vi.fn(), createSignedUrls: vi.fn(), remove: vi.fn() }));
const db = vi.hoisted(() => ({
  client: { count: vi.fn() },
  appointment: { findFirst: vi.fn() },
  clientPhoto: { create: vi.fn(), findMany: vi.fn(), findFirst: vi.fn(), delete: vi.fn() },
}));
vi.mock('../services/supabaseAuthService.js', () => ({
  getSupabaseAdminClient: () => ({ storage: { from: () => storage } }),
}));
vi.mock('../config/prisma.js', () => ({ prisma: db }));
vi.mock('../services/scheduleSettingsService.js', () => ({
  getBusinessScheduleSettings: vi.fn().mockResolvedValue({ timezone: 'America/Sao_Paulo' }),
}));

const { clientPhotosService } = await import('../modules/clientPhotos/clientPhotos.service.js');
const { UploadPhotoSchema } = await import('../modules/clientPhotos/clientPhotos.types.js');

const C1 = '11111111-1111-4111-8111-111111111111';
const A1 = '22222222-2222-4222-8222-222222222222';
const P1 = '33333333-3333-4333-8333-333333333333';
const small = Buffer.alloc(1000, 1).toString('base64');

beforeEach(() => {
  vi.clearAllMocks();
  db.client.count.mockResolvedValue(1);
  storage.upload.mockResolvedValue({ error: null });
  storage.remove.mockResolvedValue({ error: null });
  storage.createSignedUrls.mockResolvedValue({ data: [], error: null });
  db.clientPhoto.create.mockImplementation(async ({ data }) => ({ id: P1, ...data }));
});

describe('clientPhotosService', () => {
  it('schema rejeita tipo de imagem inválido', () => {
    expect(UploadPhotoSchema.safeParse({ imageBase64: small, contentType: 'image/gif' }).success).toBe(false);
    expect(UploadPhotoSchema.safeParse({ imageBase64: small, contentType: 'image/png' }).success).toBe(true);
  });
  it('6 MB decodificados -> ValidationError', async () => {
    const big = Buffer.alloc(6 * 1024 * 1024, 1).toString('base64');
    await expect(clientPhotosService.upload('b1', C1, { imageBase64: big, contentType: 'image/jpeg' }, 'u1'))
      .rejects.toMatchObject({ statusCode: 400, message: 'Imagem inválida ou maior que 5MB' });
    expect(storage.upload).not.toHaveBeenCalled();
  });
  it('caminho começa com businessId/clientId/', async () => {
    await clientPhotosService.upload('b1', C1, { imageBase64: small, contentType: 'image/webp' }, 'u1');
    const path = storage.upload.mock.calls[0][0] as string;
    expect(path.startsWith(`b1/${C1}/`)).toBe(true);
    expect(path.endsWith('.webp')).toBe(true);
  });
  it('appointmentId de outra cliente -> ValidationError', async () => {
    db.appointment.findFirst.mockResolvedValue(null);
    await expect(clientPhotosService.upload('b1', C1, { imageBase64: small, contentType: 'image/png', appointmentId: A1 }, 'u1'))
      .rejects.toMatchObject({ statusCode: 400 });
    expect(db.appointment.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: A1, businessId: 'b1', clientId: C1 } }));
  });
  it('appointmentId copia serviceName e takenAt', async () => {
    db.appointment.findFirst.mockResolvedValue({ date: new Date('2026-03-04T00:00:00Z'), service: { name: 'Corte' } });
    await clientPhotosService.upload('b1', C1, { imageBase64: small, contentType: 'image/png', appointmentId: A1 }, 'u1');
    const data = db.clientPhoto.create.mock.calls[0][0].data;
    expect(data.serviceName).toBe('Corte');
    expect(data.takenAt.toISOString().slice(0, 10)).toBe('2026-03-04');
  });
  it('cliente de outro negócio -> NotFound', async () => {
    db.client.count.mockResolvedValue(0);
    await expect(clientPhotosService.list('b1', C1)).rejects.toMatchObject({ statusCode: 404 });
  });
  it('GET devolve url assinada por 600 s', async () => {
    db.clientPhoto.findMany.mockResolvedValue([{ id: P1, caption: 'x', serviceName: null, takenAt: new Date('2026-03-04T00:00:00Z'), storagePath: 'b1/c/1.jpg' }]);
    storage.createSignedUrls.mockResolvedValue({ data: [{ path: 'b1/c/1.jpg', signedUrl: 'https://s/1', error: null }], error: null });
    const r = await clientPhotosService.list('b1', C1);
    expect(storage.createSignedUrls).toHaveBeenCalledWith(['b1/c/1.jpg'], 600);
    expect(r[0]).toMatchObject({ id: P1, url: 'https://s/1', takenAt: '2026-03-04' });
  });
  it('DELETE de foto de outro negócio -> NotFound', async () => {
    db.clientPhoto.findFirst.mockResolvedValue(null);
    await expect(clientPhotosService.remove('b1', C1, P1)).rejects.toMatchObject({ statusCode: 404, message: 'Foto não encontrado' });
  });
  it('falha do remove -> 502 e linha não apagada', async () => {
    db.clientPhoto.findFirst.mockResolvedValue({ id: P1, storagePath: 'b1/c/1.jpg' });
    storage.remove.mockResolvedValue({ error: { message: 'boom' } });
    await expect(clientPhotosService.remove('b1', C1, P1)).rejects.toMatchObject({ statusCode: 502 });
    expect(db.clientPhoto.delete).not.toHaveBeenCalled();
  });
  it('DELETE ok remove objeto e linha', async () => {
    db.clientPhoto.findFirst.mockResolvedValue({ id: P1, storagePath: 'b1/c/1.jpg' });
    await clientPhotosService.remove('b1', C1, P1);
    expect(storage.remove).toHaveBeenCalledWith(['b1/c/1.jpg']);
    expect(db.clientPhoto.delete).toHaveBeenCalledWith({ where: { id: P1 } });
  });
});
