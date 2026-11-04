import { ForbiddenError, NotFoundError, ValidationError } from '../../utils/errors.js';
import { depoimentosRepository as repo } from './depoimentos.repository.js';
import {
  ADIAR_DIAS, FEEDBACK_MAX, NOTA_MINIMA_PUBLICAVEL, TEXTO_MAX, TEXTO_MIN,
  classificarEnvio, nomeSugerido, podeMostrarPopup,
} from './depoimentos.rules.js';
import type { DepoimentoAtual, EnvioInput, EstadoDepoimento, StatusAtual, UsuarioDono } from './depoimentos.types.js';

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
