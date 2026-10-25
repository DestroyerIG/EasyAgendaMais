import { Prisma } from '@prisma/client';
import { prisma } from '../../config/prisma.js';
import logger from '../../utils/logger.js';
import { AppError, ConflictError, NotFoundError, ValidationError } from '../../utils/errors.js';
import { todayInTimezone } from '../../utils/businessDate.js';
import { buildPixPayload, type PixKeyType } from '../../utils/pixPayload.js';
import { getBusinessScheduleSettings } from '../../services/scheduleSettingsService.js';
import { filaEnvios } from '../whatsappFila/fila.service.js';
import { notificationsService } from '../notifications/notifications.service.js';
import { linhaCsv } from '../crm/csv.js';
import { somarDias } from '../reports/periodo.js';
import { clubeRepository as repo, POR_PAGINA, type ContratoRow, type OfertaRow } from './clube.repository.js';
import {
  DIAS_ADESAO_PENDENTE, DIAS_ANTECEDENCIA_COBRANCA, type Cobertura, avaliarCobertura, cicloQueComecaEm, contratoVigente,
  descontoSocia, escolherCobertura, saldo, sessoesDoPreco, validadeDaPrimeiraSessao, validadeSemUso, valorSessao,
} from './clube.rules.js';
import type {
  CobrancaDto, ContratoDto, EditarOfertaInput, FormaPagamentoClube, IndicadoresClube, ListaContratosQuery,
  OfertaDto, OfertaInput, VincularInput,
} from './clube.types.js';

type Tx = Prisma.TransactionClient;
type Cobranca = NonNullable<Awaited<ReturnType<typeof repo.buscarCobranca>>>;

const n = (v: unknown) => Number(v ?? 0);
const ymd = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);
const dataBr = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;
const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

async function hojeDo(businessId: string): Promise<string> {
  const { timezone } = await getBusinessScheduleSettings(businessId);
  return todayInTimezone(timezone);
}

type Negocio = NonNullable<Awaited<ReturnType<typeof repo.negocioParaPix>>>;

function gerarPix(negocio: Negocio, valor: number, descricao: string): string | null {
  if (!negocio.pixKey || !negocio.pixKeyType || valor <= 0) return null;
  try {
    return buildPixPayload({
      pixKey: negocio.pixKey, pixKeyType: negocio.pixKeyType as PixKeyType,
      merchantName: negocio.name, merchantCity: 'BRASIL', amount: valor, description: descricao.slice(0, 40),
    });
  } catch (err) {
    logger.warn({ err, businessId: negocio.id }, 'Pix do clube não gerado');
    return null;
  }
}

// ─── DTOs ────────────────────────────────────────────────────────────────

export function paraOfertaDto(o: OfertaRow, cont?: { ativos: number; receita: number }): OfertaDto {
  const tipo = o.tipo as 'clube' | 'pacote';
  return {
    id: o.id, tipo, nome: o.nome, descricao: o.descricao, preco: n(o.preco),
    servicos: o.servicos.map((s) => ({ id: s.service.id, nome: s.service.name })),
    profissionais: o.profissionais.map((p) => ({ id: p.professional.id, nome: p.professional.name })),
    beneficios: o.beneficios, descontoExtrasPct: n(o.descontoExtrasPct), faltaDebita: o.faltaDebita, publica: o.publica,
    sessoesPorCiclo: o.sessoesPorCiclo, sessoesReferencia: o.sessoesReferencia, intervaloMinimoDias: o.intervaloMinimoDias,
    totalSessoes: o.totalSessoes, validadeDias: o.validadeDias,
    valorSessao: valorSessao(n(o.preco), sessoesDoPreco({ tipo, totalSessoes: o.totalSessoes, sessoesPorCiclo: o.sessoesPorCiclo, sessoesReferencia: o.sessoesReferencia })),
    status: o.status as OfertaDto['status'],
    contratosAtivos: cont?.ativos ?? 0, receitaMensal: Math.round((cont?.receita ?? 0) * 100) / 100,
  };
}

const paraCobrancaDto = (b: Cobranca): CobrancaDto => ({
  id: b.id, competencia: ymd(b.competencia)!, valor: n(b.valor), vencimento: ymd(b.vencimento)!,
  status: b.status as CobrancaDto['status'], pixCopiaCola: b.pixCopiaCola,
  forma: (b.forma as FormaPagamentoClube | null) ?? null,
  pagoEm: b.pagoEm ? b.pagoEm.toISOString() : null, enviadoEm: b.enviadoEm ? b.enviadoEm.toISOString() : null,
});

export function paraContratoDto(c: ContratoRow, usosNoCiclo: number): ContratoDto {
  const tipo = c.tipo as 'clube' | 'pacote';
  const pendente = c.cobrancas.find((b) => b.status === 'pendente') ?? null;
  const paga = c.cobrancas.find((b) => b.status === 'paga') ?? null;
  const cicloFim = ymd(c.cicloFim);
  let proximoVencimento: string | null = null;
  if (pendente) proximoVencimento = ymd(pendente.vencimento);
  else if (tipo === 'clube' && cicloFim && ['ativo', 'em_atraso'].includes(c.status)) proximoVencimento = somarDias(cicloFim, 1);
  return {
    id: c.id, tipo, status: c.status as ContratoDto['status'], origem: c.origem as ContratoDto['origem'],
    oferta: { id: c.oferta.id, nome: c.oferta.nome },
    cliente: { id: c.client.id, nome: c.client.name, telefone: c.client.phone },
    preco: n(c.preco), valorSessao: n(c.valorSessao),
    saldo: saldo({ tipo, sessoesPorCiclo: c.sessoesPorCiclo, totalSessoes: c.totalSessoes, sessoesUsadas: c.sessoesUsadas, usosNoCiclo }),
    cicloInicio: ymd(c.cicloInicio), cicloFim, validoAte: ymd(c.validoAte), cancelaEm: ymd(c.cancelaEm),
    proximoVencimento,
    cobrancaPendente: pendente ? paraCobrancaDto(pendente) : null,
    ultimaForma: (paga?.forma as FormaPagamentoClube | null) ?? null,
    criadoEm: c.createdAt.toISOString(),
  };
}

async function dtosDeContratos(lista: ContratoRow[]): Promise<ContratoDto[]> {
  const usos = await repo.usosNoCiclo(lista.filter((c) => c.tipo === 'clube').map((c) => c.id));
  return lista.map((c) => paraContratoDto(c, usos.get(c.id) ?? 0));
}

// ─── Cobrança e ativação ───────────────────────────────────────────────────

function textoCobranca(c: { nome: string; oferta: string; tipo: string; primeira: boolean }, b: { valor: number; vencimento: string; pix: string }) {
  const primeiroNome = c.nome.split(' ')[0] ?? c.nome;
  const abertura = c.primeira
    ? `Olá, ${primeiroNome}! Para ativar ${c.tipo === 'clube' ? 'sua assinatura do' : 'seu'} ${c.oferta}, pague ${brl(b.valor)} pelo Pix copia e cola abaixo.`
    : `Olá, ${primeiroNome}! A mensalidade do ${c.oferta} (${brl(b.valor)}) vence em ${dataBr(b.vencimento)}. Segue o Pix copia e cola:`;
  const fecho = c.primeira
    ? 'Assim que o salão confirmar o pagamento, sua assinatura começa.'
    : 'Assim que o salão confirmar, suas sessões do novo mês ficam liberadas.';
  return `${abertura}\n\n${b.pix}\n\n${fecho}`;
}

async function enviarCobranca(businessId: string, contrato: { clientId: string; tipo: string; client: { name: string; phone: string }; oferta: { nome: string } }, b: Cobranca, primeira: boolean) {
  if (!b.pixCopiaCola) return false;
  try {
    await filaEnvios.enfileirar([{
      businessId, clientId: contrato.clientId, phone: contrato.client.phone, origin: 'clube',
      body: textoCobranca(
        { nome: contrato.client.name, oferta: contrato.oferta.nome, tipo: contrato.tipo, primeira },
        { valor: n(b.valor), vencimento: ymd(b.vencimento)!, pix: b.pixCopiaCola },
      ),
    }]);
    await prisma.clubeCobranca.update({ where: { id: b.id }, data: { enviadoEm: new Date() } });
    return true;
  } catch (err) {
    logger.warn({ err, cobrancaId: b.id }, 'Cobrança do clube não entrou na fila do WhatsApp');
    return false;
  }
}

/** Pagamento confirmado: ativa o contrato (primeiro pagamento) ou abre o ciclo pago da competência. */
async function aplicarPagamento(tx: Tx, contratoId: string, competencia: string, hoje: string) {
  const c = await tx.clubeContrato.findUniqueOrThrow({ where: { id: contratoId } });
  if (c.status === 'aguardando_pagamento') {
    if (c.tipo === 'clube') {
      const ciclo = cicloQueComecaEm(hoje, Number(hoje.slice(8, 10)));
      await tx.clubeContrato.update({
        where: { id: c.id },
        data: { status: 'ativo', ativadoEm: repo.data(hoje), cicloInicio: repo.data(ciclo.inicio), cicloFim: repo.data(ciclo.fim) },
      });
    } else {
      await tx.clubeContrato.update({
        where: { id: c.id },
        data: { status: 'ativo', ativadoEm: repo.data(hoje), validoAte: repo.data(validadeSemUso(hoje, c.validadeDias ?? 30)) },
      });
    }
    return;
  }
  if (c.tipo !== 'clube' || !c.ativadoEm) return;
  if (!['ativo', 'em_atraso'].includes(c.status)) throw new ConflictError('Este contrato não está mais ativo');
  const fimAtual = ymd(c.cicloFim);
  if (fimAtual && competencia <= fimAtual) return; // ciclo já pago
  const ciclo = cicloQueComecaEm(competencia, c.ativadoEm.getUTCDate());
  await tx.clubeContrato.update({
    where: { id: c.id },
    data: { status: 'ativo', cicloInicio: repo.data(ciclo.inicio), cicloFim: repo.data(ciclo.fim) },
  });
}

async function caixaParaConfirmar(tx: Tx, businessId: string, hoje: string, forma: FormaPagamentoClube) {
  const caixa = await repo.sessaoDeCaixa(tx, businessId, hoje);
  if (forma === 'dinheiro') {
    if (!caixa) throw new AppError('Abra o caixa de hoje para receber em dinheiro', 409, 'CASH_CLOSED');
    if (caixa.closedAt) throw new AppError('O caixa de hoje já foi fechado', 409, 'CASH_ALREADY_CLOSED');
  }
  return caixa && !caixa.closedAt ? caixa.id : null;
}

// ─── Uso da sessão ─────────────────────────────────────────────────────────

export interface AlvoCobertura { clientId: string; serviceId: string; professionalId: string; data: string }

/**
 * Grava a sessão usada dentro de uma transação já aberta (fechamento da comanda ou falta).
 * Reavalia a regra sob o lock do contrato; lança ConflictError se a cobertura não vale mais.
 */
async function gravarUso(tx: Tx, businessId: string, contratoId: string, alvo: AlvoCobertura & {
  comandaItemId: string | null; appointmentId: string; motivo: 'atendimento' | 'falta';
}) {
  await repo.travarContrato(tx, contratoId);
  const [c] = await repo.paraCobertura(tx, businessId, alvo.clientId, { ids: [contratoId] });
  const avaliacao: Cobertura = c
    ? avaliarCobertura(c, alvo)
    : { ok: false, contratoId, nome: '', motivo: 'Contrato não encontrado' };
  if (!avaliacao.ok) throw new ConflictError(`A sessão não pode ser debitada: ${avaliacao.motivo}`);
  await tx.clubeUso.create({
    data: {
      businessId, contratoId, comandaItemId: alvo.comandaItemId, appointmentId: alvo.appointmentId,
      serviceId: alvo.serviceId, data: repo.data(alvo.data), valorSessao: c!.valorSessao, motivo: alvo.motivo,
    },
  });
  if (c!.tipo === 'pacote') {
    const usadas = c!.sessoesUsadas + 1;
    await tx.clubeContrato.update({
      where: { id: contratoId },
      data: {
        sessoesUsadas: usadas,
        ...(c!.sessoesUsadas === 0 ? { validoAte: repo.data(validadeDaPrimeiraSessao(alvo.data, c!.validadeDias ?? 30)) } : {}),
        ...(c!.totalSessoes !== null && usadas >= c!.totalSessoes ? { status: 'concluido' } : {}),
      },
    });
  }
  return avaliacao;
}

async function contratoOuErro(db: Tx | typeof prisma, businessId: string, id: string) {
  const c = await repo.buscarContrato(db, businessId, id);
  if (!c) throw new NotFoundError('Contrato');
  return c;
}

// ─── Serviço ───────────────────────────────────────────────────────────────

export const clubeService = {
  // Ofertas
  async listarOfertas(businessId: string): Promise<OfertaDto[]> {
    const [ofertas, cont] = await Promise.all([
      repo.listarOfertas(businessId),
      repo.contadoresPorOferta(businessId, new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)),
    ]);
    return ofertas.map((o) => paraOfertaDto(o, cont.get(o.id)));
  },

  async criarOferta(businessId: string, input: OfertaInput): Promise<OfertaDto> {
    await validarIds(businessId, input);
    return paraOfertaDto(await repo.criarOferta(businessId, input));
  },

  async editarOferta(businessId: string, id: string, input: EditarOfertaInput): Promise<OfertaDto> {
    const atual = await repo.buscarOferta(businessId, id);
    if (!atual) throw new NotFoundError('Plano');
    if ('status' in input && !('tipo' in input)) {
      await repo.mudarStatusOferta(businessId, id, input.status);
    } else {
      const o = input as OfertaInput;
      if (o.tipo !== atual.tipo) throw new ValidationError('Não dá para trocar um clube por pacote. Crie um plano novo.');
      await validarIds(businessId, o);
      await repo.editarOferta(businessId, id, o);
    }
    const cont = await repo.contadoresPorOferta(businessId, new Date(Date.now() - 30 * 24 * 60 * 60 * 1000));
    return paraOfertaDto((await repo.buscarOferta(businessId, id))!, cont.get(id));
  },

  // Contratos
  async listarContratos(businessId: string, q: ListaContratosQuery) {
    const hoje = await hojeDo(businessId);
    const [{ itens, total }, indicadores] = await Promise.all([
      repo.listarContratos(businessId, q),
      repo.indicadores(businessId, hoje, somarDias(hoje, 30)) as Promise<IndicadoresClube>,
    ]);
    return { itens: await dtosDeContratos(itens), total, pagina: q.pagina, porPagina: POR_PAGINA, indicadores };
  },

  async contratosDoCliente(businessId: string, clientId: string) {
    const hoje = await hojeDo(businessId);
    const lista = await repo.contratosDoCliente(businessId, clientId);
    const dtos = await dtosDeContratos(lista);
    return dtos.map((d) => ({ ...d, vigente: contratoVigente(d, hoje) }));
  },

  async vincular(businessId: string, userId: string, input: VincularInput) {
    const oferta = await repo.buscarOferta(businessId, input.ofertaId);
    if (!oferta) throw new NotFoundError('Plano');
    if (oferta.status !== 'ativa') throw new ConflictError('Este plano está pausado ou arquivado');
    const cliente = await prisma.client.findFirst({ where: { id: input.clientId, businessId }, select: { id: true } });
    if (!cliente) throw new NotFoundError('Cliente');
    const { pago, forma } = input.pagamento;
    if (!pago && forma !== 'pix') throw new ValidationError('Pagamento a receber só por Pix. Nas outras formas, marque como pago.');
    const negocio = (await repo.negocioParaPix(businessId))!;
    if (!pago && !negocio.pixKey) throw new ValidationError('Cadastre a chave Pix do salão em Ajustes para cobrar por Pix');
    const hoje = await hojeDo(businessId);

    const { contratoId, cobranca } = await repo.transacao(async (tx) => {
      await repo.travarAdesao(tx, `${input.clientId}|${input.ofertaId}`);
      if (await repo.temContratoVigente(tx, businessId, input.clientId, input.ofertaId)) {
        throw new ConflictError('Esta cliente já tem este plano ativo');
      }
      const cashSessionId = pago ? await caixaParaConfirmar(tx, businessId, hoje, forma) : null;
      const contrato = await criarContrato(tx, businessId, oferta, input.clientId, 'painel', userId);
      const b = await tx.clubeCobranca.create({
        data: {
          businessId, contratoId: contrato.id, competencia: repo.data(hoje), vencimento: repo.data(hoje), valor: oferta.preco,
          pixCopiaCola: pago ? null : gerarPix(negocio, n(oferta.preco), oferta.nome),
          ...(pago ? { status: 'paga', forma, pagoEm: new Date(), confirmadoPor: userId, cashSessionId } : {}),
        },
      });
      if (pago) await aplicarPagamento(tx, contrato.id, hoje, hoje);
      return { contratoId: contrato.id, cobranca: b };
    });

    const c = await contratoOuErro(prisma, businessId, contratoId);
    if (!pago) await enviarCobranca(businessId, c, cobranca, true);
    return (await dtosDeContratos([await contratoOuErro(prisma, businessId, contratoId)]))[0]!;
  },

  async cancelar(businessId: string, id: string) {
    const hoje = await hojeDo(businessId);
    await repo.transacao(async (tx) => {
      await repo.travarContrato(tx, id);
      const c = await contratoOuErro(tx, businessId, id);
      if (!['aguardando_pagamento', 'ativo', 'em_atraso'].includes(c.status)) throw new ConflictError('Este contrato já foi encerrado');
      // Clube pago vale até o fim do ciclo; o resto encerra hoje.
      const fim = c.tipo === 'clube' && c.status === 'ativo' && c.cicloFim ? ymd(c.cicloFim)! : hoje;
      await tx.clubeContrato.update({
        where: { id }, data: { status: 'cancelado', canceladoEm: new Date(), cancelaEm: repo.data(fim) },
      });
      await tx.clubeCobranca.updateMany({ where: { contratoId: id, status: 'pendente' }, data: { status: 'cancelada' } });
    });
    return (await dtosDeContratos([await contratoOuErro(prisma, businessId, id)]))[0]!;
  },

  // Cobranças
  async confirmarCobranca(businessId: string, userId: string, id: string, forma: FormaPagamentoClube) {
    const hoje = await hojeDo(businessId);
    const inicial = await repo.buscarCobranca(prisma, businessId, id);
    if (!inicial) throw new NotFoundError('Cobrança');
    await repo.transacao(async (tx) => {
      await repo.travarContrato(tx, inicial.contratoId);
      const b = (await repo.buscarCobranca(tx, businessId, id))!;
      if (b.status === 'paga') return; // confirmar de novo não duplica
      if (b.status === 'cancelada') throw new ConflictError('Esta cobrança foi cancelada');
      const cashSessionId = await caixaParaConfirmar(tx, businessId, hoje, forma);
      const r = await tx.clubeCobranca.updateMany({
        where: { id, status: 'pendente' },
        data: { status: 'paga', forma, pagoEm: new Date(), confirmadoPor: userId, cashSessionId },
      });
      if (r.count !== 1) return;
      await aplicarPagamento(tx, b.contratoId, ymd(b.competencia)!, hoje);
    });
    return (await dtosDeContratos([await contratoOuErro(prisma, businessId, inicial.contratoId)]))[0]!;
  },

  async reenviarCobranca(businessId: string, id: string) {
    let b = await repo.buscarCobranca(prisma, businessId, id);
    if (!b) throw new NotFoundError('Cobrança');
    if (b.status !== 'pendente') throw new ConflictError('Esta cobrança não está pendente');
    const c = await contratoOuErro(prisma, businessId, b.contratoId);
    if (!b.pixCopiaCola) {
      const negocio = (await repo.negocioParaPix(businessId))!;
      const pix = gerarPix(negocio, n(b.valor), c.oferta.nome);
      if (!pix) throw new ValidationError('Cadastre a chave Pix do salão em Ajustes para cobrar por Pix');
      b = await prisma.clubeCobranca.update({ where: { id }, data: { pixCopiaCola: pix } });
    }
    const enviada = await enviarCobranca(businessId, c, b, c.status === 'aguardando_pagamento');
    return { enviada, pixCopiaCola: b.pixCopiaCola };
  },

  async exportarCsv(businessId: string): Promise<string> {
    const dtos = await dtosDeContratos(await repo.todosContratos(businessId));
    const STATUS: Record<ContratoDto['status'], string> = {
      aguardando_pagamento: 'Aguardando pagamento', ativo: 'Ativo', em_atraso: 'Em atraso',
      cancelado: 'Cancelado', concluido: 'Concluído', expirado: 'Expirado',
    };
    const linhas = [
      linhaCsv(['Cliente', 'Telefone', 'Plano', 'Tipo', 'Status', 'Preço', 'Valor por sessão', 'Saldo', 'Próximo vencimento', 'Válido até', 'Encerra em', 'Criado em']),
      ...dtos.map((d) => linhaCsv([
        d.cliente.nome, d.cliente.telefone, d.oferta.nome, d.tipo === 'clube' ? 'Clube' : 'Pacote', STATUS[d.status],
        d.preco, d.valorSessao,
        d.saldo.total === null ? 'Ilimitado' : `${d.saldo.restantes} de ${d.saldo.total}`,
        d.proximoVencimento ?? '', d.validoAte ?? '', d.cancelaEm ?? '', d.criadoEm.slice(0, 10),
      ])),
    ];
    return `﻿${linhas.join('\r\n')}\r\n`;
  },

  // Rotina de hora em hora
  async rotina(agora: Date = new Date()) {
    const negocios = await repo.negociosComContratos();
    let cobrancas = 0;
    let atrasos = 0;
    for (const { businessId } of negocios) {
      try {
        const { timezone } = await getBusinessScheduleSettings(businessId);
        const hoje = todayInTimezone(timezone, agora);
        cobrancas += await gerarCobrancasDoCiclo(businessId, hoje);
        atrasos += await marcarAtrasos(businessId, hoje);
        await repo.expirarPacotes(businessId, hoje);
        await cancelarAdesoesVencidas(businessId, agora);
      } catch (err) {
        logger.error({ err, businessId }, 'Rotina do clube falhou para o negócio');
      }
    }
    return { cobrancas, atrasos };
  },

  // Comanda e falta
  async cobertura(businessId: string, alvo: AlvoCobertura) {
    const contratos = await repo.paraCobertura(prisma, businessId, alvo.clientId);
    const escolhida = escolherCobertura(contratos.map((c) => avaliarCobertura(c, alvo)));
    const descontoPct = descontoSocia(contratos.map((c) => ({ valido: contratoVigente(c, alvo.data), descontoExtrasPct: c.descontoExtrasPct })));
    return { escolhida, descontoPct };
  },

  gravarUso,

  /** Falta com `falta_debita`: debita a sessão do contrato que cobriria o serviço. Sem contrato válido, nada acontece. */
  async aoFaltar(businessId: string, appointmentId: string) {
    const a = await prisma.appointment.findFirst({
      where: { id: appointmentId, businessId, status: 'faltou' },
      select: { id: true, clientId: true, serviceId: true, professionalId: true, date: true },
    });
    if (!a) return null;
    const alvo = { clientId: a.clientId, serviceId: a.serviceId, professionalId: a.professionalId, data: ymd(a.date)! };
    const contratos = await repo.paraCobertura(prisma, businessId, a.clientId, { faltaDebita: true });
    const escolhida = escolherCobertura(contratos.map((c) => avaliarCobertura(c, alvo)));
    if (!escolhida?.ok) return null;
    try {
      return await repo.transacao((tx) => gravarUso(tx, businessId, escolhida.contratoId, { ...alvo, comandaItemId: null, appointmentId: a.id, motivo: 'falta' }));
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') return null; // já debitada
      throw err;
    }
  },

};

async function validarIds(businessId: string, o: OfertaInput) {
  const ok = await repo.idsValidos(businessId, o.servicos, o.profissionais);
  if (!ok.servicos) throw new ValidationError('Serviço não encontrado');
  if (!ok.profissionais) throw new ValidationError('Profissional não encontrada');
}

export async function criarContrato(tx: Tx, businessId: string, oferta: OfertaRow, clientId: string, origem: 'painel' | 'publico', userId: string | null) {
  const tipo = oferta.tipo as 'clube' | 'pacote';
  const preco = n(oferta.preco);
  return tx.clubeContrato.create({
    data: {
      businessId, ofertaId: oferta.id, clientId, tipo, status: 'aguardando_pagamento', origem,
      preco, valorSessao: valorSessao(preco, sessoesDoPreco({ tipo, totalSessoes: oferta.totalSessoes, sessoesPorCiclo: oferta.sessoesPorCiclo, sessoesReferencia: oferta.sessoesReferencia })),
      sessoesPorCiclo: tipo === 'clube' ? oferta.sessoesPorCiclo : null,
      intervaloMinimoDias: oferta.intervaloMinimoDias,
      totalSessoes: tipo === 'pacote' ? oferta.totalSessoes : null,
      validadeDias: tipo === 'pacote' ? oferta.validadeDias : null,
      createdBy: userId,
    },
  });
}

export { gerarPix, enviarCobranca };

async function gerarCobrancasDoCiclo(businessId: string, hoje: string) {
  const contratos = await repo.clubesARenovar(businessId, somarDias(hoje, DIAS_ANTECEDENCIA_COBRANCA));
  if (contratos.length === 0) return 0;
  const negocio = (await repo.negocioParaPix(businessId))!;
  let criadas = 0;
  for (const c of contratos) {
    if (!c.cicloFim) continue;
    const competencia = somarDias(ymd(c.cicloFim)!, 1);
    try {
      const b = await prisma.clubeCobranca.create({
        data: {
          businessId, contratoId: c.id, competencia: repo.data(competencia), vencimento: repo.data(competencia),
          valor: c.preco, pixCopiaCola: gerarPix(negocio, n(c.preco), c.oferta.nome),
        },
      });
      criadas++;
      await enviarCobranca(businessId, c, b, false);
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') continue; // já gerada
      throw err;
    }
  }
  return criadas;
}

async function marcarAtrasos(businessId: string, hoje: string) {
  // Vencimento = dia seguinte ao fim do ciclo; passa a atraso depois que o dia do vencimento acaba.
  const lista = await repo.marcarAtraso(businessId, somarDias(hoje, -1));
  let marcados = 0;
  for (const c of lista) {
    const r = await prisma.clubeContrato.updateMany({ where: { id: c.id, status: 'ativo' }, data: { status: 'em_atraso' } });
    if (r.count !== 1) continue;
    marcados++;
    await notificationsService.notify(businessId, {
      type: 'clube_atraso', title: 'Mensalidade em atraso',
      description: `${c.client.name} · ${c.oferta.nome}`, link: '/clube/assinantes?status=em_atraso',
    }).catch((err) => logger.warn({ err }, 'Aviso de atraso do clube não criado'));
  }
  return marcados;
}

async function cancelarAdesoesVencidas(businessId: string, agora: Date) {
  const vencidas = await repo.adesoesVencidas(businessId, new Date(agora.getTime() - DIAS_ADESAO_PENDENTE * 24 * 60 * 60 * 1000));
  for (const { id } of vencidas) {
    await repo.transacao(async (tx) => {
      const r = await tx.clubeContrato.updateMany({
        where: { id, status: 'aguardando_pagamento' }, data: { status: 'cancelado', canceladoEm: agora, cancelaEm: agora },
      });
      if (r.count === 1) await tx.clubeCobranca.updateMany({ where: { contratoId: id, status: 'pendente' }, data: { status: 'cancelada' } });
    });
  }
  return vencidas.length;
}
