export type NavItemId =
  | 'hoje'
  | 'agenda'
  | 'clientes'
  | 'caixa'
  | 'clube'
  | 'whatsapp'
  | 'relatorios'
  | 'minha-pagina'
  | 'ajustes';

export interface NavItem {
  id: NavItemId;
  label: string;
  href: string;
  // Nome do ícone Material Symbol (renderizado via <Icon name={icon} />, Tarefa 1).
  icon: string;
  matches: readonly string[];
}

// Itens da barra lateral, na ordem do DESIGN.md — os nove, sem "Funil CRM"
// (fora de escopo; ver seção 0.3 do INVENTARIO.md).
export const NAV_ITEMS: readonly NavItem[] = [
  { id: 'hoje', label: 'Hoje', href: '/dashboard', icon: 'today', matches: ['/dashboard'] },
  { id: 'agenda', label: 'Agenda', href: '/agendamentos', icon: 'calendar_month', matches: ['/agendamentos'] },
  { id: 'clientes', label: 'Clientes', href: '/clientes', icon: 'group', matches: ['/clientes'] },
  { id: 'caixa', label: 'Caixa', href: '/financeiro', icon: 'point_of_sale', matches: ['/financeiro'] },
  { id: 'clube', label: 'Clube e pacotes', href: '/clube', icon: 'loyalty', matches: ['/clube'] },
  { id: 'whatsapp', label: 'WhatsApp', href: '/whatsapp', icon: 'chat', matches: ['/whatsapp'] },
  { id: 'relatorios', label: 'Relatórios', href: '/relatorios', icon: 'bar_chart', matches: ['/relatorios'] },
  { id: 'minha-pagina', label: 'Minha página', href: '/minha-pagina', icon: 'storefront', matches: ['/minha-pagina'] },
  { id: 'ajustes', label: 'Configurações', href: '/configuracoes', icon: 'settings', matches: ['/configuracoes', '/servicos', '/planos'] },
];

// Barra inferior do celular: Hoje, Agenda, [+], Clientes, [Mais] — hoje-mobile.html.
export const BOTTOM_NAV_IDS: readonly NavItemId[] = ['hoje', 'agenda', 'clientes'];
export const MORE_MENU_IDS: readonly NavItemId[] = ['caixa', 'clube', 'whatsapp', 'relatorios', 'minha-pagina', 'ajustes'];
export const NEW_APPOINTMENT_HREF = '/agendamentos?novo=1';

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
