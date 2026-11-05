/**
 * whatsappMenu.ts — Lista de opções do menu que a cliente realmente lê.
 * A numeração enviada e a numeração interpretada saem da mesma lista.
 */

import { getMenuOptions, type MenuOptionRow } from './whatsappConfigService.js';
import type { BotConfig } from './whatsappConstants.js';

export interface ContextoMenu {
  promocoes: string;
  instagramVisivel: boolean;
}

export const opcoesVisiveis = (options: MenuOptionRow[], ctx: ContextoMenu): MenuOptionRow[] =>
  options
    .filter((o) => o.active)
    .filter((o) => o.handler !== 'rating')
    .filter((o) => o.handler !== 'promotions' || ctx.promocoes.trim() !== '')
    .filter((o) => o.handler !== 'instagram' || ctx.instagramVisivel)
    .sort((a, b) => a.option_order - b.option_order);

export const resolverEscolha = (visiveis: MenuOptionRow[], escolha: number): MenuOptionRow | null => {
  if (!Number.isInteger(escolha) || escolha < 1 || escolha > visiveis.length) return null;
  return visiveis[escolha - 1] ?? null;
};

export const carregarMenuVisivel = async (
  businessId: string,
  config: BotConfig,
): Promise<MenuOptionRow[]> => {
  const options = await getMenuOptions(businessId);
  // instagramVisivel fica fixo em true até a Task 2 definir a regra.
  return opcoesVisiveis(options ?? [], {
    promocoes: config?.promotions_message ?? '',
    instagramVisivel: true,
  });
};
