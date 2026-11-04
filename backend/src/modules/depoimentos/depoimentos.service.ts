import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from '../../utils/errors.js';
import { auditLogService } from '../../services/auditLogService.js';
import { depoimentosRepository as repo } from './depoimentos.repository.js';
import {
  ADIAR_DIAS, FEEDBACK_MAX, NOTA_MINIMA_PUBLICAVEL, TEXTO_MAX, TEXTO_MIN,
  classificarEnvio, nomeSugerido, podeMostrarPopup,
} from './depoimentos.rules.js';
import type {
  Aba, DepoimentoAtual, DepoimentoAdmin, DepoimentoPublico, EnvioInput, EstadoDepoimento, ResultadoLista, StatusAtual, UsuarioAdmin, UsuarioDono,
} from './depoimentos.types.js';
import type { AdminLinha, Transicionada } from './depoimentos.repository.js';

const DIA_MS = 24 * 60 * 60 * 1000;
const NOME_MAX = 60;
const CIDADE_MAX = 80;

const STATUS_PUBLICO: Record<string, StatusAtual> = {
  pendente: 'em_analise',
  publicado: 'publicado',
  recusado: 'nao_publicado',
  interno: 'nao_publicado',
  retirado: 'nao_publicado',
};

const negocioDe = (u: UsuarioDono): string => {
  if (!u.businessId) throw new ForbiddenError('Acesso negado para este perfil');
  return u.businessId;
};

const vazioParaNulo = (s: string | undefined): string | null => (s?.trim() ? s.trim() : null);

async function publicos(): Promise<DepoimentoPublico[]> {
  const linhas = await repo.publicos();
  return linhas.map((d) => ({
    texto: d.texto,
    nota: Number(d.nota),
    nomeExibido: d.nome_exibido ?? '',
    negocio: d.negocio_nome,
    cidade: d.cidade ?? '',
    logoUrl: d.logo_url || null,
  }));
}

async function estado(user: UsuarioDono): Promise<EstadoDepoimento> {
  const id = negocioDe(user);
  const negocio = await repo.negocio(id);
  if (!negocio) throw new NotFoundError('Negócio');
  const [concluidos, pedido, temEnvio, linha] = await Promise.all([
    repo.concluidos(id), repo.pedido(id), repo.temEnvio(id), repo.atual(id),
  ]);
  const atual: DepoimentoAtual | null = linha
    ? {
        status: STATUS_PUBLICO[linha.status] ?? 'nao_publicado',
        nota: Number(linha.nota),
        texto: linha.texto,
        nomeExibido: linha.nome_exibido,
        cidade: linha.cidade,
      }
    : null;
  return {
    mostrarPopup: podeMostrarPopup({
      role: user.role,
      subscriptionStatus: negocio.subscription_status,
      negocioCriadoEm: negocio.created_at,
      concluidos,
      pedido: pedido ? { adiadoAte: pedido.adiado_ate, dispensadoEm: pedido.dispensado_em } : null,
      temEnvio,
      agora: new Date(),
    }),
    nomeSugerido: nomeSugerido(negocio.owner_name),
    atual,
  };
}

export const depoimentosService = {
  publicos,
  estado,

  async enviar(user: UsuarioDono, body: EnvioInput): Promise<EstadoDepoimento> {
    const id = negocioDe(user);
    const publicavel = body.nota >= NOTA_MINIMA_PUBLICAVEL;
    const texto = body.texto.trim();
    const [min, max] = publicavel ? [TEXTO_MIN, TEXTO_MAX] : [1, FEEDBACK_MAX];
    if (texto.length < min || texto.length > max) {
      throw new ValidationError(`O texto deve ter entre ${min} e ${max} caracteres`);
    }
    const autorizou = publicavel && body.autorizou;
    const nomeExibido = vazioParaNulo(body.nomeExibido);
    const cidade = vazioParaNulo(body.cidade);
    if (autorizou && (!nomeExibido || !cidade)) {
      throw new ValidationError('Informe o nome e a cidade que vão aparecer no depoimento');
    }
    // Limites das colunas VARCHAR(60) e VARCHAR(80): evita 500 por valor longo demais.
    if (nomeExibido && nomeExibido.length > NOME_MAX) {
      throw new ValidationError(`O nome deve ter no máximo ${NOME_MAX} caracteres`);
    }
    if (cidade && cidade.length > CIDADE_MAX) {
      throw new ValidationError(`A cidade deve ter no máximo ${CIDADE_MAX} caracteres`);
    }
    const negocio = await repo.negocio(id);
    if (!negocio) throw new NotFoundError('Negócio');
    await repo.enviar({
      businessId: id,
      negocioNome: negocio.name,
      logoUrl: negocio.logo_url,
      nota: body.nota,
      texto,
      nomeExibido,
      cidade,
      autorizou,
      autorizadoEm: autorizou ? new Date() : null,
      status: classificarEnvio({ nota: body.nota, autorizou }),
    });
    return estado(user);
  },

  async adiar(user: UsuarioDono): Promise<EstadoDepoimento> {
    await repo.adiar(negocioDe(user), new Date(Date.now() + ADIAR_DIAS * DIA_MS));
    return estado(user);
  },

  async dispensar(user: UsuarioDono): Promise<EstadoDepoimento> {
    await repo.dispensar(negocioDe(user), new Date());
    return estado(user);
  },

  async retirar(user: UsuarioDono): Promise<EstadoDepoimento> {
    await repo.retirar(negocioDe(user));
    return estado(user);
  },
};

// ---- SuperAdmin ----

type RequisicaoAuditavel = Parameters<typeof auditLogService.logAdminAction>[0]['req'];

const STATUS_DA_ABA: Record<Aba, string[]> = {
  pendentes: ['pendente'],
  publicados: ['publicado'],
  recusados: ['recusado'],
  internos: ['interno', 'retirado'],
};

const paraAdmin = (l: AdminLinha): DepoimentoAdmin => ({
  id: l.id,
  negocio: l.negocio_nome,
  negocioId: l.business_id,
  plano: l.plano,
  nomeExibido: l.nome_exibido,
  cidade: l.cidade,
  nota: Number(l.nota),
  texto: l.texto,
  textoOriginal: l.texto_original,
  autorizadoEm: l.autorizado_em ? l.autorizado_em.toISOString() : null,
  criadoEm: l.criado_em.toISOString(),
  status: l.status,
});

/** A transição é decidida no SQL; sem linha, distingue "não existe" (404) de "status não permite" (409). */
async function transicionar(
  id: string,
  admin: UsuarioAdmin,
  actionType: string,
  executar: () => Promise<Transicionada | null>,
  mensagemConflito: string,
  req: RequisicaoAuditavel,
): Promise<void> {
  const linha = await executar();
  if (!linha) {
    if ((await repo.statusDe(id)) === null) throw new NotFoundError('Depoimento');
    throw new ConflictError(mensagemConflito);
  }
  await auditLogService.logAdminAction({
    req,
    actionType,
    actorUserId: admin.userId,
    actorBusinessId: admin.businessId ?? null,
    targetBusinessId: linha.business_id,
    resourceType: 'depoimento',
    resourceId: id,
  });
}

export const depoimentosAdminService = {
  async listar(aba: Aba): Promise<ResultadoLista> {
    const [linhas, publicados] = await Promise.all([
      repo.listarAdmin(STATUS_DA_ABA[aba], aba === 'pendentes'),
      repo.contarPublicados(),
    ]);
    return { itens: linhas.map(paraAdmin), publicados };
  },

  publicar: (id: string, admin: UsuarioAdmin, req: RequisicaoAuditavel) =>
    transicionar(id, admin, 'DEPOIMENTO_PUBLICADO', () => repo.publicar(id, admin.userId),
      'Só é possível publicar um depoimento pendente', req),

  recusar: (id: string, admin: UsuarioAdmin, req: RequisicaoAuditavel) =>
    transicionar(id, admin, 'DEPOIMENTO_RECUSADO', () => repo.recusar(id),
      'Só é possível recusar um depoimento pendente', req),

  async corrigir(id: string, texto: string, admin: UsuarioAdmin, req: RequisicaoAuditavel): Promise<void> {
    const limpo = texto.trim();
    if (limpo.length < TEXTO_MIN || limpo.length > TEXTO_MAX) {
      throw new ValidationError(`O texto deve ter entre ${TEXTO_MIN} e ${TEXTO_MAX} caracteres`);
    }
    await transicionar(id, admin, 'DEPOIMENTO_CORRIGIDO', () => repo.corrigir(id, limpo),
      'Só é possível corrigir um depoimento pendente ou publicado', req);
  },
};
