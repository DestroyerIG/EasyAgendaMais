export type Direcao = 'in' | 'out';
export type Origem = 'cliente' | 'bot' | 'lembrete' | 'confirmacao' | 'pix_recibo' | 'lista_espera'
  | 'manual_painel' | 'manual_celular' | 'sistema' | 'painel_evento';
export type StatusMensagem = 'recebida' | 'enviada' | 'entregue' | 'lida' | 'falhou';
export type Atendimento = 'bot' | 'humano';
export type StatusConversa = 'aberta' | 'aguardando' | 'finalizada';
export const LIMITE_DIARIO = 250;
export const HORAS_VOLTA_ROBO = 12;
export const HORAS_FINALIZAR_ROBO = 24;
export const DIAS_RETENCAO = 180;
