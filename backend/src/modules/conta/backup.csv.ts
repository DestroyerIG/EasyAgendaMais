import { linhaCsv } from '../crm/csv.js';

// CSVs do backup da conta: ";" como separador, decimais com vírgula e BOM, como o de comissões.

type Campo = string | number | null;
type Num = number | string | { toString(): string } | null | undefined;

const BOM = '﻿';
const FUSO = 'America/Sao_Paulo';

const montar = (cabecalho: string[], linhas: Campo[][]): string =>
  BOM + [linhaCsv(cabecalho), ...linhas.map(linhaCsv)].join('\r\n') + '\r\n';

const dinheiro = (v: Num): number | null => (v === null || v === undefined ? null : Number(v.toString()));

// Colunas @db.Date chegam como meia-noite UTC: o dia é o da própria data.
const dia = (d: Date | null | undefined): string | null => {
  if (!d) return null;
  const iso = d.toISOString();
  return `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
};
const hora = (d: Date | null | undefined): string | null => (d ? d.toISOString().slice(11, 16) : null);

const FORMATO = new Intl.DateTimeFormat('pt-BR', { timeZone: FUSO, day: '2-digit', month: '2-digit', year: 'numeric' });
const FORMATO_HORA = new Intl.DateTimeFormat('pt-BR', {
  timeZone: FUSO, day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false,
});
const momento = (d: Date | null | undefined): string | null => (d ? FORMATO_HORA.format(d).replace(', ', ' ') : null);
const dataLocal = (d: Date | null | undefined): string | null => (d ? FORMATO.format(d) : null);

const sim = (v: boolean): string => (v ? 'Sim' : 'Não');

const STATUS_AGENDAMENTO: Record<string, string> = {
  confirmado: 'Confirmado', pendente: 'Pendente', concluido: 'Concluído', cancelado: 'Cancelado', faltou: 'Faltou',
};
const STATUS_COMANDA: Record<string, string> = { rascunho: 'Rascunho', aberta: 'Aberta', fechada: 'Fechada', cancelada: 'Cancelada' };
const TIPO_ITEM: Record<string, string> = { service: 'Serviço', servico: 'Serviço', product: 'Produto', produto: 'Produto' };
const PAGAMENTO: Record<string, string> = {
  pix: 'Pix', dinheiro: 'Dinheiro', cartao: 'Cartão', credito: 'Cartão de crédito', debito: 'Cartão de débito',
};
const TIPO_MOVIMENTO: Record<string, string> = { sangria: 'Sangria', suprimento: 'Suprimento', reforco: 'Reforço', venda: 'Venda' };
const rotulo = (mapa: Record<string, string>, v: string | null | undefined): string | null => (v ? (mapa[v] ?? v) : null);

export interface ClienteLinha { name: string; phone: string; email: string | null; birthDate: Date | null; createdAt: Date }
export const clientesCsv = (l: ClienteLinha[]): string =>
  montar(['Nome', 'Telefone', 'E-mail', 'Aniversário', 'Cadastrada em'],
    l.map((c) => [c.name, c.phone, c.email, dia(c.birthDate), dataLocal(c.createdAt)]));

export interface AgendamentoLinha {
  date: Date; time: Date; status: string; source: string; depositAmount: Num;
  client: { name: string }; professional: { name: string }; service: { name: string; price: Num };
}
export const agendamentosCsv = (l: AgendamentoLinha[]): string =>
  montar(['Data', 'Hora', 'Cliente', 'Profissional', 'Serviço', 'Valor do serviço', 'Sinal', 'Situação', 'Origem'],
    l.map((a) => [dia(a.date), hora(a.time), a.client.name, a.professional.name, a.service.name,
      dinheiro(a.service.price), dinheiro(a.depositAmount), rotulo(STATUS_AGENDAMENTO, a.status), a.source]));

export interface ServicoLinha { name: string; price: Num; durationMinutes: number; depositPercentage: Num; active: boolean }
export const servicosCsv = (l: ServicoLinha[]): string =>
  montar(['Serviço', 'Preço', 'Duração (min)', 'Sinal (%)', 'Ativo'],
    l.map((s) => [s.name, dinheiro(s.price), String(s.durationMinutes), dinheiro(s.depositPercentage), sim(s.active)]));

export interface ProfissionalLinha {
  name: string; especialidade: string | null; cnpj: string | null;
  commissionServicePct: Num; commissionProductPct: Num; active: boolean;
}
export const profissionaisCsv = (l: ProfissionalLinha[]): string =>
  montar(['Nome', 'Especialidade', 'CNPJ', 'Comissão de serviços (%)', 'Comissão de produtos (%)', 'Ativa'],
    l.map((p) => [p.name, p.especialidade, p.cnpj, dinheiro(p.commissionServicePct), dinheiro(p.commissionProductPct), sim(p.active)]));

export interface ComandaItemLinha {
  name: string; kind: string; unitPrice: Num; quantity: number;
  comanda: {
    number: number; status: string; closedAt: Date | null; createdAt: Date; paymentMethod: string | null; totalCharged: Num;
    client: { name: string }; professional: { name: string };
  };
}
export const comandasCsv = (l: ComandaItemLinha[]): string =>
  montar(
    ['Comanda', 'Data', 'Cliente', 'Profissional', 'Situação', 'Item', 'Tipo', 'Quantidade', 'Preço unitário', 'Forma de pagamento', 'Total da comanda'],
    l.map((i) => [String(i.comanda.number), dataLocal(i.comanda.closedAt ?? i.comanda.createdAt), i.comanda.client.name,
      i.comanda.professional.name, rotulo(STATUS_COMANDA, i.comanda.status), i.name, rotulo(TIPO_ITEM, i.kind),
      String(i.quantity), dinheiro(i.unitPrice), rotulo(PAGAMENTO, i.comanda.paymentMethod), dinheiro(i.comanda.totalCharged)]),
  );

export interface SessaoCaixaLinha {
  date: Date; openedAt: Date; openingBalance: Num; closedAt: Date | null;
  countedBalance: Num; expectedBalance: Num; difference: Num; notes: string | null;
}
export interface MovimentoCaixaLinha { kind: string; amount: Num; description: string; createdAt: Date }

// Sessões (abertura/fechamento do dia) e movimentos no mesmo arquivo, em ordem de data.
export const caixaCsv = (sessoes: SessaoCaixaLinha[], movimentos: MovimentoCaixaLinha[]): string => {
  const linhas: Array<{ ordem: number; campos: Campo[] }> = [
    ...sessoes.map((s) => ({
      ordem: s.openedAt.getTime(),
      campos: ['Caixa do dia', momento(s.openedAt), dia(s.date), dinheiro(s.openingBalance), dinheiro(s.expectedBalance),
        dinheiro(s.countedBalance), dinheiro(s.difference), s.notes] as Campo[],
    })),
    ...movimentos.map((m) => ({
      ordem: m.createdAt.getTime(),
      campos: [rotulo(TIPO_MOVIMENTO, m.kind) ?? 'Movimento', momento(m.createdAt), m.description, dinheiro(m.amount), null, null, null, null] as Campo[],
    })),
  ].sort((a, b) => a.ordem - b.ordem);
  return montar(
    ['Registro', 'Data e hora', 'Descrição ou dia', 'Valor ou saldo inicial', 'Saldo esperado', 'Saldo contado', 'Diferença', 'Observações'],
    linhas.map((x) => x.campos),
  );
};

export interface DespesaLinha { date: Date; description: string; category: string; amount: Num; paymentMethod: string | null }
export const despesasCsv = (l: DespesaLinha[]): string =>
  montar(['Data', 'Descrição', 'Categoria', 'Valor', 'Forma de pagamento'],
    l.map((d) => [dia(d.date), d.description, d.category, dinheiro(d.amount), rotulo(PAGAMENTO, d.paymentMethod)]));
