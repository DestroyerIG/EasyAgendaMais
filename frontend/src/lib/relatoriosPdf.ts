import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { formatCurrency } from '@/lib/formatters';
import {
  type ApuracaoComissoes, type LinhaComissao, type VisaoGeral, type Evolucao,
  AVISO_SALAO_PARCEIRO, ROTULO_FORMA, dataBr, formatarCnpj, rotuloMes, rotuloPeriodo,
} from '@/lib/relatorios';
import { termosDe, type Termos } from '@/lib/vocabulario';

// PDFs das telas de Relatórios e Comissões, gerados no navegador como o relatório do Caixa.

type Doc = jsPDF & { lastAutoTable: { finalY: number } };
const LARANJA: [number, number, number] = [204, 133, 41];
const r$ = (v: number) => formatCurrency(v);
const pct = (v: number | null, sufixo = '%') => (v === null ? '—' : `${String(v).replace('.', ',')}${sufixo}`);

function cabecalho(doc: Doc, titulo: string, subtitulo: string) {
  doc.setFontSize(18);
  doc.setTextColor(255, 122, 0);
  doc.text(titulo, 14, 20);
  doc.setFontSize(10);
  doc.setTextColor(100);
  doc.text(subtitulo, 14, 27);
  doc.setTextColor(0);
}

const STATUS: Record<LinhaComissao['status'], string> = { pendente: 'Pendente', pago: 'Pago', sem_valor: 'Sem valor' };

export function pdfComissoes(a: ApuracaoComissoes, negocio: string, t: Termos = termosDe(null)) {
  const doc = new jsPDF({ orientation: 'landscape' }) as Doc;
  const parceiro = a.modelo === 'salao_parceiro';
  cabecalho(doc, `${negocio} — Comissões`, `${rotuloPeriodo(a.periodo)} · ${parceiro ? 'Salão-parceiro' : 'Comissão tradicional'}`);
  autoTable(doc, {
    startY: 34,
    head: [[t.prof.S, 'CNPJ', 'Atend.', 'Serviços', 'Produtos', parceiro ? 'Cota salão' : 'Fica no salão', parceiro ? 'Cota prof.' : 'Comissão', 'Gorjetas', 'Adiant.', 'A pagar', 'Status']],
    body: a.itens.map((i) => [
      i.professional.nome, formatarCnpj(i.professional.cnpj) ?? '—', String(i.atendimentos), r$(i.servicos), r$(i.produtos),
      r$(i.cotaSalao), r$(i.comissao), r$(i.gorjetas), i.adiantamentos ? `− ${r$(i.adiantamentos)}` : '—', r$(i.aPagar), STATUS[i.status],
    ]),
    foot: [['Total', '', '', '', '', r$(a.totais.cotaSalao), r$(a.totais.cotaProfissionais), r$(a.totais.gorjetas), '', '', '']],
    theme: 'grid',
    headStyles: { fillColor: LARANJA },
    footStyles: { fillColor: [240, 240, 240], textColor: 20 },
    styles: { fontSize: 8 },
  });
  doc.setFontSize(10);
  doc.text(`Faturamento produzido: ${r$(a.totais.faturamento)}`, 14, doc.lastAutoTable.finalY + 10);
  if (parceiro) {
    doc.setFontSize(8);
    doc.setTextColor(100);
    doc.text(doc.splitTextToSize(t.adaptar(AVISO_SALAO_PARCEIRO), 260), 14, doc.lastAutoTable.finalY + 18);
  }
  doc.save(`comissoes-${a.periodo.inicio}-a-${a.periodo.fim}.pdf`);
}

export function pdfComprovante(a: ApuracaoComissoes, i: LinhaComissao, negocio: string, t: Termos = termosDe(null)) {
  if (!i.repasse) return;
  const doc = new jsPDF() as Doc;
  const parceiro = a.modelo === 'salao_parceiro';
  cabecalho(doc, 'Comprovante de repasse', `${negocio} · gerado em ${new Date().toLocaleString('pt-BR')}`);
  autoTable(doc, {
    startY: 34,
    body: [
      [t.prof.S, i.professional.nome],
      ['CNPJ (MEI)', formatarCnpj(i.professional.cnpj) ?? 'Não informado'],
      ['Período', rotuloPeriodo(a.periodo)],
      ['Atendimentos', String(i.atendimentos)],
      ['Serviços', r$(i.servicos)],
      ['Produtos', r$(i.produtos)],
      [parceiro ? `Cota ${t.prof.doS}` : 'Comissão', r$(i.comissao)],
      ['Gorjetas', r$(i.gorjetas)],
      ['Adiantamentos descontados', r$(i.adiantamentos)],
      ['Valor pago', r$(i.repasse.valorPago)],
      ['Forma', ROTULO_FORMA[i.repasse.forma]],
      ['Pago em', new Date(i.repasse.pagoEm).toLocaleDateString('pt-BR')],
      ...(i.repasse.observacao ? [['Observação', i.repasse.observacao]] : []),
    ],
    theme: 'plain',
    columnStyles: { 0: { fontStyle: 'bold', cellWidth: 70 } },
  });
  if (parceiro) {
    doc.setFontSize(8);
    doc.setTextColor(100);
    doc.text(doc.splitTextToSize(t.adaptar(AVISO_SALAO_PARCEIRO), 180), 14, doc.lastAutoTable.finalY + 10);
  }
  doc.setTextColor(0);
  doc.setFontSize(10);
  const y = doc.lastAutoTable.finalY + 40;
  doc.line(14, y, 100, y);
  doc.text(i.professional.nome, 14, y + 6);
  doc.save(`repasse-${i.professional.nome.toLowerCase().replace(/\s+/g, '-')}-${a.periodo.inicio}.pdf`);
}

export function pdfRelatorio(v: VisaoGeral, e: Evolucao | null, negocio: string) {
  const doc = new jsPDF() as Doc;
  const ind = v.indicadores;
  cabecalho(doc, `${negocio} — Relatórios`, `${rotuloPeriodo(v.periodo)} · comparado a ${dataBr(v.anterior.inicio)} a ${dataBr(v.anterior.fim)}`);
  autoTable(doc, {
    startY: 34,
    head: [['Indicador', 'Valor', 'Variação']],
    body: [
      ['Faturamento do período', r$(v.faturamento), '—'],
      ['Ticket médio', ind.ticketMedio.valor === null ? '—' : r$(ind.ticketMedio.valor), pct(ind.ticketMedio.variacao)],
      ['Retorno no ciclo', pct(ind.retornoNoCiclo.valor), pct(ind.retornoNoCiclo.variacao)],
      ['Taxa de faltas', pct(ind.faltas.valor), pct(ind.faltas.variacao)],
      ['Faturamento do mês', r$(ind.faturamentoMes.valor), ind.faturamentoMes.meta ? `Meta ${r$(ind.faturamentoMes.meta)}` : 'Sem meta'],
    ],
    theme: 'striped',
    headStyles: { fillColor: LARANJA },
  });
  autoTable(doc, {
    startY: doc.lastAutoTable.finalY + 10,
    head: [['Origem dos agendamentos', 'Agendamentos', '%', 'Faturamento']],
    body: v.origem.itens.map((o) => [o.rotulo, String(o.quantidade), `${o.percentual}%`, r$(o.faturamento)]),
    theme: 'grid',
    headStyles: { fillColor: LARANJA },
  });
  if (e) {
    autoTable(doc, {
      startY: doc.lastAutoTable.finalY + 10,
      head: [['Mês', 'Serviços', 'Produtos', 'Total', 'Meta']],
      body: e.meses.map((m) => [
        `${rotuloMes(m.mes)}/${m.mes.slice(0, 4)}${m.atual ? ' (atual)' : ''}`, r$(m.servicos), r$(m.produtos), r$(m.total), m.meta ? r$(m.meta) : '—',
      ]),
      theme: 'grid',
      headStyles: { fillColor: LARANJA },
    });
  }
  doc.save(`relatorio-${v.periodo.inicio}-a-${v.periodo.fim}.pdf`);
}
