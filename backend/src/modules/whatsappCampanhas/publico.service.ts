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
import { comRodape, filtrarPublico, resumoParaPublico, type ClienteDoPublico } from './campanhas.rules.js';
import { RODAPE_SAIR, type PublicoDto, type PublicoSchema, type Segmento } from './campanhas.types.js';

export type ClienteElegivel = ClienteDoPublico & { vars: Record<string, string> };

const MAX_ENCAIXES = 2;
const somarUmDia = (ymd: string): string => new Date(Date.parse(`${ymd}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);

export const publicoService = {
  async montar(
    businessId: string,
    f: { segmento: Segmento; professionalId: string | null; serviceId: string | null },
    inicio: Date,
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

    const elegiveis = livres.map((c) => {
      const profId = c.profissionalPreferida?.id;
      const vagas = semana
        ? vagasDaSemana(semana, MAX_ENCAIXES, {
          professionalId: profId && profsAtivas.has(profId) ? profId : undefined,
          duracaoMinima: c.ultimoServico?.duracao ?? 0,
        })
        : [];
      return {
        ...c,
        vars: {
          primeiro_nome: primeiroNome(c.nome),
          profissional: c.profissionalPreferida?.nome ?? '',
          servico: c.ultimoServico?.nome ?? '',
          horarios_livres: vagas.map((v) => formatarEncaixe(v.data, v.inicio, tz).curto).join(', '),
          link,
        },
      };
    });

    return { elegiveis, selecionadas: selecionadas.length, resguardadas: selecionadas.length - livres.length };
  },

  async previa(businessId: string, input: z.infer<typeof PublicoSchema>, agora: Date = new Date()): Promise<PublicoDto> {
    const tz = (await getBusinessScheduleSettings(businessId)).timezone || 'America/Sao_Paulo';
    const amanha10 = zonedToUtc(somarUmDia(todayInTimezone(tz, agora)), '10:00', tz);
    const { elegiveis, selecionadas, resguardadas } = await this.montar(businessId, input, amanha10, agora);
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
