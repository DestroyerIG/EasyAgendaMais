import { createHash } from 'node:crypto';
import logger from '../../utils/logger.js';
import { getBusinessScheduleSettings } from '../../services/scheduleSettingsService.js';
import { todayInTimezone, zonedToUtc } from '../../utils/businessDate.js';
import { filaEnvios } from '../whatsappFila/fila.service.js';
import { PRIORIDADE_ALTA, PRIORIDADE_NORMAL } from '../whatsappFila/fila.rules.js';
import { retornoService } from '../whatsappRetorno/retorno.service.js';
import { automacoes } from './automacoes.service.js';
import { aniversarianteEm, renderizarTexto } from './automacoes.rules.js';
import type { Regra } from './automacoes.types.js';
import { rotinasRepository as repo } from './rotinas.repository.js';
import { envioAutomaticoLiberado } from '../conta/envioAutomatico.js';
import type { Origem } from '../whatsappInbox/inbox.types.js';

const DIA_MS = 86_400_000;
const HORA_RADAR = '09:00';
const HORA_ANIVERSARIO = '08:00';
const LIMITE_RADAR = 30;
const CARENCIA_RETORNO_DIAS = 30;

const primeiroNome = (nome: string) => nome.trim().split(/\s+/)[0] ?? '';

function somarDias(ymd: string, n: number): string {
  const d = new Date(`${ymd}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** "HH:MM" no fuso do negócio. */
function horaLocal(agora: Date, tz: string): string {
  return new Intl.DateTimeFormat('en-GB', { timeZone: tz, hourCycle: 'h23', hour: '2-digit', minute: '2-digit' }).format(agora);
}

async function fusoDe(businessId: string): Promise<string> {
  return (await getBusinessScheduleSettings(businessId)).timezone || 'America/Sao_Paulo';
}

const linkPublico = (slug: string | null) => {
  const base = process.env.FRONTEND_URL;
  return slug && base ? `${base}/agendar/${slug}` : null;
};

export const linkMapa = (endereco: string | null) =>
  endereco ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(endereco)}` : null;

/** UUID determinístico por negócio e dia: marca o lote do radar para não rodar duas vezes no dia. */
function loteDoRadar(businessId: string, hoje: string): string {
  const h = createHash('sha1').update(`radar:${businessId}:${hoje}`).digest('hex');
  const variante = ((parseInt(h[16], 16) & 0x3) | 0x8).toString(16);
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-5${h.slice(13, 16)}-${variante}${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

/**
 * Trava diária em memória ("regra:negócio" -> dia local já processado), marcada só depois de uma rodada
 * completa sem erro. Reinício do servidor volta a rodar uma vez; lote, carência e envio do ano evitam duplicar.
 */
const diaProcessado = new Map<string, string>();
const jaRodouHoje = (regra: Regra, businessId: string, hoje: string) => diaProcessado.get(`${regra}:${businessId}`) === hoje;
const marcarRodouHoje = (regra: Regra, businessId: string, hoje: string) => { diaProcessado.set(`${regra}:${businessId}`, hoje); };

/** Só para testes. */
export function limparTravasDiarias(): void {
  diaProcessado.clear();
}

/**
 * Roda `fn` em cada negócio com a regra ligada; erro de um negócio não para os outros.
 * Contingência: só roda se a origem que a rotina grava está liberada para a conta (`podeEnviarOrigem`).
 */
async function porNegocio(regra: Regra, origem: Origem, fn: (businessId: string) => Promise<number>): Promise<number> {
  let total = 0;
  for (const businessId of await repo.negociosComRegraAtiva(regra)) {
    try {
      if (!(await envioAutomaticoLiberado(businessId, origem))) continue;
      total += await fn(businessId);
    } catch (err) {
      logger.warn({ err, businessId, regra }, 'automacoes: rotina falhou no negócio');
    }
  }
  return total;
}

export const automacoesRotinas = {
  async confirmacoes(agora: Date = new Date()): Promise<number> {
    return porNegocio('confirmacao', 'confirmacao', async (businessId) => {
      const regra = await automacoes.obter(businessId, 'confirmacao');
      if (!regra.ativa) return 0;
      const tz = await fusoDe(businessId);
      if (horaLocal(agora, tz) < regra.config.hora) return 0;
      const amanha = somarDias(todayInTimezone(tz, agora), 1);
      const ags = (await repo.agendamentosDoDia(businessId, amanha, 'confirmacao'))
        .filter((a) => zonedToUtc(amanha, a.hora, tz).getTime() - a.createdAt.getTime() > DIA_MS);
      if (ags.length === 0) return 0;
      const negocio = await repo.negocio(businessId);

      let gravadas = 0;
      for (const a of ags) {
        try {
          const texto = renderizarTexto(regra.texto, {
            nome: a.nome, primeiro_nome: primeiroNome(a.nome), servico: a.servico, horario: a.hora,
            data: 'amanhã', profissional: a.profissional, negocio: negocio.nome,
          });
          const [envio] = await filaEnvios.enfileirar([{
            businessId, clientId: a.clientId, phone: a.phone, body: texto, origin: 'confirmacao',
            agendadoPara: agora, prioridade: PRIORIDADE_ALTA, appointmentId: a.id,
          }]);
          // Voltou o item de outro agendamento da mesma cliente: tenta de novo depois que ele sair.
          if (envio?.appointmentId !== a.id) continue;
          if (await repo.marcarConfirmacaoEnviada(businessId, a.id, agora)) gravadas += 1;
        } catch (err) {
          logger.warn({ err, businessId, appointmentId: a.id }, 'automacoes: confirmação não enfileirada');
        }
      }
      return gravadas;
    });
  },

  async radarRetorno(agora: Date = new Date()): Promise<number> {
    return porNegocio('retorno', 'retorno', async (businessId) => {
      const regra = await automacoes.obter(businessId, 'retorno');
      if (!regra.ativa) return 0;
      const tz = await fusoDe(businessId);
      if (horaLocal(agora, tz) < HORA_RADAR) return 0;
      const hoje = todayInTimezone(tz, agora);
      if (jaRodouHoje('retorno', businessId, hoje)) return 0;
      const lote = loteDoRadar(businessId, hoje);
      if (await repo.existeLote(businessId, lote)) { marcarRodouHoje('retorno', businessId, hoje); return 0; }

      const porDias = regra.config.modo === 'dias';
      const lista = await retornoService.listarParaRotina(businessId, agora, porDias ? { minDiasSemVir: regra.config.dias } : {});
      const carencia = agora.getTime() - CARENCIA_RETORNO_DIAS * DIA_MS;
      const escolhidas = lista.itens
        .filter((i) => i.podeReceber)
        .filter((i) => !porDias || i.ultimaVisitaHaDias >= regra.config.dias)
        .filter((i) => !i.ultimoConviteEm || new Date(i.ultimoConviteEm).getTime() < carencia)
        .filter((i) => i.envio?.status !== 'na_fila' && i.envio?.status !== 'enviando')
        .slice(0, LIMITE_RADAR);
      if (escolhidas.length === 0) { marcarRodouHoje('retorno', businessId, hoje); return 0; }

      const envios = await filaEnvios.enfileirar(escolhidas.map((i) => ({
        businessId, clientId: i.cliente.id, phone: i.cliente.telefone, origin: 'retorno' as const,
        prioridade: PRIORIDADE_NORMAL, loteId: lote, agendadoPara: agora,
        body: renderizarTexto(regra.texto, {
          primeiro_nome: primeiroNome(i.cliente.nome), dias: String(i.ultimaVisitaHaDias), ultimo_servico: i.servico,
          profissional: i.profissional, horarios_livres: i.encaixes.map((e) => e.longo).join(' ou '),
          link_agenda: lista.linkAgendamento, negocio: lista.negocioNome,
        }),
      })));
      marcarRodouHoje('retorno', businessId, hoje);
      return envios.length;
    });
  },

  async aniversarios(agora: Date = new Date()): Promise<number> {
    return porNegocio('aniversario', 'aniversario', async (businessId) => {
      const regra = await automacoes.obter(businessId, 'aniversario');
      if (!regra.ativa) return 0;
      const tz = await fusoDe(businessId);
      if (horaLocal(agora, tz) < HORA_ANIVERSARIO) return 0;
      const hoje = todayInTimezone(tz, agora);
      if (jaRodouHoje('aniversario', businessId, hoje)) return 0;
      const [ano, mes, dia] = hoje.split('-').map(Number);
      const bissexto = (ano % 4 === 0 && ano % 100 !== 0) || ano % 400 === 0;
      const doDia = (await repo.aniversariantesDoDia(businessId, mes, dia, mes === 2 && dia === 28 && !bissexto))
        .filter((c) => aniversarianteEm(c.birthDate, hoje));
      if (doDia.length === 0) { marcarRodouHoje('aniversario', businessId, hoje); return 0; }
      const inicioDoAno = zonedToUtc(`${hoje.slice(0, 4)}-01-01`, '00:00', tz);
      const jaReceberam = await repo.clientesComEnvioDesde(businessId, 'aniversario', inicioDoAno, doDia.map((c) => c.id));
      const novas = doDia.filter((c) => !jaReceberam.has(c.id));
      if (novas.length === 0) { marcarRodouHoje('aniversario', businessId, hoje); return 0; }

      const negocio = await repo.negocio(businessId);
      const link = linkPublico(negocio.slug);
      const envios = await filaEnvios.enfileirar(novas.map((c) => ({
        businessId, clientId: c.id, phone: c.phone, origin: 'aniversario' as const,
        prioridade: PRIORIDADE_NORMAL, agendadoPara: agora,
        body: renderizarTexto(regra.texto, {
          primeiro_nome: primeiroNome(c.nome), presente: regra.config.presente, link, negocio: negocio.nome,
        }),
      })));
      marcarRodouHoje('aniversario', businessId, hoje);
      return envios.length;
    });
  },

  /**
   * Lembrete no modo véspera: agendamentos de amanhã, a partir da hora configurada, pela fila
   * (cadência, janela, SAIR e consentimento ficam com ela). reminderSent marca o que já entrou na fila.
   */
  async lembretesVespera(agora: Date = new Date()): Promise<number> {
    return porNegocio('lembrete', 'lembrete', async (businessId) => {
      const regra = await automacoes.obter(businessId, 'lembrete');
      if (!regra.ativa || regra.config.modo !== 'vespera') return 0;
      const tz = await fusoDe(businessId);
      if (horaLocal(agora, tz) < regra.config.hora) return 0;
      const amanha = somarDias(todayInTimezone(tz, agora), 1);
      const ags = await repo.agendamentosDoDia(businessId, amanha, 'lembrete');
      if (ags.length === 0) return 0;
      const negocio = await repo.negocio(businessId);

      let enfileirados = 0;
      for (const a of ags) {
        try {
          const texto = renderizarTexto(regra.texto, {
            nome: a.nome, nome_cliente: a.nome, primeiro_nome: primeiroNome(a.nome), servico: a.servico,
            profissional: a.profissional, horario: a.hora, data: 'amanhã',
            endereco: negocio.endereco, link_mapa: linkMapa(negocio.endereco),
          });
          const [envio] = await filaEnvios.enfileirar([{
            businessId, clientId: a.clientId, phone: a.phone, body: texto, origin: 'lembrete',
            agendadoPara: agora, prioridade: PRIORIDADE_ALTA, appointmentId: a.id,
          }]);
          // Voltou o item de outro agendamento da mesma cliente: tenta de novo depois que ele sair.
          if (envio?.appointmentId !== a.id) continue;
          if (await repo.marcarLembreteEnviado(businessId, a.id)) enfileirados += 1;
        } catch (err) {
          logger.warn({ err, businessId, appointmentId: a.id }, 'automacoes: lembrete na véspera não enfileirado');
        }
      }
      return enfileirados;
    });
  },
};
