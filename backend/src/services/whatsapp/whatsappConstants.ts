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
  /** Mensagem informativa (promoções, Instagram, opção personalizada): só aceita voltar ao menu. */
  INFO: 'info',
  MANAGE_CHOOSE: 'manage_choose',
  MANAGE_ACTION: 'manage_action',
  /** Pré-reserva criada: espera o pagamento do sinal (Pix ou link). */
  AWAITING_DEPOSIT: 'awaiting_deposit',
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
  manage_list_message: string;
  manage_no_appointments_message: string;
  manage_action_message: string;
  promotions_message: string;
  instagram_message: string;
  politica_message: string;
  /** Padrão vem do vocabulário do segmento (fase 6); o texto editado fica em `textos_extras`. */
  choose_professional_title: string;
  no_professionals_message: string;
  /** Daqui em diante não há coluna própria: o texto editado fica em `textos_extras`. */
  services_list_title: string;
  no_services_message: string;
  no_services_available_message: string;
  name_greeting_message: string;
  choose_service_title: string;
  choose_date_title: string;
  closed_day_message: string;
  choose_time_title: string;
  walkin_notice: string;
  slot_taken_message: string;
  booking_failed_message: string;
  new_date_title: string;
  reschedule_inactive_message: string;
  reschedule_failed_message: string;
  appointment_inactive_message: string;
  list_error_message: string;
  out_of_hours_message: string;
  today_hours_message: string;
  paused_message: string;
  invalid_list_choice_message: string;
  service_selected_message: string;
  professional_selected_message: string;
  cancel_list_hint: string;
  reschedule_list_hint: string;
  cancel_failed_message: string;
  deposit_request_message: string;
  deposit_checkout_message: string;
  deposit_waiting_message: string;
  deposit_expired_message: string;
  deposit_cancelled_message: string;
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
  cancel_no_appointments_message: '📋 Você não tem agendamentos próximos para cancelar.\n\nSe deseja agendar, escolha a opção *1*',
  reschedule_no_appointments_message: '📋 Você não tem agendamentos para reagendar.\n\nSe deseja agendar, escolha a opção *1*',
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
  name_validation_message: 'Por favor, digite seu nome completo para continuarmos.\n\n*0* • ↩️ Ou digite 0 para voltar ao menu de atendimento',
  no_slots_message: 'Infelizmente não há horários disponíveis com este profissional nesta data. Escolha outra data ou outro profissional.\n\n*0* • ↩️ Voltar ao menu de atendimento',
  cancel_no_appointments_message: '📋 Você não tem agendamentos próximos para cancelar.\n\nSe quiser marcar um horário, volte ao menu.',
  cancel_list_message: '❌ Seus agendamentos próximos:',
  cancel_success_message: '✅ Seu agendamento foi cancelado com sucesso!\n\nSe deseja remarcar ou agende um novo horário.',
  reschedule_no_appointments_message: '📋 Você não tem agendamentos para reagendar.\n\nSe quiser marcar um horário, volte ao menu.',
  reschedule_list_message: '🔄 Seus agendamentos disponíveis para reagendamento:',
  reschedule_success_message: '✅ Seu horário foi remarcado!\n\n📋 Serviço: {servico}\n👤 Profissional: {profissional}\n📅 Data: {data}\n⏰ Horário: {horario}\n\nAté lá! 👋',
  manage_list_message: '🔄 Seus agendamentos:',
  manage_no_appointments_message: '📋 Você não tem agendamentos próximos.',
  manage_action_message: 'O que deseja fazer com o agendamento de {data} às {horario}?\n\n*1* • 🔄 Remarcar\n*2* • ❌ Cancelar\n\n*0* • ↩️ Voltar ao menu',
  promotions_message: '',
  instagram_message: '📱 *Nos acompanhe no Instagram!*\n\n👉 {instagram_handle}\n\nVeja nossos trabalhos mais recentes e novidades.',
  politica_message: '',
  choose_professional_title: 'Escolha o profissional',
  no_professionals_message: 'Desculpe, não há profissionais disponíveis no momento.',
  services_list_title: 'Nossos serviços',
  no_services_message: 'Não há serviços cadastrados no momento.',
  no_services_available_message: 'Desculpe, não há serviços disponíveis no momento.',
  name_greeting_message: '✅ Olá, *{nome_cliente}*!',
  choose_service_title: 'Escolha o serviço',
  choose_date_title: 'Escolha a data',
  closed_day_message: 'Hoje não estamos atendendo. Escolha outro dia.',
  choose_time_title: 'Horários disponíveis',
  walkin_notice: 'Também aceitamos encaixes durante o horário de atendimento.',
  slot_taken_message: '⚠️ Este horário acabou de ser reservado. Por favor, escolha outro horário.',
  booking_failed_message: '⚠️ Não consegui confirmar seu agendamento agora. Por favor, tente novamente em instantes.',
  new_date_title: '📅 Escolha a nova data para reagendar:',
  reschedule_inactive_message: '⚠️ Esse agendamento não está mais ativo, então não consegui remarcar.',
  reschedule_failed_message: '⚠️ Não consegui remarcar seu agendamento agora. Por favor, tente novamente em instantes.',
  appointment_inactive_message: 'Esse agendamento não está mais ativo.',
  list_error_message: 'Desculpe, ocorreu um erro ao listar os agendamentos. Tente novamente mais tarde.',
  out_of_hours_message: 'Olá! Nosso horário de atendimento é das {horario_atendimento}. Sua mensagem foi recebida e retornaremos dentro do nosso expediente.',
  today_hours_message: 'Hoje atendemos até as {hora_fechamento}.',
  paused_message: 'A agenda online está pausada no momento. Fale direto com {nome_negocio} pelo WhatsApp.',
  invalid_list_choice_message: 'Opção inválida. Por favor, escolha um número válido.',
  service_selected_message: '✅ *{servico}* selecionado!',
  professional_selected_message: '✅ *{profissional}* selecionado!',
  cancel_list_hint: '⚠️ Clique no número do agendamento para cancelar ou digite *0* para voltar ao menu de atendimento',
  reschedule_list_hint: '👉 Clique no número para reagendar ou digite *0* para voltar ao menu de atendimento',
  cancel_failed_message: 'Desculpe, ocorreu um erro ao cancelar o agendamento. Tente novamente.',
  deposit_request_message: '⏳ Sua vaga para {servico} está pré-reservada por {prazo} min! Para garantir, pague o sinal de R$ {valor_sinal} pelo Pix. O código vem na próxima mensagem 👇',
  deposit_checkout_message: '⏳ Sua vaga para {servico} está pré-reservada por {prazo} min! Para garantir, pague o sinal de R$ {valor_sinal} neste link: {link_pagamento}',
  deposit_waiting_message: 'Ainda estamos aguardando o pagamento do sinal. Sua vaga fica reservada por até {prazo} min. Se você já pagou, é só aguardar a confirmação, que chega por aqui.\n\n*0* • ❌ Cancelar a pré-reserva',
  deposit_expired_message: '⏰ O prazo para pagar o sinal acabou e o horário foi liberado. Se você já fez o pagamento, responda aqui que {nome_negocio} confere para você. Quer agendar de novo? É só mandar um oi.',
  deposit_cancelled_message: 'Pré-reserva cancelada. Quando quiser, é só mandar um oi.',
};

/** Fecha as respostas de agendamento do simulador: nada foi gravado de verdade. */
export const AVISO_TESTE = '🧪 Teste: nada foi agendado.';
