import { crmRepository } from '../crm/crm.repository.js';
import { resumirCliente, diasEntre } from '../crm/crmMetrics.js';
import { todayRepository } from '../dashboard/today.repository.js';
import { proximasVagas } from '../dashboard/today.service.js';
import { filaEnvios, MOTIVO_OPT_OUT, MOTIVO_REVOGADO } from '../whatsappFila/fila.service.js';
import { inboxRecorder } from '../whatsappInbox/inbox.recorder.js';
import { getBusinessScheduleSettings } from '../../services/scheduleSettingsService.js';
import { todayInTimezone } from '../../utils/businessDate.js';
import { formatarEncaixe, montarMensagemRetorno } from './retorno.rules.js';
import { retornoRepository } from './retorno.repository.js';
import type { OportunidadeDto, RetornoDto } from './retorno.types.js';

const LIMITE_DIAS = 120;
const MAX_ENCAIXES = 2;

export const retornoService = {
  async listar(
    businessId: string,
    filtros: { professionalId?: string; somenteComEncaixe?: boolean },
    agora: Date = new Date(),
    incluirLink = true,
  ): Promise<RetornoDto> {
    const tz = (await getBusinessScheduleSettings(businessId)).timezone || 'America/Sao_Paulo';
    const hoje = todayInTimezone(tz, agora);
    const [clientes, visitas, futuros, profs, negocio] = await Promise.all([
      crmRepository.clientes(businessId),
      crmRepository.visitas(businessId),
      todayRepository.clientesComAgendamentoFuturo(businessId, hoje, agora),
      todayRepository.profissionaisAtivas(businessId),
      retornoRepository.negocio(businessId),
    ]);
    const ativas = new Set(profs.map((p) => p.id));
    const base = process.env.FRONTEND_URL ?? '';
    const linkAgendamento = negocio.slug ? `${base}/agendar/${negocio.slug}` : null;

    const candidatas = clientes.flatMap((c) => {
      if (!c.active || futuros.has(c.id)) return [];
      const r = resumirCliente(visitas.get(c.id) ?? [], hoje, null);
      const ultima = r.ultimaVisita;
      if (!ultima || ultima.diasAtras > LIMITE_DIAS) return [];
      if (r.retornoPrevisto.venceuHa === null || r.retornoPrevisto.venceuHa <= 0 || !r.retornoPrevisto.data) return [];
      return [{ c, ultima, atraso: r.retornoPrevisto.venceuHa, ciclo: diasEntre(ultima.date, r.retornoPrevisto.data) }];
    }).filter((x) => !filtros.professionalId || x.ultima.professionalId === filtros.professionalId)
      .sort((a, b) => b.atraso - a.atraso || a.c.name.localeCompare(b.c.name, 'pt-BR'));

    const ids = candidatas.map((x) => x.c.id);
    const ultimosEnvios = ids.length ? await filaEnvios.ultimosPorCliente(businessId, 'retorno', ids) : new Map();

    const itens: OportunidadeDto[] = [];
    for (const { c, ultima, atraso, ciclo } of candidatas) {
      const professionalId = ultima.professionalId ?? '';
      const vagas = await proximasVagas(businessId, agora, MAX_ENCAIXES, {
        professionalId: ativas.has(professionalId) ? professionalId : undefined,
        duracaoMinima: ultima.duracao,
      });
      const encaixes = vagas.map((v) => formatarEncaixe(v.data, v.inicio, tz));
      if (filtros.somenteComEncaixe && encaixes.length === 0) continue;

      let motivoBloqueio: string | null = null;
      if (c.consentimento === 'revogado') motivoBloqueio = MOTIVO_REVOGADO;
      else if (await inboxRecorder.estaEmOptOut(businessId, c.phone)) motivoBloqueio = MOTIVO_OPT_OUT;

      const envio = ultimosEnvios.get(c.id) ?? null;
      itens.push({
        cliente: { id: c.id, nome: c.name, telefone: c.phone },
        atrasoDias: atraso, servico: ultima.servico, profissional: ultima.profissional, professionalId,
        ultimaVisitaHaDias: ultima.diasAtras, cicloDias: ciclo, valorUltimaVisita: ultima.receita, encaixes,
        podeReceber: motivoBloqueio === null, motivoBloqueio,
        // enviadoEm também é preenchido na reserva (enviando/falhou): só o status enviado conta como convite.
        ultimoConviteEm: envio && envio.status === 'enviado' ? envio.enviadoEm : null,
        envio,
        texto: montarMensagemRetorno({
          nome: c.name, negocio: negocio.nome, servico: ultima.servico, profissional: ultima.profissional,
          dias: ultima.diasAtras, encaixes, link: incluirLink ? linkAgendamento : null,
        }),
      });
    }

    const centavos = itens.reduce((s, i) => s + Math.round(i.valorUltimaVisita * 100), 0);
    return {
      resumo: { recuperacaoEstimada: centavos / 100, oportunidades: itens.length },
      linkAgendamento, numeroNegocio: negocio.whatsapp, itens,
    };
  },
};
