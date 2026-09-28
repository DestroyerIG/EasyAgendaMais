'use client';

/**
 * Tela Caixa do dia (caixa.html).
 *
 * Dado real: GET /finance/summary alimenta os 3 primeiros cartões de resumo (Entradas =
 * ganhos de hoje, Saídas = gastos de hoje, Saldo = ganhos menos gastos de hoje) e o card
 * "Resumo do Mês"; GET /finance/expenses (lista completa de despesas) é filtrada aqui só
 * para as lançadas na data de hoje, e essa mesma lista filtrada alimenta tanto o valor do
 * cartão "Saídas" quanto o bloco "Despesas do dia" — nunca dois números diferentes para a
 * mesma coisa. GET /finance/monthly alimenta o gráfico de crescimento, sem mudar a forma
 * dos dados que entram nele. A geração de PDF (jsPDF) e a aba "Gastos" (ExpensesTable, com
 * edição e exclusão do histórico completo) continuam com os mesmos handlers de sempre.
 *
 * Dado de exemplo (`conteudoDemo.caixa`): o conceito de "comanda" (aberta/fechada/falta)
 * como unidade de atendimento, a abertura de caixa (horário, responsável, saldo inicial),
 * o detalhamento "Entradas por forma de pagamento" e a conferência do dinheiro em espécie —
 * nada disso existe no sistema hoje. O "Total faturado" do detalhamento é somado a partir
 * dos próprios itens listados (nunca de um número solto), para não abrir uma conta que os
 * itens abaixo não fecham. "Mostrando N de 16 comandas" usa o tamanho real do array de
 * exemplo para N, nunca um número solto.
 *
 * Botões sem suporte real (Fechar caixa, páginas 2/"Próxima" das comandas) mostram o aviso
 * padrão em vez de fingir que funcionaram; "Nova despesa" continua abrindo o modal real de
 * sempre (o mesmo handler de "Novo gasto" da aba Gastos).
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import api from '@/lib/api';
import { useToast } from './Toast';
import { formatCurrency } from '@/lib/formatters';
import {
  Card,
  Button,
  Skeleton,
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
  Icon,
  AVISO_RECURSO_A_CAMINHO,
} from '@/components/ui';
import { FinanceChart } from '@/components/finance/FinanceChart';
import { ExpensesTable } from '@/components/finance/ExpensesTable';
import { ExpenseModal } from '@/components/finance/ExpenseModal';
import { FeatureGate } from '@/components/billing/FeatureGate';
import type { FeatureAccessDecision } from '@/lib/subscriptionAccess';
import type { Expense, MonthlyReportDay } from '@/types';
import { getApiErrorMessage } from '@/utils/handleApiError';
import { conteudoDemo } from '@/lib/conteudoDemo';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

interface FinanceSummary {
  today: { earnings: number; expenses: number; profit: number };
  month: { earnings: number; expenses: number; profit: number };
}

interface FinanceModuleProps {
  reportAccess: FeatureAccessDecision;
  exportAccess: FeatureAccessDecision;
  onUpgrade: () => void;
  onManageBilling: () => void;
}

type AutoTableDoc = jsPDF & { lastAutoTable: { finalY: number } };

function safeFormatDate(dateStr: string, formatStr: string) {
  try {
    if (!dateStr) return '---';
    const date = new Date(dateStr.includes('T') ? dateStr : `${dateStr}T12:00:00`);
    if (isNaN(date.getTime())) return 'Data inválida';
    return format(date, formatStr, { locale: ptBR });
  } catch {
    return 'Erro na data';
  }
}

/** Uma despesa real é "de hoje" quando a data (sem hora) coincide com a data atual. */
function despesaEhDeHoje(expense: Expense, agora: Date): boolean {
  if (!expense.date) return false;
  const data = new Date(expense.date.includes('T') ? expense.date : `${expense.date}T12:00:00`);
  if (Number.isNaN(data.getTime())) return false;
  return (
    data.getFullYear() === agora.getFullYear() &&
    data.getMonth() === agora.getMonth() &&
    data.getDate() === agora.getDate()
  );
}

/** "terça, 28 de setembro de 2026" — dia da semana real de hoje, sem o "-feira". */
function dataDeHojeExtensa(agora: Date): string {
  const comFeira = agora.toLocaleDateString('pt-BR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
  return comFeira.replace('-feira', '');
}

const STATUS_COMANDA_TOKENS: Record<string, string> = {
  Fechada: 'bg-success/12 text-success-text',
  Aberta: 'bg-warning/12 text-warning-text',
  Falta: 'bg-danger/12 text-danger',
};

export const FinanceModule = ({
  reportAccess,
  exportAccess,
  onUpgrade,
  onManageBilling,
}: FinanceModuleProps) => {
  const [summary, setSummary] = useState<FinanceSummary | null>(null);
  const [reportData, setReportData] = useState<MonthlyReportDay[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);
  const [activeTab, setActiveTab] = useState<'dashboard' | 'gastos'>('dashboard');
  const [paginaComandas, setPaginaComandas] = useState(1);
  const { showToast } = useToast();

  const aCaminho = useCallback(() => showToast(AVISO_RECURSO_A_CAMINHO, 'info'), [showToast]);

  const loadAllData = useCallback(async () => {
    try {
      setLoading(true);
      const now = new Date();

      const monthlyRequest = reportAccess.allowed
        ? api.get('/finance/monthly', { params: { month: now.getMonth() + 1, year: now.getFullYear() } })
        : Promise.resolve({ data: [] as MonthlyReportDay[] });

      const results = await Promise.allSettled([
        api.get('/finance/summary'),
        api.get('/finance/expenses'),
        monthlyRequest,
      ]);

      if (results[0].status === 'fulfilled') setSummary(results[0].value.data);
      if (results[1].status === 'fulfilled') setExpenses(results[1].value.data);
      if (results[2].status === 'fulfilled') setReportData(results[2].value.data);

      const hasUnexpectedError = results.some(result => {
        if (result.status !== 'rejected') return false;
        const statusCode = (result.reason as { response?: { status?: number } })?.response?.status;
        return statusCode !== 402 && statusCode !== 403;
      });

      if (hasUnexpectedError) {
        showToast('Alguns dados financeiros não puderam ser carregados.', 'error');
      }
    } catch {
      showToast('Erro ao carregar dados financeiros', 'error');
    } finally {
      setLoading(false);
    }
  }, [reportAccess.allowed, showToast]);

  useEffect(() => {
    loadAllData();
  }, [loadAllData]);

  const handleOpenModal = (expense?: Expense) => {
    setEditingExpense(expense || null);
    setIsModalOpen(true);
  };

  const handleSubmitExpense = async (data: { description: string; category: string; amount: number; date: string }) => {
    if (editingExpense) {
      await api.put(`/finance/expenses/${editingExpense.id}`, data);
      showToast('Gasto atualizado com sucesso', 'success');
    } else {
      await api.post('/finance/expenses', data);
      showToast('Gasto adicionado com sucesso', 'success');
    }
    loadAllData();
  };

  const handleDeleteExpense = async (id: string) => {
    if (!confirm('Tem certeza que deseja excluir este gasto?')) return;
    try {
      await api.delete(`/finance/expenses/${id}`);
      showToast('Gasto excluído com sucesso', 'success');
      loadAllData();
    } catch (error: unknown) {
      const message = getApiErrorMessage(error, 'Erro ao excluir gasto');
      showToast(message, 'error');
    }
  };

  const exportToPDF = async () => {
    const monthSummary = {
      earnings: summary?.month.earnings || 0,
      expenses: summary?.month.expenses || 0,
      profit: summary?.month.profit || 0,
    };

    const doc = new jsPDF() as AutoTableDoc;
    const now = format(new Date(), 'dd/MM/yyyy HH:mm');

    doc.setFontSize(20);
    doc.setTextColor(255, 122, 0);
    doc.text('EasyAgenda+ — Relatório Financeiro', 14, 20);
    doc.setFontSize(10);
    doc.setTextColor(100);
    doc.text(`Gerado em: ${now}`, 14, 28);
    doc.setFontSize(14);
    doc.setTextColor(0);
    doc.text('Resumo Mensal', 14, 40);

    autoTable(doc, {
      startY: 45,
      head: [['Métrica', 'Valor']],
      body: [
        ['Ganhos', `R$ ${monthSummary.earnings.toFixed(2)}`],
        ['Gastos', `R$ ${monthSummary.expenses.toFixed(2)}`],
        ['Lucro Líquido', `R$ ${monthSummary.profit.toFixed(2)}`],
      ],
      theme: 'striped',
      headStyles: { fillColor: [204, 133, 41] },
    });

    doc.text('Detalhamento de Gastos', 14, doc.lastAutoTable.finalY + 15);

    autoTable(doc, {
      startY: doc.lastAutoTable.finalY + 20,
      head: [['Data', 'Descrição', 'Categoria', 'Valor']],
      body: expenses.map(exp => [
        safeFormatDate(exp.date, 'dd/MM/yyyy'),
        exp.description,
        exp.category,
        `R$ ${parseFloat(exp.amount.toString()).toFixed(2)}`,
      ]),
      theme: 'grid',
      headStyles: { fillColor: [204, 133, 41] },
    });

    doc.save(`relatorio-financeiro-${format(new Date(), 'MM-yyyy')}.pdf`);
  };

  // Despesas reais lançadas hoje — mesma lista usada no cartão "Saídas" e no bloco
  // "Despesas do dia", para os dois nunca mostrarem números diferentes.
  const despesasHoje = useMemo(() => {
    const agora = new Date();
    return expenses.filter(item => despesaEhDeHoje(item, agora));
  }, [expenses]);
  const saidasHojeTotal = despesasHoje.reduce((total, item) => total + Number(item.amount), 0);
  const entradasHojeTotal = summary?.today.earnings ?? 0;
  const saldoHojeTotal = entradasHojeTotal - saidasHojeTotal;

  const caixa = conteudoDemo.caixa;
  const totalFaturadoFormas = caixa.formasPagamento.reduce((total, item) => total + item.valor, 0);
  const dataHojeExtensa = dataDeHojeExtensa(new Date());

  if (loading) {
    return (
      <div className="space-y-8 pb-10">
        <Skeleton className="h-9 w-56" label="Carregando…" />
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <Card key={index} className="flex flex-col gap-2">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-9 w-32" />
            </Card>
          ))}
        </div>
        <Card>
          <Skeleton className="mb-6 h-7 w-52" />
          <Skeleton className="h-[350px] w-full" />
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-10">
      {/* Cabeçalho: título + linha de abertura de caixa (exemplo) + ações */}
      <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-ink">Caixa do dia</h1>
          <p className="mt-1 text-[14px] text-muted">
            {dataHojeExtensa}
            <span className="mx-1.5 text-line">·</span>
            aberto às {caixa.abertura.horario} por {caixa.abertura.responsavel}
            <span className="mx-1.5 text-line">·</span>
            saldo inicial <span className="font-semibold text-ink tabular-nums">{formatCurrency(caixa.abertura.saldoInicial)}</span>
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {exportAccess.allowed && (
            <Button variant="secondary" onClick={exportToPDF}>
              <Icon name="description" size={16} />
              PDF
            </Button>
          )}
          <Button onClick={aCaminho}>
            <Icon name="lock" size={16} />
            Fechar caixa
          </Button>
        </div>
      </header>

      <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as 'dashboard' | 'gastos')}>
        <TabsList>
          <TabsTrigger value="dashboard">Visão Geral</TabsTrigger>
          <TabsTrigger value="gastos">Gastos</TabsTrigger>
        </TabsList>

        <TabsContent value="dashboard" className="space-y-6">
          {/* 4 cartões de métrica: Entradas/Saídas/Saldo reais, Comandas de exemplo */}
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
            <Card className="flex flex-col justify-between gap-3">
              <div className="flex items-center justify-between">
                <span className="text-[13px] font-semibold text-muted">Entradas</span>
                <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-success/10 text-success-text">
                  <Icon name="arrow_upward" size={16} />
                </span>
              </div>
              <div>
                <p className="text-[28px] font-bold leading-tight tabular-nums text-ink">{formatCurrency(entradasHojeTotal)}</p>
                <p className="mt-1 text-[12px] font-medium text-muted">Ganhos confirmados hoje</p>
              </div>
            </Card>

            <Card className="flex flex-col justify-between gap-3">
              <div className="flex items-center justify-between">
                <span className="text-[13px] font-semibold text-muted">Saídas</span>
                <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-danger/10 text-danger">
                  <Icon name="arrow_downward" size={16} />
                </span>
              </div>
              <div>
                <p className="text-[28px] font-bold leading-tight tabular-nums text-ink">{formatCurrency(saidasHojeTotal)}</p>
                <p className="mt-1 text-[12px] font-medium text-muted">
                  {despesasHoje.length} {despesasHoje.length === 1 ? 'despesa lançada hoje' : 'despesas lançadas hoje'}
                </p>
              </div>
            </Card>

            <Card className="flex flex-col justify-between gap-3">
              <div className="flex items-center justify-between">
                <span className="text-[13px] font-semibold text-muted">Saldo</span>
                <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-brand-text/10 text-brand-text">
                  <Icon name="account_balance_wallet" size={16} />
                </span>
              </div>
              <div>
                <p className="text-[28px] font-bold leading-tight tabular-nums text-ink">{formatCurrency(saldoHojeTotal)}</p>
                <p className="mt-1 text-[12px] font-medium text-muted">Ganhos menos gastos de hoje</p>
              </div>
            </Card>

            <Card className="flex flex-col justify-between gap-3">
              <div className="flex items-center justify-between">
                <span className="text-[13px] font-semibold text-muted">Comandas (exemplo)</span>
                <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-surface-2 text-ink">
                  <Icon name="receipt_long" size={16} />
                </span>
              </div>
              <div>
                <p className="text-[28px] font-bold leading-tight tabular-nums text-ink">{caixa.metricas.comandasTotal}</p>
                <div className="mt-1 flex items-center gap-1.5 text-[11px] font-semibold">
                  <span className="text-success-text">{caixa.metricas.comandasFechadas} fechadas</span>
                  <span className="text-line">·</span>
                  <span className="text-warning-text">{caixa.metricas.comandasAbertas} abertas</span>
                  <span className="text-line">·</span>
                  <span className="text-danger">{caixa.metricas.comandasFalta} falta</span>
                </div>
              </div>
            </Card>
          </div>

          {/* Entradas por forma de pagamento — exemplo (não existe cobrança por forma no sistema).
              O rótulo do subtotal deixa claro que é o total só deste detalhamento de exemplo,
              não uma segunda leitura do total real de "Entradas" acima (correção I4). */}
          <Card>
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-[15px] font-bold text-ink">Entradas por forma de pagamento (exemplo)</h2>
              <span className="text-[12px] text-muted">
                Total do detalhamento (exemplo): <strong className="font-semibold tabular-nums text-ink">{formatCurrency(totalFaturadoFormas)}</strong>
              </span>
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
              {caixa.formasPagamento.map(forma => (
                <div key={forma.rotulo} className="flex flex-col justify-between rounded-xl border border-line bg-surface-2/60 p-3.5">
                  <div className="mb-1 flex items-center justify-between gap-2">
                    <span className="text-[12px] font-medium text-muted">{forma.rotulo}</span>
                    <span className="rounded border border-line bg-surface px-1.5 py-0.5 text-[11px] font-bold tabular-nums text-muted">
                      {(totalFaturadoFormas > 0 ? (forma.valor / totalFaturadoFormas) * 100 : 0)
                        .toFixed(1)
                        .replace('.', ',')}%
                    </span>
                  </div>
                  <div>
                    <p className="text-[18px] font-bold leading-tight tabular-nums text-ink">{formatCurrency(forma.valor)}</p>
                    <span className="text-[11px] text-muted">
                      {forma.quantidade} {forma.quantidade === 1 ? 'transação' : 'transações'}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </Card>

          {/* Comandas do dia (exemplo) + Despesas do dia (real) e Conferência (exemplo) */}
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
            <Card className="lg:col-span-8">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h2 className="text-[16px] font-bold text-ink">Comandas do dia (exemplo)</h2>
                  <p className="text-[12px] text-muted">Visão consolidada dos atendimentos realizados no dia — contagem de comandas de exemplo, não movimento financeiro</p>
                </div>
                <span className="text-[12px] font-semibold text-muted">
                  {caixa.comandas.length} de {caixa.metricas.comandasTotal} atendimentos
                </span>
              </div>

              <div className="overflow-x-auto rounded-xl border border-line">
                <table className="w-full min-w-[640px] border-collapse text-left text-[13px]">
                  <thead>
                    <tr className="border-b border-line bg-surface-2 text-[11px] font-bold uppercase tracking-wider text-muted">
                      <th className="px-3.5 py-3">Hora</th>
                      <th className="px-3.5 py-3">Cliente</th>
                      <th className="px-3.5 py-3">Profissional</th>
                      <th className="px-3.5 py-3">Pagamento</th>
                      <th className="px-3.5 py-3 text-right">Total</th>
                      <th className="px-3.5 py-3 text-center">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line font-medium text-ink">
                    {caixa.comandas.map(comanda => (
                      <tr
                        key={`${comanda.hora}-${comanda.cliente}`}
                        className={comanda.status === 'Aberta' ? 'bg-warning/5' : undefined}
                      >
                        <td className="px-3.5 py-3.5 font-semibold tabular-nums text-muted">{comanda.hora}</td>
                        <td className="px-3.5 py-3.5">
                          <div className="font-bold text-ink">{comanda.cliente}</div>
                          <div className="text-[11px] tabular-nums text-muted">{comanda.telefone}</div>
                        </td>
                        <td className="px-3.5 py-3.5 text-[12px] font-semibold text-ink">{comanda.profissional}</td>
                        <td className="px-3.5 py-3.5 text-[12px] text-ink">{comanda.formaPagamento}</td>
                        <td
                          className={
                            comanda.status === 'Falta'
                              ? 'px-3.5 py-3.5 text-right font-bold tabular-nums text-muted line-through'
                              : 'px-3.5 py-3.5 text-right font-bold tabular-nums'
                          }
                        >
                          {formatCurrency(comanda.total)}
                        </td>
                        <td className="px-3.5 py-3.5 text-center">
                          <span
                            className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-bold ${STATUS_COMANDA_TOKENS[comanda.status]}`}
                          >
                            {comanda.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="mt-4 flex items-center justify-between text-[12px] text-muted">
                <span>
                  Mostrando {caixa.comandas.length} de {caixa.metricas.comandasTotal} comandas
                </span>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setPaginaComandas(1)}
                    className={`rounded px-2.5 py-1 font-semibold transition-colors ${
                      paginaComandas === 1 ? 'border border-line bg-surface-2 text-ink' : 'text-muted hover:bg-surface-2'
                    }`}
                  >
                    1
                  </button>
                  <button type="button" onClick={aCaminho} className="rounded px-2.5 py-1 text-muted transition-colors hover:bg-surface-2">
                    2
                  </button>
                  <button type="button" onClick={aCaminho} className="rounded px-2.5 py-1 text-muted transition-colors hover:bg-surface-2">
                    Próxima
                  </button>
                </div>
              </div>
            </Card>

            <div className="flex flex-col gap-5 lg:col-span-4">
              {/* Despesas do dia — real, mesmo total do cartão "Saídas" */}
              <Card>
                <div className="mb-4 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full bg-danger" />
                    <h3 className="text-[15px] font-bold text-ink">Despesas do dia</h3>
                  </div>
                  <span className="text-[13px] font-bold leading-tight tabular-nums text-danger">
                    - {formatCurrency(saidasHojeTotal)}
                  </span>
                </div>

                {despesasHoje.length === 0 ? (
                  <p className="rounded-xl border border-line bg-surface-2/60 p-3.5 text-[13px] text-muted">
                    Nenhuma despesa lançada hoje.
                  </p>
                ) : (
                  <div className="flex flex-col gap-3">
                    {despesasHoje.map(despesa => (
                      <div key={despesa.id} className="flex flex-col gap-1 rounded-xl border border-line bg-surface-2/60 p-3">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-[13px] font-bold text-ink">{despesa.description}</span>
                          <span className="text-[13px] font-bold tabular-nums text-ink">{formatCurrency(despesa.amount)}</span>
                        </div>
                        <div className="flex items-center justify-between border-t border-line/50 pt-1 text-[10px] text-muted">
                          <span>{safeFormatDate(despesa.date, "dd 'de' MMM")}</span>
                          <span className="rounded-full border border-line bg-surface px-1.5 py-0.5 font-medium text-ink">
                            {despesa.category}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                <button
                  type="button"
                  onClick={() => handleOpenModal()}
                  className="mt-4 flex w-full items-center justify-center gap-2 rounded-[10px] border border-line bg-surface-2 px-3 py-2.5 text-[13px] font-bold text-ink transition-colors hover:bg-line/60"
                >
                  <Icon name="add" size={16} />
                  Nova despesa
                </button>
              </Card>

              {/* Conferência do dinheiro em espécie — exemplo */}
              <Card>
                <div className="mb-4 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full bg-brand" />
                    <h3 className="text-[15px] font-bold text-ink">Conferência do dinheiro em espécie</h3>
                  </div>
                  {caixa.conferenciaDinheiro.bateCaixa && (
                    <span className="inline-flex items-center rounded-full bg-success/12 px-2 py-0.5 text-[10px] font-bold text-success-text">
                      Bate 100%
                    </span>
                  )}
                </div>

                <div className="flex flex-col gap-2.5 text-[13px]">
                  <div className="flex items-center justify-between border-b border-line/60 py-1">
                    <span className="text-muted">Fundo inicial de troco</span>
                    {/* Mesmo saldo inicial do cabeçalho (caixa.abertura.saldoInicial) — não
                        um segundo campo fixo duplicando o mesmo número (correção I11). */}
                    <span className="font-semibold tabular-nums text-ink">{formatCurrency(caixa.abertura.saldoInicial)}</span>
                  </div>
                  <div className="flex items-center justify-between border-b border-line/60 py-1">
                    <span className="text-muted">(+) Entradas em dinheiro</span>
                    <span className="font-semibold tabular-nums text-success-text">
                      + {formatCurrency(caixa.conferenciaDinheiro.entradasDinheiro)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between border-b border-line/60 py-1">
                    <span className="text-muted">(-) Saídas em dinheiro</span>
                    <span className="font-semibold tabular-nums text-muted">
                      - {formatCurrency(caixa.conferenciaDinheiro.saidasDinheiro)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between pt-2">
                    <span className="font-bold text-ink">Total esperado na gaveta</span>
                    {/* Calculado (fundo + entradas − saídas), nunca um número gravado
                        separado que pudesse deixar de bater com as três linhas acima. */}
                    <span className="text-[18px] font-extrabold tabular-nums text-ink">
                      {formatCurrency(
                        caixa.abertura.saldoInicial +
                          caixa.conferenciaDinheiro.entradasDinheiro -
                          caixa.conferenciaDinheiro.saidasDinheiro,
                      )}
                    </span>
                  </div>
                </div>

                <div className="mt-4 flex items-center gap-2.5 rounded-xl border border-line bg-surface-2/70 p-3 text-[11px] text-muted">
                  <Icon name="check_circle" size={16} className="shrink-0 text-success-text" />
                  <span>Valores conferidos na abertura e sem discrepâncias detectadas.</span>
                </div>
              </Card>
            </div>
          </div>

          {/* Gráfico de crescimento (mensal, real) + resumo/exportação */}
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            <div className="lg:col-span-2">
              <FeatureGate
                access={reportAccess}
                onUpgrade={onUpgrade}
                onManageBilling={onManageBilling}
                title="Relatórios mensais indisponíveis"
              >
                <FinanceChart data={reportData} />
              </FeatureGate>
            </div>
            <div className="space-y-6">
              <Card>
                <h3 className="mb-4 text-[15px] font-bold text-ink">Resumo do mês</h3>
                <div className="space-y-3">
                  <div className="flex items-center justify-between rounded-control border border-line bg-surface-2 p-3.5">
                    <span className="text-[13px] font-medium text-muted">Ganhos</span>
                    <span className="text-[15px] font-bold text-success-text">{formatCurrency(summary?.month.earnings || 0)}</span>
                  </div>
                  <div className="flex items-center justify-between rounded-control border border-line bg-surface-2 p-3.5">
                    <span className="text-[13px] font-medium text-muted">Gastos</span>
                    <span className="text-[15px] font-bold text-danger">{formatCurrency(summary?.month.expenses || 0)}</span>
                  </div>
                  <div className="flex items-center justify-between border-t border-line px-1 pt-2">
                    <span className="text-[12px] font-black text-muted">Lucro Líquido</span>
                    <span className={`text-[18px] font-black ${(summary?.month.profit || 0) >= 0 ? 'text-brand-text' : 'text-danger'}`}>
                      {formatCurrency(summary?.month.profit || 0)}
                    </span>
                  </div>
                </div>
              </Card>
              <FeatureGate
                access={exportAccess}
                onUpgrade={onUpgrade}
                onManageBilling={onManageBilling}
                title="Exportações indisponíveis"
              >
                <Card className="border-brand/20 bg-gradient-to-br from-brand/10 to-transparent">
                  <h3 className="mb-2 text-[15px] font-bold text-ink">Exportação rápida</h3>
                  <p className="mb-4 text-[12px] text-muted">Gere um documento PDF com todos os dados financeiros deste mês.</p>
                  <Button variant="secondary" onClick={exportToPDF} fullWidth>
                    <Icon name="description" size={18} />
                    Gerar relatório
                  </Button>
                </Card>
              </FeatureGate>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="gastos">
          <div className="mb-4 flex justify-end">
            <Button onClick={() => handleOpenModal()}>
              <Icon name="add" size={16} />
              Novo gasto
            </Button>
          </div>
          <ExpensesTable expenses={expenses} onEdit={handleOpenModal} onDelete={handleDeleteExpense} />
        </TabsContent>
      </Tabs>

      <ExpenseModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSubmit={handleSubmitExpense}
        editingExpense={editingExpense}
      />
    </div>
  );
};
