/**
 * whatsappMenu.ts — Lista de opções do menu que a cliente realmente lê.
 * A numeração enviada e a numeração interpretada saem da mesma lista.
 */

import { prisma } from '../../config/prisma.js';
import { ValidationError } from '../../utils/errors.js';
import { getMenuOptions, type MenuOptionRow } from './whatsappConfigService.js';
import type { BotConfig } from './whatsappConstants.js';

export interface ContextoMenu {
  promocoes: string;
  instagramVisivel: boolean;
}

/** O Instagram aparece com perfil cadastrado, ou quando o texto não depende da variável. */
export const instagramVisivel = (handle: string | null | undefined, mensagem: string): boolean => {
  if (!mensagem || mensagem.trim() === '') return false;
  if (handle && handle.trim() !== '') return true;
  return !mensagem.includes('{instagram_handle}');
};

const PERFIL_INSTAGRAM = /^[a-zA-Z0-9._]{1,30}$/;

/** Aceita `perfil`, `@perfil` ou URL do instagram.com e devolve `@perfil`. Vazio vira null. */
export const normalizarInstagram = (entrada: string): string | null => {
  let perfil = (entrada ?? '').trim();
  if (perfil === '') return null;
  const url = perfil.match(/^(?:https?:\/\/)?(?:www\.)?instagram\.com\/([^/?#\s]+)/i);
  if (url) perfil = url[1];
  perfil = perfil.replace(/^@/, '');
  if (!PERFIL_INSTAGRAM.test(perfil)) throw new ValidationError('Perfil do Instagram inválido');
  return `@${perfil}`;
};

export const opcoesVisiveis = (options: MenuOptionRow[], ctx: ContextoMenu): MenuOptionRow[] =>
  options
    .filter((o) => o.active)
    .filter((o) => o.handler !== 'rating')
    .filter((o) => o.handler !== 'promotions' || ctx.promocoes.trim() !== '')
    .filter((o) => o.handler !== 'instagram' || ctx.instagramVisivel)
    .sort((a, b) => a.option_order - b.option_order);

export type MotivoOculta = 'desligada' | 'sem_promocao' | 'sem_instagram';

/**
 * Todas as linhas do menu, na ordem, com o número que a cliente lê (`numero`) ou, quando a opção
 * não aparece, o motivo. A avaliação nunca aparece no menu e não tem motivo a mostrar.
 */
export const anotarMenu = <T extends MenuOptionRow>(
  options: T[],
  ctx: ContextoMenu,
): Array<T & { numero: number | null; motivoOculta: MotivoOculta | null }> => {
  const numeros = new Map(opcoesVisiveis(options, ctx).map((o, i) => [o.id, i + 1]));
  return [...options]
    .sort((a, b) => a.option_order - b.option_order)
    .map((o) => {
      const numero = numeros.get(o.id) ?? null;
      let motivoOculta: MotivoOculta | null = null;
      if (numero === null && o.handler !== 'rating') {
        if (!o.active) motivoOculta = 'desligada';
        else if (o.handler === 'promotions') motivoOculta = 'sem_promocao';
        else if (o.handler === 'instagram') motivoOculta = 'sem_instagram';
      }
      return { ...o, numero, motivoOculta };
    });
};

export const resolverEscolha = (visiveis: MenuOptionRow[], escolha: number): MenuOptionRow | null => {
  if (!Number.isInteger(escolha) || escolha < 1 || escolha > visiveis.length) return null;
  return visiveis[escolha - 1] ?? null;
};

export const carregarMenuVisivel = async (
  businessId: string,
  config: BotConfig,
): Promise<MenuOptionRow[]> => {
  const options = await getMenuOptions(businessId);
  const negocio = await prisma.business
    .findFirst({ where: { id: businessId }, select: { instagramHandle: true } })
    .catch(() => null);
  return opcoesVisiveis(options ?? [], {
    promocoes: config?.promotions_message ?? '',
    instagramVisivel: instagramVisivel(negocio?.instagramHandle, config?.instagram_message ?? ''),
  });
};
