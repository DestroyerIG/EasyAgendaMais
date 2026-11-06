'use client';

/**
 * Tela Caixa do dia (caixa.html, Stitch baf21f).
 *
 * Dado real do caixa: GET /cash/today?date= (`buscarCaixa`) alimenta o cabeçalho (abertura,
 * fechamento), os 4 cartões, "Entradas por forma de pagamento", "Comandas do dia",
 * "Despesas do dia", a conferência do dinheiro em espécie e os movimentos (sangria e
 * suprimento). Tudo é calculado no servidor — esta tela só mostra, nunca soma por conta
 * própria um número que o servidor já entrega. Dias passados são somente leitura.
 *
 * Continuam como antes: GET /finance/summary (card "Resumo do mês"), GET /finance/expenses
 * (aba "Gastos" e PDF), GET /finance/monthly (gráfico) e a exportação em PDF (jsPDF).
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import api from '@/lib/api';
import { useToast } from './Toast';
import { formatCurrency, formatPhone } from '@/lib/formatters';
import { cn } from '@/lib/cn';
import {
  Card,
  Button,
  Skeleton,
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
  Icon,
} from '@/components/ui';
import { FinanceChart } from '@/components/finance/FinanceChart';
import { ExpensesTable } from '@/components/finance/ExpensesTable';
import { ExpenseModal } from '@/components/finance/ExpenseModal';
import { FeatureGate } from '@/components/billing/FeatureGate';
import { AbrirCaixaInline } from '@/components/comanda/AbrirCaixaInline';
import { ComandaModal } from '@/components/comanda/ComandaModal';
import { MovimentoCaixaModal } from '@/components/caixa/MovimentoCaixaModal';
import { FecharCaixaModal } from '@/components/caixa/FecharCaixaModal';
import type { FeatureAccessDecision } from '@/lib/subscriptionAccess';
import type { Expense, ExpenseFormData, MonthlyReportDay } from '@/types';
import { getApiErrorMessage } from '@/utils/handleApiError';
import { buscarCaixa, abrirCaixa, reabrirCaixa, ROTULO_FORMA_CAIXA, type CashDay } from '@/lib/caixa';
import { addDays, format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { SeloProntaParaCobrar } from '@/components/comanda/SeloProntaParaCobrar';
import { useVocabulario } from '@/hooks/useVocabulario';

interface FinanceSummary {
  today: { earnings: number; expenses: number; profit: number };
  month: { earnings: number; expenses: number; profit: number };
}

interface FinanceModuleProps {
  reportAccess: FeatureAccessDecision;
  exportAccess: FeatureAccessDecision;
  onUpgrade: (recurso: string) => void;
  onManageBilling: () => void;
}

type AutoTableDoc = jsPDF & { lastAutoTable: { finalY: number } };
type LinhaComanda = CashDay['linhas'][number];

const COMANDAS_POR_PAGINA = 6;

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

/** "terça, 28 de setembro de 2026" — dia da semana por extenso, sem o "-feira". */
function dataExtensa(dia: string): string {
  const comFeira = parseISO(dia).toLocaleDateString('pt-BR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
  return comFeira.replace('-feira', '');
}

const hojeISO = () => format(new Date(), 'yyyy-MM-dd');
const somarDias = (dia: string, n: number) => format(addDays(parseISO(dia), n), 'yyyy-MM-dd');
const hora = (iso: string) => safeFormatDate(iso, 'HH:mm');
const percentual = (valor: number, total: number) =>
  `${(total > 0 ? (valor / total) * 100 : 0).toFixed(1).replace('.', ',')}%`;

const STATUS_COMANDA_TOKENS: Record<LinhaComanda['status'], string> = {
  Fechada: 'bg-success/12 text-success-text',
  Aberta: 'bg-warning/12 text-warning-text',
  Falta: 'bg-danger/12 text-danger',
  Clube: 'bg-brand/12 text-brand',
};

const ROTULO_PAGAMENTO_LINHA: Record<'pix' | 'debito' | 'credito' | 'dinheiro', string> = {
  pix: 'Pix balcão',
  debito: 'Débito',
  credito: 'Crédito',
  dinheiro: 'Dinheiro em espécie',
};

/** Texto da coluna "Pagamento" de uma comanda do dia. */
function rotuloPagamento(linha: LinhaComanda): string {
  if (linha.pagamento === 'em_atendimento') return 'Em atendimento';
  if (linha.pagamento === 'faltou') return 'Não compareceu';
  const sinal = `Sinal Pix (${formatCurrency(linha.depositApplied)})`;
  if (linha.pagamento === 'sinal') return sinal;
  const forma = ROTULO_PAGAMENTO_LINHA[linha.pagamento];
  return linha.depositApplied > 0 ? `${sinal} + ${forma}` : forma;
}

const ROTULO_FORMA_DESPESA: Record<string, string> = {
  pix: 'Pix estúdio',
  debito: 'Débito estúdio',
  credito: 'Crédito estúdio',
  dinheiro: 'Dinheiro',
};

export const FinanceModule = ({
  reportAccess,
  exportAccess,
  onUpgrade,
  onManageBilling,
}: FinanceModuleProps) => {
  const { prof } = useVocabulario();
  const [summary, setSummary] = useState<FinanceSummary | null>(null);
  const [reportData, setReportData] = useState<MonthlyReportDay[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);
  const [dataNovaDespesa, setDataNovaDespesa] = useState<string | undefined>(undefined);
  const [activeTab, setActiveTab] = useState<'dashboard' | 'gastos'>('dashboard');
  const [paginaComandas, setPaginaComandas] = useState(1);
  const [dataSelecionada, setDataSelecionada] = useState<string>(hojeISO);
  const [dia, setDia] = useState<CashDay | null>(null);
  const [caixaCarregando, setCaixaCarregando] = useState(true);
  const [caixaErro, setCaixaErro] = useState(false);
  const [abrindoCaixa, setAbrindoCaixa] = useState(false);
  const [movimentoAberto, setMovimentoAberto] = useState(false);
  const [fecharAberto, setFecharAberto] = useState(false);
  const [comandaAppointmentId, setComandaAppointmentId] = useState<string | null>(null);
  const { showToast } = useToast();
  // Só a resposta da última data pedida vale (navegação rápida entre dias).
  const ultimaDataPedida = useRef(dataSelecionada);

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

  const carregarCaixa = useCallback(async (data: string) => {
    ultimaDataPedida.current = data;
    setCaixaCarregando(true);
    try {
      const resposta = await buscarCaixa(data);
      if (ultimaDataPedida.current !== data) return;
      setDia(resposta);
      setCaixaErro(false);
    } catch {
      if (ultimaDataPedida.current !== data) return;
      setDia(null);
      setCaixaErro(true);
    } finally {
      if (ultimaDataPedida.current === data) setCaixaCarregando(false);
    }
  }, []);

  useEffect(() => {
    loadAllData();
  }, [loadAllData]);

  useEffect(() => {
    setPaginaComandas(1);
    carregarCaixa(dataSelecionada);
  }, [carregarCaixa, dataSelecionada]);

  const handleOpenModal = (expense?: Expense, dataPadrao?: string) => {
    setEditingExpense(expense || null);
    setDataNovaDespesa(dataPadrao);
    setIsModalOpen(true);
  };

  const handleSubmitExpense = async (data: ExpenseFormData) => {
    if (editingExpense) {
      await api.put(`/finance/expenses/${editingExpense.id}`, data);
      showToast('Gasto atualizado com sucesso', 'success');
    } else {
      await api.post('/finance/expenses', data);
      showToast('Gasto adicionado com sucesso', 'success');
    }
    loadAllData();
    carregarCaixa(dataSelecionada);
  };

  const handleDeleteExpense = async (id: string) => {
    if (!confirm('Tem certeza que deseja excluir este gasto?')) return;
    try {
      await api.delete(`/finance/expenses/${id}`);
      showToast('Gasto excluído com sucesso', 'success');
      loadAllData();
      carregarCaixa(dataSelecionada);
    } catch (error: unknown) {
      const message = getApiErrorMessage(error, 'Erro ao excluir gasto');
      showToast(message, 'error');
    }
  };

  const handleAbrirCaixa = async (saldoInicial: number) => {
    setAbrindoCaixa(true);
    try {
      const aberto = await abrirCaixa(saldoInicial);
      setDia(aberto);
      showToast('Caixa aberto', 'success');
    } catch (error) {
      showToast(getApiErrorMessage(error, 'Não foi possível abrir o caixa'), 'error');
    } finally {
      setAbrindoCaixa(false);
    }
  };

  const handleReabrirCaixa = async () => {
    setAbrindoCaixa(true);
    try {
      const reaberto = await reabrirCaixa();
      setDia(reaberto);
      showToast('Caixa reaberto', 'success');
    } catch (error) {
      showToast(getApiErrorMessage(error, 'Não foi possível reabrir o caixa'), 'error');
    } finally {
      setAbrindoCaixa(false);
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

  if (loading || (caixaCarregando && !dia && !caixaErro)) {
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

  const ehHoje = dia?.isToday ?? dataSelecionada === hojeISO();
  const sessao = dia?.session ?? null;
  const caixaAberto = !!sessao && !sessao.closedAt;
  const caixaFechado = !!sessao?.closedAt;
  const diferenca = sessao?.difference ?? null;

  const linhas = dia?.linhas ?? [];
  const totalPaginas = Math.max(1, Math.ceil(linhas.length / COMANDAS_POR_PAGINA));
  const pagina = Math.min(paginaComandas, totalPaginas);
  const linhasDaPagina = linhas.slice((pagina - 1) * COMANDAS_POR_PAGINA, pagina * COMANDAS_POR_PAGINA);

  return (
    <div className="space-y-6 pb-10">
      {/* Cabeçalho: título, data, linha de abertura/fechamento e ações */}
      <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-bold text-ink">Caixa do dia</h1>
          <p className="mt-1 text-[14px] text-muted">
            {dataExtensa(dataSelecionada)}
            {sessao && (
              <>
                <span className="mx-1.5 text-line">·</span>
                aberto às {hora(sessao.openedAt)} por {dia?.responsavel}
                <span className="mx-1.5 text-line">·</span>
                saldo inicial <span className="font-semibold text-ink tabular-nums">{formatCurrency(sessao.openingBalance)}</span>
              </>
            )}
            {sessao?.closedAt && (
              <>
                <span className="mx-1.5 text-line">·</span>
                fechado às {hora(sessao.closedAt)}
                <span className="mx-1.5 text-line">·</span>
                diferença <span className="font-semibold text-ink tabular-nums">{formatCurrency(sessao.difference ?? 0)}</span>
              </>
            )}
            {dia && !sessao && !ehHoje && (
              <>
                <span className="mx-1.5 text-line">·</span>
                o caixa não foi aberto neste dia
              </>
            )}
          </p>
          {dia && !sessao && ehHoje && (
            <div className="mt-3 max-w-xl">
              <AbrirCaixaInline carregando={abrindoCaixa} rotuloBotao="Abrir caixa" onAbrir={handleAbrirCaixa} />
            </div>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1 rounded-control bg-surface-2 p-1">
            <button
              type="button"
              aria-label="Dia anterior"
              title="Dia anterior"
              onClick={() => setDataSelecionada(d => somarDias(d, -1))}
              className="inline-flex h-9 w-9 items-center justify-center rounded-[8px] text-ink transition-colors hover:bg-surface"
            >
              <Icon name="chevron_left" size={20} />
            </button>
            <button
              type="button"
              onClick={() => setDataSelecionada(hojeISO())}
              className="inline-flex h-9 items-center rounded-[8px] px-2.5 text-[13px] font-bold text-ink transition-colors hover:bg-surface"
            >
              Hoje
            </button>
            <button
              type="button"
              aria-label="Próximo dia"
              title="Próximo dia"
              disabled={dataSelecionada >= hojeISO()}
              onClick={() => setDataSelecionada(d => somarDias(d, 1))}
              className="inline-flex h-9 w-9 items-center justify-center rounded-[8px] text-ink transition-colors hover:bg-surface disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Icon name="chevron_right" size={20} />
            </button>
          </div>
          {exportAccess.allowed && (
            <Button variant="secondary" onClick={exportToPDF}>
              <Icon name="description" size={16} />
              PDF
            </Button>
          )}
          {ehHoje && caixaAberto && (
            <Button variant="secondary" onClick={() => setMovimentoAberto(true)}>
              <Icon name="remove_circle_outline" size={16} />
              Registrar sangria/suprimento
            </Button>
          )}
          {/* Caixa de um dia passado esquecido aberto também pode ser fechado daqui. */}
          {caixaAberto && (
            <Button onClick={() => setFecharAberto(true)}>
              <Icon name="lock" size={16} />
              Fechar caixa
            </Button>
          )}
          {ehHoje && caixaFechado && (
            <Button variant="secondary" onClick={handleReabrirCaixa} loading={abrindoCaixa} disabled={abrindoCaixa}>
              {abrindoCaixa ? null : <Icon name="lock_open" size={16} />}
              Reabrir caixa
            </Button>
          )}
        </div>
      </header>

      <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as 'dashboard' | 'gastos')}>
        <TabsList>
          <TabsTrigger value="dashboard">Visão Geral</TabsTrigger>
          <TabsTrigger value="gastos">Gastos</TabsTrigger>
        </TabsList>

        <TabsContent value="dashboard" className="space-y-6">
          {!dia ? (
            <Card className="flex flex-col items-start gap-3">
              <p className="text-[14px] text-muted">Não foi possível carregar o caixa deste dia.</p>
              <Button variant="secondary" loading={caixaCarregando} onClick={() => carregarCaixa(dataSelecionada)}>
                {caixaCarregando ? null : <Icon name="refresh" size={16} />}
                Tentar de novo
              </Button>
            </Card>
          ) : (
            <>
              {/* 4 cartões de métrica */}
              <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
                <Card className="flex flex-col justify-between gap-3">
                  <div className="flex items-center justify-between">
                    <span className="text-[13px] font-semibold text-muted">Entradas</span>
                    <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-success/10 text-success-text">
                      <Icon name="arrow_upward" size={16} />
                    </span>
                  </div>
                  <div>
                    <p className="text-[28px] font-bold leading-tight tabular-nums text-ink">{formatCurrency(dia.totals.entradas)}</p>
                    <p className="mt-1 text-[12px] font-medium text-muted">{dia.totals.entradasQtd} recebimentos confirmados</p>
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
                    <p className="text-[28px] font-bold leading-tight tabular-nums text-ink">{formatCurrency(dia.totals.saidas)}</p>
                    <p className="mt-1 text-[12px] font-medium text-muted">{dia.totals.saidasQtd} despesas operacionais</p>
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
                    <p className="text-[28px] font-bold leading-tight tabular-nums text-ink">{formatCurrency(dia.totals.saldo)}</p>
                    <p className="mt-1 text-[12px] font-medium text-muted">Físico + digital apurado</p>
                  </div>
                </Card>

                <Card className="flex flex-col justify-between gap-3">
                  <div className="flex items-center justify-between">
                    <span className="text-[13px] font-semibold text-muted">Comandas</span>
                    <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-surface-2 text-ink">
                      <Icon name="receipt_long" size={16} />
                    </span>
                  </div>
                  <div>
                    <p className="text-[28px] font-bold leading-tight tabular-nums text-ink">{dia.comandasResumo.total}</p>
                    <div className="mt-1 flex items-center gap-1.5 text-[11px] font-semibold">
                      <span className="text-success-text">{dia.comandasResumo.fechadas} fechadas</span>
                      <span className="text-line">·</span>
                      <span className="text-warning-text">{dia.comandasResumo.abertas} abertas</span>
                      <span className="text-line">·</span>
                      <span className="text-danger">{dia.comandasResumo.falta} falta</span>
                    </div>
                  </div>
                </Card>
              </div>

              {/* Entradas por forma de pagamento */}
              <Card>
                <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                  <h2 className="text-[15px] font-bold text-ink">Entradas por forma de pagamento</h2>
                  <span className="text-[12px] text-muted">
                    Total faturado: <strong className="font-semibold tabular-nums text-ink">{formatCurrency(dia.totals.entradas)}</strong>
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
                  {dia.formas.map(forma => {
                    const rotulo = ROTULO_FORMA_CAIXA[forma.chave];
                    return (
                      <div key={forma.chave} className="flex flex-col justify-between rounded-xl border border-line bg-surface-2/60 p-3.5">
                        <div className="mb-1 flex items-center justify-between gap-2">
                          <span className="text-[12px] font-medium text-muted">{rotulo.rotulo}</span>
                          <span className="rounded border border-line bg-surface px-1.5 py-0.5 text-[11px] font-bold tabular-nums text-muted">
                            {percentual(forma.valor, dia.totals.entradas)}
                          </span>
                        </div>
                        <div>
                          <p className="text-[18px] font-bold leading-tight tabular-nums text-ink">{formatCurrency(forma.valor)}</p>
                          <span className="text-[11px] text-muted">{rotulo.legenda(forma.quantidade)}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </Card>

              {/* Comandas do dia + Despesas do dia, conferência e movimentos */}
              <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
                <Card className="lg:col-span-8">
                  <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <h2 className="text-[16px] font-bold text-ink">Comandas do dia</h2>
                      <p className="text-[12px] text-muted">Visão consolidada dos atendimentos realizados no dia</p>
                    </div>
                    <span className="text-[12px] font-semibold text-muted">
                      {dia.comandasResumo.total} {dia.comandasResumo.total === 1 ? 'atendimento' : 'atendimentos'}
                    </span>
                  </div>

                  <div className="overflow-x-auto rounded-xl border border-line">
                    <table className="w-full min-w-[760px] border-collapse text-left text-[13px]">
                      <thead>
                        <tr className="border-b border-line bg-surface-2 text-[11px] font-bold uppercase tracking-wider text-muted">
                          <th className="px-3.5 py-3">Hora</th>
                          <th className="px-3.5 py-3">Cliente</th>
                          <th className="px-3.5 py-3">{prof.S}</th>
                          <th className="px-3.5 py-3">Serviços</th>
                          <th className="px-3.5 py-3">Pagamento</th>
                          <th className="px-3.5 py-3 text-right">Total</th>
                          <th className="px-3.5 py-3 text-center">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-line font-medium text-ink">
                        {linhasDaPagina.length === 0 ? (
                          <tr>
                            <td colSpan={7} className="px-3.5 py-6 text-center text-[13px] text-muted">
                              Nenhuma comanda neste dia.
                            </td>
                          </tr>
                        ) : (
                          linhasDaPagina.map((linha, i) => {
                            const aberta = linha.status === 'Aberta' && linha.appointmentId !== null;
                            const abrirComanda = () => setComandaAppointmentId(linha.appointmentId);
                            return (
                              <tr
                                // Mensalidade do clube não tem agendamento.
                                key={linha.appointmentId ?? `clube-${linha.hora}-${i}`}
                                className={aberta ? 'cursor-pointer bg-warning/5 transition-colors hover:bg-warning/10' : undefined}
                                onClick={aberta ? abrirComanda : undefined}
                                onKeyDown={aberta ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); abrirComanda(); } } : undefined}
                                tabIndex={aberta ? 0 : undefined}
                                aria-label={aberta ? `Abrir comanda de ${linha.cliente}` : undefined}
                              >
                                <td className="px-3.5 py-3.5 font-semibold tabular-nums text-muted">{linha.hora}</td>
                                <td className="px-3.5 py-3.5">
                                  <div className="font-bold text-ink">{linha.cliente}</div>
                                  {linha.telefone && (
                                    <div className="text-[11px] tabular-nums text-muted">{formatPhone(linha.telefone)}</div>
                                  )}
                                </td>
                                <td className="px-3.5 py-3.5 text-[12px] font-semibold text-ink">{linha.profissional}</td>
                                <td className="px-3.5 py-3.5 text-[12px] text-ink">{linha.servicos}</td>
                                <td className="px-3.5 py-3.5 text-[12px]">
                                  <span
                                    className={
                                      aberta
                                        ? 'font-semibold text-warning-text'
                                        : linha.status === 'Falta'
                                          ? 'text-muted'
                                          : 'font-medium text-ink'
                                    }
                                  >
                                    {rotuloPagamento(linha)}
                                  </span>
                                </td>
                                <td
                                  className={
                                    linha.status === 'Falta'
                                      ? 'px-3.5 py-3.5 text-right font-bold tabular-nums text-muted line-through'
                                      : 'px-3.5 py-3.5 text-right font-bold tabular-nums'
                                  }
                                >
                                  {formatCurrency(linha.total)}
                                </td>
                                <td className="px-3.5 py-3.5 text-center">
                                  <span
                                    className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-bold ${STATUS_COMANDA_TOKENS[linha.status]}`}
                                  >
                                    {linha.status}
                                  </span>
                                  {linha.prontaParaCobrar && <SeloProntaParaCobrar className="mt-1" />}
                                </td>
                              </tr>
                            );
                          })
                        )}
                      </tbody>
                    </table>
                  </div>

                  <div className="mt-4 flex items-center justify-between text-[12px] text-muted">
                    <span>
                      Mostrando {linhasDaPagina.length} de {linhas.length} comandas
                    </span>
                    {totalPaginas > 1 && (
                      <div className="flex items-center gap-1">
                        {Array.from({ length: totalPaginas }, (_, i) => i + 1).map(n => (
                          <button
                            key={n}
                            type="button"
                            aria-current={n === pagina ? 'page' : undefined}
                            onClick={() => setPaginaComandas(n)}
                            className={cn(
                              'rounded px-2.5 py-1 font-semibold transition-colors',
                              n === pagina ? 'border border-line bg-surface-2 text-ink' : 'text-muted hover:bg-surface-2',
                            )}
                          >
                            {n}
                          </button>
                        ))}
                        <button
                          type="button"
                          disabled={pagina >= totalPaginas}
                          onClick={() => setPaginaComandas(pagina + 1)}
                          className="rounded px-2.5 py-1 text-muted transition-colors hover:bg-surface-2 disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          Próxima
                        </button>
                      </div>
                    )}
                  </div>
                </Card>

                <div className="flex flex-col gap-5 lg:col-span-4">
                  {/* Despesas do dia */}
                  <Card>
                    <div className="mb-4 flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="h-2 w-2 rounded-full bg-danger" />
                        <h3 className="text-[15px] font-bold text-ink">Despesas do dia</h3>
                      </div>
                      <span className="text-[13px] font-bold leading-tight tabular-nums text-danger">
                        - {formatCurrency(dia.totals.saidas)}
                      </span>
                    </div>

                    {dia.despesas.length === 0 ? (
                      <p className="rounded-xl border border-line bg-surface-2/60 p-3.5 text-[13px] text-muted">
                        Nenhuma despesa lançada neste dia.
                      </p>
                    ) : (
                      <div className="flex flex-col gap-3">
                        {dia.despesas.map(despesa => (
                          <div key={despesa.id} className="flex flex-col gap-1 rounded-xl border border-line bg-surface-2/60 p-3">
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-[13px] font-bold text-ink">{despesa.descricao}</span>
                              <span className="text-[13px] font-bold tabular-nums text-ink">{formatCurrency(despesa.valor)}</span>
                            </div>
                            <div className="flex items-center justify-between gap-2 border-t border-line/50 pt-1 text-[10px] text-muted">
                              <span>{(despesa.formaPagamento && ROTULO_FORMA_DESPESA[despesa.formaPagamento]) || 'Não informado'}</span>
                              <span className="rounded-full border border-line bg-surface px-1.5 py-0.5 font-medium text-ink">
                                {despesa.categoria}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    {ehHoje && (
                      <button
                        type="button"
                        onClick={() => handleOpenModal(undefined, dia.date)}
                        className="mt-4 flex w-full items-center justify-center gap-2 rounded-[10px] border border-line bg-surface-2 px-3 py-2.5 text-[13px] font-bold text-ink transition-colors hover:bg-line/60"
                      >
                        <Icon name="add" size={16} />
                        Nova despesa
                      </button>
                    )}
                  </Card>

                  {/* Conferência do dinheiro em espécie */}
                  <Card>
                    <div className="mb-4 flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="h-2 w-2 rounded-full bg-brand" />
                        <h3 className="text-[15px] font-bold text-ink">Conferência do dinheiro em espécie</h3>
                      </div>
                      {caixaFechado && diferenca === 0 && (
                        <span className="inline-flex shrink-0 items-center rounded-full bg-success/12 px-2 py-0.5 text-[10px] font-bold text-success-text">
                          Bate 100%
                        </span>
                      )}
                      {caixaFechado && diferenca !== null && diferenca !== 0 && (
                        <span
                          className={cn(
                            'inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[10px] font-bold',
                            diferenca < 0 ? 'bg-danger/12 text-danger' : 'bg-warning/12 text-warning-text',
                          )}
                        >
                          Diferença de {formatCurrency(Math.abs(diferenca))}
                        </span>
                      )}
                    </div>

                    <div className="flex flex-col gap-2.5 text-[13px]">
                      <div className="flex items-center justify-between border-b border-line/60 py-1">
                        <span className="text-muted">Fundo inicial de troco</span>
                        <span className="font-semibold tabular-nums text-ink">{formatCurrency(dia.gaveta.fundoInicial)}</span>
                      </div>
                      <div className="flex items-center justify-between border-b border-line/60 py-1">
                        <span className="text-muted">(+) Entradas em dinheiro</span>
                        <span className="font-semibold tabular-nums text-success-text">+ {formatCurrency(dia.gaveta.entradasDinheiro)}</span>
                      </div>
                      {dia.gaveta.suprimentos > 0 && (
                        <div className="flex items-center justify-between border-b border-line/60 py-1">
                          <span className="text-muted">(+) Suprimentos</span>
                          <span className="font-semibold tabular-nums text-success-text">+ {formatCurrency(dia.gaveta.suprimentos)}</span>
                        </div>
                      )}
                      {dia.gaveta.sangrias > 0 && (
                        <div className="flex items-center justify-between border-b border-line/60 py-1">
                          <span className="text-muted">(−) Sangrias</span>
                          <span className="font-semibold tabular-nums text-muted">- {formatCurrency(dia.gaveta.sangrias)}</span>
                        </div>
                      )}
                      <div className="flex items-center justify-between border-b border-line/60 py-1">
                        <span className="text-muted">(−) Saídas em dinheiro</span>
                        <span className="font-semibold tabular-nums text-muted">- {formatCurrency(dia.gaveta.saidasDinheiro)}</span>
                      </div>
                      <div className="flex items-center justify-between pt-2">
                        <span className="font-bold text-ink">Total esperado na gaveta</span>
                        <span className="text-[18px] font-extrabold tabular-nums text-ink">{formatCurrency(dia.gaveta.esperado)}</span>
                      </div>
                    </div>

                    <div className="mt-4 flex items-center gap-2.5 rounded-xl border border-line bg-surface-2/70 p-3 text-[11px] text-muted">
                      {!caixaFechado ? (
                        <>
                          <Icon name="info" size={16} className="shrink-0 text-muted" />
                          <span>Confira ao fechar o caixa</span>
                        </>
                      ) : diferenca === 0 ? (
                        <>
                          <Icon name="check_circle" size={16} className="shrink-0 text-success-text" />
                          <span>Valor contado confere com o esperado na gaveta.</span>
                        </>
                      ) : (
                        <>
                          <Icon name="error" size={16} className={cn('shrink-0', (diferenca ?? 0) < 0 ? 'text-danger' : 'text-warning-text')} />
                          <span>
                            Contado {formatCurrency(sessao?.countedBalance ?? 0)} · esperado {formatCurrency(sessao?.expectedBalance ?? dia.gaveta.esperado)}
                          </span>
                        </>
                      )}
                    </div>

                    {dia.movimentos.length > 0 && (
                      <div className="mt-4 border-t border-line pt-4">
                        <h4 className="mb-2 text-[13px] font-bold text-ink">Sangrias e suprimentos</h4>
                        <ul className="flex flex-col gap-2">
                          {dia.movimentos.map(mov => (
                            <li key={mov.id} className="flex items-center justify-between gap-2 text-[12px]">
                              <span className="flex min-w-0 items-center gap-1.5">
                                <Icon
                                  name={mov.kind === 'sangria' ? 'remove_circle_outline' : 'add_circle_outline'}
                                  size={16}
                                  className={mov.kind === 'sangria' ? 'shrink-0 text-danger' : 'shrink-0 text-success-text'}
                                />
                                <span className="truncate text-ink">
                                  <strong className="font-semibold">{mov.kind === 'sangria' ? 'Sangria' : 'Suprimento'}</strong>
                                  {mov.descricao ? ` · ${mov.descricao}` : ''}
                                </span>
                                <span className="shrink-0 tabular-nums text-muted">{hora(mov.criadoEm)}</span>
                              </span>
                              <span className={cn('shrink-0 font-semibold tabular-nums', mov.kind === 'sangria' ? 'text-danger' : 'text-success-text')}>
                                {mov.kind === 'sangria' ? '- ' : '+ '}{formatCurrency(mov.valor)}
                              </span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </Card>
                </div>
              </div>
            </>
          )}

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
        defaultDate={dataNovaDespesa}
      />

      <MovimentoCaixaModal
        isOpen={movimentoAberto}
        onClose={() => setMovimentoAberto(false)}
        onSalvo={setDia}
      />

      {dia && (
        <FecharCaixaModal
          isOpen={fecharAberto}
          dia={dia}
          onClose={() => setFecharAberto(false)}
          onFechado={setDia}
        />
      )}

      {comandaAppointmentId && (
        <ComandaModal
          appointmentId={comandaAppointmentId}
          onClose={() => setComandaAppointmentId(null)}
          onAtualizada={() => carregarCaixa(dataSelecionada)}
        />
      )}
    </div>
  );
};
