import { randomBytes } from 'node:crypto';
import logger from '../../utils/logger.js';
import { cifrarCom, decifrarCom } from '../../utils/cifra.js';
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from '../../utils/errors.js';
import { notificationsService } from '../notifications/notifications.service.js';
import { GatewayCheckoutDesligado, GatewayIndisponivel, GatewayTokenInvalido, type Tokens } from './gateways/index.js';
import { infinitePay, normalizarHandle, type CredencialInfinitePay } from './gateways/infinitePay.js';
import { gatewayDe } from './gateways/porId.js';
import { recebimentosRepository as repo } from './recebimentos.repository.js';
import {
  assinarEstado, chaveRecebimentos, desafioPkce, lerEstado, gatewayDisponivel, gatewaysDisponiveis, nonceDoEstado, recebimentosConfigurado,
  tokenPertoDeVencer, verificadorPkce,
} from './recebimentos.rules.js';
import type { EstadoRecebimentos, FormaSinal, GatewayId, UsuarioLogado } from './recebimentos.types.js';

// Conexão do negócio com o gateway de recebimentos (Mercado Pago ou InfinitePay). Tokens e chaves ficam cifrados e nunca saem daqui.

// A InfinitePay não tem expiração: a conexão fica com validade "infinita".
const SEM_EXPIRACAO = new Date('9999-12-31T00:00:00Z');
const COM_ARTIGO: Record<GatewayId, { o: string; O: string }> = {
  mercadopago: { o: 'o Mercado Pago', O: 'O Mercado Pago' },
  infinitepay: { o: 'a InfinitePay', O: 'A InfinitePay' },
};

const frontend = () => (process.env.FRONTEND_URL || process.env.APP_URL || 'http://localhost:3000').replace(/\/+$/, '');
const telaDe = (gateway: GatewayId) => `${frontend()}/dashboard/configuracoes/recebimentos/${gateway}`;

const VALIDADE_PENDENTE_MS = 10 * 60 * 1000;
const INTERVALO_ALERTA_MS = 24 * 60 * 60 * 1000;

// Conexões que voltaram do gateway e esperam a confirmação do navegador logado (uma instância só).
const pendentes = new Map<string, { userId: string; gateway: GatewayId; tokens: Tokens; exp: number }>();
function limparPendentes() {
  const agora = Date.now();
  for (const [t, p] of pendentes) if (p.exp < agora) pendentes.delete(t);
}

const cifrar = (texto: string) => cifrarCom(chaveRecebimentos(), texto);
const decifrar = (cifrado: string) => decifrarCom(chaveRecebimentos(), cifrado);

type ConexaoComTokens = NonNullable<Awaited<ReturnType<typeof repo.conexaoDoNegocio>>>;

// Uma renovação por negócio de cada vez nesta instância: o refresh token é de uso único, e duas
// chamadas com o mesmo token fariam a segunda receber `invalid_grant` com a conexão boa.
const renovando = new Map<string, Promise<string>>();

/**
 * Renova os tokens da conexão e grava os novos, cifrados, só se o refresh token gravado ainda for o
 * que foi usado. Devolve o access token válido. Se o gateway recusar o refresh, relê a linha: quando
 * ele mudou, outra chamada (ou outra instância) renovou antes, e o token salvo serve.
 */
function renovarConexao(c: ConexaoComTokens): Promise<string> {
  const emCurso = renovando.get(c.businessId);
  if (emCurso) return emCurso;
  const p = (async () => {
    try {
      const t = await gatewayDe(c.gateway as GatewayId).renovar(decifrar(c.refreshTokenCifrado));
      const gravou = await repo.atualizarTokensSe(c.id, c.refreshTokenCifrado, {
        accessTokenCifrado: cifrar(t.accessToken), refreshTokenCifrado: cifrar(t.refreshToken), tokenExpiraEm: t.expiraEm,
      });
      if (gravou) return t.accessToken;
      // Não gravou: a linha foi reconectada ou apagada no meio. Vale o que estiver salvo agora.
      const atual = await repo.conexaoDoNegocio(c.businessId);
      if (!atual || atual.situacao !== 'ativa') throw new GatewayIndisponivel();
      return decifrar(atual.accessTokenCifrado);
    } catch (e) {
      if (e instanceof GatewayTokenInvalido) {
        const atual = await repo.conexaoDoNegocio(c.businessId);
        if (atual && atual.situacao === 'ativa' && atual.refreshTokenCifrado !== c.refreshTokenCifrado) {
          return decifrar(atual.accessTokenCifrado);
        }
      }
      throw e;
    }
  })().finally(() => renovando.delete(c.businessId));
  renovando.set(c.businessId, p);
  return p;
}

export const conexaoService = {
  conectarUrl(user: UsuarioLogado, gateway: GatewayId): { url: string } {
    if (!gatewayDisponivel('mercadopago')) throw new NotFoundError('Recebimentos');
    const estado = assinarEstado(user.userId, gateway);
    const desafio = desafioPkce(verificadorPkce(nonceDoEstado(estado)));
    return { url: gatewayDe(gateway).urlAutorizacao(estado, desafio) };
  },

  /**
   * Volta do gateway: troca o código e deixa a conexão pendente por 10 minutos. Quem confirma é o
   * navegador logado (POST /confirmar), e só se for a mesma pessoa que pediu. Devolve para onde
   * redirecionar. Nunca lança.
   */
  async callback(gateway: GatewayId, code: string | undefined, state: string | undefined): Promise<string> {
    const tela = telaDe(gateway);
    try {
      const lido = gatewayDisponivel('mercadopago') && state ? lerEstado(state) : null;
      if (!lido || lido.gateway !== gateway || !code) return `${tela}?recebimento=erro`;
      const tokens = await gatewayDe(gateway).trocarCodigo(code, verificadorPkce(lido.nonce));
      limparPendentes();
      const t = randomBytes(24).toString('base64url');
      pendentes.set(t, { userId: lido.userId, gateway, tokens, exp: Date.now() + VALIDADE_PENDENTE_MS });
      return `${tela}?recebimento=confirmar&t=${t}`;
    } catch (e) {
      logger.warn({ err: e, gateway }, 'Recebimentos: falha ao trocar o código');
      return `${tela}?recebimento=erro`;
    }
  },

  async confirmar(user: UsuarioLogado, gateway: GatewayId, t: string): Promise<EstadoRecebimentos> {
    const p = pendentes.get(t);
    pendentes.delete(t);
    if (!p || p.exp < Date.now() || p.gateway !== gateway) throw new NotFoundError('Conexão pendente com o gateway');
    if (p.userId !== user.userId) throw new ForbiddenError('Esta conexão foi pedida por outra conta. Conecte de novo por aqui.');

    const u = await repo.usuario(user.userId);
    if (!u) throw new NotFoundError('Usuário');
    if (u.role !== 'tenant_admin') throw new ForbiddenError('Só quem administra o negócio conecta os recebimentos');

    // O id da conta vem de /users/me: o webhook roteia por ele, e o `user_id` do OAuth pode faltar.
    const conta = await gatewayDe(gateway).conta(p.tokens.accessToken);
    const contaId = conta.id || p.tokens.contaId;
    if (!contaId || (p.tokens.contaId && conta.id && p.tokens.contaId !== conta.id)) {
      throw new ValidationError('O Mercado Pago não confirmou a conta. Conecte de novo.');
    }
    if (await repo.contaEmOutroNegocio(gateway, contaId, u.businessId)) {
      throw new ConflictError('Esta conta do Mercado Pago já está conectada a outro negócio.');
    }
    try {
      await repo.salvarConexao({
        businessId: u.businessId, gateway, contaExternaId: contaId, contaNome: conta.nome,
        accessTokenCifrado: cifrar(p.tokens.accessToken), refreshTokenCifrado: cifrar(p.tokens.refreshToken),
        tokenExpiraEm: p.tokens.expiraEm,
      });
    } catch (e) {
      // Índice único de (gateway, conta): outro negócio conectou a mesma conta ao mesmo tempo.
      if ((e as { code?: string }).code === 'P2002') {
        throw new ConflictError('Esta conta do Mercado Pago já está conectada a outro negócio.');
      }
      throw e;
    }
    return conexaoService.verConexao(user);
  },

  /**
   * Conecta a InfinitePay por chave: confere a chave na API antes de gravar. Reconectar com chave nova
   * passa por aqui também e sobrescreve a linha do negócio.
   */
  async conectarChave(user: UsuarioLogado, d: { handle: string; chave: string }): Promise<EstadoRecebimentos> {
    if (!gatewayDisponivel('infinitepay')) throw new NotFoundError('Recebimentos');
    const u = await repo.usuario(user.userId);
    if (!u) throw new NotFoundError('Usuário');
    if (u.role !== 'tenant_admin') throw new ForbiddenError('Só quem administra o negócio conecta os recebimentos');
    const handle = normalizarHandle(d.handle);
    if (!handle) throw new ValidationError('Informe a InfiniteTag.');
    const atual = await repo.conexaoDoNegocio(u.businessId);
    if (atual && atual.gateway === 'mercadopago' && atual.situacao === 'ativa') {
      throw new ConflictError('Desconecte o Mercado Pago antes de conectar a InfinitePay.');
    }
    try {
      await infinitePay.conferirChave({ handle, chave: d.chave });
    } catch (e) {
      if (e instanceof GatewayTokenInvalido) {
        throw new ValidationError('A InfinitePay recusou a chave. Confira se a chave e a InfiniteTag são da mesma conta.');
      }
      if (e instanceof GatewayCheckoutDesligado) {
        throw new ValidationError('Ligue o Checkout integrado na InfinitePay e tente de novo.');
      }
      if (e instanceof GatewayIndisponivel) {
        throw new ValidationError('A InfinitePay não respondeu. Tente de novo em alguns minutos.');
      }
      throw e;
    }
    const jaConectada = 'Esta conta da InfinitePay já está conectada a outro negócio.';
    if (await repo.contaEmOutroNegocio('infinitepay', handle, u.businessId)) throw new ConflictError(jaConectada);
    try {
      await repo.salvarConexao({
        businessId: u.businessId, gateway: 'infinitepay', contaExternaId: handle, contaNome: `$${handle}`,
        accessTokenCifrado: cifrar(d.chave), refreshTokenCifrado: cifrar(''), tokenExpiraEm: SEM_EXPIRACAO,
        aceitaPix: false, aceitaCartao: true, aceiteCartaoEm: new Date(),
      });
    } catch (e) {
      if ((e as { code?: string }).code === 'P2002') throw new ConflictError(jaConectada);
      throw e;
    }
    return conexaoService.verConexao(user);
  },

  /** Chave e InfiniteTag da conexão ativa da InfinitePay. Outro gateway ou sem conexão: null. */
  async credencial(businessId: string): Promise<{ gateway: 'infinitepay'; cred: CredencialInfinitePay } | null> {
    const c = await repo.conexaoDoNegocio(businessId);
    if (!c || c.situacao !== 'ativa' || c.gateway !== 'infinitepay') return null;
    return { gateway: 'infinitepay', cred: { handle: c.contaExternaId, chave: decifrar(c.accessTokenCifrado) } };
  },

  async verConexao(user: UsuarioLogado): Promise<EstadoRecebimentos> {
    if (!recebimentosConfigurado()) return { configurado: false, disponiveis: [], conexao: null };
    const disponiveis = gatewaysDisponiveis();
    const c = await repo.conexaoDoNegocio(user.businessId);
    if (!c) return { configurado: true, disponiveis, conexao: null };
    const [ultima, pendentesN] = await Promise.all([repo.ultimaConfirmacaoEm(user.businessId), repo.reservasPendentes(user.businessId)]);
    return {
      configurado: true,
      disponiveis,
      conexao: {
        gateway: c.gateway as GatewayId,
        situacao: c.situacao === 'ativa' ? 'ativa' : 'precisa_reconectar',
        contaNome: c.contaNome ?? '',
        aceitaPix: c.aceitaPix, aceitaCartao: c.aceitaCartao,
        aceiteCartaoEm: c.aceiteCartaoEm?.toISOString() ?? null,
        ultimaConfirmacaoEm: ultima?.toISOString() ?? null,
        reservasPendentes: pendentesN,
      },
    };
  },

  async definirFormas(
    user: UsuarioLogado, gateway: GatewayId,
    f: { aceitaPix: boolean; aceitaCartao: boolean; aceiteCartao?: boolean },
  ): Promise<EstadoRecebimentos> {
    const c = await repo.conexaoDoNegocio(user.businessId);
    if (!c || c.gateway !== gateway) throw new NotFoundError('Conexão de recebimentos');
    if (gateway === 'infinitepay') throw new ValidationError('A InfinitePay não permite escolher as formas de pagamento.');
    if (!f.aceitaPix && !f.aceitaCartao) throw new ValidationError('Deixe ao menos uma forma de receber ligada');
    const novoAceite = f.aceitaCartao && !c.aceiteCartaoEm && f.aceiteCartao === true;
    if (f.aceitaCartao && !c.aceiteCartaoEm && !novoAceite) {
      throw new ValidationError('Para receber no cartão, confirme que leu as condições');
    }
    await repo.atualizarConexao(c.id, {
      aceitaPix: f.aceitaPix, aceitaCartao: f.aceitaCartao, ...(novoAceite ? { aceiteCartaoEm: new Date() } : {}),
    });
    return conexaoService.verConexao(user);
  },

  /** Apaga a conexão; as cobranças já criadas ficam. */
  async desconectar(user: UsuarioLogado, gateway: GatewayId): Promise<{ desconectado: true }> {
    const c = await repo.conexaoDoNegocio(user.businessId);
    if (!c || c.gateway !== gateway) throw new NotFoundError('Conexão de recebimentos');
    await repo.apagarConexao(user.businessId);
    return { desconectado: true };
  },

  /**
   * Token da conexão ativa. Perto do vencimento, renova na hora: se o cron falhar por dias, o token
   * vencido não é usado. Sem conseguir renovar, só devolve o atual se ainda não venceu.
   */
  async tokenAtivo(businessId: string, agora: Date = new Date()): Promise<{ gateway: GatewayId; accessToken: string } | null> {
    const c = await repo.conexaoDoNegocio(businessId);
    if (!c || c.situacao !== 'ativa' || c.gateway === 'infinitepay') return null;
    const gateway = c.gateway as GatewayId;
    if (!tokenPertoDeVencer(c.tokenExpiraEm, agora)) return { gateway, accessToken: decifrar(c.accessTokenCifrado) };
    try {
      return { gateway, accessToken: await renovarConexao(c) };
    } catch (e) {
      if (e instanceof GatewayTokenInvalido) {
        await conexaoService.marcarReconectar(businessId, e.message);
        return null;
      }
      logger.warn({ err: e, businessId }, 'Recebimentos: falha ao renovar o token na hora');
      return c.tokenExpiraEm.getTime() > agora.getTime() ? { gateway, accessToken: decifrar(c.accessTokenCifrado) } : null;
    }
  },

  /** Formas que o cliente pode escolher. Sem conexão ativa (ou em erro), só Pix. Nunca lança. */
  async formas(businessId: string): Promise<FormaSinal[]> {
    try {
      const c = await repo.conexaoDoNegocio(businessId);
      if (!c || c.situacao !== 'ativa' || !gatewayDisponivel(c.gateway as GatewayId)) return ['pix'];
      const lista: FormaSinal[] = [];
      if (c.aceitaPix) lista.push('pix');
      if (c.aceitaCartao) lista.push('cartao');
      return lista.length ? lista : ['pix'];
    } catch (e) {
      logger.warn({ err: e, businessId }, 'Recebimentos: falha ao ler as formas');
      return ['pix'];
    }
  },

  /**
   * Um 401 numa chamada qualquer não prova token vencido. Só a URL fixa da conta prova que o acesso caiu.
   * Mercado Pago confere o token; InfinitePay confere a chave gravada do negócio.
   */
  async acessoRevogado(businessId: string, gateway: GatewayId, accessToken?: string): Promise<boolean> {
    try {
      if (gateway === 'infinitepay') {
        const c = await conexaoService.credencial(businessId);
        if (!c) return false;
        await infinitePay.conferirChave(c.cred);
      } else {
        if (!accessToken) return false;
        await gatewayDe(gateway).conta(accessToken);
      }
      return false;
    } catch (e) {
      return e instanceof GatewayTokenInvalido;
    }
  },

  /** O negócio liberou o cartão, mas a conexão não está ativa agora. Nunca lança. */
  async cartaoForaDoAr(businessId: string): Promise<boolean> {
    try {
      const c = await repo.conexaoDoNegocio(businessId);
      return !!c && c.aceitaCartao && (c.situacao !== 'ativa' || !gatewayDisponivel(c.gateway as GatewayId));
    } catch {
      return false;
    }
  },

  /** O gateway recusou o acesso: a conexão vai para "precisa reconectar" e avisa uma vez (na troca de situação). */
  async marcarReconectar(businessId: string, motivo: string): Promise<void> {
    if (!(await repo.marcarReconectar(businessId))) return;
    logger.warn({ businessId, motivo }, 'Recebimentos: conexão precisa ser refeita');
    const gateway = ((await repo.conexaoDoNegocio(businessId))?.gateway ?? 'mercadopago') as GatewayId;
    await notificationsService.notify(businessId, {
      type: 'recebimento_alerta',
      title: `Reconecte ${COM_ARTIGO[gateway].o}`,
      description: `${COM_ARTIGO[gateway].O} recusou o acesso. Enquanto isso, os sinais voltam a ser pagos por Pix manual.`,
      link: `/dashboard/configuracoes/recebimentos/${gateway}`,
    });
  },

  /** O gateway recusou uma cobrança: avisa no sino, no máximo uma vez a cada 24 horas. */
  async alertarRecusa(businessId: string): Promise<void> {
    const c = await repo.conexaoDoNegocio(businessId);
    if (!c) return;
    if (!(await repo.reservarAlerta(c.id, new Date(), INTERVALO_ALERTA_MS))) return;
    const gateway = c.gateway as GatewayId;
    await notificationsService.notify(businessId, {
      type: 'recebimento_alerta',
      title: `${COM_ARTIGO[gateway].O} recusou uma cobrança`,
      description: gateway === 'infinitepay'
        ? 'Confira se o Checkout integrado continua ligado na InfinitePay e se a chave ainda vale.'
        : 'Confira se a conta tem chave Pix cadastrada e se o acesso está ativo.',
      link: `/dashboard/configuracoes/recebimentos/${gateway}`,
    });
  },

  async porContaExterna(gateway: GatewayId, contaId: string): Promise<{ businessId: string } | null> {
    return repo.conexaoPorContaExterna(gateway, contaId);
  },

  /** Renova os tokens a menos de 30 dias do vencimento. Roda uma vez por dia; nunca lança. */
  async renovarVencendo(agora: Date = new Date()): Promise<void> {
    if (!recebimentosConfigurado()) return;
    try {
      for (const lida of await repo.conexoesAtivas()) {
        if (lida.gateway !== 'mercadopago' || !tokenPertoDeVencer(lida.tokenExpiraEm, agora)) continue;
        // Relê a linha: a foto da lista pode ter ficado velha se uma renovação na hora rodou no meio.
        const c = await repo.conexaoDoNegocio(lida.businessId);
        if (!c || c.situacao !== 'ativa' || c.gateway !== 'mercadopago' || !tokenPertoDeVencer(c.tokenExpiraEm, agora)) continue;
        try {
          await renovarConexao(c);
        } catch (e) {
          if (e instanceof GatewayTokenInvalido) await conexaoService.marcarReconectar(c.businessId, e.message);
          else if (e instanceof GatewayIndisponivel) logger.warn({ businessId: c.businessId }, 'Recebimentos: renovação adiada');
          else logger.warn({ err: e, businessId: c.businessId }, 'Recebimentos: falha ao renovar o token');
        }
      }
    } catch (e) {
      logger.warn({ err: e }, 'Recebimentos: falha ao renovar os tokens');
    }
  },
};
