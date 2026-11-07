/**
 * whatsappTextos.ts — Catálogo dos textos editáveis do robô e a leitura/gravação deles.
 * Chaves com coluna própria ficam na coluna; as demais, em `whatsapp_bot_config.textos_extras`.
 * Para incluir um texto novo: acrescentar a entrada em CATALOGO_TEXTOS e o padrão em DEFAULT_BOT_CONFIG.
 */

import { prisma } from '../../config/prisma.js';
import { ValidationError } from '../../utils/errors.js';
import { vocabularioDe } from '../../config/vocabulario.js';
import { DEFAULT_BOT_CONFIG, PADROES_ANTIGOS, type BotConfig } from './whatsappConstants.js';
import { mensagensPadrao } from './whatsappVocabulario.js';

export interface TextoDef {
  chave: keyof BotConfig & string;
  /** Opção do menu a que o texto pertence; `geral` quando não pertence a nenhuma. */
  caminho: 'geral' | 'schedule' | 'view_services' | 'manage' | 'promotions' | 'instagram' | 'attendant' | 'cancel' | 'reschedule' | 'end_session';
  rotulo: string;
  /** Variáveis (sem chaves) que funcionam neste texto. */
  variaveis: string[];
  /** Variáveis cuja remoção merece aviso na tela. */
  importantes?: string[];
  permiteVazio?: boolean;
  max?: number;
}

export type TextoDto = TextoDef & { valor: string; padrao: string; personalizado: boolean };

const MAX_PADRAO = 2000;
const NEGOCIO = ['nome_negocio'];
const AGENDAMENTO = ['nome_negocio', 'servico', 'profissional', 'data', 'horario', 'valor', 'nome_cliente'];

/** Na ordem da conversa. */
export const CATALOGO_TEXTOS: TextoDef[] = [
  { chave: 'out_of_hours_message', caminho: 'geral', rotulo: 'Fora do horário de atendimento', variaveis: ['horario_atendimento'] },
  { chave: 'paused_message', caminho: 'geral', rotulo: 'Agenda pausada', variaveis: ['nome_negocio'] },
  { chave: 'welcome_header', caminho: 'geral', rotulo: 'Boas-vindas', variaveis: ['nome_negocio'] },
  { chave: 'today_hours_message', caminho: 'geral', rotulo: 'Horário de hoje', variaveis: ['hora_fechamento'] },
  { chave: 'ask_name_message', caminho: 'geral', rotulo: 'Pergunta do nome', variaveis: NEGOCIO },
  { chave: 'name_validation_message', caminho: 'geral', rotulo: 'Nome inválido', variaveis: [] },
  { chave: 'invalid_option_message', caminho: 'geral', rotulo: 'Opção inválida', variaveis: [] },
  { chave: 'invalid_list_choice_message', caminho: 'geral', rotulo: 'Número inválido em uma lista', variaveis: [] },
  { chave: 'services_list_title', caminho: 'view_services', rotulo: 'Título da lista de serviços', variaveis: [] },
  { chave: 'no_services_message', caminho: 'view_services', rotulo: 'Sem serviços cadastrados', variaveis: [] },
  { chave: 'no_services_available_message', caminho: 'schedule', rotulo: 'Sem serviços para agendar', variaveis: [] },
  { chave: 'name_greeting_message', caminho: 'schedule', rotulo: 'Saudação depois do nome', variaveis: ['nome_cliente'] },
  { chave: 'choose_service_title', caminho: 'schedule', rotulo: 'Título da escolha de serviços', variaveis: [] },
  { chave: 'choose_professional_title', caminho: 'schedule', rotulo: 'Título da escolha de profissionais', variaveis: [] },
  { chave: 'no_professionals_message', caminho: 'schedule', rotulo: 'Sem profissionais disponíveis', variaveis: NEGOCIO },
  { chave: 'choose_date_title', caminho: 'schedule', rotulo: 'Título da escolha de datas', variaveis: [] },
  { chave: 'closed_day_message', caminho: 'schedule', rotulo: 'Dia sem atendimento', variaveis: [] },
  { chave: 'choose_time_title', caminho: 'schedule', rotulo: 'Título da escolha de horários', variaveis: [] },
  { chave: 'walkin_notice', caminho: 'schedule', rotulo: 'Aviso de encaixe', variaveis: [] },
  { chave: 'no_slots_message', caminho: 'schedule', rotulo: 'Sem horários na data', variaveis: NEGOCIO },
  { chave: 'slot_taken_message', caminho: 'schedule', rotulo: 'Horário recém-reservado', variaveis: [] },
  { chave: 'booking_failed_message', caminho: 'schedule', rotulo: 'Falha ao confirmar o agendamento', variaveis: [] },
  { chave: 'confirmation_message', caminho: 'schedule', rotulo: 'Agendamento confirmado', variaveis: AGENDAMENTO, importantes: ['horario', 'data'] },
  { chave: 'manage_list_message', caminho: 'manage', rotulo: 'Título da lista de agendamentos', variaveis: NEGOCIO },
  { chave: 'manage_no_appointments_message', caminho: 'manage', rotulo: 'Sem agendamentos próximos', variaveis: NEGOCIO },
  { chave: 'manage_action_message', caminho: 'manage', rotulo: 'Escolha entre remarcar e cancelar', variaveis: ['data', 'horario'] },
  { chave: 'new_date_title', caminho: 'manage', rotulo: 'Título da nova data', variaveis: [] },
  { chave: 'reschedule_success_message', caminho: 'manage', rotulo: 'Remarcado com sucesso', variaveis: ['servico', 'profissional', 'data', 'horario'] },
  { chave: 'reschedule_inactive_message', caminho: 'manage', rotulo: 'Agendamento inativo ao remarcar', variaveis: [] },
  { chave: 'reschedule_failed_message', caminho: 'manage', rotulo: 'Falha ao remarcar', variaveis: [] },
  { chave: 'cancel_success_message', caminho: 'manage', rotulo: 'Cancelado com sucesso', variaveis: [] },
  { chave: 'appointment_inactive_message', caminho: 'manage', rotulo: 'Agendamento inativo ao cancelar', variaveis: [] },
  { chave: 'list_error_message', caminho: 'manage', rotulo: 'Erro ao listar agendamentos', variaveis: [] },
  { chave: 'cancel_list_message', caminho: 'cancel', rotulo: 'Título da lista para cancelar', variaveis: NEGOCIO },
  { chave: 'cancel_no_appointments_message', caminho: 'cancel', rotulo: 'Sem agendamentos para cancelar', variaveis: NEGOCIO },
  { chave: 'reschedule_list_message', caminho: 'reschedule', rotulo: 'Título da lista para remarcar', variaveis: NEGOCIO },
  { chave: 'reschedule_no_appointments_message', caminho: 'reschedule', rotulo: 'Sem agendamentos para remarcar', variaveis: NEGOCIO },
  { chave: 'promotions_message', caminho: 'promotions', rotulo: 'Promoções', variaveis: NEGOCIO, permiteVazio: true },
  { chave: 'instagram_message', caminho: 'instagram', rotulo: 'Instagram', variaveis: ['nome_negocio', 'instagram_handle'] },
  { chave: 'attendant_message', caminho: 'attendant', rotulo: 'Falar com a equipe', variaveis: NEGOCIO },
  { chave: 'end_session_message', caminho: 'end_session', rotulo: 'Atendimento encerrado', variaveis: NEGOCIO },
  { chave: 'politica_message', caminho: 'geral', rotulo: 'Resposta rápida: Política', variaveis: [], permiteVazio: true, max: 1000 },
];

const POR_CHAVE = new Map(CATALOGO_TEXTOS.map((t) => [t.chave, t]));

/** Chaves que têm coluna própria em `whatsapp_bot_config` (campo do Prisma). As outras vão para `textos_extras`. */
export const COLUNAS_TEXTO: Partial<Record<keyof BotConfig, string>> = {
  welcome_header: 'welcomeHeader',
  ask_name_message: 'askNameMessage',
  attendant_message: 'attendantMessage',
  confirmation_message: 'confirmationMessage',
  invalid_option_message: 'invalidOptionMessage',
  end_session_message: 'endSessionMessage',
  name_validation_message: 'nameValidationMessage',
  no_slots_message: 'noSlotsMessage',
  cancel_no_appointments_message: 'cancelNoAppointmentsMessage',
  cancel_list_message: 'cancelListMessage',
  cancel_success_message: 'cancelSuccessMessage',
  reschedule_no_appointments_message: 'rescheduleNoAppointmentsMessage',
  reschedule_list_message: 'rescheduleListMessage',
  promotions_message: 'promotionsMessage',
  instagram_message: 'instagramMessage',
  politica_message: 'politicaMessage',
};

type Linha = Record<string, unknown> & { textosExtras?: unknown };

const extrasDe = (linha: Linha | null): Record<string, unknown> =>
  linha?.textosExtras && typeof linha.textosExtras === 'object' && !Array.isArray(linha.textosExtras)
    ? (linha.textosExtras as Record<string, unknown>)
    : {};

/** O que está gravado para a chave (coluna ou extras), ou null. */
const gravado = (linha: Linha | null, def: TextoDef): string | null => {
  const bruto = COLUNAS_TEXTO[def.chave] ? linha?.[COLUNAS_TEXTO[def.chave] as string] : extrasDe(linha)[def.chave];
  return typeof bruto === 'string' ? bruto : null;
};

/**
 * O valor gravado só conta como edição se difere do padrão do segmento, do padrão genérico atual e
 * do padrão antigo (o botão Salvar antigo gravava tudo). Vazio só vale onde `permiteVazio`.
 */
export const textoPersonalizado = (def: TextoDef, salvo: string | null, padraoSegmento: string): salvo is string =>
  salvo !== null
  && salvo !== padraoSegmento
  && salvo !== DEFAULT_BOT_CONFIG[def.chave]
  && salvo !== PADROES_ANTIGOS[def.chave]
  && (def.permiteVazio === true || salvo.trim() !== '');

const segmentoDe = async (businessId: string) => {
  const s = await prisma.businessSettings.findUnique({ where: { businessId }, select: { segment: true } }).catch(() => null);
  return vocabularioDe(s?.segment);
};

const montar = (linha: Linha | null, padroes: BotConfig): TextoDto[] =>
  CATALOGO_TEXTOS.map((def) => {
    const padrao = padroes[def.chave] ?? '';
    const salvo = gravado(linha, def);
    const personalizado = textoPersonalizado(def, salvo, padrao);
    return { ...def, valor: personalizado ? (salvo as string) : padrao, padrao, personalizado };
  });

export async function textosDoNegocio(businessId: string): Promise<TextoDto[]> {
  const [linha, v] = await Promise.all([
    prisma.whatsappBotConfig.findFirst({ where: { businessId } }) as Promise<Linha | null>,
    segmentoDe(businessId),
  ]);
  return montar(linha, mensagensPadrao(v));
}

/**
 * Grava só as chaves enviadas. `null` restaura o padrão; texto igual ao padrão do segmento também
 * é gravado como nulo, para o padrão continuar acompanhando o segmento.
 */
export async function salvarTextos(businessId: string, textos: Record<string, string | null>): Promise<TextoDto[]> {
  if (!textos || typeof textos !== 'object' || Array.isArray(textos)) throw new ValidationError('Textos inválidos');

  const v = await segmentoDe(businessId);
  const padroes = mensagensPadrao(v);
  const entradas: Array<{ def: TextoDef; valor: string | null }> = [];

  for (const [chave, valor] of Object.entries(textos)) {
    const def = POR_CHAVE.get(chave as TextoDef['chave']);
    if (!def) throw new ValidationError(`Texto desconhecido: ${chave}`);
    if (valor !== null && typeof valor !== 'string') throw new ValidationError(`${def.rotulo}: o texto deve ser uma mensagem`);
    if (valor === null) { entradas.push({ def, valor: null }); continue; }
    if (!def.permiteVazio && valor.trim() === '') throw new ValidationError(`${def.rotulo}: a mensagem não pode ficar vazia`);
    const max = def.max ?? MAX_PADRAO;
    if (valor.length > max) throw new ValidationError(`${def.rotulo}: a mensagem pode ter até ${max} caracteres`);
    entradas.push({ def, valor: valor === (padroes[def.chave] ?? '') ? null : valor });
  }

  const atual = (await prisma.whatsappBotConfig.findFirst({ where: { businessId } })) as Linha | null;
  const extras = { ...extrasDe(atual) };
  const colunas: Record<string, string | null> = {};
  for (const { def, valor } of entradas) {
    const coluna = COLUNAS_TEXTO[def.chave];
    if (coluna) colunas[coluna] = valor;
    else if (valor === null) delete extras[def.chave];
    else extras[def.chave] = valor;
  }

  // Colunas fora deste catálogo (lembrete, avaliação…) nunca entram aqui, então não são tocadas.
  await prisma.whatsappBotConfig.upsert({
    where: { businessId },
    create: { businessId, ...colunas, textosExtras: extras as object },
    update: { ...colunas, textosExtras: extras as object },
  });

  return montar({ ...(atual ?? {}), ...colunas, textosExtras: extras }, padroes);
}
