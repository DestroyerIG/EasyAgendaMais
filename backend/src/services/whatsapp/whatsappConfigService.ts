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
import { CATALOGO_TEXTOS, COLUNAS_TEXTO } from './whatsappTextos.js';
import { menuPadrao, menuNaoPersonalizado, mesmoMenu } from './whatsappMenuPadrao.js';

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
  created_at?: Date | string | null;
  updated_at?: Date | string | null;
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
      const linha = dbConfig as unknown as Record<string, unknown>;
      const extras = (dbConfig.textosExtras ?? {}) as Record<string, unknown>;
      // Fora do catálogo: ficam na coluna e não são editáveis na tela.
      const config: BotConfig = {
        ...DEFAULT_BOT_CONFIG,
        reminder_message:        dbConfig.reminderMessage       ?? DEFAULT_BOT_CONFIG.reminder_message,
        session_expired_message: dbConfig.sessionExpiredMessage ?? DEFAULT_BOT_CONFIG.session_expired_message,
      };
      for (const def of CATALOGO_TEXTOS) {
        const coluna = COLUNAS_TEXTO[def.chave];
        const bruto = coluna ? linha[coluna] : extras[def.chave];
        const salvo = typeof bruto === 'string' && (def.permiteVazio || bruto.trim() !== '') ? bruto : null;
        config[def.chave] = salvoOuPadrao(def.chave, salvo);
      }
      return config;
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

    // Só semeia quando o negócio não tem linha nenhuma: menu com tudo desligado é escolha do dono.
    const existentes = await prisma.$queryRaw<{ id: string }[]>(Prisma.sql`
      SELECT id FROM whatsapp_menu_options WHERE business_id = ${businessId}::uuid LIMIT 1
    `);
    if (existentes.length > 0) return [];

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

  if (menuNaoPersonalizado(rows, segmento)) {
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
