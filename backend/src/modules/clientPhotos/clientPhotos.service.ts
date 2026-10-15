import { randomUUID } from 'node:crypto';
import { prisma } from '../../config/prisma.js';
import { AppError, NotFoundError, ValidationError } from '../../utils/errors.js';
import { getSupabaseAdminClient } from '../../services/supabaseAuthService.js';
import { getBusinessScheduleSettings } from '../../services/scheduleSettingsService.js';
import { todayInTimezone } from '../../utils/businessDate.js';
import type { ClientPhotoDto, UploadPhotoInput } from './clientPhotos.types.js';

// Bucket PRIVADO (LGPD): só links assinados de curta duração chegam ao navegador.
const BUCKET = 'client-photos';
const MAX_BYTES = 5 * 1024 * 1024;
const SIGNED_URL_SECONDS = 600;
const EXT: Record<UploadPhotoInput['contentType'], string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };

const ymd = (d: Date): string => d.toISOString().slice(0, 10);

const assertClient = async (businessId: string, clientId: string): Promise<void> => {
  if ((await prisma.client.count({ where: { id: clientId, businessId } })) === 0) throw new NotFoundError('Cliente');
};

const toDto = (p: { id: string; caption: string | null; serviceName: string | null; takenAt: Date }, url: string | null): ClientPhotoDto => ({
  id: p.id, url, caption: p.caption, serviceName: p.serviceName, takenAt: ymd(p.takenAt),
});

export const clientPhotosService = {
  async list(businessId: string, clientId: string): Promise<ClientPhotoDto[]> {
    await assertClient(businessId, clientId);
    const rows = await prisma.clientPhoto.findMany({
      where: { businessId, clientId },
      orderBy: [{ takenAt: 'desc' }, { createdAt: 'desc' }],
    });
    if (rows.length === 0) return [];
    const { data, error } = await getSupabaseAdminClient().storage.from(BUCKET).createSignedUrls(rows.map((r) => r.storagePath), SIGNED_URL_SECONDS);
    if (error) throw new AppError(`Falha ao gerar links das fotos: ${error.message}`, 502, 'IMAGE_SIGN_FAILED');
    const byPath = new Map((data ?? []).map((d) => [d.path, d.signedUrl]));
    return rows.map((r) => toDto(r, byPath.get(r.storagePath) ?? null));
  },

  async upload(businessId: string, clientId: string, input: UploadPhotoInput, userId?: string): Promise<ClientPhotoDto> {
    await assertClient(businessId, clientId);
    const buffer = Buffer.from(input.imageBase64, 'base64');
    if (buffer.length === 0 || buffer.length > MAX_BYTES) throw new ValidationError('Imagem inválida ou maior que 5MB');

    let serviceName: string | null = null;
    let takenAt: Date;
    if (input.appointmentId) {
      const appt = await prisma.appointment.findFirst({
        where: { id: input.appointmentId, businessId, clientId },
        select: { date: true, service: { select: { name: true } } },
      });
      if (!appt) throw new ValidationError('Agendamento inválido para esta cliente');
      serviceName = appt.service.name;
      takenAt = appt.date;
    } else {
      const { timezone } = await getBusinessScheduleSettings(businessId);
      takenAt = new Date(`${input.takenAt ?? todayInTimezone(timezone)}T00:00:00.000Z`);
    }

    const path = `${businessId}/${clientId}/${randomUUID()}.${EXT[input.contentType]}`;
    const client = getSupabaseAdminClient();
    const { error } = await client.storage.from(BUCKET).upload(path, buffer, { contentType: input.contentType });
    if (error) throw new AppError(`Falha ao enviar imagem: ${error.message}`, 502, 'IMAGE_UPLOAD_FAILED');

    let row;
    try {
      row = await prisma.clientPhoto.create({
        data: { businessId, clientId, appointmentId: input.appointmentId ?? null, serviceName, caption: input.caption || null, storagePath: path, takenAt, createdBy: userId ?? null },
      });
    } catch (e) {
      await client.storage.from(BUCKET).remove([path]).catch(() => undefined);
      throw e;
    }
    const { data } = await client.storage.from(BUCKET).createSignedUrls([path], SIGNED_URL_SECONDS);
    return toDto(row, data?.[0]?.signedUrl ?? null);
  },

  async remove(businessId: string, clientId: string, photoId: string): Promise<void> {
    const photo = await prisma.clientPhoto.findFirst({ where: { id: photoId, businessId, clientId } });
    if (!photo) throw new NotFoundError('Foto');
    const { error } = await getSupabaseAdminClient().storage.from(BUCKET).remove([photo.storagePath]);
    if (error) throw new AppError(`Falha ao remover imagem: ${error.message}`, 502, 'IMAGE_DELETE_FAILED');
    await prisma.clientPhoto.delete({ where: { id: photo.id } });
  },
};
