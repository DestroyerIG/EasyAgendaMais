import { getBusinessScheduleSettings } from '../../services/scheduleSettingsService.js';
import { AppError, ConflictError, ForbiddenError, NotFoundError } from '../../utils/errors.js';
import { todayInTimezone } from '../../utils/businessDate.js';
import logger from '../../utils/logger.js';
import { crmService } from '../crm/crm.service.js';
import { clientPhotosService } from '../clientPhotos/clientPhotos.service.js';
import type { UploadPhotoInput } from '../clientPhotos/clientPhotos.types.js';
import { comandasService } from '../comandas/comandas.service.js';
import type { ComandaDetailDto, SaveComandaInput } from '../comandas/comandas.types.js';
import { appointmentsService } from '../appointments/appointments.service.js';
import { appointmentsPrismaRepository } from '../appointments/appointments.repository.js';
import { notificationsService } from '../notifications/notifications.service.js';
import { filaEnvios } from '../whatsappFila/fila.service.js';
import { comissoesService } from '../reports/comissoes.service.js';
import { intervaloUtc, type Periodo } from '../reports/periodo.js';
import { bancadaRepository as repo } from './bancada.repository.js';
import {
  escolherProxima, horaNoFuso, minutosAte, motivoParaNaoCancelar, motivoParaNaoReagendar, novoHorarioValido,
  parteDaProfissional, resumoAvaliacoes, textoCancelado, textoReagendado,
} from './bancada.rules.js';
import type { BancadaComandaInput, CancelarInput, Profissional, ReagendarInput } from './bancada.types.js';

// App da profissional (fase 5). Toda função recebe a profissional do login (middleware), nunca do corpo.

const dataBr = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;
const primeiro = (nome: string) => nome.split(' ')[0] || nome;

async function relogio(businessId: string) {
  const { timezone } = await getBusinessScheduleSettings(businessId);
  const agora = new Date();
  return { timezone, hoje: todayInTimezone(timezone, agora), agora: horaNoFuso(agora, timezone) };
}

async function exigirCliente(businessId: string, p: Profissional, clientId: string) {
  if (!(await repo.clienteDaProfissional(businessId, p.id, clientId))) throw new NotFoundError('Cliente');
}

async function exigirAgendamento(businessId: string, p: Profissional, id: string) {
  const a = await repo.agendamentoDela(businessId, p.id, id);
  if (!a) throw new NotFoundError('Agendamento');
  return a;
}

async function exigirComanda(businessId: string, p: Profissional, id: string) {
  const c = await repo.comandaDela(businessId, p.id, id);
  if (!c) throw new NotFoundError('Comanda');
  return c;
}

/** Aviso à cliente pela fila do WhatsApp (respeita o opt-out). Devolve se entrou na fila. */
async function avisarCliente(businessId: string, a: { clientId: string; client: { phone: string } }, body: string, appointmentId: string) {
  try {
    await filaEnvios.enfileirar([{ businessId, clientId: a.clientId, phone: a.client.phone, origin: 'painel_evento', body, appointmentId }]);
    return true;
  } catch (e) {
    logger.warn({ err: e, appointmentId }, 'Aviso à cliente não entrou na fila');
    return false;
  }
}

const comCobranca = async (businessId: string, dto: ComandaDetailDto) => ({ ...dto, profissionalCobra: await repo.profissionalCobra(businessId) });

export const bancadaService = {
  async hoje(businessId: string, p: Profissional) {
    const { hoje, agora } = await relogio(businessId);
    const [agenda, cobra] = await Promise.all([repo.agendaDoDia(businessId, p.id, hoje), repo.profissionalCobra(businessId)]);
    const proxima = escolherProxima(agenda, agora);
    let destaque = null;
    if (proxima) {
      const [perfil, visitas, ultimas] = await Promise.all([
        crmService.profile(businessId, proxima.cliente.id),
        repo.visitasConcluidas(businessId, proxima.cliente.id),
        repo.visitasComEla(businessId, p.id, proxima.cliente.id, 1),
      ]);
      destaque = {
        agendamentoId: proxima.id,
        emMinutos: proxima.status === 'em_atendimento' ? null : minutosAte(proxima.time, agora),
        fase: perfil.fase,
        visitas,
        alergias: perfil.fichaTecnica.allergies,
        ficha: perfil.fichaTecnica.campos
          .map((c) => ({ rotulo: c.label, valor: perfil.fichaTecnica.fields[c.key] ?? '' }))
          .filter((c) => c.valor.trim() !== '')
          .concat(perfil.fichaTecnica.customFields.map((c) => ({ rotulo: c.label, valor: c.value }))),
        ultimoTrabalho: ultimas[0] ?? null,
      };
    }
    return {
      profissional: { id: p.id, nome: p.nome },
      data: hoje,
      profissionalCobra: cobra,
      resumo: {
        total: agenda.length,
        emAndamento: agenda.filter((a) => a.status === 'em_atendimento').length,
        concluidos: agenda.filter((a) => a.status === 'concluido').length,
      },
      destaque,
      agenda,
    };
  },

  async ficha(businessId: string, p: Profissional, clientId: string) {
    await exigirCliente(businessId, p, clientId);
    const [perfil, fotos, visitas, total] = await Promise.all([
      crmService.profile(businessId, clientId),
      clientPhotosService.list(businessId, clientId),
      repo.visitasComEla(businessId, p.id, clientId, 3),
      repo.visitasConcluidas(businessId, clientId),
    ]);
    // O e-mail e a data de nascimento ficam com a recepção.
    const { email: _email, birthDate: _nasc, ...cliente } = perfil.cliente;
    return {
      cliente, fase: perfil.fase, etiquetas: perfil.etiquetas, etiquetasAuto: perfil.etiquetasAuto,
      indicadores: { visitas: total, ticketMedio: perfil.indicadores.ticketMedio, cicloMedio: perfil.indicadores.cicloMedio },
      fichaTecnica: perfil.fichaTecnica,
      fotos: fotos.slice(0, 6),
      visitas,
    };
  },

  async salvarNota(businessId: string, p: Profissional, clientId: string, notas: string | null) {
    await exigirCliente(businessId, p, clientId);
    await repo.salvarNota(businessId, clientId, notas?.trim() ? notas.trim() : null);
    return { notas: notas?.trim() ? notas.trim() : null };
  },

  async enviarFoto(businessId: string, userId: string, p: Profissional, clientId: string, input: UploadPhotoInput) {
    await exigirCliente(businessId, p, clientId);
    if (input.appointmentId) await exigirAgendamento(businessId, p, input.appointmentId);
    return clientPhotosService.upload(businessId, clientId, input, userId);
  },

  /** Abre a comanda e começa o atendimento (a mesma transição do painel). */
  async iniciar(businessId: string, p: Profissional, appointmentId: string) {
    await exigirAgendamento(businessId, p, appointmentId);
    return comCobranca(businessId, await comandasService.open(appointmentId, businessId));
  },

  async horarios(businessId: string, p: Profissional, appointmentId: string, data: string) {
    const a = await exigirAgendamento(businessId, p, appointmentId);
    const { hoje, agora } = await relogio(businessId);
    if (data < hoje) return [];
    const slots = await appointmentsService.getAvailableSlots(businessId, { professionalId: p.id, date: data, serviceId: a.serviceId }) as string[];
    return (Array.isArray(slots) ? slots : []).filter((h) => data > hoje || h > agora);
  },

  async reagendar(businessId: string, p: Profissional, id: string, input: ReagendarInput) {
    const a = await exigirAgendamento(businessId, p, id);
    const { hoje, agora } = await relogio(businessId);
    const bloqueio = motivoParaNaoReagendar(a, hoje, agora) ?? novoHorarioValido(input.data, input.hora, hoje, agora);
    if (bloqueio) throw new ConflictError(bloqueio);
    if (await appointmentsPrismaRepository.hasConflict(businessId, p.id, input.data, `${input.hora}:00`, id)) {
      throw new ConflictError('Este horário já está ocupado na sua agenda');
    }
    if (!(await repo.reagendar(businessId, id, input.data, input.hora))) {
      throw new ConflictError('Este agendamento mudou enquanto você reagendava. Atualize a tela');
    }
    await notificationsService.notify(businessId, {
      type: 'agenda_profissional',
      title: `${primeiro(p.nome)} reagendou ${primeiro(a.client.name)}`,
      description: `${a.service.name} · de ${dataBr(a.date)} ${a.time} para ${dataBr(input.data)} às ${input.hora}`,
      link: `/agenda?data=${input.data}`,
    });
    const negocio = await repo.nomeDoNegocio(businessId);
    const avisoEnviado = input.avisarCliente
      ? await avisarCliente(businessId, a, textoReagendado({ cliente: a.client.name, negocio, servico: a.service.name, data: input.data, hora: input.hora }), id)
      : false;
    return { data: input.data, hora: input.hora, avisoEnviado };
  },

  async cancelar(businessId: string, p: Profissional, id: string, input: CancelarInput) {
    const a = await exigirAgendamento(businessId, p, id);
    const { hoje } = await relogio(businessId);
    const bloqueio = motivoParaNaoCancelar(a, hoje);
    if (bloqueio) throw new ConflictError(bloqueio);
    // Mesma transição do painel: dispara a lista de espera.
    await appointmentsService.updateStatus(id, businessId, 'cancelado', { porProfissional: true });
    await notificationsService.notify(businessId, {
      type: 'agenda_profissional',
      title: `${primeiro(p.nome)} cancelou ${primeiro(a.client.name)}`,
      description: `${a.service.name} · ${dataBr(a.date)} às ${a.time} · ${input.motivo}`,
      link: `/agenda?data=${a.date}`,
    });
    const negocio = await repo.nomeDoNegocio(businessId);
    const avisoEnviado = input.avisarCliente
      ? await avisarCliente(businessId, a, textoCancelado({ cliente: a.client.name, negocio, servico: a.service.name, data: a.date, hora: a.time }), id)
      : false;
    return { cancelado: true, avisoEnviado };
  },

  async comanda(businessId: string, p: Profissional, id: string) {
    await exigirComanda(businessId, p, id);
    return comCobranca(businessId, await comandasService.get(id, businessId));
  },

  /** Sem a chave "a profissional cobra", desconto, gorjeta e forma ficam como a recepção deixou. */
  async salvarComanda(businessId: string, p: Profissional, id: string, input: BancadaComandaInput) {
    await exigirComanda(businessId, p, id);
    const atual = await comandasService.get(id, businessId);
    const cobra = await repo.profissionalCobra(businessId);
    const entrada: SaveComandaInput = {
      extras: input.extras,
      discount: cobra ? input.discount ?? atual.discount : atual.discount,
      tip: cobra ? input.tip ?? atual.tip : atual.tip,
      paymentMethod: cobra ? input.paymentMethod ?? atual.paymentMethod : atual.paymentMethod,
      ...(input.usarCobertura !== undefined ? { usarCobertura: input.usarCobertura } : {}),
    };
    return comCobranca(businessId, await comandasService.save(id, businessId, entrada));
  },

  async enviarParaRecepcao(businessId: string, p: Profissional, id: string, input: BancadaComandaInput) {
    const dto = await bancadaService.salvarComanda(businessId, p, id, input);
    await repo.marcarEnviadaRecepcao(id);
    await notificationsService.notify(businessId, {
      type: 'comanda_pronta',
      title: `Comanda de ${primeiro(dto.client.name)} pronta para cobrar`,
      description: `${primeiro(p.nome)} · Comanda #${dto.number}`,
      link: `/caixa?comanda=${dto.appointment.id}`,
    });
    return dto;
  },

  async fecharComanda(businessId: string, userId: string, p: Profissional, id: string, input: BancadaComandaInput) {
    await exigirComanda(businessId, p, id);
    if (!(await repo.profissionalCobra(businessId))) {
      throw new ForbiddenError('Quem cobra é a recepção. Use "Enviar para a recepção"');
    }
    const atual = await comandasService.get(id, businessId);
    try {
      return comCobranca(businessId, await comandasService.close(id, businessId, userId, {
        extras: input.extras, discount: input.discount ?? atual.discount, tip: input.tip ?? atual.tip,
        paymentMethod: input.paymentMethod ?? null,
        ...(input.usarCobertura !== undefined ? { usarCobertura: input.usarCobertura } : {}),
      }));
    } catch (e) {
      // A profissional não abre nem reabre o caixa: quem cuida da gaveta é a recepção.
      if (e instanceof AppError && (e.code === 'CASH_CLOSED' || e.code === 'CASH_ALREADY_CLOSED')) {
        throw new AppError(
          e.code === 'CASH_CLOSED' ? 'O caixa de hoje ainda não foi aberto. Peça para a recepção abrir.' : 'O caixa de hoje já foi fechado. Peça para a recepção reabrir.',
          409, e.code,
        );
      }
      throw e;
    }
  },

  async numeros(businessId: string, p: Profissional, periodo: Periodo, ctx: { plan?: unknown; subscriptionStatus?: unknown }) {
    const { timezone } = await getBusinessScheduleSettings(businessId);
    const intervalo = intervaloUtc(periodo, timezone);
    const [apuracao, comandas, notas] = await Promise.all([
      comissoesService.apuracao(businessId, periodo, ctx),
      repo.extrato(businessId, p.id, intervalo),
      repo.avaliacoes(businessId, p.id, intervalo),
    ]);
    const minha = apuracao.itens.find((i) => i.professional.id === p.id);
    const extrato = comandas.map((k) => ({
      id: k.id, numero: k.numero, fechadaEm: k.fechadaEm, hora: k.hora, cliente: k.cliente, pago: k.pago,
      itens: k.itens.map(({ commissionAmount: _c, ...i }) => i),
      parte: parteDaProfissional(k.itens, k.gorjeta),
    }));
    return {
      periodo,
      modelo: apuracao.modelo,
      // Nada da casa (faturamento total, retenção): só a parte dela.
      resumo: minha ? {
        atendimentos: minha.atendimentos, faturamento: minha.faturamento,
        comissaoServico: minha.comissaoServico, comissaoProduto: minha.comissaoProduto, gorjetas: minha.gorjetas,
        adiantamentos: minha.adiantamentos, aPagar: minha.aPagar, status: minha.status,
        repasse: minha.repasse ? { pagoEm: minha.repasse.pagoEm, forma: minha.repasse.forma } : null,
      } : null,
      extrato,
      avaliacoes: resumoAvaliacoes(notas.map((x) => ({ rating: x.nota }))),
    };
  },

  async avaliacoes(businessId: string, p: Profissional, periodo: Periodo) {
    const { timezone } = await getBusinessScheduleSettings(businessId);
    const lista = await repo.avaliacoes(businessId, p.id, intervaloUtc(periodo, timezone));
    return { ...resumoAvaliacoes(lista.map((x) => ({ rating: x.nota }))), itens: lista };
  },
};

