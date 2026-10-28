import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const showToast = vi.fn();
const toastApi = { showToast };
vi.mock('@/components/Toast', () => ({ useToast: () => toastApi }));

const carencia = vi.hoisted(() => ({ ativa: false }));
vi.mock('@/hooks/useBloqueadoNaCarencia', () => ({
  useBloqueadoNaCarencia: () => ({
    bloqueado: carencia.ativa,
    dica: carencia.ativa ? 'Disponível depois de regularizar' : undefined,
  }),
}));

const api = vi.hoisted(() => ({
  listarCampanhas: vi.fn(),
  cancelarCampanha: vi.fn(),
  detalhesCampanha: vi.fn(),
}));
vi.mock('@/lib/whatsappCampanhas', async (original) => ({ ...(await original<object>()), ...api }));
vi.mock('../campanhas/NovaCampanha', () => ({
  NovaCampanha: (p: { campanha?: { nome: string }; onFechar: (r: boolean) => void }) => (
    <div>tela-nova{p.campanha ? `:${p.campanha.nome}` : ''}<button onClick={() => p.onFechar(false)}>Voltar</button></div>
  ),
}));

import { Campanhas } from '../campanhas/Campanhas';
import { previsaoDuracao, type CampanhaDto, type DetalhesCampanhaDto } from '@/lib/whatsappCampanhas';

const camp = (o: Partial<CampanhaDto> = {}): CampanhaDto => ({
  id: 'c1', nome: 'Volta de maio', segmento: 'em_risco', professionalId: null, serviceId: null, texto: 'Oi',
  data: '2026-10-25', hora: '10:00', cadencia: 25, status: 'enviando', total: 40, enviadas: 12, createdAt: '2026-10-20T10:00:00Z', ...o,
});

describe('previsaoDuracao', () => {
  it('formata horas e minutos', () => {
    expect(previsaoDuracao(36, 25, '10:00')).toBe('1h 27min');
    expect(previsaoDuracao(10, 25, '10:00')).toBe('24min');
  });
  it('avisa quando passa das 20h', () => {
    expect(previsaoDuracao(300, 10, '10:00').endsWith('continua no dia seguinte às 08:00')).toBe(true);
  });
});

describe('Campanhas', () => {
  beforeEach(() => {
    Object.values(api).forEach((f) => f.mockReset());
    showToast.mockReset();
    carencia.ativa = false;
  });

  it('em carência desabilita "Nova campanha" com a dica', async () => {
    carencia.ativa = true;
    api.listarCampanhas.mockResolvedValue([camp()]);
    render(<Campanhas conectado nomeNegocio="Studio" />);
    const botao = await screen.findByRole('button', { name: /Nova campanha/ });
    expect(botao).toBeDisabled();
    expect(botao).toHaveAttribute('title', 'Disponível depois de regularizar');
  });

  it('lista vazia convida a criar e abre a criação', async () => {
    api.listarCampanhas.mockResolvedValue([]);
    render(<Campanhas conectado nomeNegocio="Studio" />);
    expect(await screen.findByText('Nenhuma campanha ainda')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Criar primeira campanha' }));
    expect(screen.getByText('tela-nova')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Voltar' }));
    expect(await screen.findByText('Nenhuma campanha ainda')).toBeInTheDocument();
  });

  it('campanha enviando mostra progresso e cancela com confirmação no cartão', async () => {
    api.listarCampanhas.mockResolvedValue([camp()]);
    api.cancelarCampanha.mockResolvedValue(undefined);
    const confirmar = vi.spyOn(window, 'confirm');
    render(<Campanhas conectado nomeNegocio="Studio" />);
    expect(await screen.findByText('Enviando')).toBeInTheDocument();
    expect(screen.getByText('12/40')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Cancelar envio' }));
    expect(api.cancelarCampanha).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: 'Sim, cancelar' }));
    await waitFor(() => expect(api.cancelarCampanha).toHaveBeenCalledWith('c1'));
    expect(confirmar).not.toHaveBeenCalled();
  });

  it('depois de cancelar, o cartão fecha a confirmação e mostra Ver detalhes', async () => {
    api.listarCampanhas.mockResolvedValueOnce([camp()]).mockResolvedValueOnce([camp({ status: 'cancelada' })]);
    api.cancelarCampanha.mockResolvedValue(undefined);
    render(<Campanhas conectado nomeNegocio="Studio" />);
    await userEvent.click(await screen.findByRole('button', { name: 'Cancelar envio' }));
    await userEvent.click(screen.getByRole('button', { name: 'Sim, cancelar' }));
    expect(await screen.findByText('Cancelada')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Sim, cancelar' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Ver detalhes' })).toBeInTheDocument();
  });

  it('se o cancelamento falha, recarrega a lista e fecha a confirmação', async () => {
    api.listarCampanhas.mockResolvedValueOnce([camp()]).mockResolvedValueOnce([camp({ status: 'concluida', enviadas: 40 })]);
    api.cancelarCampanha.mockRejectedValue(new Error('409'));
    render(<Campanhas conectado nomeNegocio="Studio" />);
    await userEvent.click(await screen.findByRole('button', { name: 'Cancelar envio' }));
    await userEvent.click(screen.getByRole('button', { name: 'Sim, cancelar' }));
    expect(await screen.findByText('Concluída')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Sim, cancelar' })).toBeNull();
    expect(showToast).toHaveBeenCalledWith(expect.any(String), 'error');
  });

  it('rascunho oferece continuar editando e não mostra progresso', async () => {
    api.listarCampanhas.mockResolvedValue([camp({ status: 'rascunho', total: 0, enviadas: 0 })]);
    render(<Campanhas conectado nomeNegocio="Studio" />);
    expect(await screen.findByText('Rascunho')).toBeInTheDocument();
    expect(screen.queryByText(/^\d+\/\d+$/)).toBeNull();
    expect(screen.queryByRole('button', { name: 'Ver detalhes' })).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Continuar editando' }));
    expect(screen.getByText('tela-nova:Volta de maio')).toBeInTheDocument();
  });

  it('Ver detalhes abre o modal com o motivo do item pulado', async () => {
    api.listarCampanhas.mockResolvedValue([camp()]);
    const det: DetalhesCampanhaDto = {
      campanha: camp(),
      contagem: { enviadas: 12, naFila: 27, puladas: 1, falhas: 0, canceladas: 0 },
      itens: [{ id: 'i1', nome: 'Juliana Paes', telefone: '5583999990000', status: 'pulado', motivo: 'Pediu para não receber mensagens', enviadoEm: null }],
    };
    api.detalhesCampanha.mockResolvedValue(det);
    render(<Campanhas conectado nomeNegocio="Studio" />);
    await userEvent.click(await screen.findByRole('button', { name: 'Ver detalhes' }));
    expect(await screen.findByText('Pediu para não receber mensagens')).toBeInTheDocument();
    expect(screen.getByText('Juliana Paes')).toBeInTheDocument();
    expect(api.detalhesCampanha).toHaveBeenCalledWith('c1');
  });
});
