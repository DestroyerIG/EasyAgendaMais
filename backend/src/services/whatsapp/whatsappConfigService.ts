/**
 * whatsappConfigService.ts — Configuração do bot — busca e seed de config e menu options no banco.
 */

import { Prisma } from '@prisma/client';
import logger from '../../utils/logger.js';
import { prisma } from '../../config/prisma.js';
import { DEFAULT_BOT_CONFIG, PADROES_ANTIGOS, BotConfig } from './whatsappConstants.js';
import { aplicarVocabulario } from './whatsappVocabulario.js';
import { vocabularioDe } from '../../config/vocabulario.js';
import type { Segmento } from '../../modules/crm/technicalSheetTemplates.js';
import { menuPadrao, menuNaoPersonalizado } from './whatsappMenuPadrao.js';

// ── Menu option row shape returned by the DB ──────────────────────────────────

export interface MenuOptionRow {
  id: string;
  business_id: string;
  option_order: number;
  label: string;
  emoji: string;
  type: string;
  handler: string;
  active: boolean;
  response_message?: string | null;
}

/**
 * Busca configuração de mensagens do bot (todas as mensagens configuráveis).
 */
export const getBotConfig = async (businessId: string): Promise<BotConfig> => {
  const config = await lerBotConfig(businessId);
  // Vocabulário do segmento (fase 6) nas mensagens padrão. Sem o segmento, fica o texto de sempre.
  const s = await prisma.businessSettings.findUnique({ where: { businessId }, select: { segment: true } }).catch(() => null);
  return aplicarVocabulario(config, vocabularioDe(s?.segment));
};

/** Valor salvo; se for nulo ou exatamente o texto padrão antigo (nunca editado), vale o padrão atual. */
const salvoOuPadrao = (chave: keyof BotConfig, salvo: string | null | undefined): string =>
  salvo == null || salvo === PADROES_ANTIGOS[chave] ? (DEFAULT_BOT_CONFIG[chave] ?? '') : salvo;

const lerBotConfig = async (businessId: string): Promise<BotConfig> => {
  try {
    const dbConfig = await prisma.whatsappBotConfig.findFirst({
      where: { businessId },
    });

    if (dbConfig) {
      return {
        welcome_header:                    salvoOuPadrao('welcome_header', dbConfig.welcomeHeader),
        ask_name_message:                  dbConfig.askNameMessage                  ?? DEFAULT_BOT_CONFIG.ask_name_message,
        attendant_message:                 salvoOuPadrao('attendant_message', dbConfig.attendantMessage),
        confirmation_message:              dbConfig.confirmationMessage             ?? DEFAULT_BOT_CONFIG.confirmation_message,
        reminder_message:                  dbConfig.reminderMessage                 ?? DEFAULT_BOT_CONFIG.reminder_message,
        invalid_option_message:            dbConfig.invalidOptionMessage            ?? DEFAULT_BOT_CONFIG.invalid_option_message,
        session_expired_message:           dbConfig.sessionExpiredMessage           ?? DEFAULT_BOT_CONFIG.session_expired_message,
        end_session_message:               dbConfig.endSessionMessage               ?? DEFAULT_BOT_CONFIG.end_session_message,
        name_validation_message:           dbConfig.nameValidationMessage           ?? DEFAULT_BOT_CONFIG.name_validation_message,
        no_slots_message:                  dbConfig.noSlotsMessage                  ?? DEFAULT_BOT_CONFIG.no_slots_message,
        cancel_no_appointments_message:    salvoOuPadrao('cancel_no_appointments_message', dbConfig.cancelNoAppointmentsMessage),
        cancel_list_message:               dbConfig.cancelListMessage               ?? DEFAULT_BOT_CONFIG.cancel_list_message,
        cancel_success_message:            dbConfig.cancelSuccessMessage            ?? DEFAULT_BOT_CONFIG.cancel_success_message,
        reschedule_no_appointments_message: salvoOuPadrao('reschedule_no_appointments_message', dbConfig.rescheduleNoAppointmentsMessage),
        reschedule_list_message:           dbConfig.rescheduleListMessage           ?? DEFAULT_BOT_CONFIG.reschedule_list_message,
        reschedule_success_message:        DEFAULT_BOT_CONFIG.reschedule_success_message,
        manage_list_message:               DEFAULT_BOT_CONFIG.manage_list_message,
        manage_no_appointments_message:    DEFAULT_BOT_CONFIG.manage_no_appointments_message,
        manage_action_message:             DEFAULT_BOT_CONFIG.manage_action_message,
        promotions_message:                salvoOuPadrao('promotions_message', dbConfig.promotionsMessage),
        instagram_message:                 salvoOuPadrao('instagram_message', dbConfig.instagramMessage),
        politica_message:                  dbConfig.politicaMessage                 ?? DEFAULT_BOT_CONFIG.politica_message,
      };
    }

    return DEFAULT_BOT_CONFIG;
  } catch (error) {
    logger.error({ err: error, businessId }, 'Erro ao buscar config do bot');
    return DEFAULT_BOT_CONFIG;
  }
};

/**
 * Busca opções do menu dinâmico do bot.
 * Nota: whatsapp_menu_options não está no schema Prisma — usa $queryRaw.
 */
export const getMenuOptions = async (businessId: string): Promise<MenuOptionRow[]> => {
  try {
    await garantirMenuAtualSemFalhar(businessId);
    const rows = await prisma.$queryRaw<MenuOptionRow[]>(Prisma.sql`
      SELECT * FROM whatsapp_menu_options
       WHERE business_id = ${businessId}::uuid AND active = true
       ORDER BY option_order ASC
    `);

    if (rows.length > 0) {
      return rows;
    }

    await seedDefaultMenuOptions(businessId);
    return prisma.$queryRaw<MenuOptionRow[]>(Prisma.sql`
      SELECT * FROM whatsapp_menu_options
       WHERE business_id = ${businessId}::uuid AND active = true
       ORDER BY option_order ASC
    `);
  } catch (error) {
    logger.error({ err: error, businessId }, 'Erro ao buscar opções do menu');
    return [];
  }
};

/** Segmento do negócio; `outro` quando não há configuração ou o valor é inválido. */
export const segmentoDoNegocio = async (businessId: string): Promise<Segmento> => {
  const s = await prisma.businessSettings.findUnique({ where: { businessId }, select: { segment: true } });
  return vocabularioDe(s?.segment).segmento;
};

const mesmoMenu = (rows: MenuOptionRow[], segmento: Segmento): boolean => {
  const padrao = menuPadrao(segmento);
  const ordenadas = [...rows].sort((a, b) => a.option_order - b.option_order);
  return (
    padrao.length === ordenadas.length &&
    padrao.every((o, i) => o.emoji === ordenadas[i].emoji && o.label === ordenadas[i].label && o.handler === ordenadas[i].handler)
  );
};

/**
 * Atualiza o menu gravado: o que nunca foi personalizado passa para o menu atual do segmento, e a
 * linha `rating` (a avaliação saiu do menu) é apagada de menu personalizado, sem tocar no resto.
 * Lê primeiro e só escreve, em uma transação, se algo mudar.
 */
export const garantirMenuAtual = async (businessId: string, segmento: Segmento): Promise<void> => {
  const rows = await prisma.$queryRaw<MenuOptionRow[]>(Prisma.sql`
    SELECT * FROM whatsapp_menu_options
     WHERE business_id = ${businessId}::uuid
     ORDER BY option_order ASC
  `);
  if (rows.length === 0) return;

  if (menuNaoPersonalizado(rows)) {
    if (mesmoMenu(rows, segmento)) return;
    await prisma.$transaction(async (tx) => {
      await tx.$executeRaw(Prisma.sql`DELETE FROM whatsapp_menu_options WHERE business_id = ${businessId}::uuid`);
      for (const opt of menuPadrao(segmento)) {
        await tx.$executeRaw(Prisma.sql`
          INSERT INTO whatsapp_menu_options (business_id, option_order, label, emoji, type, handler, active)
          VALUES (${businessId}::uuid, ${opt.order}, ${opt.label}, ${opt.emoji}, 'system', ${opt.handler}, true)
        `);
      }
    });
    return;
  }

  if (rows.some((r) => r.handler === 'rating')) {
    await prisma.$transaction(async (tx) => {
      await tx.$executeRaw(
        Prisma.sql`DELETE FROM whatsapp_menu_options WHERE business_id = ${businessId}::uuid AND handler = 'rating'`,
      );
    });
  }
};

/** Como `garantirMenuAtual`, mas uma falha só vira aviso: o robô segue com as linhas como estão. */
export const garantirMenuAtualSemFalhar = async (businessId: string): Promise<void> => {
  try {
    await garantirMenuAtual(businessId, await segmentoDoNegocio(businessId));
  } catch (error) {
    logger.warn({ err: error, businessId }, 'Não foi possível atualizar o menu do robô');
  }
};

/**
 * Seed de opções padrão do menu para um negócio.
 */
export const seedDefaultMenuOptions = async (businessId: string): Promise<void> => {
  for (const opt of menuPadrao(await segmentoDoNegocio(businessId))) {
    await prisma.$executeRaw(Prisma.sql`
      INSERT INTO whatsapp_menu_options (business_id, option_order, label, emoji, type, handler, active)
      VALUES (${businessId}::uuid, ${opt.order}, ${opt.label}, ${opt.emoji}, 'system', ${opt.handler}, true)
      ON CONFLICT (business_id, option_order) DO NOTHING
    `);
  }
};
