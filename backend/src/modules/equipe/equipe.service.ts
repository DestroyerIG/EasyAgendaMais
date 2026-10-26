import type { Response } from 'express';
import { authService } from '../../services/authService.js';
import { supabaseAuthService } from '../../services/supabaseAuthService.js';
import { emailService } from '../../services/emailService.js';
import { evaluateFeatureAccess } from '../../services/featureAccessService.js';
import { AppError, ConflictError, ForbiddenError, NotFoundError } from '../../utils/errors.js';
import logger from '../../utils/logger.js';
import { vocabularioDe } from '../../config/vocabulario.js';
import { equipeRepository as repo } from './equipe.repository.js';
import { estadoAcesso, expiraEm, gerarToken, hashToken, situacaoConvite } from './equipe.rules.js';
import type { AcessoDto, ConviteCriadoDto, ConvitePublicoDto } from './equipe.types.js';

// Convite e acesso das profissionais ao app (fase 5).

type Profissional = NonNullable<Awaited<ReturnType<typeof repo.profissional>>>;

const paraAcesso = (p: Pick<Profissional, 'id' | 'usuario' | 'convites'>, agora = new Date()): AcessoDto => {
  const e = estadoAcesso({ usuario: p.usuario, convite: p.convites[0] ?? null }, agora);
  return { professionalId: p.id, estado: e.estado, email: e.email, desde: e.desde?.toISOString() ?? null };
};

const linkDoConvite = (token: string) => `${emailService.getFrontendBaseUrl()}/convite/${token}`;

const liberado = (b: { plan: unknown; subscriptionStatus: unknown }) =>
  evaluateFeatureAccess({ feature: 'app_profissional', plan: b.plan, subscriptionStatus: b.subscriptionStatus }).allowed;

class ConviteInvalidoError extends AppError {
  constructor(message: string) { super(message, 410, 'CONVITE_INVALIDO'); }
}

const MENSAGEM_CONVITE = {
  usado: 'Este convite já foi usado. Entre com seu e-mail e senha.',
  revogado: 'Este convite foi cancelado. Peça um novo convite ao salão.',
  vencido: 'Este convite expirou. Peça um novo convite ao salão.',
} as const;

async function carregarProfissional(businessId: string, professionalId: string): Promise<Profissional> {
  const p = await repo.profissional(businessId, professionalId);
  if (!p) throw new NotFoundError('Profissional');
  return p;
}

async function conviteValido(token: string) {
  const c = await repo.conviteDoToken(hashToken(token));
  if (!c) throw new ConviteInvalidoError('Convite não encontrado. Peça um novo convite ao salão.');
  const s = situacaoConvite(c, new Date());
  if (s !== 'ok') throw new ConviteInvalidoError(MENSAGEM_CONVITE[s]);
  if (!c.professional.active) throw new ConviteInvalidoError('Este cadastro de profissional foi desativado. Fale com o salão.');
  if (!liberado(c.business)) throw new ForbiddenError('O plano do salão não inclui o app da profissional. Fale com o salão.');
  return c;
}

export const equipeService = {
  async acessos(businessId: string): Promise<AcessoDto[]> {
    const agora = new Date();
    return (await repo.acessos(businessId)).map((p) => paraAcesso(p, agora));
  },

  async convidar(businessId: string, userId: string, professionalId: string, email: string): Promise<ConviteCriadoDto> {
    const p = await carregarProfissional(businessId, professionalId);
    if (!p.active) throw new ConflictError('Reative a profissional antes de convidar');
    if (p.usuario) {
      throw new ConflictError(p.usuario.blocked
        ? 'Esta profissional já teve acesso. Use "Reativar acesso"'
        : 'Esta profissional já tem acesso ao app');
    }
    if (await repo.usuarioDoEmail(email)) throw new ConflictError('Este e-mail já tem acesso ao EasyAgenda+');

    const token = gerarToken();
    await repo.criarConvite({ businessId, professionalId, email, tokenHash: hashToken(token), expiraEm: expiraEm(new Date()), criadoPor: userId });
    const negocio = await repo.negocio(businessId);
    const link = linkDoConvite(token);
    const envio = await emailService.sendConviteProfissional({ to: email, url: link, negocio: negocio?.name ?? 'Seu salão', nome: p.name });
    logger.info({ businessId, professionalId, emailEnviado: envio.delivered }, 'Convite da profissional criado');
    return { ...paraAcesso(await carregarProfissional(businessId, professionalId)), link, emailEnviado: envio.delivered };
  },

  async revogar(businessId: string, professionalId: string): Promise<AcessoDto> {
    await carregarProfissional(businessId, professionalId);
    await repo.revogarAbertos(professionalId);
    return paraAcesso(await carregarProfissional(businessId, professionalId));
  },

  async removerAcesso(businessId: string, professionalId: string): Promise<AcessoDto> {
    const p = await carregarProfissional(businessId, professionalId);
    await repo.revogarAbertos(professionalId);
    if (p.usuario && !p.usuario.blocked) await repo.definirBloqueio(p.usuario.id, true);
    return paraAcesso(await carregarProfissional(businessId, professionalId));
  },

  async reativarAcesso(businessId: string, professionalId: string): Promise<AcessoDto> {
    const p = await carregarProfissional(businessId, professionalId);
    if (!p.usuario) throw new ConflictError('Esta profissional ainda não tem acesso. Envie um convite');
    if (!p.active) throw new ConflictError('Reative a profissional antes de liberar o acesso');
    if (p.usuario.blocked) await repo.definirBloqueio(p.usuario.id, false);
    return paraAcesso(await carregarProfissional(businessId, professionalId));
  },

  configuracao: (businessId: string) => repo.configuracao(businessId),
  salvarConfiguracao: (businessId: string, profissionalCobra: boolean) => repo.salvarConfiguracao(businessId, profissionalCobra),

  async verConvite(token: string): Promise<ConvitePublicoDto> {
    const c = await conviteValido(token);
    return { negocio: c.business.name, profissional: c.professional.name, email: c.email, vocabulario: vocabularioDe(c.business.settings?.segment) };
  },

  /** Cria o login no Supabase (já confirmado) e o usuário local, e abre a sessão. */
  async aceitar(res: Response, token: string, senha: string) {
    const c = await conviteValido(token);
    if (c.professional.usuario) throw new ConviteInvalidoError(MENSAGEM_CONVITE.usado);
    const outro = await repo.usuarioDoEmail(c.email);
    if (outro) throw new ConflictError('Este e-mail já tem acesso ao EasyAgenda+. Peça à dona um convite com outro e-mail');

    const { userId: supabaseUserId } = await supabaseAuthService.createConfirmedUser(c.email, senha);
    const ok = await repo.aceitar({
      conviteId: c.id, businessId: c.businessId, professionalId: c.professionalId, email: c.email,
      supabaseUserId, passwordHash: authService.senhaPlaceholder(),
    });
    if (!ok) throw new ConviteInvalidoError(MENSAGEM_CONVITE.usado);
    logger.info({ businessId: c.businessId, professionalId: c.professionalId }, 'Convite da profissional aceito');
    const sessao = await authService.abrirSessaoConfirmada(res, { email: c.email, supabaseUserId });
    return { token: sessao.token, refreshToken: sessao.refreshToken, user: sessao.user };
  },
};
