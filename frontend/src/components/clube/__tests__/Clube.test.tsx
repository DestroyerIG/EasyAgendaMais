import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import * as clube from '@/lib/clube';
import { PlanosModule } from '../PlanosModule';
import { AssinantesModule } from '../AssinantesModule';
import { AdesaoClube, ClubeVitrine } from '../AdesaoClube';
import { SeloClube } from '../SeloClube';

const showToast = vi.hoisted(() => vi.fn());
const usuario = vi.hoisted(() => ({ role: 'tenant_admin' }));

vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: { role: usuario.role } }) }));
vi.mock('@/components/Toast', () => ({ useToast: () => ({ showToast }) }));
vi.mock('qrcode', () => ({ default: { toDataURL: vi.fn().mockResolvedValue('data:image/png;base64,x') } }));
vi.mock('@/lib/clube', async (orig) => {
  const real = await orig<typeof import('@/lib/clube')>();
  return {
    ...real,
    clubeApi: {
      ofertas: vi.fn(), mudarStatus: vi.fn(), contratos: vi.fn(), cancelar: vi.fn(),
      reenviar: vi.fn(), confirmar: vi.fn(), doCliente: vi.fn(), exportarCsv: vi.fn(),
    },
    clubePublicoApi: { vitrine: vi.fn(), oferta: vi.fn(), aderir: vi.fn() },
  };
});

const oferta = (over: Partial<clube.Oferta> = {}): clube.Oferta => ({
  id: 'o1', tipo: 'clube', nome: 'Clube Mãos Sempre Feitas', descricao: null, preco: 199,
  servicos: [{ id: 's1', nome: 'Manutenção' }], profissionais: [], beneficios: ['Prioridade na agenda'],
  descontoExtrasPct: 10, faltaDebita: false, publica: true, sessoesPorCiclo: 2, sessoesReferencia: 2,
  intervaloMinimoDias: 14, totalSessoes: null, validadeDias: null, valorSessao: 99.5, status: 'ativa',
  contratosAtivos: 3, receitaMensal: 597, ...over,
});

const contrato = (over: Partial<clube.Contrato> = {}): clube.Contrato => ({
  id: 'ct1', tipo: 'clube', status: 'ativo', origem: 'painel',
  oferta: { id: 'o1', nome: 'Clube Mãos Sempre Feitas' },
  cliente: { id: 'c1', nome: 'Mariana Souza', telefone: '83999990000' },
  preco: 199, valorSessao: 99.5, saldo: { restantes: 1, total: 2, usadas: 1 },
  cicloInicio: '2026-10-10', cicloFim: '2026-11-09', validoAte: null, cancelaEm: null,
  proximoVencimento: '2026-11-10', cobrancaPendente: null, ultimaForma: 'pix', criadoEm: '2026-10-10T12:00:00Z',
  ...over,
});

const lista = (itens: clube.Contrato[]): clube.ListaContratos => ({
  itens, total: itens.length, pagina: 1, porPagina: 20,
  indicadores: { ativos: itens.length, receitaMensal: 199, emAtraso: 0, cancelam30dias: 0 },
});

beforeEach(() => {
  vi.clearAllMocks();
  usuario.role = 'tenant_admin';
});

describe('PlanosModule', () => {
  it('mostra os cartões, a receita e filtra por tipo', async () => {
    const user = userEvent.setup();
    vi.mocked(clube.clubeApi.ofertas).mockResolvedValue([
      oferta(),
      oferta({ id: 'o2', tipo: 'pacote', nome: 'Pacote 4 manutenções', preco: 380, publica: false, totalSessoes: 4, validadeDias: 120, sessoesPorCiclo: null, contratosAtivos: 1 }),
    ]);
    render(<PlanosModule />);
    expect(await screen.findByText('Clube Mãos Sempre Feitas')).toBeInTheDocument();
    expect(screen.getByText('Ativo na página pública')).toBeInTheDocument();
    expect(screen.getByText('4 sessões · validade de 4 meses após a 1ª sessão')).toBeInTheDocument();
    await user.click(screen.getByRole('tab', { name: /Pacotes de sessões/ }));
    expect(screen.queryByText('Clube Mãos Sempre Feitas')).not.toBeInTheDocument();
    expect(screen.getByText('Pacote 4 manutenções')).toBeInTheDocument();
  });

  it('pausar muda o status e recarrega', async () => {
    const user = userEvent.setup();
    vi.mocked(clube.clubeApi.ofertas).mockResolvedValue([oferta()]);
    vi.mocked(clube.clubeApi.mudarStatus).mockResolvedValue(oferta({ status: 'pausada' }));
    render(<PlanosModule />);
    await user.click(await screen.findByRole('button', { name: 'Pausar' }));
    await waitFor(() => expect(clube.clubeApi.mudarStatus).toHaveBeenCalledWith('o1', 'pausada'));
    expect(clube.clubeApi.ofertas).toHaveBeenCalledTimes(2);
  });

  it('equipe vê os planos mas não cria nem edita', async () => {
    usuario.role = 'professional';
    vi.mocked(clube.clubeApi.ofertas).mockResolvedValue([oferta()]);
    render(<PlanosModule />);
    await screen.findByText('Clube Mãos Sempre Feitas');
    expect(screen.queryByRole('button', { name: /Novo plano ou pacote/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Editar' })).not.toBeInTheDocument();
  });
});

describe('AssinantesModule', () => {
  it('contrato com Pix pendente: confirma o pagamento pelo modal', async () => {
    const user = userEvent.setup();
    const pendente = contrato({
      status: 'aguardando_pagamento',
      cobrancaPendente: { id: 'cb1', competencia: '2026-10', valor: 199, vencimento: '2026-10-25', status: 'pendente', pixCopiaCola: 'pix', forma: null, pagoEm: null, enviadoEm: null },
    });
    vi.mocked(clube.clubeApi.contratos).mockResolvedValue(lista([pendente]));
    vi.mocked(clube.clubeApi.confirmar).mockResolvedValue(contrato());
    render(<AssinantesModule />);
    expect(await screen.findByText('Aguardando Pix')).toBeInTheDocument();
    expect(screen.getByText(/Pix ainda não enviado/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Confirmar pagamento' }));
    await user.click(await screen.findByRole('button', { name: 'Confirmar recebimento' }));
    await waitFor(() => expect(clube.clubeApi.confirmar).toHaveBeenCalledWith('cb1', 'pix'));
    expect(showToast).toHaveBeenCalledWith('Pagamento confirmado.', 'success');
  });

  it('mostra o saldo e o próximo vencimento do clube', async () => {
    vi.mocked(clube.clubeApi.contratos).mockResolvedValue(lista([contrato()]));
    render(<AssinantesModule />);
    expect(await screen.findByText('1 de 2')).toBeInTheDocument();
    expect(screen.getByText('1 disp.')).toBeInTheDocument();
    expect(screen.getByText('10 Nov 2026')).toBeInTheDocument();
  });
});

describe('Adesão pública', () => {
  const publica: clube.OfertaPublica = {
    id: 'o1', nome: 'Clube Mãos Sempre Feitas', descricao: 'Unhas feitas o mês inteiro.', preco: 199,
    servicos: ['Manutenção'], beneficios: ['Prioridade na agenda'], sessoesPorCiclo: 2, intervaloMinimoDias: 14,
    descontoExtrasPct: 10, valorSessao: 99.5,
  };
  const negocio = { nome: 'Studio Aurora', slug: 'aurora', logoUrl: null, brandColor: null };

  it('só assina depois do consentimento e mostra o Pix', async () => {
    const user = userEvent.setup();
    vi.mocked(clube.clubePublicoApi.oferta).mockResolvedValue({ negocio, oferta: publica });
    vi.mocked(clube.clubePublicoApi.aderir).mockResolvedValue({
      oferta: { id: 'o1', nome: publica.nome }, cobranca: { valor: 199, pixCopiaCola: '000201PIX', vencimento: '2026-10-25' }, repetida: false,
    });
    render(<AdesaoClube slug="aurora" ofertaId="o1" />);
    expect(await screen.findByRole('heading', { name: 'Clube Mãos Sempre Feitas' })).toBeInTheDocument();
    expect(screen.getByText('2 sessões por mês (não cumulativas) · intervalo mínimo de 14 dias')).toBeInTheDocument();
    await user.type(screen.getByPlaceholderText('Seu nome'), 'Mariana');
    await user.type(screen.getByPlaceholderText('Seu WhatsApp'), '83999990000');
    const assinar = screen.getByRole('button', { name: 'Assinar com Pix' });
    expect(assinar).toBeDisabled();
    await user.click(screen.getByRole('checkbox'));
    await user.click(assinar);
    await waitFor(() => expect(clube.clubePublicoApi.aderir).toHaveBeenCalledWith('aurora', 'o1', { nome: 'Mariana', telefone: '83999990000', consentimento: true }));
    expect(await screen.findByLabelText('Código Pix copia e cola')).toHaveValue('000201PIX');
    expect(screen.getByText(/Assim que o salão confirmar o pagamento, sua assinatura começa/)).toBeInTheDocument();
  });

  it('clube indisponível mostra a mensagem', async () => {
    vi.mocked(clube.clubePublicoApi.oferta).mockRejectedValue(new Error('404'));
    render(<AdesaoClube slug="aurora" ofertaId="x" />);
    expect(await screen.findByText('Este clube não está disponível.')).toBeInTheDocument();
  });

  it('vitrine lista os clubes com link para a adesão e some sem clube', async () => {
    vi.mocked(clube.clubePublicoApi.vitrine).mockResolvedValue({ negocio, ofertas: [publica] });
    const { unmount } = render(<ClubeVitrine slug="aurora" />);
    expect(await screen.findByRole('link', { name: /Clube Mãos Sempre Feitas/ })).toHaveAttribute('href', '/agendar/aurora/clube/o1');
    unmount();
    vi.mocked(clube.clubePublicoApi.vitrine).mockResolvedValue({ negocio, ofertas: [] });
    const { container } = render(<ClubeVitrine slug="aurora" />);
    await waitFor(() => expect(clube.clubePublicoApi.vitrine).toHaveBeenCalledTimes(2));
    expect(container).toBeEmptyDOMElement();
  });
});

describe('SeloClube', () => {
  it('mostra só os contratos vigentes, com o atraso em destaque', async () => {
    vi.mocked(clube.clubeApi.doCliente).mockResolvedValue([
      { ...contrato({ status: 'em_atraso' }), vigente: true },
      { ...contrato({ id: 'ct2', oferta: { id: 'o2', nome: 'Pacote antigo' }, status: 'concluido' }), vigente: false },
    ]);
    render(<SeloClube clientId="c1" />);
    expect(await screen.findByText('Clube Mãos Sempre Feitas')).toBeInTheDocument();
    expect(screen.getByText('· em atraso')).toBeInTheDocument();
    expect(screen.queryByText('Pacote antigo')).not.toBeInTheDocument();
  });
});
