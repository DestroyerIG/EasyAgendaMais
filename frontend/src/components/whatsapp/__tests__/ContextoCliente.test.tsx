import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AxiosError } from 'axios';

const showToast = vi.fn();
const toastApi = { showToast };
vi.mock('@/components/Toast', () => ({ useToast: () => toastApi }));

const apiMock = vi.hoisted(() => ({ put: vi.fn(), post: vi.fn() }));
vi.mock('@/lib/api', () => ({ default: apiMock }));

import { ContextoCliente } from '../conversas/ContextoCliente';
import type { ContextoClienteDto, ConversaResumoDto } from '@/lib/whatsappInbox';

const conversa = (o: Partial<ConversaResumoDto> = {}): ConversaResumoDto => ({
  id: 'c1', telefone: '5583998765432', nome: 'Mariana Souza', clientId: 'cli1',
  atendimento: 'humano', status: 'aberta', responsavel: null,
  ultimaMensagemEm: new Date().toISOString(), previa: 'oi', naoLidas: 0, sinalPendente: true, ...o,
});

const mesesAtras = (n: number) => {
  const d = new Date();
  d.setMonth(d.getMonth() - n);
  d.setDate(d.getDate() - 2);
  return d.toISOString();
};

const contexto = (o: Partial<ContextoClienteDto> = {}): ContextoClienteDto => ({
  cliente: { id: 'cli1', nome: 'Mariana Souza', telefone: '5583998765432', desde: mesesAtras(8) },
  fase: 'fiel', ltv: 1820, cicloMedio: 21,
  agendamento: {
    id: 'ag1', data: '2026-09-19', hora: '14:00', status: 'aguardando_pagamento', servico: 'Manutenção gel',
    valor: 110, profissional: 'Camila Rocha', sinal: 30, expiraEm: null,
  },
  ultimasVisitas: [
    { data: '2026-08-28', servico: 'Manutenção gel', valor: 110 },
    { data: '2026-08-07', servico: 'Esmaltação', valor: 60 },
  ],
  ...o,
});

describe('ContextoCliente', () => {
  beforeEach(() => { vi.clearAllMocks(); });
  afterEach(() => { vi.clearAllMocks(); });

  it('mostra fase, tempo de cadastro, LTV e ciclo médio', () => {
    render(<ContextoCliente contexto={contexto()} conversa={conversa()} onAtualizar={vi.fn()} />);
    expect(screen.getByText('Fiel / VIP')).toBeInTheDocument();
    expect(screen.getByText('Mariana Souza')).toBeInTheDocument();
    expect(screen.getByText('Cadastrada há 8 meses')).toBeInTheDocument();
    expect(screen.getByText(/R\$\s*1\.820/)).toBeInTheDocument();
    expect(screen.getByText('21 dias')).toBeInTheDocument();
  });

  it('sem sinal não mostra valor zerado', () => {
    const base = contexto();
    render(<ContextoCliente contexto={contexto({ agendamento: { ...base.agendamento!, sinal: null } })} conversa={conversa()} onAtualizar={vi.fn()} />);
    expect(screen.getByText('O bot aguarda a confirmação do sinal Pix para travar a vaga na agenda de Camila Rocha.')).toBeInTheDocument();
    expect(screen.queryByText(/R\$\s*0,00/)).not.toBeInTheDocument();
  });

  it('agendamento aguardando mostra o texto do bot e confirma o sinal', async () => {
    apiMock.put.mockResolvedValue({ data: {} });
    const onAtualizar = vi.fn();
    render(<ContextoCliente contexto={contexto()} conversa={conversa()} onAtualizar={onAtualizar} />);
    expect(screen.getByText('Sinal pendente')).toBeInTheDocument();
    expect(screen.getByText('Sábado, 19/09 • 14:00')).toBeInTheDocument();
    expect(screen.getByText(/O bot aguarda a confirmação deste sinal Pix de R\$\s*30,00 para travar a vaga na agenda de Camila Rocha\./)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Confirmar agendamento' }));
    await waitFor(() => expect(apiMock.put).toHaveBeenCalledWith('/appointments/ag1/status', { status: 'confirmado' }));
    expect(showToast).toHaveBeenCalledWith('Pagamento confirmado!', 'success');
    expect(onAtualizar).toHaveBeenCalled();
  });

  it('erro ao confirmar mostra a mensagem da API', async () => {
    apiMock.put.mockRejectedValue(new AxiosError('falhou', '400', undefined, undefined, { data: { error: 'A reserva expirou' }, status: 400, statusText: 'Bad Request', headers: {}, config: {} as never }));
    const onAtualizar = vi.fn();
    render(<ContextoCliente contexto={contexto()} conversa={conversa()} onAtualizar={onAtualizar} />);
    await userEvent.click(screen.getByRole('button', { name: 'Confirmar agendamento' }));
    await waitFor(() => expect(showToast).toHaveBeenCalledWith('A reserva expirou', 'error'));
    expect(onAtualizar).not.toHaveBeenCalled();
  });

  it('agendamento já confirmado não oferece o botão', () => {
    const c = contexto();
    render(<ContextoCliente contexto={contexto({ agendamento: { ...c.agendamento!, status: 'confirmado' } })} conversa={conversa()} onAtualizar={vi.fn()} />);
    expect(screen.getByText('Confirmado')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Confirmar agendamento' })).not.toBeInTheDocument();
  });

  it('histórico mostra as visitas pagas; vazio mostra aviso', () => {
    const { unmount } = render(<ContextoCliente contexto={contexto()} conversa={conversa()} onAtualizar={vi.fn()} />);
    expect(screen.getByText('28/08 • Manutenção gel')).toBeInTheDocument();
    expect(screen.getByText('07/08 • Esmaltação')).toBeInTheDocument();
    expect(screen.getAllByText(/\(Pago\)/)).toHaveLength(2);
    unmount();
    render(<ContextoCliente contexto={contexto({ ultimasVisitas: [], agendamento: null, cicloMedio: null })} conversa={conversa()} onAtualizar={vi.fn()} />);
    expect(screen.getByText('Nenhuma visita ainda.')).toBeInTheDocument();
    expect(screen.getByText('—')).toBeInTheDocument();
  });

  it('sem cliente: abre o cadastro com o telefone e salva', async () => {
    apiMock.post.mockResolvedValue({ data: {} });
    const onAtualizar = vi.fn();
    render(<ContextoCliente contexto={null} conversa={conversa({ clientId: null, nome: null })} onAtualizar={onAtualizar} />);
    expect(screen.getByText('Contato sem cadastro')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Cadastrar cliente' }));
    const telefone = await screen.findByLabelText('Telefone / WhatsApp');
    expect(telefone).toHaveValue('+55 (83) 99876-5432');
    await userEvent.type(screen.getByLabelText('Nome Completo'), 'Joana Lima');
    await userEvent.click(screen.getByRole('button', { name: 'Concluir Cadastro' }));
    await waitFor(() => expect(apiMock.post).toHaveBeenCalledWith('/clients', expect.objectContaining({ name: 'Joana Lima', phone: '+55 (83) 99876-5432' })));
    await waitFor(() => expect(onAtualizar).toHaveBeenCalled());
    expect(showToast).toHaveBeenCalledWith('Cliente cadastrada!', 'success');
  });
});
