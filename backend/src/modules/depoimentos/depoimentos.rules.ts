export const DIAS_MINIMOS = 14;
export const ATENDIMENTOS_MINIMOS = 10;
export const ADIAR_DIAS = 30;
export const NOTA_MINIMA_PUBLICAVEL = 4;
export const TEXTO_MIN = 20;
export const TEXTO_MAX = 400;
export const FEEDBACK_MAX = 1000;
export const MAX_NA_LANDING = 6;

const DIA_MS = 24 * 60 * 60 * 1000;

export function podeMostrarPopup(e: {
  role: string;
  subscriptionStatus: string;
  negocioCriadoEm: Date;
  concluidos: number;
  pedido: { adiadoAte: Date | null; dispensadoEm: Date | null } | null;
  temEnvio: boolean;
  agora: Date;
}): boolean {
  if (e.role !== 'tenant_admin') return false;
  if (e.subscriptionStatus !== 'active') return false;
  if (e.agora.getTime() - e.negocioCriadoEm.getTime() < DIAS_MINIMOS * DIA_MS) return false;
  if (e.concluidos < ATENDIMENTOS_MINIMOS) return false;
  if (e.temEnvio) return false;
  if (e.pedido?.dispensadoEm) return false;
  if (e.pedido?.adiadoAte && e.pedido.adiadoAte.getTime() > e.agora.getTime()) return false;
  return true;
}

export function classificarEnvio(e: { nota: number; autorizou: boolean }): 'pendente' | 'interno' {
  return e.nota >= NOTA_MINIMA_PUBLICAVEL && e.autorizou ? 'pendente' : 'interno';
}

const PARTICULAS = new Set(['da', 'de', 'do', 'dos', 'das']);

function capitalizar(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
}

export function nomeSugerido(ownerName: string): string {
  const partes = ownerName.split(/\s+/).filter(Boolean);
  if (partes.length === 0) return '';
  const primeiro = capitalizar(partes[0]);
  const ultimo = partes
    .slice(1)
    .filter((p) => !PARTICULAS.has(p.toLowerCase()))
    .shift();
  return ultimo ? `${primeiro} ${ultimo.charAt(0).toUpperCase()}.` : primeiro;
}
