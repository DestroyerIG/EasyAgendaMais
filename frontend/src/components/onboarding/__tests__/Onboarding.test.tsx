import { describe, it, expect, vi, beforeEach } from 'vitest';
import { StrictMode } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ToastProvider } from '@/components/Toast';
import { erroDosHorarios } from '../EtapaHorarios';
import { erroDosServicos } from '../EtapaServicos';
import type { DiaSemana, Onboarding } from '@/lib/onboarding';
import { VOCABULARIO_PADRAO } from '@/lib/vocabulario';

const mocks = vi.hoisted(() => ({
  replace: vi.fn(),
  router: null as unknown as Record<string, unknown>,
  refreshMe: vi.fn(),
  user: { value: { role: 'tenant_admin' } as Record<string, unknown> | null },
  ver: vi.fn(),
  salvarNegocio: vi.fn(),
  salvarHorarios: vi.fn(),
  catalogo: vi.fn(),
  salvarServicos: vi.fn(),
  salvarRecebimentos: vi.fn(),
  confirmar: vi.fn(),
  googleConexao: vi.fn(),
}));

vi.mock('next/navigation', async (orig) => ({
  ...(await orig<typeof import('next/navigation')>()),
  // Mesmo objeto a cada render, como o roteador do Next.
  useRouter: () => mocks.router,
}));
vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: mocks.user.value, loading: false, refreshMe: mocks.refreshMe }),
}));
vi.mock('@/lib/onboarding', async (orig) => {
  const real = await orig<typeof import('@/lib/onboarding')>();
  return {
    ...real,
    onboardingApi: { ...real.onboardingApi, ver: mocks.ver, salvarNegocio: mocks.salvarNegocio, salvarHorarios: mocks.salvarHorarios,
      catalogo: mocks.catalogo, salvarServicos: mocks.salvarServicos, salvarRecebimentos: mocks.salvarRecebimentos,
    },
  };
});
vi.mock('@/lib/recebimentos', async (orig) => {
  const real = await orig<typeof import('@/lib/recebimentos')>();
  return { ...real, recebimentosApi: { ...real.recebimentosApi, confirmar: mocks.confirmar } };
});

vi.mock('@/lib/googleAgenda', async (orig) => {
  const real = await orig<typeof import('@/lib/googleAgenda')>();
  return { ...real, googleAgendaApi: { ...real.googleAgendaApi, conexao: mocks.googleConexao, conectar: vi.fn(), confirmar: vi.fn() } };
});

mocks.router = { push: vi.fn(), replace: mocks.replace, prefetch: vi.fn(), back: vi.fn(), forward: vi.fn(), refresh: vi.fn() };

const { OnboardingFlow } = await import('../OnboardingFlow');

const HORARIOS = { diasAbertos: ['seg', 'ter'] as DiaSemana[], abertura: '09:00', fechamento: '18:00', intervaloMinutos: 30, pausa: null };

const dados = (etapa: number, pendente = true): Onboarding => ({
  estado: { pendente, bloqueante: pendente && etapa <= 3, etapa },
  negocio: { nome: 'Studio', responsavel: 'Ana', segmento: etapa > 1 ? 'unhas' : null, modoEquipe: etapa > 1 ? 'sozinha' : null },
  horarios: { ...HORARIOS, diasAbertos: [...HORARIOS.diasAbertos] },
  servicos: [],
  pagina: { slug: null, slugSugerido: 'studio', logoUrl: null, brandColor: null, fotos: 0 },
  whatsappConectado: false,
  temChavePix: false,
  recebimentos: { conexao: null, temChavePix: false },
  vocabulario: VOCABULARIO_PADRAO,
});

const TITULO_HORARIOS = 'Quais são os dias e horários de atendimento?';
const renderFluxo = () => render(<ToastProvider><OnboardingFlow /></ToastProvider>);

describe('validações das etapas', () => {
  it('horários: pede um dia, fechamento depois da abertura e pausa dentro do expediente', () => {
    const base = { ...HORARIOS, diasAbertos: ['seg'] as DiaSemana[] };
    expect(erroDosHorarios(base)).toBeNull();
    expect(erroDosHorarios({ ...base, diasAbertos: [] })).toMatch(/pelo menos um dia/);
    expect(erroDosHorarios({ ...base, fechamento: '08:00' })).toMatch(/fechamento/);
    expect(erroDosHorarios({ ...base, pausa: { inicio: '13:00', fim: '12:00' } })).toMatch(/fim da pausa/);
    expect(erroDosHorarios({ ...base, pausa: { inicio: '08:00', fim: '09:30' } })).toMatch(/dentro do horário/);
  });

  it('serviços: pelo menos um marcado, com nome, preço, duração e sem nome repetido', () => {
    const s = { nome: 'Corte', duracaoMinutos: 30, preco: 50, marcado: true };
    expect(erroDosServicos([s])).toBeNull();
    expect(erroDosServicos([{ ...s, marcado: false }])).toMatch(/pelo menos um/);
    expect(erroDosServicos([{ ...s, nome: ' ' }])).toMatch(/nome/);
    expect(erroDosServicos([{ ...s, preco: 0 }])).toMatch(/preço/);
    expect(erroDosServicos([{ ...s, duracaoMinutos: 5 }])).toMatch(/duração/);
    expect(erroDosServicos([s, { ...s, nome: 'corte ' }])).toMatch(/mesmo nome/);
    // Desmarcado não conta, mesmo inválido.
    expect(erroDosServicos([s, { ...s, nome: '', preco: 0, marcado: false }])).toBeNull();
  });
});

describe('OnboardingFlow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.refreshMe.mockResolvedValue(undefined);
    mocks.googleConexao.mockResolvedValue({ configurado: false, conexao: null });
    mocks.user.value = { role: 'tenant_admin' };
    window.history.replaceState({}, '', '/');
    try { localStorage.clear(); } catch { /* sem storage */ }
  });

  it('quem já concluiu vai para o painel', async () => {
    mocks.ver.mockResolvedValue(dados(6, false));
    renderFluxo();
    await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith('/dashboard'));
  });

  it('quem não é a dona não passa pelo onboarding', async () => {
    mocks.user.value = { role: 'employee' };
    renderFluxo();
    await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith('/dashboard'));
    expect(mocks.ver).not.toHaveBeenCalled();
  });

  it('retoma na etapa em que parou', async () => {
    mocks.ver.mockResolvedValue(dados(2));
    renderFluxo();
    expect(await screen.findByText(TITULO_HORARIOS)).toBeInTheDocument();
  });

  it('etapa 1 só avança com segmento e equipe; salva, atualiza a sessão e vai para os horários', async () => {
    const user = userEvent.setup();
    mocks.ver.mockResolvedValue(dados(1));
    mocks.salvarNegocio.mockResolvedValue(dados(2));
    renderFluxo();

    const continuar = await screen.findByRole('button', { name: /Continuar/ });
    expect(continuar).toBeDisabled();
    await user.click(screen.getByRole('radio', { name: /Barbearia/ }));
    expect(continuar).toBeDisabled();
    await user.click(screen.getByRole('radio', { name: /Atendo sozinha/ }));
    await user.click(continuar);

    await waitFor(() => expect(mocks.salvarNegocio).toHaveBeenCalledWith('barbearia', 'sozinha'));
    expect(mocks.refreshMe).toHaveBeenCalled();
    expect(await screen.findByText(TITULO_HORARIOS)).toBeInTheDocument();
  });

  it('o segmento escolhido na landing já vem marcado', async () => {
    localStorage.setItem('easyagenda:segmento-cadastro', 'unhas');
    mocks.ver.mockResolvedValue(dados(1));
    renderFluxo();
    expect(await screen.findByRole('radio', { name: /Unhas/ })).toHaveAttribute('aria-checked', 'true');
  });

  it('voltar da etapa 2 mostra a etapa 1 sem salvar', async () => {
    const user = userEvent.setup();
    mocks.ver.mockResolvedValue(dados(2));
    renderFluxo();
    await user.click(await screen.findByRole('button', { name: /Voltar/ }));
    expect(screen.getByText('Qual é o foco principal do seu negócio?')).toBeInTheDocument();
    expect(mocks.salvarHorarios).not.toHaveBeenCalled();
  });

  it('Horários mostra o Google Agenda opcional quando o ambiente tem Google, e Continuar segue sem conectar', async () => {
    const user = userEvent.setup();
    mocks.googleConexao.mockResolvedValue({ configurado: true, conexao: null });
    mocks.ver.mockResolvedValue(dados(2));
    mocks.salvarHorarios.mockResolvedValue(dados(3));
    mocks.catalogo.mockResolvedValue([]);
    renderFluxo();
    expect(await screen.findByText('Já usa o Google Agenda?')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Conectar Google Agenda' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Continuar/ }));
    await waitFor(() => expect(mocks.salvarHorarios).toHaveBeenCalled());
  });

  it('Horários não mostra título nem botão do Google quando não está configurado', async () => {
    mocks.ver.mockResolvedValue(dados(2));
    renderFluxo();
    await screen.findByText(TITULO_HORARIOS);
    await waitFor(() => expect(mocks.googleConexao).toHaveBeenCalled());
    expect(screen.queryByText('Já usa o Google Agenda?')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Conectar Google Agenda' })).not.toBeInTheDocument();
  });

  it('erro ao salvar mantém a etapa', async () => {
    const user = userEvent.setup();
    mocks.ver.mockResolvedValue(dados(2));
    mocks.salvarHorarios.mockRejectedValue(new Error('x'));
    renderFluxo();
    await user.click(await screen.findByRole('button', { name: /Continuar/ }));
    await waitFor(() => expect(mocks.salvarHorarios).toHaveBeenCalled());
    expect(screen.getByText(TITULO_HORARIOS)).toBeInTheDocument();
  });

  it('etapa Serviços não pede sinal nem chave Pix', async () => {
    mocks.ver.mockResolvedValue(dados(3));
    mocks.catalogo.mockResolvedValue([
      { nome: 'Manicure', duracaoMinutos: 45, preco: 40, sinalPct: null, descricao: 'Mãos', marcado: true },
    ]);
    renderFluxo();
    expect(await screen.findByLabelText('Oferecer Manicure')).toBeInTheDocument();
    expect(screen.queryByText(/Exigir sinal via Pix/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Chave Pix para receber o sinal/)).not.toBeInTheDocument();
  });

  it('etapa Serviços salva só nome, duração e preço', async () => {
    const user = userEvent.setup();
    mocks.ver.mockResolvedValue(dados(3));
    mocks.catalogo.mockResolvedValue([
      { nome: 'Manicure', duracaoMinutos: 45, preco: 40, sinalPct: 30, descricao: 'Mãos', marcado: true },
    ]);
    mocks.salvarServicos.mockResolvedValue(dados(4));
    renderFluxo();
    await screen.findByLabelText('Oferecer Manicure');
    await user.click(screen.getByRole('button', { name: /Continuar/ }));
    await waitFor(() => expect(mocks.salvarServicos).toHaveBeenCalledTimes(1));
    expect(mocks.salvarServicos).toHaveBeenCalledWith([{ nome: 'Manicure', duracaoMinutos: 45, preco: 40 }]);
  });

  describe('etapa Recebimentos', () => {
    const TITULO = 'Como você quer receber o sinal?';

    it('abre na etapa 4 com o título e "Etapa 4 de 6"', async () => {
      mocks.ver.mockResolvedValue(dados(4));
      renderFluxo();
      expect(await screen.findByText(TITULO)).toBeInTheDocument();
      expect(screen.getByText('Etapa 4 de 6')).toBeInTheDocument();
    });

    it('"Configurar depois" leva a Sua página (etapa 5)', async () => {
      const user = userEvent.setup();
      mocks.ver.mockResolvedValue(dados(4));
      renderFluxo();
      await user.click(await screen.findByRole('button', { name: 'Configurar depois' }));
      expect(await screen.findByText('Etapa 5 de 6')).toBeInTheDocument();
      expect(screen.queryByText(TITULO)).not.toBeInTheDocument();
    });

    it('salvar chama salvarRecebimentos e avança para Sua página', async () => {
      const user = userEvent.setup();
      mocks.ver.mockResolvedValue(dados(4));
      mocks.salvarRecebimentos.mockResolvedValue(dados(5));
      renderFluxo();
      await user.click(await screen.findByText('Não vou cobrar sinal agora'));
      const continuar = screen.getByRole('button', { name: /Continuar/ });
      await waitFor(() => expect(continuar).toBeEnabled());
      await user.click(continuar);
      await waitFor(() => expect(mocks.salvarRecebimentos).toHaveBeenCalledTimes(1));
      expect(await screen.findByText('Etapa 5 de 6')).toBeInTheDocument();
    });

    it.each([
      ['direto', (ui: React.ReactElement) => ui],
      ['em StrictMode', (ui: React.ReactElement) => <StrictMode>{ui}</StrictMode>],
    ])('retorno do Mercado Pago confirma uma única vez (%s), avisa e limpa a URL', async (_n, envolver) => {
      window.history.pushState({}, '', '/onboarding?recebimento=confirmar&t=abc');
      const conectado = dados(4);
      conectado.recebimentos = { temChavePix: false, conexao: { gateway: 'mercadopago', contaNome: 'Conta Teste', situacao: 'ativa' } as never };
      mocks.ver.mockResolvedValueOnce(dados(4)).mockResolvedValue(conectado);
      mocks.confirmar.mockResolvedValue({});
      render(envolver(<ToastProvider><OnboardingFlow /></ToastProvider>));
      expect(await screen.findByText('Mercado Pago conectado.')).toBeInTheDocument();
      expect((await screen.findAllByText('Conectado')).length).toBeGreaterThan(0);
      expect(mocks.ver.mock.calls.length).toBeGreaterThanOrEqual(2);
      expect(mocks.confirmar).toHaveBeenCalledTimes(1);
      expect(mocks.confirmar).toHaveBeenCalledWith('abc');
      expect(window.location.search).toBe('');
      expect(screen.getByText('Etapa 4 de 6')).toBeInTheDocument();
    });

    it('retorno do Mercado Pago não pula etapas obrigatórias: etapa salva 2 continua em Horários', async () => {
      window.history.pushState({}, '', '/onboarding?recebimento=confirmar&t=abc');
      mocks.ver.mockResolvedValue(dados(2));
      mocks.confirmar.mockResolvedValue({});
      renderFluxo();
      expect(await screen.findByText('Mercado Pago conectado.')).toBeInTheDocument();
      expect(screen.getByText(TITULO_HORARIOS)).toBeInTheDocument();
      expect(mocks.confirmar).toHaveBeenCalledTimes(1);
      expect(window.location.search).toBe('');
    });

    it('retorno com erro mostra o aviso e fica na etapa 4', async () => {
      window.history.pushState({}, '', '/onboarding?recebimento=erro');
      mocks.ver.mockResolvedValue(dados(4));
      renderFluxo();
      expect(await screen.findByText('Não foi possível conectar o Mercado Pago. Tente de novo.')).toBeInTheDocument();
      expect(mocks.confirmar).not.toHaveBeenCalled();
      expect(screen.getByText('Etapa 4 de 6')).toBeInTheDocument();
      expect(window.location.search).toBe('');
    });

    it('falha ao confirmar mostra o aviso e fica na etapa 4', async () => {
      window.history.pushState({}, '', '/onboarding?recebimento=confirmar&t=abc');
      mocks.ver.mockResolvedValue(dados(4));
      mocks.confirmar.mockRejectedValue('falhou');
      renderFluxo();
      expect(await screen.findByText('Não foi possível conectar o Mercado Pago. Tente de novo.')).toBeInTheDocument();
      expect(screen.getByText('Etapa 4 de 6')).toBeInTheDocument();
    });
  });
});
