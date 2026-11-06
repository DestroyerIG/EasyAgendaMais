import logger from '../../utils/logger.js';
// @ts-ignore — sendWhatsAppMessage é um serviço JS legado ainda não tipado
import { sendWhatsAppMessage } from '../../services/whatsapp/index.js';
import { avisarSinalConfirmado } from '../appointments/sinalConfirmado.js';
import { notificationsService } from '../notifications/notifications.service.js';
import { conexaoService } from './conexao.service.js';
import { GatewayIndisponivel, GatewayRecusou, GatewayTokenInvalido, gateways } from './gateways/index.js';
import { recebimentosRepository as repo } from './recebimentos.repository.js';
import { centavos, decidirPagamento, reais, recebimentosConfigurado, type Decisao } from './recebimentos.rules.js';
import type { GatewayId, PagamentoGateway } from './recebimentos.types.js';

// Pagamentos do sinal. O aviso do gateway só diz onde olhar: a prova é sempre a busca feita com o
// token do negócio. Webhook e rotina caem no mesmo processarCobranca, e as repetições não têm efeito.

const GATEWAY: GatewayId = 'mercadopago';
const JANELA_APOS_VENCER_MS = 30 * 60 * 1000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MENSAGEM_AO_CLIENTE = 'O negócio vai entrar em contato com você sobre o seu sinal.';

type Cobranca = NonNullable<Awaited<ReturnType<typeof repo.cobrancaComReserva>>>;
type Token = { gateway: GatewayId; accessToken: string };

/** Um 401 pode vir de um id escolhido por quem avisou. Só a URL fixa da conta prova que o acesso caiu. */
async function acessoRevogado(token: Token): Promise<boolean> {
  try {
    await gateways[token.gateway].conta(token.accessToken);
    return false;
  } catch (e) {
    return e instanceof GatewayTokenInvalido;
  }
}

/** Chamada ao gateway: acesso revogado pede reconexão; indisponível fica para a próxima rodada. */
async function consultarGateway<T>(businessId: string, token: Token, chamada: () => Promise<T>): Promise<T | null> {
  try {
    return await chamada();
  } catch (e) {
    if (e instanceof GatewayTokenInvalido) {
      if (await acessoRevogado(token)) await conexaoService.marcarReconectar(businessId, e.message);
      return null;
    }
    if (e instanceof GatewayIndisponivel || e instanceof GatewayRecusou) {
      logger.warn({ businessId, erro: e.name }, 'Recebimentos: gateway não respondeu à consulta');
      return null;
    }
    throw e;
  }
}

async function alertarNegocio(businessId: string, title: string, description: string): Promise<void> {
  try {
    await notificationsService.notify(businessId, { type: 'recebimento_alerta', title, description });
  } catch (e) {
    logger.warn({ err: e, businessId }, 'Recebimentos: alerta não enviado');
  }
}

async function avisarConfirmada(cobrancaId: string): Promise<void> {
  const reserva = await repo.reservaDaCobranca(cobrancaId);
  if (!reserva) {
    logger.warn({ cobrancaId }, 'Recebimentos: reserva confirmada não encontrada para avisar');
    return;
  }
  await avisarSinalConfirmado(reserva);
}

/** Pago, mas a reserva não pode ser confirmada: o negócio decide e o cliente fica sabendo. */
async function avisarPagoSemReserva(c: Cobranca): Promise<void> {
  const reserva = await repo.reservaDaCobranca(c.id);
  if (!reserva) return;
  await alertarNegocio(
    c.businessId,
    'Sinal pago, mas a reserva não foi confirmada',
    `${reserva.client.name} pagou ${reais(c.valor)}, mas o horário não está mais reservado. Fale com a pessoa, confira no Mercado Pago e devolva se for o caso.`,
  );
  try {
    await sendWhatsAppMessage(reserva.client.phone, MENSAGEM_AO_CLIENTE, { businessId: c.businessId, origin: 'pix_recibo' });
  } catch (e) {
    logger.warn({ err: e, cobrancaId: c.id }, 'Recebimentos: mensagem ao cliente não enviada');
  }
}

async function avisarDuplicado(c: Cobranca): Promise<void> {
  const reserva = await repo.reservaDaCobranca(c.id);
  if (!reserva) return;
  await alertarNegocio(
    c.businessId,
    'Possível sinal pago em dobro',
    `${reserva.client.name} pode ter pago ${reais(c.valor)} a mais nesta reserva. Confira no Mercado Pago e devolva se for o caso.`,
  );
}

async function avisarEstorno(c: Cobranca, situacao: 'devolvida' | 'contestada'): Promise<void> {
  const reserva = await repo.reservaDaCobranca(c.id);
  if (!reserva) return;
  const [titulo, fato] = situacao === 'devolvida' ? ['Sinal devolvido', 'foi devolvido'] : ['Sinal contestado', 'foi contestado'];
  await alertarNegocio(
    c.businessId,
    titulo,
    `O sinal de ${reais(c.valor)} de ${reserva.client.name} ${fato}. Confira no Mercado Pago. A reserva não mudou: você decide se ela continua.`,
  );
}

async function aplicar(decisao: Decisao, c: Cobranca, p: PagamentoGateway): Promise<void> {
  switch (decisao) {
    case 'ignorar':
      return;
    case 'confirmar': {
      const { confirmou } = await repo.marcarPagaEConfirmar(c.id, p);
      if (confirmou) await avisarConfirmada(c.id);
      return;
    }
    case 'reativar': {
      const resultado = await repo.marcarPagaEReativar(c.id, p);
      if (resultado === 'reativada') await avisarConfirmada(c.id);
      if (resultado === 'ocupado') await avisarPagoSemReserva(c);
      return;
    }
    case 'alertar_atrasado':
      if (await repo.marcarPaga(c.id, p)) await avisarPagoSemReserva(c);
      return;
    case 'alertar_duplicado': {
      // Segundo pagamento da mesma cobrança: ela já guarda o primeiro, então o repetido ganha linha própria.
      const registrou = c.situacao === 'paga' ? await repo.registrarPagamentoRepetido(c, p) : await repo.marcarPaga(c.id, p);
      if (registrou) await avisarDuplicado(c);
      return;
    }
    case 'marcar_recusada':
      await repo.marcarRecusada(c.id);
      return;
    case 'marcar_devolvida':
      if (await repo.marcarEstorno(c, p, 'devolvida')) await avisarEstorno(c, 'devolvida');
      return;
    case 'marcar_contestada':
      if (await repo.marcarEstorno(c, p, 'contestada')) await avisarEstorno(c, 'contestada');
  }
}

/** Relê a cobrança a cada pagamento: o anterior pode ter acabado de mudar a situação. */
async function avaliar(cobrancaId: string, pagamento: PagamentoGateway): Promise<void> {
  const c = await repo.cobrancaComReserva(cobrancaId);
  if (!c) return;
  const decisao = decidirPagamento({
    cobranca: c,
    pagamento,
    reserva: c.appointment,
    outraCobrancaPaga: await repo.outraCobrancaPaga(c.appointmentId, c.id),
    agora: new Date(),
  });
  if (pagamento.status === 'approved' && pagamento.referencia === c.id && centavos(pagamento.valor) !== centavos(c.valor)) {
    logger.warn({ cobrancaId, pagamentoId: pagamento.id }, 'Recebimentos: pagamento aprovado com valor diferente da cobrança');
  }
  if (decisao !== 'ignorar') logger.info({ cobrancaId, pagamentoId: pagamento.id, decisao }, 'Recebimentos: decisão sobre pagamento');
  await aplicar(decisao, c, pagamento);
}

/** Com um aprovado na referência, os recusados são só tentativas anteriores e ficam de fora. */
function emOrdemDeAvaliacao(pagamentos: PagamentoGateway[]): PagamentoGateway[] {
  const aprovados = pagamentos.filter((p) => p.status === 'approved');
  if (aprovados.length === 0) return pagamentos;
  return [...aprovados, ...pagamentos.filter((p) => p.status !== 'approved' && p.status !== 'rejected')];
}

async function conferirCobranca(cobrancaId: string): Promise<void> {
  const c = await repo.cobrancaComReserva(cobrancaId);
  if (!c) return;
  const token = await conexaoService.tokenAtivo(c.businessId);
  if (!token) {
    logger.warn({ cobrancaId, businessId: c.businessId }, 'Recebimentos: negócio sem conexão ativa para conferir a cobrança');
    return;
  }
  const pagamentos = await consultarGateway(
    c.businessId, token, () => gateways[token.gateway].buscarPorReferencia(token.accessToken, c.id),
  );
  for (const p of emOrdemDeAvaliacao(pagamentos ?? [])) await avaliar(c.id, p);
}

export const pagamentosService = {
  /** Aviso do gateway. Nunca lança: quem chama já respondeu 200. */
  async processarAviso(aviso: { contaId: string; tipo: 'order' | 'payment'; recursoId: string }): Promise<void> {
    if (!recebimentosConfigurado()) return;
    const { contaId, tipo, recursoId } = aviso;
    try {
      const conexao = await conexaoService.porContaExterna(GATEWAY, contaId);
      if (!conexao) {
        logger.warn({ contaId, recursoId }, 'Recebimentos: aviso de conta sem conexão');
        return;
      }
      const { businessId } = conexao;
      const token = await conexaoService.tokenAtivo(businessId);
      if (!token) {
        logger.warn({ contaId, recursoId, businessId }, 'Recebimentos: aviso de negócio sem token utilizável');
        return;
      }
      const referencia = await consultarGateway(
        businessId, token, () => gateways[token.gateway].referenciaDoRecurso(token.accessToken, { tipo, id: recursoId }),
      );
      // A conta também recebe pagamentos que não são sinais: esses têm outra referência, ou nenhuma.
      if (!referencia || !UUID.test(referencia)) return;
      if (!(await repo.cobrancaDoNegocio(referencia, businessId))) {
        logger.warn({ contaId, recursoId, businessId }, 'Recebimentos: referência do aviso não é cobrança deste negócio');
        return;
      }
      await pagamentosService.processarCobranca(referencia);
    } catch (e) {
      logger.error({ err: e, contaId, recursoId }, 'Recebimentos: falha ao processar o aviso');
    }
  },

  /** Busca os pagamentos da cobrança no gateway e aplica a decisão a cada um. Nunca lança. */
  async processarCobranca(cobrancaId: string): Promise<void> {
    try {
      await conferirCobranca(cobrancaId);
    } catch (e) {
      logger.error({ err: e, cobrancaId }, 'Recebimentos: falha ao processar a cobrança');
    }
  },

  /** Rede de segurança para avisos perdidos: roda a cada minuto. Nunca lança. */
  async conferirPendentes(agora: Date = new Date()): Promise<void> {
    if (!recebimentosConfigurado()) return;
    try {
      const limite = new Date(agora.getTime() - JANELA_APOS_VENCER_MS);
      for (const { id } of await repo.cobrancasParaConferir(limite)) await pagamentosService.processarCobranca(id);
    } catch (e) {
      logger.error({ err: e }, 'Recebimentos: falha ao conferir as cobranças pendentes');
    }
  },
};
