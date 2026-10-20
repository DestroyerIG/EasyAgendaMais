import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { FilaConversas } from '../conversas/FilaConversas';
import type { ConversaResumoDto, ListaConversasDto } from '@/lib/whatsappInbox';

const conversa = (extra: Partial<ConversaResumoDto>): ConversaResumoDto => ({
  id: 'c1', telefone: '5583999990000', nome: null, clientId: null,
  atendimento: 'bot', status: 'aberta', responsavel: null,
  ultimaMensagemEm: '2026-10-20T15:00:00Z', previa: 'Oi', naoLidas: 0, sinalPendente: false,
  avatarUrl: 'https://cdn.exemplo/foto.jpg',
  ...extra,
} as ConversaResumoDto);

const dados = (c: ConversaResumoDto): ListaConversasDto => ({
  itens: [c],
  contadores: { todas: 1, aguardando: 0, bot: 1, finalizadas: 0 },
  proximoCursor: null,
});

const renderFila = (c: ConversaResumoDto) => render(
  <FilaConversas
    filtro="todas" dados={dados(c)} selecionadaId={null}
    onSelecionar={vi.fn()} onMarcarLidas={vi.fn()} onCarregarMais={vi.fn()}
  />,
);

describe('FilaConversas avatar', () => {
  it('contato sem nome cuja foto falha mostra o ícone de pessoa, sem dígitos do telefone', () => {
    const { container } = renderFila(conversa({}));
    fireEvent.error(container.querySelector('img') as HTMLImageElement);
    expect(container.querySelector('img')).toBeNull();
    expect(screen.getByText('person')).toBeInTheDocument();
    expect(screen.queryByText(/^\d{2}$/)).toBeNull();
  });

  it('contato com nome cuja foto falha mostra as iniciais', () => {
    const { container } = renderFila(conversa({ nome: 'Camila Rocha' }));
    fireEvent.error(container.querySelector('img') as HTMLImageElement);
    expect(screen.getByText('CR')).toBeInTheDocument();
    expect(screen.queryByText('person')).toBeNull();
  });
});
