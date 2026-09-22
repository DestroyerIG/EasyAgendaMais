import { CalendarDays, Home, MessageCircle, Settings, Users, Wallet, type LucideIcon } from 'lucide-react';

export type NavItemId = 'hoje' | 'agenda' | 'clientes' | 'caixa' | 'whatsapp' | 'ajustes';

export interface NavItem {
  id: NavItemId;
  label: string;
  href: string;
  icon: LucideIcon;
  matches: readonly string[];
}

// Itens da barra lateral, na ordem do DESIGN.md, só os que já existem.
// Clube e pacotes, Relatórios e Minha página entram quando os sub-projetos entregarem as telas.
export const NAV_ITEMS: readonly NavItem[] = [
  { id: 'hoje', label: 'Hoje', href: '/dashboard', icon: Home, matches: ['/dashboard'] },
  { id: 'agenda', label: 'Agenda', href: '/agendamentos', icon: CalendarDays, matches: ['/agendamentos'] },
  { id: 'clientes', label: 'Clientes', href: '/clientes', icon: Users, matches: ['/clientes'] },
  { id: 'caixa', label: 'Caixa', href: '/financeiro', icon: Wallet, matches: ['/financeiro'] },
  { id: 'whatsapp', label: 'WhatsApp', href: '/whatsapp', icon: MessageCircle, matches: ['/whatsapp'] },
  { id: 'ajustes', label: 'Ajustes', href: '/configuracoes', icon: Settings, matches: ['/configuracoes', '/servicos', '/planos'] },
];

// Barra inferior do celular: Hoje, Agenda, [+], Clientes, [Mais].
export const BOTTOM_NAV_IDS: readonly NavItemId[] = ['hoje', 'agenda', 'clientes'];
export const MORE_MENU_IDS: readonly NavItemId[] = ['caixa', 'whatsapp', 'ajustes'];
export const NEW_APPOINTMENT_HREF = '/agendamentos?novo=1';

export const SETTINGS_TABS: readonly { label: string; href: string }[] = [
  { label: 'Negócio', href: '/configuracoes' },
  { label: 'Serviços e equipe', href: '/servicos' },
  { label: 'Plano e cobrança', href: '/planos' },
];

export function normalizePath(pathname: string): string {
  const trimmed = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname;
  if (trimmed.startsWith('/dashboard/')) {
    return trimmed.slice('/dashboard'.length);
  }
  return trimmed;
}

export function getActiveNavItem(pathname: string): NavItemId | null {
  const path = normalizePath(pathname);
  const found = NAV_ITEMS.find((item) =>
    item.matches.some((match) => path === match || path.startsWith(`${match}/`)),
  );
  return found?.id ?? null;
}

export function getNavItem(id: NavItemId): NavItem {
  const item = NAV_ITEMS.find((candidate) => candidate.id === id);
  if (!item) throw new Error(`Item de navegação desconhecido: ${id}`);
  return item;
}
