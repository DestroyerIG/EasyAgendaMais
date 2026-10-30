import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { AxiosError, AxiosHeaders } from 'axios';
import { ToastProvider } from '@/components/Toast';
import type { DetalheNegocio, PaginatedAdminResponse, RegistroAuditoria } from '@/types/admin';

const ID = '1a2b3c4d-5e6f-7a8b-9c0d-112233445566';

const adminApi = vi.hoisted(() => ({
  getTenantDetails: vi.fn(),
  getTenantAudit: vi.fn(),
  exportTenantAuditCsv: vi.fn(),
  extendTrial: vi.fn(),
  blockTenant: vi.fn(),
  unblockTenant: vi.fn(),
  resyncSubscription: vi.fn(),
  overrideSubscriptionPlan: vi.fn(),
  overrideSubscriptionStatus: vi.fn(),
  cancelSubscriptionAdmin: vi.fn(),
}));

vi.mock('@/lib/adminApi', () => ({ adminApi }));
vi.mock('next/navigation', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/navigation')>()),
  useParams: () => ({ id: ID }),
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
}));

const { default: AdminNegocioDetalhePage } = await import('../page');

type Negocio = DetalheNegocio['negocio'];

const detalhe = (negocio: Partial<Negocio> = {}, extra: Partial<DetalheNegocio> = {}): DetalheNegocio => ({
  negocio: {
    id: ID,
    nome: 'Studio Aurora',
    dono: 'Carla Silva',
    email: 'carla@aurora.com',
    whatsapp: '11987654321',
    endereco: 'Rua das Flores, 10 - Campina Grande, PB',
    segmento: 'unhas',
    plano: 'profissional',
    preco: 99.9,
    status: 'ativo',
    whatsappConectado: true,
    whatsappConectadoEm: '2026-10-01T12:00:00.000Z',
    agendamentos30d: 40,
    ultimaAtividadeEm: null,
    diasRestantesTeste: null,
    cpfCnpj: null,
    slug: 'studio-aurora',
    criadoEm: '2026-03-01T12:00:00.000Z',
    suspensoMotivo: null,
    statusAssinatura: 'active',
    fimDoPeriodo: '2026-11-15T12:00:00.000Z',
    temAssinaturaGateway: true,
    jaPagou: true,
    usuarioDonoId: 'u1',
    ...negocio,
  },
  ltv: { total: 699.3, ciclos: 7, desde: '2026-03-15T12:00:00.000Z' },
  proximaCobranca: { data: '2026-11-15T12:00:00.000Z', valor: 99.9 },
  faturas: [
    {
      id: 'f1',
      data: '2026-10-15T12:00:00.000Z',
      referencia: 'out/2026',
      periodoInicio: null,
      periodoFim: null,
      valor: 99.9,
      forma: 'pix',
      formaDetalhe: 'Pix',
      status: 'pago',
      tipo: 'mensalidade',
      url: 'https://pagamento.exemplo/f1',
    },
  ],
  uso: {
    profissionaisAtivas: 2,
    agendamentosMes: 50,
    agendamentosComSinalMes: 30,
    clientes: 482,
    clientesNovosMes: 28,
    lembretesLigados: true,
    enviosMes: { enviados: 120, falhos: 3 },
    limiteProfissionais: 5,
    paginaPublica: 'https://easyagenda.com.br/studio-aurora',
  },
  ...extra,
});

const auditoria = (): PaginatedAdminResponse<RegistroAuditoria> => ({
  data: [
    {
      id: 'a1',
      criadoEm: '2026-10-20T15:00:00.000Z',
      acao: 'TENANT_BLOCKED',
      status: 'success',
      ator: 'admin@easyagenda.com',
      detalhes: null,
      ip: null,
    },
  ],
  meta: { total: 1, page: 1, limit: 10, totalPages: 1 },
});

const abrir = () =>
  render(
    <ToastProvider>
      <AdminNegocioDetalhePage />
    </ToastProvider>,
  );

beforeEach(() => {
  vi.clearAllMocks();
  adminApi.getTenantDetails.mockResolvedValue(detalhe());
  adminApi.getTenantAudit.mockResolvedValue(auditoria());
  adminApi.extendTrial.mockResolvedValue({ tenantId: ID, fimDoTeste: '2026-11-10T12:00:00.000Z' });
  adminApi.blockTenant.mockResolvedValue({});
  adminApi.overrideSubscriptionPlan.mockResolvedValue({});
});

describe('Detalhes do negócio', () => {
  it('mostra o id curto, a trilha e os dados do cabeçalho', async () => {
    abrir();
    expect(await screen.findByRole('heading', { name: 'Studio Aurora', level: 1 })).toBeInTheDocument();
    expect(screen.getByText('#1a2b3c4d')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Negócios' })).toHaveAttribute('href', '/admin/negocios');
    expect(screen.getByText('Carla Silva')).toBeInTheDocument();
    expect(screen.getByText('R$ 99,90 / mês')).toBeInTheDocument();
    expect(screen.getByText('R$ 699,30')).toBeInTheDocument();
    expect(screen.getByText('7 ciclos')).toBeInTheDocument();
    expect(screen.getByText('2 / 5 vagas')).toBeInTheDocument();
    expect(screen.getByText('30 de 50')).toBeInTheDocument();
    expect(screen.getByText('Agendamentos com sinal no mês')).toBeInTheDocument();
    expect(screen.getByText('+28 novas no mês')).toBeInTheDocument();
    expect(screen.getByText('120 enviados e 3 falhos no mês')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /2ª via/ })).toHaveAttribute('href', 'https://pagamento.exemplo/f1');
    expect(screen.queryByText(/#SA-/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Engine/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Cliente verificado/i)).not.toBeInTheDocument();
  });

  it('com assinatura ativa, não existe "Estender teste grátis"', async () => {
    abrir();
    await screen.findByText('#1a2b3c4d');
    expect(screen.queryByRole('button', { name: /Estender teste grátis/ })).not.toBeInTheDocument();
  });

  it('em teste sem gateway, estender com motivo e 5 dias chama extendTrial e recarrega', async () => {
    adminApi.getTenantDetails.mockResolvedValue(
      detalhe({ statusAssinatura: 'trialing', temAssinaturaGateway: false, jaPagou: false, status: 'teste' }),
    );
    abrir();
    fireEvent.click(await screen.findByRole('button', { name: /Estender teste grátis/ }));
    const modal = await screen.findByRole('dialog');
    fireEvent.change(within(modal).getByLabelText(/Dias/), { target: { value: '5' } });
    fireEvent.change(within(modal).getByLabelText(/Motivo/), { target: { value: 'adaptação da equipe' } });
    fireEvent.click(within(modal).getByRole('button', { name: 'Estender teste' }));
    await waitFor(() => expect(adminApi.extendTrial).toHaveBeenCalledWith(ID, 5, 'adaptação da equipe'));
    await waitFor(() => expect(adminApi.getTenantDetails).toHaveBeenCalledTimes(2));
    expect(adminApi.getTenantAudit).toHaveBeenCalledTimes(2);
  });

  it('teste com assinatura no gateway não pode ser estendido aqui', async () => {
    adminApi.getTenantDetails.mockResolvedValue(detalhe({ statusAssinatura: 'trialing', temAssinaturaGateway: true }));
    abrir();
    await screen.findByText('#1a2b3c4d');
    expect(screen.queryByRole('button', { name: /Estender teste grátis/ })).not.toBeInTheDocument();
  });

  it('faturas: null mostra a frase de erro', async () => {
    adminApi.getTenantDetails.mockResolvedValue(detalhe({}, { faturas: null }));
    abrir();
    expect(await screen.findByText('Não foi possível carregar as faturas agora.')).toBeInTheDocument();
  });

  it('sem faturas mostra o estado vazio', async () => {
    adminApi.getTenantDetails.mockResolvedValue(detalhe({}, { faturas: [], proximaCobranca: null }));
    abrir();
    expect(await screen.findByText('Nenhuma fatura ainda.')).toBeInTheDocument();
    expect(screen.queryByText(/Próxima cobrança/)).not.toBeInTheDocument();
  });

  it('a aba "Financeiro" consulta a auditoria da categoria', async () => {
    abrir();
    await screen.findByText('Conta bloqueada');
    fireEvent.click(screen.getByRole('button', { name: 'Financeiro' }));
    await waitFor(() =>
      expect(adminApi.getTenantAudit).toHaveBeenLastCalledWith(ID, expect.objectContaining({ categoria: 'financeiro', page: 1 })),
    );
  });

  it('mudar plano envia o plano escolhido e o motivo', async () => {
    abrir();
    fireEvent.click(await screen.findByRole('button', { name: /Mudar plano/ }));
    const modal = await screen.findByRole('dialog');
    fireEvent.change(within(modal).getByLabelText(/Plano/), { target: { value: 'premium' } });
    fireEvent.change(within(modal).getByLabelText(/Motivo/), { target: { value: 'pedido do dono' } });
    fireEvent.click(within(modal).getByRole('button', { name: 'Mudar plano' }));
    await waitFor(() => expect(adminApi.overrideSubscriptionPlan).toHaveBeenCalledWith(ID, 'premium', 'pedido do dono'));
  });

  it('erro na ação mostra a mensagem do backend', async () => {
    adminApi.blockTenant.mockRejectedValue(
      new AxiosError('falhou', '400', undefined, undefined, {
        status: 400,
        statusText: 'Bad Request',
        headers: {},
        config: { headers: new AxiosHeaders() },
        data: { message: 'Negócio já bloqueado.' },
      }),
    );
    abrir();
    fireEvent.click(await screen.findByRole('button', { name: /Bloquear acesso/ }));
    const modal = await screen.findByRole('dialog');
    fireEvent.change(within(modal).getByLabelText(/Motivo/), { target: { value: 'fraude' } });
    fireEvent.click(within(modal).getByRole('button', { name: 'Bloquear acesso' }));
    expect(await screen.findByText('Negócio já bloqueado.')).toBeInTheDocument();
  });

  it('negócio bloqueado pelo admin mostra "Desbloquear acesso"', async () => {
    adminApi.getTenantDetails.mockResolvedValue(detalhe({ status: 'bloqueado_admin' }));
    abrir();
    expect(await screen.findByRole('button', { name: /Desbloquear acesso/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Bloquear acesso/ })).not.toBeInTheDocument();
  });

  it('não existem "Login como" nem "Aplicar cupom"', async () => {
    abrir();
    await screen.findByText('#1a2b3c4d');
    expect(screen.queryByText(/Login como/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Aplicar cupom/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/LGPD/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Grade de funcionamento/i)).not.toBeInTheDocument();
  });
});
