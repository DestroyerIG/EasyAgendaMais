/**
 * Constantes do bot WhatsApp — steps do fluxo conversacional, timeouts, defaults.
 */

export const SESSION_TIMEOUT_MS = parseInt(process.env.WHATSAPP_SESSION_TIMEOUT_MS || '1800000', 10); // 30 min

/**
 * Steps (estados) da máquina de estados do fluxo conversacional.
 */
export const STEPS = {
  MENU: 'menu',
  CHOOSE_SERVICE: 'choose_service',
  ASK_NAME: 'ask_name',
  CHOOSE_PROFESSIONAL: 'choose_professional',
  CHOOSE_DATE: 'choose_date',
  CHOOSE_TIME: 'choose_time',
  CONFIRM_CANCEL: 'confirm_cancel',
  CONFIRM_RESCHEDULE: 'confirm_reschedule',
  VIEW_SERVICES: 'view_services',
} as const;

export type StepKey = keyof typeof STEPS;
export type StepValue = (typeof STEPS)[StepKey];

/**
 * Opções padrão do menu do bot.
 */
export interface MenuOption {
  order: number;
  label: string;
  emoji: string;
  handler: string;
}

/**
 * Shape of bot config messages.
 */
export interface BotConfig {
  welcome_header: string;
  ask_name_message: string;
  attendant_message: string;
  confirmation_message: string;
  reminder_message: string;
  invalid_option_message: string;
  session_expired_message: string;
  end_session_message: string;
  name_validation_message: string;
  no_slots_message: string;
  cancel_no_appointments_message: string;
  cancel_list_message: string;
  cancel_success_message: string;
  reschedule_no_appointments_message: string;
  reschedule_list_message: string;
  reschedule_success_message: string;
  promotions_message: string;
  instagram_message: string;
  politica_message: string;
  /** Calculados pelo vocabulário do segmento (fase 6), não ficam no banco. */
  choose_professional_title?: string;
  no_professionals_message?: string;
}

/**
 * Mensagens padrão do bot (usadas quando não há configuração no banco).
 */
/** Texto de promoções que o sistema enviava por padrão, com desconto que o negócio nunca definiu. */
export const PROMOCOES_PADRAO_ANTIGO =
  '🎉 *Promoções e Ofertas Especiais!*\n\n✨ *Desconto de 10%* em todos os serviços para clientes frequentes!\n\n💝 *Promoção do Mês:* combo de serviços com preço especial\n(Válido até o final do mês)\n\n🎁 *Indique um amigo* e ganhe 5% em seu próximo atendimento!\n\nPara aproveitar as promoções, agende agora!';

/**
 * Textos padrão anteriores que podem estar gravados no banco. Se o valor salvo for exatamente igual,
 * o dono nunca editou: a leitura devolve o padrão atual (Promoções volta vazio).
 */
export const PADROES_ANTIGOS: Partial<Record<keyof BotConfig, string>> = {
  welcome_header: 'Olá 👋 Bem-vindo!\n\nSou o assistente virtual de {nome_negocio} 🤖 e estou aqui para agilizar seu atendimento.\n\nComo posso ajudar hoje?',
  attendant_message: 'Um atendente entrará em contato em breve! 👨‍💼',
  cancel_no_appointments_message: '📋 Você não tem agendamentos próximos para cancelar.\n\nSe deseja agendar, escolha a opção 1️⃣',
  reschedule_no_appointments_message: '📋 Você não tem agendamentos para reagendar.\n\nSe deseja agendar, escolha a opção 1️⃣',
  instagram_message: '📱 *Nos acompanhe no Instagram!*\n\n🎨 Veja nossos trabalhos, dicas de estilo e tendências!\n\n👉 {instagram_handle}\n\n📸 Siga-nos para:\n✨ Ver nossos trabalhos mais recentes\n💡 Receber dicas de beleza\n🎯 Acompanhar promoções exclusivas\n\n📲 Clique no link para nos seguir!',
  promotions_message: PROMOCOES_PADRAO_ANTIGO,
};

export const DEFAULT_BOT_CONFIG: BotConfig = {
  welcome_header: 'Olá 👋 Que bom ter você aqui!\n\nSou o assistente virtual de {nome_negocio} 🤖.\n\nComo posso ajudar hoje?',
  ask_name_message: 'Vejo que é sua primeira vez aqui! 😊\n\nQual o seu *nome completo*?',
  attendant_message: 'Nossa equipe vai falar com você em breve! 💬',
  confirmation_message: '✅ Seu horário foi agendado com sucesso!\n\n📋 Serviço: {servico}\n👤 Profissional: {profissional}\n📅 Data: {data}\n⏰ Horário: {horario}\n💰 Valor: R$ {valor}\n\nAté lá! 👋',
  reminder_message: '⏰ Lembrete!\n\nOlá {nome_cliente}!\n\nSeu horário é daqui a 2 horas:\n📋 {servico}\n👤 Profissional: {profissional}\n⏰ {horario}\n\nTe esperamos!',
  invalid_option_message: 'Opção inválida. Por favor, escolha um número da lista.',
  session_expired_message: '⏰ Sua sessão expirou por inatividade.\n\nDigite qualquer coisa para começar novamente.',
  end_session_message: '✅ Atendimento encerrado.\n\nSe precisar novamente, é só mandar uma nova mensagem.',
  name_validation_message: 'Por favor, digite seu nome completo para continuarmos.\n\n0️⃣ Ou digite 0 para voltar ao menu de atendimento',
  no_slots_message: 'Infelizmente não há horários disponíveis com este profissional nesta data. Escolha outra data ou outro profissional.\n\n0️⃣ Voltar ao menu de atendimento',
  cancel_no_appointments_message: '📋 Você não tem agendamentos próximos para cancelar.\n\nSe quiser marcar um horário, volte ao menu.',
  cancel_list_message: '❌ Seus agendamentos próximos:',
  cancel_success_message: '✅ Seu agendamento foi cancelado com sucesso!\n\nSe deseja remarcar ou agende um novo horário.',
  reschedule_no_appointments_message: '📋 Você não tem agendamentos para reagendar.\n\nSe quiser marcar um horário, volte ao menu.',
  reschedule_list_message: '🔄 Seus agendamentos disponíveis para reagendamento:',
  reschedule_success_message: '✅ Seu horário foi remarcado!\n\n📋 Serviço: {servico}\n👤 Profissional: {profissional}\n📅 Data: {data}\n⏰ Horário: {horario}\n\nAté lá! 👋',
  promotions_message: '',
  instagram_message: '📱 *Nos acompanhe no Instagram!*\n\n👉 {instagram_handle}\n\nVeja nossos trabalhos mais recentes e novidades.',
  politica_message: '',
};

/** Fecha as respostas de agendamento do simulador: nada foi gravado de verdade. */
export const AVISO_TESTE = '🧪 Teste: nada foi agendado.';
