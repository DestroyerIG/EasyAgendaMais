/**
 * serviceSerializer.ts — molda Service (Prisma camelCase) para o DTO snake_case que o
 * frontend consome (frontend/src/types/index.ts). Sem ele a resposta de /business/services
 * trazia `durationMinutes`, e a tela lia `duration_minutes` (undefined) — o card de
 * serviço e o seletor de serviço do agendamento mostravam a duração em branco.
 */

interface RawService {
  id: string;
  businessId?: string;
  name: string;
  price: unknown;
  durationMinutes: number;
  depositPercentage?: unknown;
  description?: string | null;
  active: boolean;
  createdAt?: Date | string;
}

export interface ServiceDto {
  id: string;
  business_id?: string;
  name: string;
  price: number;
  duration_minutes: number;
  deposit_percentage: number | null;
  description: string | null;
  active: boolean;
  created_at?: string;
}

const priceToNumber = (p: unknown): number => {
  const n = Number(typeof p === 'object' && p !== null ? String(p) : (p as string | number));
  return Number.isFinite(n) ? n : 0;
};

export const toServiceDto = (s: RawService): ServiceDto => ({
  id: s.id,
  business_id: s.businessId,
  name: s.name,
  price: priceToNumber(s.price),
  duration_minutes: s.durationMinutes,
  deposit_percentage: s.depositPercentage !== null && s.depositPercentage !== undefined
    ? Number(s.depositPercentage)
    : null,
  description: s.description ?? null,
  active: s.active,
  created_at: s.createdAt ? new Date(s.createdAt).toISOString() : undefined,
});
