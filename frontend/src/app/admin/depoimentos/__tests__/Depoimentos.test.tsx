import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import type { DepoimentoAdmin } from '@/types/admin';

const adminApi = vi.hoisted(() => ({
  listarDepoimentos: vi.fn(),
  publicarDepoimento: vi.fn(),
  recusarDepoimento: vi.fn(),
  corrigirDepoimento: vi.fn(),
}));
vi.mock('@/lib/adminApi', () => ({ adminApi }));

const { default: DepoimentosPage } = await import('../page');

const item = (extra: Partial<DepoimentoAdmin> = {}): DepoimentoAdmin => ({
  id: 'd1',
  negocio: 'Studio Aurora',
  negocioId: 'n1',
  plano: 'profissional',
  nomeExibido: 'Carla S.',
  cidade: 'Campina Grande',
  nota: 5,
  texto: 'A agenda ficou muito mais organizada e as clientes adoram o link.',
  textoOriginal: null,
  autorizadoEm: '2026-10-20T15:00:00.000Z',
  criadoEm: '2026-10-20T15:00:00.000Z',
  status: 'pendente',
  ...extra,
});

const abrirAba = (nome: string) => {
  const aba = screen.getByRole('tab', { name: nome });
  fireEvent.mouseDown(aba, { button: 0 });
  fireEvent.click(aba);
};

beforeEach(() => {
  vi.clearAllMocks();
  adminApi.listarDepoimentos.mockResolvedValue({ data: [item()], publicados: 0 });
  adminApi.publicarDepoimento.mockResolvedValue(undefined);
  adminApi.recusarDepoimento.mockResolvedValue(undefined);
  adminApi.corrigirDepoimento.mockResolvedValue(undefined);
});

// Primeiro render carrega o módulo todo; em máquina lenta passa dos 5 s padrão.
describe('SuperAdmin Depoimentos', { timeout: 30000 }, () => {
  it('mostra as quatro abas e carrega os pendentes', async () => {
    render(<DepoimentosPage />);
    for (const nome of ['Pendentes', 'Publicados', 'Recusados', 'Avaliações internas']) {
      expect(screen.getByRole('tab', { name: nome })).toBeInTheDocument();
    }
    expect(await screen.findByText('Studio Aurora')).toBeInTheDocument();
    expect(adminApi.listarDepoimentos).toHaveBeenCalledWith('pendentes');
    expect(screen.getByLabelText('Nota 5 de 5')).toBeInTheDocument();
    expect(screen.getByText(/Carla S\./)).toBeInTheDocument();
    expect(screen.getByText(/Campina Grande/)).toBeInTheDocument();
    expect(screen.getByText('Autorizou exibir no site em 20/10/2026')).toBeInTheDocument();
  });

  it('na aba Publicados mostra o progresso até o mínimo da landing', async () => {
    adminApi.listarDepoimentos.mockResolvedValue({ data: [item({ status: 'publicado' })], publicados: 1 });
    render(<DepoimentosPage />);
    abrirAba('Publicados');
    expect(await screen.findByText('1 de 3 para a seção aparecer')).toBeInTheDocument();
  });

  it('com 3 ou mais publicados não mostra o aviso', async () => {
    adminApi.listarDepoimentos.mockResolvedValue({ data: [item({ status: 'publicado' })], publicados: 3 });
    render(<DepoimentosPage />);
    abrirAba('Publicados');
    await screen.findByText('Studio Aurora');
    expect(screen.queryByText(/para a seção aparecer/)).not.toBeInTheDocument();
  });

  it('Publicar chama a API e recarrega a lista', async () => {
    render(<DepoimentosPage />);
    fireEvent.click(await screen.findByRole('button', { name: 'Publicar' }));
    await waitFor(() => expect(adminApi.publicarDepoimento).toHaveBeenCalledWith('d1'));
    await waitFor(() => expect(adminApi.listarDepoimentos).toHaveBeenCalledTimes(2));
  });

  it('Recusar chama a API', async () => {
    render(<DepoimentosPage />);
    fireEvent.click(await screen.findByRole('button', { name: 'Recusar' }));
    await waitFor(() => expect(adminApi.recusarDepoimento).toHaveBeenCalledWith('d1'));
  });

  it('Corrigir texto abre o campo no card e salva', async () => {
    render(<DepoimentosPage />);
    fireEvent.click(await screen.findByRole('button', { name: 'Corrigir texto' }));
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Texto corrigido com mais de vinte caracteres.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar correção' }));
    await waitFor(() =>
      expect(adminApi.corrigirDepoimento).toHaveBeenCalledWith('d1', 'Texto corrigido com mais de vinte caracteres.'),
    );
  });

  it('mostra o erro do servidor (409) e recarrega', async () => {
    adminApi.publicarDepoimento.mockRejectedValue({ response: { data: { error: 'Este depoimento já foi tratado.' } } });
    render(<DepoimentosPage />);
    fireEvent.click(await screen.findByRole('button', { name: 'Publicar' }));
    expect(await screen.findByText('Este depoimento já foi tratado.')).toBeInTheDocument();
    await waitFor(() => expect(adminApi.listarDepoimentos).toHaveBeenCalledTimes(2));
  });

  it('item corrigido mostra o texto original para conferência', async () => {
    adminApi.listarDepoimentos.mockResolvedValue({
      data: [item({ textoOriginal: 'texto bruto digitado pelo dono do negócio' })],
      publicados: 0,
    });
    render(<DepoimentosPage />);
    expect(await screen.findByText('texto bruto digitado pelo dono do negócio')).toBeInTheDocument();
    expect(screen.getByText(/Texto original/)).toBeInTheDocument();
  });

  it('avaliações internas é só leitura', async () => {
    adminApi.listarDepoimentos.mockResolvedValue({ data: [item({ status: 'interno', nota: 2 })], publicados: 0 });
    render(<DepoimentosPage />);
    abrirAba('Avaliações internas');
    await waitFor(() => expect(adminApi.listarDepoimentos).toHaveBeenLastCalledWith('internos'));
    await screen.findByText('Studio Aurora');
    expect(screen.queryByRole('button', { name: 'Publicar' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Recusar' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Corrigir texto' })).not.toBeInTheDocument();
  });
});
