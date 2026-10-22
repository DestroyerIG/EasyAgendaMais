import { randomUUID } from 'node:crypto';
import { crmRepository } from '../crm/crm.repository.js';
import { resumirCliente, diasEntre } from '../crm/crmMetrics.js';
import { todayRepository } from '../dashboard/today.repository.js';
import { carregarAgendaSemana, vagasDaSemana } from '../dashboard/today.service.js';
import type { EnvioDto } from '../whatsappFila/fila.service.js';
import { filaEnvios, MOTIVO_OPT_OUT, MOTIVO_REVOGADO } from '../whatsappFila/fila.service.js';
import { whatsappService } from '../whatsapp/whatsapp.service.js';
import { inboxRecorder } from '../whatsappInbox/inbox.recorder.js';
import { avatares } from '../whatsappAvatar/avatar.service.js';
import { canonicalizePhone } from '../../services/whatsapp/utils/phoneUtils.js';
import { getBusinessScheduleSettings } from '../../services/scheduleSettingsService.js';
import { sendWhatsAppMessage } from '../../services/whatsapp/whatsappMessageService.js';
import { AppError, ConflictError, ValidationError } from '../../utils/errors.js';
import { todayInTimezone } from '../../utils/businessDate.js';
import { formatarEncaixe, montarMensagemRetorno } from './retorno.rules.js';
import { retornoRepository } from './retorno.repository.js';
import type { EnviarRetornoInput, OportunidadeDto, RetornoDto, TestarRetornoInput } from './retorno.types.js';

const LIMITE_DIAS = 120;
const MAX_ENCAIXES = 2;

const horaNoFuso = (d: Date, tz: string) =>
  new Intl.DateTimeFormat('pt-BR', { timeZone: tz, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(d);

async function montarLista(
  businessId: string,
  filtros: { professionalId?: string; somenteComEncaixe?: boolean; minDiasSemVir?: number },
  agora: Date,
  incluirLink: boolean,
  comFotos: boolean,
): Promise<{ dto: RetornoDto; negocioNome: string }> {
  const minDias = filtros.minDiasSemVir;
  const tz = (await getBusinessScheduleSettings(businessId)).timezone || 'America/Sao_Paulo';
  const hoje = todayInTimezone(tz, agora);
  const [clientes, visitas, futuros, semana, negocio] = await Promise.all([
    crmRepository.clientes(businessId),
    crmRepository.visitas(businessId),
    todayRepository.clientesComAgendamentoFuturo(businessId, hoje, agora),
    carregarAgendaSemana(businessId, agora),
    retornoRepository.negocio(businessId),
  ]);
  const ativas = new Set(semana.profs.map((p) => p.id));
  const base = process.env.FRONTEND_URL;
  // Sem FRONTEND_URL o link sairia relativo e quebrado no WhatsApp: melhor convite sem link.
  const linkAgendamento = negocio.slug && base ? `${base}/agendar/${negocio.slug}` : null;

  const candidatas = clientes.flatMap((c) => {
    if (!c.active || futuros.has(c.id)) return [];
    const r = resumirCliente(visitas.get(c.id) ?? [], hoje, null);
    const ultima = r.ultimaVisita;
    if (!ultima) return [];
    const ciclo = r.retornoPrevisto.data ? diasEntre(ultima.date, r.retornoPrevisto.data) : null;
    // Radar personalizado: quem está há pelo menos N dias sem vir, em vez de quem venceu o ciclo.
    if (minDias !== undefined) {
      if (ultima.diasAtras < minDias || ultima.diasAtras > Math.max(LIMITE_DIAS, minDias + 30)) return [];
      return [{ c, ultima, atraso: ultima.diasAtras - minDias, ciclo: ciclo ?? minDias }];
    }
    if (ultima.diasAtras > LIMITE_DIAS) return [];
    if (r.retornoPrevisto.venceuHa === null || r.retornoPrevisto.venceuHa <= 0 || !r.retornoPrevisto.data) return [];
    return [{ c, ultima, atraso: r.retornoPrevisto.venceuHa, ciclo: diasEntre(ultima.date, r.retornoPrevisto.data) }];
  }).filter((x) => !filtros.professionalId || x.ultima.professionalId === filtros.professionalId)
    .sort((a, b) => b.atraso - a.atraso || a.c.name.localeCompare(b.c.name, 'pt-BR'));

  const ids = candidatas.map((x) => x.c.id);
  const [ultimosEnvios, ultimosEnviados] = ids.length
    ? await Promise.all([
      filaEnvios.ultimosPorCliente(businessId, 'retorno', ids),
      filaEnvios.ultimosEnviadosPorCliente(businessId, 'retorno', ids),
    ])
    : [new Map<string, EnvioDto>(), new Map<string, Date>()];

  const previsoes = [...ultimosEnvios.values()].some((e) => e.status === 'na_fila')
    ? await filaEnvios.previsoes(businessId, tz, agora)
    : new Map<string, Date>();

  const itens: OportunidadeDto[] = [];
  for (const { c, ultima, atraso, ciclo } of candidatas) {
    const professionalId = ultima.professionalId ?? '';
    const vagas = vagasDaSemana(semana, MAX_ENCAIXES, {
      professionalId: ativas.has(professionalId) ? professionalId : undefined,
      duracaoMinima: ultima.duracao,
    });
    const encaixes = vagas.map((v) => formatarEncaixe(v.data, v.inicio, tz));
    if (filtros.somenteComEncaixe && encaixes.length === 0) continue;

    let motivoBloqueio: string | null = null;
    if (c.consentimento === 'revogado') motivoBloqueio = MOTIVO_REVOGADO;
    else if (await inboxRecorder.estaEmOptOut(businessId, c.phone)) motivoBloqueio = MOTIVO_OPT_OUT;

    const bruto = ultimosEnvios.get(c.id) ?? null;
    const previsto = bruto?.status === 'na_fila' ? previsoes.get(bruto.id) : undefined;
    const envio = bruto ? { ...bruto, previstoHora: previsto ? horaNoFuso(previsto, tz) : null } : null;
    itens.push({
      cliente: { id: c.id, nome: c.name, telefone: c.phone, avatarUrl: null },
      atrasoDias: atraso, servico: ultima.servico, profissional: ultima.profissional, professionalId,
      ultimaVisitaHaDias: ultima.diasAtras, cicloDias: ciclo, valorUltimaVisita: ultima.receita, encaixes,
      podeReceber: motivoBloqueio === null, motivoBloqueio,
      ultimoConviteEm: ultimosEnviados.get(c.id)?.toISOString() ?? null,
      envio,
      texto: montarMensagemRetorno({
        nome: c.name, negocio: negocio.nome, servico: ultima.servico, profissional: ultima.profissional,
        dias: ultima.diasAtras, encaixes, link: incluirLink ? linkAgendamento : null,
      }),
    });
  }

  if (comFotos && itens.length) {
    const fotos = await avatares.urlsPara(businessId, itens.map((i) => i.cliente.telefone));
    for (const i of itens) i.cliente.avatarUrl = fotos.get(canonicalizePhone(i.cliente.telefone)) ?? null;
  }

  const centavos = itens.reduce((s, i) => s + Math.round(i.valorUltimaVisita * 100), 0);
  return {
    dto: {
      resumo: { recuperacaoEstimada: centavos / 100, oportunidades: itens.length },
      linkAgendamento, numeroNegocio: negocio.whatsapp, itens,
    },
    negocioNome: negocio.nome,
  };
}

export const retornoService = {
  async listar(
    businessId: string,
    filtros: { professionalId?: string; somenteComEncaixe?: boolean },
    agora: Date = new Date(),
    incluirLink = true,
  ): Promise<RetornoDto> {
    return (await montarLista(businessId, filtros, agora, incluirLink, true)).dto;
  },

  /**
   * Mesma lista da tela (sem fotos), com o nome do negócio, para o radar automático.
   * `minDiasSemVir` troca o critério do ciclo vencido por "pelo menos N dias sem vir" (modo personalizado).
   */
  async listarParaRotina(
    businessId: string,
    agora: Date = new Date(),
    opcoes: { minDiasSemVir?: number } = {},
  ): Promise<RetornoDto & { negocioNome: string }> {
    const { dto, negocioNome } = await montarLista(businessId, { minDiasSemVir: opcoes.minDiasSemVir }, agora, true, false);
    return { ...dto, negocioNome };
  },

  async enviar(
    businessId: string,
    input: EnviarRetornoInput,
    agora: Date = new Date(),
  ): Promise<{ envios: EnvioDto[]; recusados: Array<{ clientId: string; motivo: string }> }> {
    const lista = await this.listar(businessId, {}, agora, input.incluirLink);
    const porCliente = new Map(lista.itens.map((i) => [i.cliente.id, i]));
    const recusados: Array<{ clientId: string; motivo: string }> = [];
    const aceitos: Array<{ clientId: string; phone: string; body: string }> = [];
    const vistos = new Set<string>();
    for (const { clientId, texto } of input.itens) {
      if (vistos.has(clientId)) continue;
      vistos.add(clientId);
      const item = porCliente.get(clientId);
      if (!item) { recusados.push({ clientId, motivo: 'Cliente fora da lista' }); continue; }
      if (!item.podeReceber) { recusados.push({ clientId, motivo: item.motivoBloqueio ?? 'Não pode receber' }); continue; }
      aceitos.push({ clientId, phone: item.cliente.telefone, body: texto ?? item.texto });
    }
    if (aceitos.length === 0) return { envios: [], recusados };
    const loteId = aceitos.length > 1 ? randomUUID() : null;
    const envios = await filaEnvios.enfileirar(aceitos.map((a) => ({
      businessId, ...a, origin: 'retorno' as const, loteId, ...(aceitos.length === 1 ? { agendadoPara: agora } : {}),
    })));
    return { envios, recusados };
  },

  async testar(businessId: string, input: TestarRetornoInput, agora: Date = new Date()): Promise<{ enviado: true; para: string }> {
    const conexao = await whatsappService.getStatus(businessId);
    if (conexao?.status !== 'connected') throw new ConflictError('WhatsApp desconectado. Reconecte na aba Conexão.');
    const lista = await this.listar(businessId, {}, agora, input.incluirLink);
    if (!lista.numeroNegocio) throw new ValidationError('Cadastre o número do negócio');
    const item = lista.itens.find((i) => i.cliente.id === input.clientId);
    if (!item) throw new ValidationError('Cliente fora da lista');
    const ok = await sendWhatsAppMessage(lista.numeroNegocio, item.texto, { businessId, origin: 'sistema' }).catch(() => false);
    if (!ok) throw new AppError('Não foi possível enviar o teste. Tente de novo.', 502);
    return { enviado: true, para: lista.numeroNegocio };
  },
};
