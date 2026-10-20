import type { Origem, StatusMensagem } from './inbox.types.js';

const semAcento = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '');
const PALAVRAS_SAIR = new Set(['sair', 'parar', 'stop', 'descadastrar']);

export function detectarPalavraChave(texto: string | null | undefined): 'sair' | 'voltar' | null {
  if (!texto) return null;
  const t = semAcento(texto).toLowerCase().trim().replace(/^[^a-z]+|[^a-z]+$/g, '');
  if (PALAVRAS_SAIR.has(t)) return 'sair';
  if (t === 'voltar') return 'voltar';
  return null;
}

const MIDIAS: Record<string, { mediaType: string; marcador: string }> = {
  imageMessage: { mediaType: 'imagem', marcador: '[Foto]' },
  audioMessage: { mediaType: 'audio', marcador: '[Áudio]' },
  pttMessage: { mediaType: 'audio', marcador: '[Áudio]' },
  videoMessage: { mediaType: 'video', marcador: '[Vídeo]' },
  documentMessage: { mediaType: 'documento', marcador: '[Documento]' },
  documentWithCaptionMessage: { mediaType: 'documento', marcador: '[Documento]' },
  stickerMessage: { mediaType: 'figurinha', marcador: '[Figurinha]' },
};
export const marcadorMidia = (t: string | null | undefined) => (t && MIDIAS[t]) || null;

export const previa = (texto: string) => texto.replace(/\s+/g, ' ').trim().slice(0, 160);

const AUTOMATICAS = new Set<Origem>(['lembrete', 'confirmacao', 'lista_espera', 'retorno']);
export const ehAutomatica = (o: Origem) => AUTOMATICAS.has(o);

export function grupoEnvio(o: Origem): 'automaticas' | 'pix' | 'manuais' | null {
  if (o === 'lembrete' || o === 'confirmacao' || o === 'lista_espera' || o === 'retorno') return 'automaticas';
  if (o === 'pix_recibo') return 'pix';
  if (o === 'manual_painel' || o === 'manual_celular' || o === 'bot') return 'manuais';
  return null;
}

export function saudeEnvios(envios: number, falhas: number): 'Excelente' | 'Boa' | 'Atenção' {
  if (envios <= 0) return 'Excelente';
  const taxa = falhas / envios;
  if (taxa < 0.02) return 'Excelente';
  if (taxa < 0.08) return 'Boa';
  return 'Atenção';
}

export function mascararTelefone(digitos: string): string {
  const d = digitos.replace(/\D/g, '');
  if (!d) return '';
  const local = d.startsWith('55') && d.length >= 12 ? d.slice(2) : d;
  const ddd = local.slice(0, 2);
  const numero = local.slice(2);
  return `+55 ${ddd} ${numero.slice(0, numero.length - 4)}-****`;
}

export function statusDeEntrega(raw: unknown): 'entregue' | 'lida' | null {
  const v = typeof raw === 'number' ? raw : String(raw ?? '').toUpperCase();
  if (v === 'DELIVERY_ACK' || v === 3) return 'entregue';
  if (v === 'READ' || v === 'PLAYED' || v === 4 || v === 5) return 'lida';
  return null;
}

const ORDEM: Record<StatusMensagem, number> = { falhou: -1, recebida: 0, enviada: 1, entregue: 2, lida: 3 };
export const avancaStatus = (atual: StatusMensagem, novo: 'entregue' | 'lida') => ORDEM[atual] >= 1 && ORDEM[novo] > ORDEM[atual];

const ROTULOS: Record<Origem, string> = {
  cliente: 'Mensagem da cliente', bot: 'Resposta do robô', lembrete: 'Lembrete de agendamento',
  confirmacao: 'Confirmação de agendamento', pix_recibo: 'Sinal Pix e recibo', lista_espera: 'Oferta da lista de espera',
  manual_painel: 'Resposta manual via painel', manual_celular: 'Mensagem pelo celular', sistema: 'Aviso do sistema',
  painel_evento: 'Evento do painel', retorno: 'Convite Hora de voltar',
};
export const rotuloOrigem = (o: Origem) => ROTULOS[o];
