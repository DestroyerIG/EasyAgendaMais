import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { formatCurrency } from '@/lib/formatters';
import type { MeusNumeros } from '@/lib/bancada';
import { ROTULO_FORMA, dataBr, rotuloPeriodo } from '@/lib/relatorios';

// Extrato da profissional em PDF, gerado no aparelho (como os PDFs de Relatórios).

type Doc = jsPDF & { lastAutoTable: { finalY: number } };
const LARANJA: [number, number, number] = [204, 133, 41];
const r$ = (v: number) => formatCurrency(v);

export function pdfExtrato(n: MeusNumeros, profissional: string, negocio: string) {
  const doc = new jsPDF() as Doc;
  doc.setFontSize(18);
  doc.setTextColor(255, 122, 0);
  doc.text(`Extrato — ${profissional}`, 14, 20);
  doc.setFontSize(10);
  doc.setTextColor(100);
  doc.text(`${negocio} · ${rotuloPeriodo(n.periodo)}`, 14, 27);
  doc.setTextColor(0);

  const r = n.resumo;
  autoTable(doc, {
    startY: 34,
    body: [
      ['Atendimentos', String(r?.atendimentos ?? 0)],
      ['Comissão de serviços', r$(r?.comissaoServico ?? 0)],
      ['Comissão de produtos', r$(r?.comissaoProduto ?? 0)],
      ['Gorjetas', r$(r?.gorjetas ?? 0)],
      ['Adiantamentos', r?.adiantamentos ? `− ${r$(r.adiantamentos)}` : '—'],
      [r?.status === 'pago' ? 'Recebido' : 'A receber', r$(r?.aPagar ?? 0)],
      ...(r?.repasse ? [['Repasse', `${dataBr(r.repasse.pagoEm.slice(0, 10))} · ${ROTULO_FORMA[r.repasse.forma]}`]] : []),
    ],
    theme: 'plain',
    styles: { fontSize: 10 },
    columnStyles: { 1: { halign: 'right', fontStyle: 'bold' } },
  });

  autoTable(doc, {
    startY: doc.lastAutoTable.finalY + 6,
    head: [['Data', 'Cliente', 'Itens', 'Pago', 'Sua parte']],
    body: n.extrato.map((k) => [
      `${dataBr(k.fechadaEm.slice(0, 10))} ${k.hora}`,
      k.cliente,
      k.itens.map((i) => `${i.quantidade > 1 ? `${i.quantidade}x ` : ''}${i.nome}${i.coberto ? ' (clube)' : ''}`).join(', '),
      r$(k.pago),
      r$(k.parte.total),
    ]),
    theme: 'grid',
    headStyles: { fillColor: LARANJA },
    styles: { fontSize: 8 },
    columnStyles: { 3: { halign: 'right' }, 4: { halign: 'right' } },
  });

  doc.save(`extrato-${n.periodo.inicio}-a-${n.periodo.fim}.pdf`);
}
