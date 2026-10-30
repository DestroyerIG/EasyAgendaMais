import type { SegmentoAdmin, StatusAdmin, TipoAlerta } from '@/types/admin';

// Rótulos do SuperAdmin. Os mesmos textos do CSV do backend (painel.service).

export const ROTULO_STATUS: Record<StatusAdmin, string> = {
  ativo: 'Ativo',
  teste: 'Teste',
  carencia: 'Em carência',
  bloqueado_cobranca: 'Bloqueado por cobrança',
  teste_encerrado: 'Teste encerrado',
  bloqueado_admin: 'Bloqueado pelo admin',
  cancelado: 'Cancelado',
};

export const ROTULO_PLANO: Record<string, string> = {
  basico: 'Solo',
  profissional: 'Equipe',
  premium: 'Salão',
};

export const ROTULO_SEGMENTO: Record<SegmentoAdmin, string> = {
  barbearia: 'Barbearia',
  unhas: 'Unhas',
  cilios_sobrancelhas: 'Cílios e sobrancelhas',
  cabelo: 'Cabelo',
  estetica: 'Estética',
  outro: 'Outro',
};

export const SEGMENTOS_ADMIN = Object.keys(ROTULO_SEGMENTO) as SegmentoAdmin[];
export const STATUS_ADMIN = Object.keys(ROTULO_STATUS) as StatusAdmin[];
export const PLANOS_ADMIN = Object.keys(ROTULO_PLANO);

const tem = (mapa: Record<string, string>, chave: string) => Object.prototype.hasOwnProperty.call(mapa, chave);

/** Plano fora do catálogo aparece com o próprio id. */
export const rotuloPlano = (plano: string): string => (tem(ROTULO_PLANO, plano) ? ROTULO_PLANO[plano] : plano);

/** Segmento fora da lista aparece com o próprio id. */
export const rotuloSegmento = (segmento: string): string =>
  tem(ROTULO_SEGMENTO, segmento) ? ROTULO_SEGMENTO[segmento as SegmentoAdmin] : segmento;

export const rotuloStatus = (status: string): string =>
  tem(ROTULO_STATUS, status) ? ROTULO_STATUS[status as StatusAdmin] : status;

const MENSAGEM_ALERTA: Record<TipoAlerta, string> = {
  cobranca:
    'Oi, {dono}! Aqui é do EasyAgenda+. A mensalidade do {negocio} ainda não foi confirmada. Quer ajuda para regularizar? Dá para pagar pelo Pix direto no painel.',
  teste_sem_onboarding:
    'Oi, {dono}! Aqui é do EasyAgenda+. O teste grátis do {negocio} termina em breve e a configuração ainda não foi concluída. Quer ajuda para terminar?',
  whatsapp:
    'Oi, {dono}! Aqui é do EasyAgenda+. O WhatsApp do {negocio} está desconectado, então os lembretes não estão saindo. Quer ajuda para reconectar?',
  sem_agendamento:
    'Oi, {dono}! Aqui é do EasyAgenda+. O {negocio} não registra agendamentos há alguns dias. Está tudo certo por aí? Podemos ajudar?',
};

/**
 * Mensagem de WhatsApp para o dono do negócio em risco. Usa só o primeiro nome do dono; sem
 * nome, a saudação vira "Oi!". Os nomes entram com função de substituição para que `$&` ou `$$`
 * no nome continuem sendo texto.
 */
export function mensagemAlerta(tipo: TipoAlerta, dono: string, negocio: string): string {
  const primeiroNome = dono.trim().split(/\s+/)[0] ?? '';
  const modelo = primeiroNome ? MENSAGEM_ALERTA[tipo] : MENSAGEM_ALERTA[tipo].replace('Oi, {dono}!', 'Oi!');
  return modelo.replace(/\{(dono|negocio)\}/g, (_m, chave: string) => (chave === 'dono' ? primeiroNome : negocio));
}
