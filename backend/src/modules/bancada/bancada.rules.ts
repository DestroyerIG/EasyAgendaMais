// Regras puras do app da profissional (fase 5).

const centavos = (v: number) => Math.round(v * 100);
const reais = (c: number) => c / 100;

/** "HH:MM" agora, no fuso do negócio. */
export const horaNoFuso = (agora: Date, timezone: string): string =>
  new Intl.DateTimeFormat('en-GB', { timeZone: timezone, hour: '2-digit', minute: '2-digit', hour12: false }).format(agora);

export interface ItemAgenda { id: string; time: string; status: string }

/**
 * A cliente em destaque na bancada: quem está em atendimento; senão a próxima confirmada
 * (ou aguardando o sinal) a partir de agora; senão nenhuma.
 */
export function escolherProxima<T extends ItemAgenda>(agenda: T[], agora: string): T | null {
  const ordenada = [...agenda].sort((a, b) => a.time.localeCompare(b.time));
  return ordenada.find((a) => a.status === 'em_atendimento')
    ?? ordenada.find((a) => ['confirmado', 'aguardando_pagamento'].includes(a.status) && a.time >= agora)
    ?? null;
}

/** "Faltam 20 min", "Agora" ou null (já passou). */
export function minutosAte(hora: string, agora: string): number {
  const m = (h: string) => Number(h.slice(0, 2)) * 60 + Number(h.slice(3, 5));
  return m(hora) - m(agora);
}

export interface AlvoAlteracao { status: string; date: string; time: string }

/** Reagendar: só confirmado (como no painel), de hoje em diante e que ainda não passou. */
export function motivoParaNaoReagendar(a: AlvoAlteracao, hoje: string, agora: string): string | null {
  if (a.status !== 'confirmado') return 'Só dá para reagendar um horário confirmado que ainda não começou';
  if (a.date < hoje || (a.date === hoje && a.time < agora)) return 'Este horário já passou';
  return null;
}

/** Cancelar: confirmado ou aguardando o sinal, de hoje em diante. */
export function motivoParaNaoCancelar(a: AlvoAlteracao, hoje: string): string | null {
  if (!['confirmado', 'aguardando_pagamento'].includes(a.status)) return 'Este agendamento não pode mais ser cancelado';
  if (a.date < hoje) return 'Este horário já passou';
  return null;
}

export function novoHorarioValido(data: string, hora: string, hoje: string, agora: string): string | null {
  if (data < hoje || (data === hoje && hora <= agora)) return 'Escolha um horário a partir de agora';
  return null;
}

export interface ItemExtrato { kind: string; commissionAmount: number }

/** O que a comanda rendeu para a profissional: comissão de serviço, de produto e a gorjeta inteira. */
export function parteDaProfissional(itens: ItemExtrato[], gorjeta: number) {
  let servico = 0;
  let produto = 0;
  for (const i of itens) {
    if (i.kind === 'produto') produto += centavos(i.commissionAmount);
    else servico += centavos(i.commissionAmount);
  }
  const g = centavos(gorjeta);
  return { servico: reais(servico), produto: reais(produto), gorjeta: reais(g), total: reais(servico + produto + g) };
}

export interface NotaAvaliacao { rating: number }

export function resumoAvaliacoes(notas: NotaAvaliacao[]): { media: number | null; quantidade: number } {
  if (notas.length === 0) return { media: null, quantidade: 0 };
  const soma = notas.reduce((t, n) => t + n.rating, 0);
  return { media: Math.round((soma / notas.length) * 10) / 10, quantidade: notas.length };
}

const dataBr = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;
const primeiro = (nome: string) => nome.split(' ')[0] || nome;

export function textoReagendado(d: { cliente: string; negocio: string; servico: string; data: string; hora: string }): string {
  return `Olá, ${primeiro(d.cliente)}! Seu horário de ${d.servico} no ${d.negocio} mudou para ${dataBr(d.data)} às ${d.hora}. Se não puder, é só responder esta mensagem.`;
}

export function textoCancelado(d: { cliente: string; negocio: string; servico: string; data: string; hora: string }): string {
  return `Olá, ${primeiro(d.cliente)}! Seu horário de ${d.servico} no ${d.negocio} em ${dataBr(d.data)} às ${d.hora} foi cancelado. Responda esta mensagem para marcar um novo horário.`;
}

export const MOTIVOS_CANCELAMENTO = ['Imprevisto da profissional', 'Pedido da cliente', 'Horário marcado errado', 'Outro'] as const;
