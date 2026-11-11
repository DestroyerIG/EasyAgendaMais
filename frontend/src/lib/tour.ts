import type { NavItemId } from '@/lib/navigation';

// Tour guiado do primeiro acesso: só explica, não pede nenhuma ação. Cada passo aponta para
// uma tela do menu (quando tem `nav`) e o balão destaca o item correspondente.

export interface PassoTour {
  id: string;
  titulo: string;
  texto: string;
  icone: string;
  /** Item do menu que o passo destaca e para onde ele leva. Sem `nav`, o balão fica no centro. */
  nav?: NavItemId;
}

export const PASSOS_TOUR: readonly PassoTour[] = [
  {
    id: 'boas-vindas',
    titulo: 'Bem-vinda ao EasyAgenda+',
    texto: 'Em poucos passos você conhece cada parte do sistema. É rápido, e dá para pular quando quiser.',
    icone: 'waving_hand',
  },
  {
    id: 'hoje',
    nav: 'hoje',
    titulo: 'Hoje',
    texto: 'Sua tela inicial: os atendimentos do dia, o que já foi feito e o que ainda falta. O cartão "Termine de configurar" mostra o que ainda dá para ajustar.',
    icone: 'today',
  },
  {
    id: 'agenda',
    nav: 'agenda',
    titulo: 'Agenda',
    texto: 'Veja os horários por dia ou semana, crie agendamentos e remarque quando precisar. No celular, o botão "+" cria um agendamento em dois toques.',
    icone: 'calendar_month',
  },
  {
    id: 'clientes',
    nav: 'clientes',
    titulo: 'Clientes',
    texto: 'O cadastro de quem você atende, com histórico de visitas, contato e aniversário. Fica fácil saber quem voltou e quem sumiu.',
    icone: 'group',
  },
  {
    id: 'caixa',
    nav: 'caixa',
    titulo: 'Caixa',
    texto: 'Aqui você fecha as comandas dos atendimentos, registra como o cliente pagou e acompanha o dinheiro que entrou e saiu.',
    icone: 'point_of_sale',
  },
  {
    id: 'clube',
    nav: 'clube',
    titulo: 'Clube e pacotes',
    texto: 'Venda assinaturas mensais e pacotes de serviços. O cliente paga adiantado e você garante receita recorrente.',
    icone: 'loyalty',
  },
  {
    id: 'whatsapp',
    nav: 'whatsapp',
    titulo: 'WhatsApp',
    texto: 'Conecte seu número para o robô atender e agendar sozinho, enviar lembretes automáticos e fazer campanhas para seus clientes.',
    icone: 'chat',
  },
  {
    id: 'relatorios',
    nav: 'relatorios',
    titulo: 'Relatórios',
    texto: 'Os números do negócio: faturamento, serviços mais vendidos, clientes que mais voltam e as comissões da equipe.',
    icone: 'bar_chart',
  },
  {
    id: 'minha-pagina',
    nav: 'minha-pagina',
    titulo: 'Minha página',
    texto: 'Sua página pública de agendamento. Divulgue o link no Instagram e no WhatsApp para os clientes marcarem sozinhos, a qualquer hora.',
    icone: 'storefront',
  },
  {
    id: 'ajustes',
    nav: 'ajustes',
    titulo: 'Configurações',
    texto: 'Serviços e preços, horários, equipe, formas de receber e o seu plano. Tudo o que você configurou no começo pode ser mudado aqui.',
    icone: 'settings',
  },
  {
    id: 'fim',
    titulo: 'Pronto, é só começar!',
    texto: 'Para rever este tour quando quiser, abra o menu da conta (no topo da tela) e escolha "Rever o tour".',
    icone: 'celebration',
  },
] as const;

export const TOTAL_PASSOS_TOUR = PASSOS_TOUR.length;

/** Índice do passo seguinte, ou `null` quando o tour acabou. */
export const proximoPasso = (atual: number): number | null => (atual + 1 < TOTAL_PASSOS_TOUR ? atual + 1 : null);

/** Índice do passo anterior (não passa do primeiro). */
export const passoAnterior = (atual: number): number => Math.max(atual - 1, 0);

/** O tour abre sozinho só para a dona que acabou o onboarding e ainda não viu o tour. */
export function deveAbrirTour(user: { role?: string; onboarding?: { bloqueante: boolean; tourPendente?: boolean } | null } | null | undefined): boolean {
  return user?.role === 'tenant_admin' && user.onboarding?.bloqueante === false && user.onboarding.tourPendente === true;
}
