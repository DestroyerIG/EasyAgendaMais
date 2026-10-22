import { prisma } from '../../config/prisma.js';
import { businessSettingsRepository } from '../../repositories/businessSettingsRepository.js';

export interface LinhaAutomacao { regra: string; ativa: boolean; texto: string | null; config: unknown }

export const automacoesRepository = {
  async listar(businessId: string): Promise<LinhaAutomacao[]> {
    const linhas = await prisma.whatsappAutomacao.findMany({ where: { businessId } });
    return linhas.map((l) => ({ regra: l.regra, ativa: l.ativa, texto: l.texto, config: l.config }));
  },

  async salvar(businessId: string, regra: string, data: { ativa?: boolean; texto?: string | null; config?: object }): Promise<void> {
    await prisma.whatsappAutomacao.upsert({
      where: { businessId_regra: { businessId, regra } },
      create: { businessId, regra, ativa: data.ativa ?? false, texto: data.texto ?? null, config: data.config ?? {} },
      update: data,
    });
  },

  /** Configuração antiga do lembrete: chave em business_settings e texto em whatsappBotConfig. */
  async legadoLembrete(businessId: string): Promise<{ ativa: boolean; texto: string | null }> {
    const settings = (await businessSettingsRepository.findByBusinessId(businessId)) as { whatsappReminders?: unknown } | null;
    const bot = await prisma.whatsappBotConfig.findFirst({ where: { businessId }, select: { reminderMessage: true } });
    return { ativa: settings?.whatsappReminders !== false, texto: bot?.reminderMessage?.trim() ? bot.reminderMessage : null };
  },

  async negocio(businessId: string): Promise<{ nome: string; whatsapp: string | null }> {
    const b = await prisma.business.findUnique({ where: { id: businessId }, select: { name: true, whatsapp: true } });
    return { nome: b?.name ?? '', whatsapp: b?.whatsapp ?? null };
  },
};
