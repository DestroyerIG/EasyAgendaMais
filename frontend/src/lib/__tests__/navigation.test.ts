import { describe, it, expect } from 'vitest';
import {
  BOTTOM_NAV_IDS,
  MORE_MENU_IDS,
  NAV_ITEMS,
  NEW_APPOINTMENT_HREF,
  SETTINGS_TABS,
  getActiveNavItem,
  normalizePath,
} from '../navigation';

describe('navegação', () => {
  it('barra lateral tem exatamente estes itens, nesta ordem', () => {
    expect(NAV_ITEMS.map((item) => item.label)).toEqual(['Hoje', 'Agenda', 'Clientes', 'Caixa', 'WhatsApp', 'Ajustes']);
  });

  it('endereços atuais não mudam', () => {
    expect(NAV_ITEMS.map((item) => item.href)).toEqual([
      '/dashboard',
      '/agendamentos',
      '/clientes',
      '/financeiro',
      '/whatsapp',
      '/configuracoes',
    ]);
  });

  it('barra inferior e menu Mais', () => {
    expect(BOTTOM_NAV_IDS).toEqual(['hoje', 'agenda', 'clientes']);
    expect(MORE_MENU_IDS).toEqual(['caixa', 'whatsapp', 'ajustes']);
    expect(NEW_APPOINTMENT_HREF).toBe('/agendamentos?novo=1');
  });

  it('abas de Ajustes', () => {
    expect(SETTINGS_TABS).toEqual([
      { label: 'Negócio', href: '/configuracoes' },
      { label: 'Serviços e equipe', href: '/servicos' },
      { label: 'Plano e cobrança', href: '/planos' },
    ]);
  });

  it.each([
    ['/dashboard', 'hoje'],
    ['/dashboard/', 'hoje'],
    ['/agendamentos', 'agenda'],
    ['/dashboard/agendamentos', 'agenda'],
    ['/clientes', 'clientes'],
    ['/financeiro', 'caixa'],
    ['/whatsapp', 'whatsapp'],
    ['/configuracoes', 'ajustes'],
    ['/servicos', 'ajustes'],
    ['/planos', 'ajustes'],
    ['/dashboard/planos', 'ajustes'],
    ['/pagamento', null],
  ])('%s ativa %s', (path, expected) => {
    expect(getActiveNavItem(path)).toBe(expected);
  });

  it('normaliza os endereços com /dashboard', () => {
    expect(normalizePath('/dashboard/clientes/')).toBe('/clientes');
    expect(normalizePath('/dashboard')).toBe('/dashboard');
  });
});
