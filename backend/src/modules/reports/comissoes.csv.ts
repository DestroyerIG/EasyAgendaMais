import { linhaCsv } from '../crm/csv.js';
import type { comissoesService } from './comissoes.service.js';

// CSV de comissões para o contador (";" e decimais com vírgula, com BOM, como o de clientes).

type Apuracao = Awaited<ReturnType<typeof comissoesService.apuracao>>;

const br = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}`;
const STATUS: Record<string, string> = { pendente: 'Pendente', pago: 'Pago', sem_valor: 'Sem valor' };
export const AVISO_SALAO_PARCEIRO =
  'Na parceria salão-parceiro, a cota-parte da profissional não entra na receita bruta do salão (Lei 13.352/2016). Confirme o enquadramento com seu contador.';

export function comissoesCsv(a: Apuracao): string {
  const parceiro = a.modelo === 'salao_parceiro';
  const linhas = [
    linhaCsv([`Comissões de ${br(a.periodo.inicio)} a ${br(a.periodo.fim)}`, parceiro ? 'Salão-parceiro' : 'Comissão tradicional']),
    linhaCsv([
      'Profissional', 'CNPJ', 'Atendimentos', 'Serviços', 'Produtos', 'Faturamento',
      parceiro ? 'Cota do salão' : 'Fica com o salão', parceiro ? 'Cota da profissional' : 'Comissão',
      'Gorjetas', 'Adiantamentos', 'A pagar', 'Status',
    ]),
  ];
  for (const i of a.itens) {
    linhas.push(linhaCsv([
      i.professional.nome, i.professional.cnpj, String(i.atendimentos), i.servicos, i.produtos, i.faturamento,
      i.cotaSalao, i.comissao, i.gorjetas, i.adiantamentos, i.aPagar, STATUS[i.status] ?? i.status,
    ]));
  }
  const t = a.totais;
  linhas.push(linhaCsv(['Total', null, null, null, null, t.faturamento, t.cotaSalao, t.cotaProfissionais, t.gorjetas, null, null, null]));
  if (parceiro) linhas.push('', linhaCsv([AVISO_SALAO_PARCEIRO]));
  return '﻿' + linhas.join('\r\n') + '\r\n';
}
