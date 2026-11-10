import api from '@/lib/api';

// Espelho de backend/src/services/whatsapp/whatsappTextos.ts.

export type CaminhoTexto =
  | 'geral' | 'schedule' | 'view_services' | 'manage' | 'promotions' | 'instagram'
  | 'attendant' | 'cancel' | 'reschedule' | 'end_session';

export interface TextoDto {
  chave: string;
  caminho: CaminhoTexto;
  rotulo: string;
  /** Variáveis (sem chaves) que funcionam neste texto. */
  variaveis: string[];
  /** Variáveis cuja remoção merece aviso. */
  importantes?: string[];
  permiteVazio?: boolean;
  max?: number;
  valor: string;
  padrao: string;
  personalizado: boolean;
}

export const LIMITE_TEXTO_PADRAO = 2000;

export const listarTextos = async (): Promise<TextoDto[]> => {
  const { data } = await api.get<TextoDto[]>('/whatsapp/config/textos');
  return Array.isArray(data) ? data : [];
};

/** `null` devolve o texto ao padrão. Devolve a lista atualizada. */
export const salvarTextos = async (textos: Record<string, string | null>): Promise<TextoDto[]> => {
  const { data } = await api.put<TextoDto[]>('/whatsapp/config/textos', { textos });
  return Array.isArray(data) ? data : [];
};

export const DESCRICAO_OPCAO: Record<string, string> = {
  schedule: 'Marca um horário pelo WhatsApp',
  view_services: 'Mostra seus serviços e preços',
  manage: 'Remarca ou cancela um agendamento',
  cancel: 'Cancela um agendamento',
  reschedule: 'Remarca um agendamento',
  promotions: 'Mostra suas promoções',
  instagram: 'Mostra seu perfil do Instagram',
  attendant: 'Chama sua equipe na central de conversas',
  end_session: 'Encerra a conversa',
};

/** Nome amigável de cada variável, usado nos botões de inserir. */
export const ROTULO_VARIAVEL: Record<string, string> = {
  nome_negocio: 'Nome do negócio',
  nome_cliente: 'Nome de quem agenda',
  servico: 'Serviço',
  profissional: 'Profissional',
  data: 'Data',
  horario: 'Horário',
  valor: 'Valor',
  horario_atendimento: 'Horário de atendimento',
  hora_fechamento: 'Hora de fechamento',
  instagram_handle: 'Perfil do Instagram',
  valor_sinal: 'Valor do sinal',
  prazo: 'Prazo para pagar (minutos)',
  link_pagamento: 'Link de pagamento',
};

export const rotuloVariavel = (nome: string): string => ROTULO_VARIAVEL[nome] ?? nome;

const EXEMPLO: Record<string, string> = {
  nome_negocio: 'Studio Aurora',
  nome_cliente: 'Mariana',
  servico: 'Corte',
  profissional: 'Camila',
  data: '12/11',
  horario: '14:00',
  valor: '60,00',
  horario_atendimento: '09:00 às 18:00',
  hora_fechamento: '18:00',
  instagram_handle: '@studioaurora',
  valor_sinal: '15,00',
  prazo: '15',
  link_pagamento: 'https://pagamento.exemplo/abc',
};

/** Texto com os dados de exemplo no lugar das variáveis. Variável desconhecida fica como está. */
export const previaTexto = (texto: string): string =>
  texto.replace(/\{([a-z_]+)\}/g, (inteiro, nome: string) => EXEMPLO[nome] ?? inteiro);

/** Variáveis `{nome}` presentes no texto, sem repetição. */
export const variaveisUsadas = (texto: string): string[] =>
  [...new Set([...texto.matchAll(/\{([a-z_]+)\}/g)].map((m) => m[1]))];

/** Textos que aparecem ao abrir uma opção do menu, na ordem do catálogo. Personalizada: sem textos próprios. */
export const textosDaOpcao = (handler: string | null, textos: TextoDto[]): TextoDto[] => {
  if (!handler) return [];
  // Textos do fluxo antigo (lista, escolha e confirmação) que vivem no caminho 'manage' mas também aparecem nele.
  const extra: Record<string, string[]> = {
    cancel: ['cancel_success_message', 'appointment_inactive_message', 'cancel_failed_message', 'list_error_message'],
    reschedule: [
      'new_date_title',
      'reschedule_success_message',
      'reschedule_inactive_message',
      'reschedule_failed_message',
      'list_error_message',
    ],
  };
  const chavesExtras = extra[handler] ?? [];
  return textos.filter((t) => t.caminho === handler || chavesExtras.includes(t.chave));
};

export const textosGerais = (textos: TextoDto[]): TextoDto[] => textos.filter((t) => t.caminho === 'geral');
