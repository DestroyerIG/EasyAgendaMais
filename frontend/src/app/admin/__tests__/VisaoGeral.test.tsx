import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import type { AdminVisaoGeral } from '@/types/admin';

const adminApi = vi.hoisted(() => ({ getMetrics: vi.fn() }));
vi.mock('@/lib/adminApi', () => ({ adminApi }));

const { default: AdminHomePage } = await import('../page');

const metricas = (extra: Partial<AdminVisaoGeral> = {}): AdminVisaoGeral => ({
  atualizadoEm: '2026-10-30T13:05:00.000Z',
  mrr: { mrr: 297, mrrMesAnterior: 198, variacaoPct: 50, novos: 99, churn: 0 },
  testes: { ativos: 12, vencendo48h: 3, novosNaSemana: 4 },
  conversao: {
    geral: { criados: 20, pagantes: 5, taxaPct: 25 },
    segmentos: [
      { segmento: 'barbearia', criados: 10, pagantes: 3, taxaPct: 30, ticketMedio: 99 },
      { segmento: 'unhas', criados: 5, pagantes: 1, taxaPct: 20, ticketMedio: 49 },
      { segmento: 'cilios_sobrancelhas', criados: 0, pagantes: 0, taxaPct: null, ticketMedio: null },
      { segmento: 'cabelo', criados: 3, pagantes: 1, taxaPct: 33.3, ticketMedio: 199 },
      { segmento: 'estetica', criados: 1, pagantes: 0, taxaPct: 0, ticketMedio: null },
      { segmento: 'outro', criados: 1, pagantes: 0, taxaPct: 0, ticketMedio: null },
    ],
  },
  cancelamentos: { cancelamentosMes: 2, churnContas: 2, receitaCancelada: 148, retencaoPct: 90 },
  emRisco: [
    {
      id: 'n1',
      nome: 'Studio Aurora',
      dono: 'Carla Silva',
      whatsapp: '11987654321',
      segmento: 'unhas',
      plano: 'profissional',
      tipo: 'whatsapp',
      desde: '2026-10-27T13:00:00.000Z',
      mrr: 99,
      pagante: true,
    },
  ],
  disparos24h: [
    { origem: 'lembrete', enviados: 90, falhos: 10 },
    { origem: 'xpto', enviados: 5, falhos: 0 },
  ],
  ...extra,
});

beforeEach(() => {
  vi.clearAllMocks();
  adminApi.getMetrics.mockResolvedValue(metricas());
});

describe('Visão geral do SuperAdmin', () => {
  it('mostra o MRR em reais', async () => {
    render(<AdminHomePage />);
    expect(await screen.findByText('R$ 297,00')).toBeInTheDocument();
    expect(screen.getByText('+50,0%')).toBeInTheDocument();
  });

  it('variação nula do MRR mostra "—"', async () => {
    adminApi.getMetrics.mockResolvedValue(
      metricas({ mrr: { mrr: 297, mrrMesAnterior: 0, variacaoPct: null, novos: 297, churn: 0 } }),
    );
    render(<AdminHomePage />);
    const cartao = await screen.findByRole('region', { name: 'Receita recorrente (MRR)' });
    expect(within(cartao).getByText('—')).toBeInTheDocument();
  });

  it('não mostra os blocos tirados do Stitch', async () => {
    render(<AdminHomePage />);
    await screen.findByText('R$ 297,00');
    expect(screen.queryByText(/Expansão/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Exportar BI/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Tempo real/)).not.toBeInTheDocument();
  });

  it('a tabela de risco avisa no WhatsApp e leva ao detalhe do negócio', async () => {
    render(<AdminHomePage />);
    const tabela = await screen.findByRole('table');
    const aviso = within(tabela).getByRole('link', { name: /Avisar no WhatsApp/ });
    expect(aviso.getAttribute('href')).toMatch(/^https:\/\/wa\.me\/55/);
    expect(aviso).toHaveAttribute('target', '_blank');
    expect(within(tabela).getByRole('link', { name: 'Studio Aurora' })).toHaveAttribute('href', '/admin/negocios/n1');
    expect(within(tabela).getByText('WhatsApp desconectado')).toBeInTheDocument();
  });

  it('na tabela de risco, pagante mostra o valor por mês e teste mostra o valor como potencial', async () => {
    const base = metricas().emRisco[0];
    adminApi.getMetrics.mockResolvedValue(metricas({
      emRisco: [
        base,
        {
          ...base, id: 'n2', nome: 'Studio Teste', tipo: 'teste_sem_onboarding', plano: 'premium', mrr: 199, pagante: false,
        },
      ],
    }));
    render(<AdminHomePage />);
    const tabela = await screen.findByRole('table');
    const [, pagante, teste] = within(tabela).getAllByRole('row');
    expect(within(pagante).getByText('R$ 99,00/mês')).toBeInTheDocument();
    expect(within(pagante).queryByText(/Potencial/)).not.toBeInTheDocument();
    expect(within(teste).getByText('Potencial R$ 199,00/mês')).toBeInTheDocument();
    expect(within(tabela).getByRole('columnheader', { name: 'Valor' })).toBeInTheDocument();
  });

  it('cancelamentos: o número grande é de cancelamentos no mês e os pagantes perdidos vêm com a receita', async () => {
    adminApi.getMetrics.mockResolvedValue(metricas({
      cancelamentos: { cancelamentosMes: 5, churnContas: 2, receitaCancelada: 148, retencaoPct: 90 },
    }));
    render(<AdminHomePage />);
    const cartao = await screen.findByRole('region', { name: 'Cancelamentos no mês' });
    expect(within(cartao).getByText('5')).toBeInTheDocument();
    expect(within(cartao).getByText('2 pagantes perdidos · R$ 148,00')).toBeInTheDocument();
  });

  it('cancelamentos: um pagante perdido fica no singular', async () => {
    adminApi.getMetrics.mockResolvedValue(metricas({
      cancelamentos: { cancelamentosMes: 1, churnContas: 1, receitaCancelada: 99, retencaoPct: 95 },
    }));
    render(<AdminHomePage />);
    const cartao = await screen.findByRole('region', { name: 'Cancelamentos no mês' });
    expect(within(cartao).getByText('1 pagante perdido · R$ 99,00')).toBeInTheDocument();
  });

  it('lista de risco vazia mostra o estado vazio', async () => {
    adminApi.getMetrics.mockResolvedValue(metricas({ emRisco: [] }));
    render(<AdminHomePage />);
    expect(await screen.findByText('Nenhum negócio em risco agora.')).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('mostra os testes, a conversão e os cancelamentos com os textos combinados', async () => {
    render(<AdminHomePage />);
    await screen.findByText('R$ 297,00');
    expect(screen.getByText('+4 nesta semana')).toBeInTheDocument();
    expect(screen.getByText('Contas em período de teste (7 dias sem cartão ou 14 com cartão)')).toBeInTheDocument();
    expect(screen.getByText('5 de 20 convertidos')).toBeInTheDocument();
    expect(screen.getByText('Retenção 90,0%')).toBeInTheDocument();
    expect(screen.getAllByText(/Testes no período/)).toHaveLength(6);
  });

  it('disparos: taxa real e "Outros" para origem desconhecida', async () => {
    render(<AdminHomePage />);
    const bloco = await screen.findByRole('region', { name: 'Disparos de WhatsApp (24 h)' });
    // (90 + 5) / (90 + 5 + 10) = 90,5%
    expect(within(bloco).getByText('Taxa 90,5%')).toBeInTheDocument();
    expect(within(bloco).getByText('Lembretes')).toBeInTheDocument();
    expect(within(bloco).getByText('Outros')).toBeInTheDocument();
  });

  it('recarregar busca as métricas de novo', async () => {
    render(<AdminHomePage />);
    await screen.findByText('R$ 297,00');
    expect(adminApi.getMetrics).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'Recarregar' }));
    await waitFor(() => expect(adminApi.getMetrics).toHaveBeenCalledTimes(2));
  });

  it('erro ao carregar mostra o aviso e deixa tentar de novo', async () => {
    adminApi.getMetrics.mockRejectedValueOnce(new Error('falhou'));
    render(<AdminHomePage />);
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }));
    expect(await screen.findByText('R$ 297,00')).toBeInTheDocument();
  });
});
