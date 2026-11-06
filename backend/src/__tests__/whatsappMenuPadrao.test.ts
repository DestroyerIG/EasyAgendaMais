import { describe, it, expect } from 'vitest';
import { menuPadrao } from '../services/whatsapp/whatsappMenuPadrao.js';
import type { Segmento } from '../modules/crm/technicalSheetTemplates.js';

describe('menuPadrao', () => {
  it.each([
    ['barbearia', '📅 Agendar horário', '✂️ Serviços e preços'],
    ['unhas', '📅 Agendar horário', '💅 Serviços e preços'],
    ['cilios_sobrancelhas', '📅 Agendar horário', '✨ Serviços e preços'],
    ['cabelo', '📅 Agendar horário', '💇 Serviços e preços'],
    ['estetica', '📅 Agendar procedimento', '✨ Procedimentos e preços'],
    ['outro', '📅 Agendar horário', '📋 Serviços e preços'],
  ])('%s', (seg, um, dois) => {
    const m = menuPadrao(seg as Segmento);
    expect(`${m[0].emoji} ${m[0].label}`).toBe(um);
    expect(`${m[1].emoji} ${m[1].label}`).toBe(dois);
    expect(m.slice(2).map((o) => `${o.emoji} ${o.label}`)).toEqual(
      ['🔄 Remarcar ou cancelar', '🎉 Promoções', '📱 Instagram', '💬 Falar com a equipe']);
    expect(m.map((o) => o.handler)).toEqual(['schedule', 'view_services', 'manage', 'promotions', 'instagram', 'attendant']);
  });
});
