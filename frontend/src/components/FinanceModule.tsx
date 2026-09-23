'use client';

import { useState, useEffect, useCallback } from 'react';
import api from '@/lib/api';
import { useToast } from './Toast';
import { formatCurrency } from '@/lib/formatters';
import {
  PageHeader,
  MetricCard,
  Card,
  Button,
  Skeleton,
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from '@/components/ui';
import { FinanceChart } from '@/components/finance/FinanceChart';
import { ExpensesTable } from '@/components/finance/ExpensesTable';
import { ExpenseModal } from '@/components/finance/ExpenseModal';
import { FeatureGate } from '@/components/billing/FeatureGate';
import type { FeatureAccessDecision } from '@/lib/subscriptionAccess';
import type { Expense, MonthlyReportDay } from '@/types';
import { getApiErrorMessage } from '@/utils/handleApiError';
import { Plus, FileText, Calendar } from 'lucide-react';
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
  const { showToast } = useToast();

  const safeFormatDate = (dateStr: string, formatStr: string) => {
    try {
      if (!dateStr) return '---';
      const date = new Date(dateStr.includes('T') ? dateStr : `${dateStr}T12:00:00`);
      if (isNaN(date.getTime())) return 'Data inválida';
      return format(date, formatStr, { locale: ptBR });
    } catch {
      return 'Erro na data';
    }
  };

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
    // ✅ CORRIGIDO: usa URL dinâmica /finance/expenses/${id}
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
      // ✅ CORRIGIDO: usa URL dinâmica /finance/expenses/${id}
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

  if (loading) {
    return (
      <div className="space-y-8 pb-10">
        <PageHeader title="Caixa" description="Controle total de ganhos, gastos e saúde do seu negócio." />
        <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
          {Array.from({ length: 3 }).map((_, index) => (
            <Card key={index} className="flex flex-col gap-2">
              <Skeleton className="h-4 w-24" label={index === 0 ? 'Carregando…' : undefined} />
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
    <div className="space-y-8 pb-10">
      <PageHeader
        title="Caixa"
        description="Controle total de ganhos, gastos e saúde do seu negócio."
        action={
          <div className="flex flex-wrap gap-2">
            {exportAccess.allowed && (
              <Button variant="secondary" onClick={exportToPDF}>
                <FileText className="h-4 w-4" aria-hidden="true" />
                PDF
              </Button>
            )}
            <Button onClick={() => handleOpenModal()}>
              <Plus className="h-4 w-4" aria-hidden="true" />
              Novo Gasto
            </Button>
          </div>
        }
      />

      {/* Summary Cards */}
      <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
        <MetricCard
          label="Ganhos do Mês"
          value={formatCurrency(summary?.month.earnings || 0)}
          caption="Receita de atendimentos"
        />
        <MetricCard
          label="Gastos do Mês"
          value={formatCurrency(summary?.month.expenses || 0)}
          caption="Registro manual de despesas"
        />
        <MetricCard
          label="Lucro Líquido"
          value={formatCurrency(summary?.month.profit || 0)}
          caption="Saldo real disponível"
        />
      </div>

      <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as 'dashboard' | 'gastos')}>
        <TabsList>
          <TabsTrigger value="dashboard">Visão Geral</TabsTrigger>
          <TabsTrigger value="gastos">Gastos</TabsTrigger>
        </TabsList>

        <TabsContent value="dashboard">
          <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
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
                <h3 className="mb-4 flex items-center gap-2 text-sm font-bold text-ink sm:mb-6">
                  <Calendar className="h-[18px] w-[18px] text-brand-text" aria-hidden="true" />
                  Resumo de Hoje
                </h3>
                <div className="space-y-4">
                  <div className="flex items-center justify-between rounded-control border border-line bg-surface-2 p-4">
                    <span className="text-sm font-medium text-muted">Ganhos</span>
                    <span className="text-lg font-bold text-success-text">{formatCurrency(summary?.today.earnings || 0)}</span>
                  </div>
                  <div className="flex items-center justify-between rounded-control border border-line bg-surface-2 p-4">
                    <span className="text-sm font-medium text-muted">Gastos</span>
                    <span className="text-lg font-bold text-danger">{formatCurrency(summary?.today.expenses || 0)}</span>
                  </div>
                  <div className="flex items-center justify-between border-t border-line px-2 pt-2">
                    <span className="text-xs font-black text-muted">Balanço do Dia</span>
                    <span className={`text-xl font-black ${(summary?.today.profit || 0) >= 0 ? 'text-brand-text' : 'text-danger'}`}>
                      {formatCurrency(summary?.today.profit || 0)}
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
                <Card className="bg-gradient-to-br from-brand/10 to-transparent border-brand/20">
                  <h3 className="mb-2 text-sm font-bold text-ink">Exportação Rápida</h3>
                  <p className="mb-4 text-xs text-muted">Gere um documento PDF com todos os dados financeiros deste mês.</p>
                  <Button variant="secondary" onClick={exportToPDF} fullWidth>
                    <FileText className="h-[18px] w-[18px]" aria-hidden="true" />
                    GERAR RELATÓRIO
                  </Button>
                </Card>
              </FeatureGate>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="gastos">
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
