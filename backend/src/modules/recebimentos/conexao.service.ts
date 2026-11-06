import { randomBytes } from 'node:crypto';
import logger from '../../utils/logger.js';
import { cifrarCom, decifrarCom } from '../../utils/cifra.js';
import { ForbiddenError, NotFoundError, ValidationError } from '../../utils/errors.js';
import { notificationsService } from '../notifications/notifications.service.js';
import { GatewayIndisponivel, GatewayTokenInvalido, gateways, type Tokens } from './gateways/index.js';
import { recebimentosRepository as repo } from './recebimentos.repository.js';
import {
  assinarEstado, chaveRecebimentos, desafioPkce, lerEstado, nonceDoEstado, recebimentosConfigurado,
  tokenPertoDeVencer, verificadorPkce,
} from './recebimentos.rules.js';
import type { EstadoRecebimentos, FormaSinal, GatewayId, UsuarioLogado } from './recebimentos.types.js';

// Conexão do negócio com o gateway de recebimentos (Mercado Pago). Os tokens ficam cifrados e nunca saem daqui.

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

export const conexaoService = {
  conectarUrl(user: UsuarioLogado, gateway: GatewayId): { url: string } {
    if (!recebimentosConfigurado()) throw new NotFoundError('Recebimentos');
    const estado = assinarEstado(user.userId, gateway);
    const desafio = desafioPkce(verificadorPkce(nonceDoEstado(estado)));
    return { url: gateways[gateway].urlAutorizacao(estado, desafio) };
  },

  /**
   * Volta do gateway: troca o código e deixa a conexão pendente por 10 minutos. Quem confirma é o
   * navegador logado (POST /confirmar), e só se for a mesma pessoa que pediu. Devolve para onde
   * redirecionar. Nunca lança.
   */
  async callback(gateway: GatewayId, code: string | undefined, state: string | undefined): Promise<string> {
    const tela = telaDe(gateway);
    try {
      const lido = recebimentosConfigurado() && state ? lerEstado(state) : null;
      if (!lido || lido.gateway !== gateway || !code) return `${tela}?recebimento=erro`;
      const tokens = await gateways[gateway].trocarCodigo(code, verificadorPkce(lido.nonce));
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

    const conta = await gateways[gateway].conta(p.tokens.accessToken);
    await repo.salvarConexao({
      businessId: u.businessId, gateway, contaExternaId: p.tokens.contaId, contaNome: conta.nome,
      accessTokenCifrado: cifrar(p.tokens.accessToken), refreshTokenCifrado: cifrar(p.tokens.refreshToken),
      tokenExpiraEm: p.tokens.expiraEm,
    });
    return conexaoService.verConexao(user);
  },

  async verConexao(user: UsuarioLogado): Promise<EstadoRecebimentos> {
    if (!recebimentosConfigurado()) return { configurado: false, conexao: null };
    const c = await repo.conexaoDoNegocio(user.businessId);
    if (!c) return { configurado: true, conexao: null };
    const [ultima, pendentesN] = await Promise.all([repo.ultimaConfirmacaoEm(user.businessId), repo.reservasPendentes(user.businessId)]);
    return {
      configurado: true,
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

  async tokenAtivo(businessId: string): Promise<{ gateway: GatewayId; accessToken: string } | null> {
    const c = await repo.conexaoDoNegocio(businessId);
    if (!c || c.situacao !== 'ativa') return null;
    return { gateway: c.gateway as GatewayId, accessToken: decifrar(c.accessTokenCifrado) };
  },

  /** Formas que o cliente pode escolher. Sem conexão ativa (ou em erro), só Pix. Nunca lança. */
  async formas(businessId: string): Promise<FormaSinal[]> {
    try {
      const c = await repo.conexaoDoNegocio(businessId);
      if (!c || c.situacao !== 'ativa') return ['pix'];
      const lista: FormaSinal[] = [];
      if (c.aceitaPix) lista.push('pix');
      if (c.aceitaCartao) lista.push('cartao');
      return lista.length ? lista : ['pix'];
    } catch (e) {
      logger.warn({ err: e, businessId }, 'Recebimentos: falha ao ler as formas');
      return ['pix'];
    }
  },

  /** O gateway recusou o acesso: a conexão vai para "precisa reconectar" e avisa uma vez (na troca de situação). */
  async marcarReconectar(businessId: string, motivo: string): Promise<void> {
    const c = await repo.conexaoDoNegocio(businessId);
    if (!c || c.situacao !== 'ativa') return;
    await repo.atualizarConexao(c.id, { situacao: 'precisa_reconectar' });
    logger.warn({ businessId, motivo }, 'Recebimentos: conexão precisa ser refeita');
    await notificationsService.notify(businessId, {
      type: 'recebimento_alerta',
      title: 'Reconecte o Mercado Pago',
      description: 'O Mercado Pago recusou o acesso. Enquanto isso, os sinais voltam a ser pagos por Pix manual.',
      link: '/dashboard/configuracoes/recebimentos/mercadopago',
    });
  },

  /** O gateway recusou uma cobrança: avisa no sino, no máximo uma vez a cada 24 horas. */
  async alertarRecusa(businessId: string): Promise<void> {
    const c = await repo.conexaoDoNegocio(businessId);
    if (!c) return;
    if (!(await repo.reservarAlerta(c.id, new Date(), INTERVALO_ALERTA_MS))) return;
    await notificationsService.notify(businessId, {
      type: 'recebimento_alerta',
      title: 'O Mercado Pago recusou uma cobrança',
      description: 'Confira se a conta tem chave Pix cadastrada e se o acesso está ativo.',
      link: '/dashboard/configuracoes/recebimentos/mercadopago',
    });
  },

  async porContaExterna(gateway: GatewayId, contaId: string): Promise<{ businessId: string } | null> {
    return repo.conexaoPorContaExterna(gateway, contaId);
  },

  /** Renova os tokens a menos de 30 dias do vencimento. Roda uma vez por dia; nunca lança. */
  async renovarVencendo(agora: Date = new Date()): Promise<void> {
    if (!recebimentosConfigurado()) return;
    try {
      for (const c of await repo.conexoesAtivas()) {
        if (!tokenPertoDeVencer(c.tokenExpiraEm, agora)) continue;
        try {
          const t = await gateways[c.gateway as GatewayId].renovar(decifrar(c.refreshTokenCifrado));
          await repo.atualizarConexao(c.id, {
            accessTokenCifrado: cifrar(t.accessToken), refreshTokenCifrado: cifrar(t.refreshToken), tokenExpiraEm: t.expiraEm,
          });
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
