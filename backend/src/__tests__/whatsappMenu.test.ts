import { describe, it, expect } from 'vitest';
import { opcoesVisiveis, resolverEscolha } from '../services/whatsapp/whatsappMenu.js';
import type { MenuOptionRow } from '../services/whatsapp/whatsappConfigService.js';

const op = (order: number, handler: string, active = true) =>
  ({ id: String(order), option_order: order, label: handler, emoji: '', type: 'system', handler, active }) as MenuOptionRow;
const ctx = { promocoes: 'Oferta', instagramVisivel: true };

describe('whatsappMenu', () => {
  it('renumera sem a opção desligada', () => {
    const v = opcoesVisiveis([op(1, 'schedule'), op(5, 'promotions', false), op(6, 'instagram'), op(7, 'attendant')], ctx);
    expect(resolverEscolha(v, 2)?.handler).toBe('instagram');
    expect(resolverEscolha(v, 3)?.handler).toBe('attendant');
  });
  it('esconde promoções sem texto e nunca mostra avaliação', () => {
    const v = opcoesVisiveis([op(1, 'rating'), op(2, 'promotions'), op(3, 'attendant')], { ...ctx, promocoes: '   ' });
    expect(v.map((o) => o.handler)).toEqual(['attendant']);
  });
  it('número fora da lista não resolve', () => {
    const v = opcoesVisiveis([op(1, 'schedule')], ctx);
    expect(resolverEscolha(v, 0)).toBeNull();
    expect(resolverEscolha(v, 2)).toBeNull();
  });
});
