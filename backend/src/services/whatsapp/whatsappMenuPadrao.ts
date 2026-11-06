/**
 * Fonte única do menu padrão do robô de WhatsApp: criação, reset e mensagem de reserva usam esta lista.
 */

import type { Segmento } from '../../modules/crm/technicalSheetTemplates.js';
import type { MenuOption } from './whatsappConstants.js';

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
