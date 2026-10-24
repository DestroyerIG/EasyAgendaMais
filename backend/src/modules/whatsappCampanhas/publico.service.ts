import type { z } from 'zod';
import { crmRepository } from '../crm/crm.repository.js';
import { carregarAgendaSemana, vagasDaSemana } from '../dashboard/today.service.js';
import { inboxRecorder } from '../whatsappInbox/inbox.recorder.js';
import { renderizarTexto } from '../whatsappAutomacoes/automacoes.rules.js';
import { formatarEncaixe, primeiroNome } from '../whatsappRetorno/retorno.rules.js';
import { retornoRepository } from '../whatsappRetorno/retorno.repository.js';
import { canonicalizePhone } from '../../services/whatsapp/utils/phoneUtils.js';
import { getBusinessScheduleSettings } from '../../services/scheduleSettingsService.js';
import { todayInTimezone, zonedToUtc } from '../../utils/businessDate.js';
import { LIMITE_POR_HORA, previsaoDeEnvio } from '../whatsappFila/fila.rules.js';
import { comRodape, filtrarPublico, resumoParaPublico, type ClienteDoPublico } from './campanhas.rules.js';
import { RODAPE_SAIR, type PublicoDto, type PublicoSchema, type Segmento } from './campanhas.types.js';

export type ClienteElegivel = ClienteDoPublico & { vars: Record<string, string> };

const MAX_ENCAIXES = 2;
/** Folga entre a chegada prevista da mensagem e o primeiro horário oferecido. */
const FOLGA_HORARIOS_MS = 2 * 3_600_000;
const MEIA_HORA_MS = 30 * 60_000;
/** Arredonda para cima até o próximo :00 ou :30 (os horários oferecidos ficam "redondos"). */
const arredondarMeiaHora = (ms: number) => Math.ceil(ms / MEIA_HORA_MS) * MEIA_HORA_MS;
const somarUmDia = (ymd: string): string => new Date(Date.parse(`${ymd}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);

export const publicoService = {
  async montar(
    businessId: string,
    f: { segmento: Segmento; professionalId: string | null; serviceId: string | null },
    inicio: Date,
    /** Mensagens por hora da campanha: define quando cada cliente recebe e, daí, os horários oferecidos. */
    cadencia: number,
    agora: Date = new Date(),
  ): Promise<{ elegiveis: ClienteElegivel[]; selecionadas: number; resguardadas: number }> {
    const tz = (await getBusinessScheduleSettings(businessId)).timezone || 'America/Sao_Paulo';
    const hoje = todayInTimezone(tz, agora);
    // Se não der para ler quem pediu para sair, falha: melhor erro do que mandar para quem saiu.
    const [clientes, visitas, optOuts, negocio] = await Promise.all([
      crmRepository.clientes(businessId),
      crmRepository.visitas(businessId),
      inboxRecorder.telefonesEmOptOut(businessId),
      retornoRepository.negocio(businessId),
    ]);

    const ativas = clientes.filter((c) => c.active);
    const consentimento = new Map(ativas.map((c) => [c.id, c.consentimento]));
    const base: ClienteDoPublico[] = ativas.map((c) => ({
      id: c.id, nome: c.name, telefone: c.phone, birthDate: c.birthDate,
      ...resumoParaPublico(visitas.get(c.id) ?? [], hoje),
    }));
    const selecionadas = filtrarPublico(base, f, hoje);

    const resguardada = (c: ClienteDoPublico) => {
      const chave = canonicalizePhone(c.telefone);
      return consentimento.get(c.id) === 'revogado' || !chave || optOuts.has(chave);
    };
    const livres = selecionadas.filter((c) => !resguardada(c));

    const semana = livres.length ? await carregarAgendaSemana(businessId, inicio) : null;
    const profsAtivas = new Set(semana?.profs.map((p) => p.id) ?? []);
    const urlBase = process.env.FRONTEND_URL;
    // Sem FRONTEND_URL o link sairia relativo e quebrado: a linha com {link} some.
    const link = negocio.slug && urlBase ? `${urlBase}/agendar/${negocio.slug}` : '';

    // A ordem de `elegiveis` é a ordem de criação na fila e, com a mesma prioridade e o mesmo início,
    // a ordem de saída. A previsão usa o intervalo mais lento da cadência (× 1,25), arredondado para cima
    // ao minuto do tick da fila, porque a fila na prática anda mais devagar que a cadência nominal. Os
    // horários da cliente `idx` começam 2 h depois dessa previsão, para não oferecer um horário que já passou.
    const intervaloS = Math.ceil((3600 / (cadencia > 0 ? cadencia : LIMITE_POR_HORA)) * 1.25 / 60) * 60;
    const elegiveis = livres.map((c, idx) => {
      const profId = c.profissionalPreferida?.id;
      const chegada = previsaoDeEnvio({ agora: inicio, tz, posicao: idx, ultimo: null, intervaloS });
      const vagas = semana
        ? vagasDaSemana(semana, MAX_ENCAIXES, {
          professionalId: profId && profsAtivas.has(profId) ? profId : undefined,
          duracaoMinima: c.ultimoServico?.duracao ?? 0,
          aPartirDe: new Date(arredondarMeiaHora(chegada.getTime() + FOLGA_HORARIOS_MS)),
        })
        : [];
      return {
        ...c,
        vars: {
          primeiro_nome: primeiroNome(c.nome),
          profissional: c.profissionalPreferida?.nome ?? '',
          servico: c.ultimoServico?.nome ?? '',
          horarios_livres: vagas.map((v) => formatarEncaixe(v.data, v.inicio, tz).curto).join(' ou '),
          link,
        },
      };
    });

    return { elegiveis, selecionadas: selecionadas.length, resguardadas: selecionadas.length - livres.length };
  },

  async previa(
    businessId: string, input: z.infer<typeof PublicoSchema> & { cadencia?: number }, agora: Date = new Date(),
  ): Promise<PublicoDto> {
    const tz = (await getBusinessScheduleSettings(businessId)).timezone || 'America/Sao_Paulo';
    const amanha10 = zonedToUtc(somarUmDia(todayInTimezone(tz, agora)), '10:00', tz);
    // O PublicoSchema não tem cadência: a prévia usa a padrão (a amostra é a primeira da fila, sai no início).
    const cadencia = input.cadencia ?? LIMITE_POR_HORA;
    const { elegiveis, selecionadas, resguardadas } = await this.montar(
      businessId, { segmento: input.segmento, professionalId: input.professionalId, serviceId: input.serviceId },
      amanha10, cadencia, agora,
    );
    const primeira = elegiveis[0];
    const corpo = primeira ? renderizarTexto(input.texto, primeira.vars).trim() : '';
    return {
      selecionadas,
      receberao: elegiveis.length,
      resguardadas,
      amostra: primeira
        ? { nome: primeira.nome, telefone: primeira.telefone, texto: corpo ? comRodape(corpo) : RODAPE_SAIR }
        : null,
    };
  },
};
