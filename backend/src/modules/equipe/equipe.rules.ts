import crypto from 'node:crypto';

// Convite da profissional para o app (fase 5): token, validade e estado do acesso.

export const CONVITE_DIAS = 7;

export const gerarToken = (): string => crypto.randomBytes(32).toString('base64url');
export const hashToken = (token: string): string => crypto.createHash('sha256').update(token).digest('hex');

export const expiraEm = (agora: Date): Date => new Date(agora.getTime() + CONVITE_DIAS * 24 * 60 * 60 * 1000);

export interface ConviteRegra { expiraEm: Date; aceitoEm: Date | null; revogadoEm: Date | null }
export type SituacaoConvite = 'ok' | 'usado' | 'revogado' | 'vencido';

export function situacaoConvite(c: ConviteRegra, agora: Date): SituacaoConvite {
  if (c.aceitoEm) return 'usado';
  if (c.revogadoEm) return 'revogado';
  if (c.expiraEm.getTime() <= agora.getTime()) return 'vencido';
  return 'ok';
}

export type EstadoAcesso = 'sem_acesso' | 'convite_enviado' | 'convite_vencido' | 'ativo' | 'removido';

export interface AcessoRegra {
  usuario: { email: string; blocked: boolean; createdAt: Date } | null;
  convite: (ConviteRegra & { email: string; criadoEm: Date }) | null;
}

/** O login manda: com usuário, é ativo ou removido; sem usuário, vale o último convite. */
export function estadoAcesso(a: AcessoRegra, agora: Date): { estado: EstadoAcesso; email: string | null; desde: Date | null } {
  if (a.usuario) {
    return { estado: a.usuario.blocked ? 'removido' : 'ativo', email: a.usuario.email, desde: a.usuario.createdAt };
  }
  if (!a.convite || a.convite.revogadoEm || a.convite.aceitoEm) return { estado: 'sem_acesso', email: null, desde: null };
  const vencido = situacaoConvite(a.convite, agora) === 'vencido';
  return { estado: vencido ? 'convite_vencido' : 'convite_enviado', email: a.convite.email, desde: a.convite.criadoEm };
}
