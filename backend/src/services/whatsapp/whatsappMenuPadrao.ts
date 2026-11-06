/**
 * Fonte única do menu padrão do robô de WhatsApp: criação, reset e detecção de menu não personalizado usam esta lista.
 */

import type { Segmento } from '../../modules/crm/technicalSheetTemplates.js';
import type { MenuOption } from './whatsappConstants.js';
import type { MenuOptionRow } from './whatsappConfigService.js';
import { SEGMENTOS_VALIDOS } from '../../config/vocabulario.js';

const ROTULOS_SERVICOS: Record<Segmento, { emoji: string; label: string }> = {
  barbearia: { emoji: '✂️', label: 'Serviços e preços' },
  unhas: { emoji: '💅', label: 'Serviços e preços' },
  cilios_sobrancelhas: { emoji: '✨', label: 'Serviços e preços' },
  cabelo: { emoji: '💇', label: 'Serviços e preços' },
  estetica: { emoji: '✨', label: 'Procedimentos e preços' },
  outro: { emoji: '📋', label: 'Serviços e preços' },
};

export const menuPadrao = (segmento: Segmento): MenuOption[] => {
  const servicos = ROTULOS_SERVICOS[segmento] ?? ROTULOS_SERVICOS.outro;
  return [
    { order: 1, emoji: '📅', label: segmento === 'estetica' ? 'Agendar procedimento' : 'Agendar horário', handler: 'schedule' },
    { order: 2, ...servicos, handler: 'view_services' },
    { order: 3, emoji: '🔄', label: 'Remarcar ou cancelar', handler: 'manage' },
    { order: 4, emoji: '🎉', label: 'Promoções', handler: 'promotions' },
    { order: 5, emoji: '📱', label: 'Instagram', handler: 'instagram' },
    { order: 6, emoji: '💬', label: 'Falar com a equipe', handler: 'attendant' },
  ];
};

// ── Menus antigos, só para detecção ──────────────────────────────────────────
// Nunca usados para criar menu: servem para reconhecer quem nunca personalizou.

type Impressao = { emoji: string; label: string; handler: string };

const antigoCom = (agendar: string, comRating: boolean): Impressao[] => {
  const todas: Impressao[] = [
    { emoji: agendar, label: 'Agendar um horário', handler: 'schedule' },
    { emoji: '📋', label: 'Ver nossos serviços', handler: 'view_services' },
    { emoji: '❌', label: 'Cancelar agendamento', handler: 'cancel' },
    { emoji: '🔄', label: 'Reagendamento', handler: 'reschedule' },
    { emoji: '⭐', label: 'Avaliação pós-atendimento', handler: 'rating' },
    { emoji: '🎉', label: 'Promoções', handler: 'promotions' },
    { emoji: '📱', label: 'Instagram', handler: 'instagram' },
    { emoji: '👨‍💼', label: 'Falar com um humano', handler: 'attendant' },
    { emoji: '🚪', label: 'Encerrar atendimento', handler: 'end_session' },
  ];
  return comRating ? todas : todas.filter((o) => o.handler !== 'rating');
};

const MENUS_ANTIGOS: Impressao[][] = [
  antigoCom('📅', true),
  antigoCom('💈', true),
  antigoCom('📅', false),
  antigoCom('💈', false),
];

const ordenar = (rows: MenuOptionRow[]): MenuOptionRow[] => [...rows].sort((a, b) => a.option_order - b.option_order);

const igualA = (ordenadas: MenuOptionRow[], menu: Impressao[]): boolean =>
  menu.length === ordenadas.length &&
  menu.every((o, i) => o.emoji === ordenadas[i].emoji && o.label === ordenadas[i].label && o.handler === ordenadas[i].handler);

/** Verdadeiro se as linhas são exatamente o `menuPadrao` do segmento (mesma ordem, emoji, nome e handler). */
export const mesmoMenu = (rows: MenuOptionRow[], segmento: Segmento): boolean => igualA(ordenar(rows), menuPadrao(segmento));

/** Linha nunca editada pelo dono: `updated_at` igual a `created_at` (PUT e reordenação atualizam `updated_at`). */
const intocada = (r: MenuOptionRow): boolean =>
  r.created_at != null && r.updated_at != null && new Date(r.created_at).getTime() === new Date(r.updated_at).getTime();

/**
 * Verdadeiro se as linhas são exatamente um menu que o sistema criou: mesma ordem, nome, emoji e
 * handler, todas de sistema e ativas. Ignora os buracos em `option_order`. Vale para o `menuPadrao`
 * do `segmento` e para os menus antigos; o `menuPadrao` de OUTRO segmento só vale se o dono não
 * tocou em nenhuma linha (senão uma troca de 📋 por ✂️ em `outro` seria desfeita em silêncio).
 * Qualquer outra diferença ou opção própria significa menu personalizado.
 */
export const menuNaoPersonalizado = (rows: MenuOptionRow[], segmento?: Segmento): boolean => {
  if (rows.length === 0) return false;
  const ordenadas = ordenar(rows);
  if (!ordenadas.every((r) => r.type === 'system' && r.active)) return false;
  if (MENUS_ANTIGOS.some((m) => igualA(ordenadas, m))) return true;
  if (segmento && igualA(ordenadas, menuPadrao(segmento))) return true;
  return SEGMENTOS_VALIDOS.some((s) => igualA(ordenadas, menuPadrao(s))) && ordenadas.every(intocada);
};
