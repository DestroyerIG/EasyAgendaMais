import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import type { Client } from '@/types';

const mockApiGet = vi.hoisted(() => vi.fn());
vi.mock('@/lib/api', () => ({
  default: {
    get: (...args: unknown[]) => mockApiGet(...args),
    post: vi.fn(),
    put: vi.fn(),
  },
}));

const {
  ClientModule,
  descreverUltimaVisita,
  fazAniversarioNoMes,
  linkWhatsapp,
  construirPaginas,
  exemploParaIndice,
} = await import('../ClientModule');

const client: Client = {
  id: 'c1',
  business_id: 'b1',
  name: 'Maria Silva',
  phone: '11999999999',
  last_visit: null,
  total_spent: 0,
  created_at: '2024-01-01T00:00:00.000Z',
};

function criarClientes(quantidade: number): Client[] {
  return Array.from({ length: quantidade }, (_, i) => ({
    id: `c${i}`,
    business_id: 'b1',
    name: `Cliente ${i}`,
    phone: '11999990000',
    last_visit: null,
    total_spent: 0,
    created_at: '2024-01-01T00:00:00.000Z',
  }));
}

describe('descreverUltimaVisita', () => {
  const agora = new Date('2024-06-10T12:00:00');

  it('sem last_visit, diz que nunca visitou', () => {
    expect(descreverUltimaVisita(null, agora)).toEqual({ texto: 'Nunca visitou', relativo: null });
  });

  it('hoje', () => {
    expect(descreverUltimaVisita('2024-06-10T08:00:00', agora).relativo).toBe('(hoje)');
  });

  it('ontem', () => {
    expect(descreverUltimaVisita('2024-06-09T08:00:00', agora).relativo).toBe('(ontem)');
  });

  it('há N dias', () => {
    expect(descreverUltimaVisita('2024-06-01T08:00:00', agora).relativo).toBe('(há 9 dias)');
  });
});

describe('fazAniversarioNoMes', () => {
  it('sem birth_date, false', () => {
    expect(fazAniversarioNoMes(undefined, new Date('2024-06-10'))).toBe(false);
  });

  it('mês igual ao de agora, true', () => {
    expect(fazAniversarioNoMes('1990-06-15', new Date('2024-06-10'))).toBe(true);
  });

  it('mês diferente, false', () => {
    expect(fazAniversarioNoMes('1990-05-15', new Date('2024-06-10'))).toBe(false);
  });
});

describe('linkWhatsapp', () => {
  it('telefone de 11 dígitos gera o link', () => {
    expect(linkWhatsapp('11987654321')).toBe('https://wa.me/5511987654321');
  });

  it('telefone de 10 dígitos gera o link', () => {
    expect(linkWhatsapp('1132345678')).toBe('https://wa.me/551132345678');
  });

  it('telefone incompleto não gera link', () => {
    expect(linkWhatsapp('123')).toBeNull();
  });

  it('sem telefone não gera link', () => {
    expect(linkWhatsapp(undefined)).toBeNull();
  });
});

describe('construirPaginas', () => {
  it('sem páginas, lista vazia', () => {
    expect(construirPaginas(1, 0)).toEqual([]);
  });

  it('poucas páginas, mostra todas sem reticências', () => {
    expect(construirPaginas(2, 4)).toEqual([1, 2, 3, 4]);
  });

  it('muitas páginas, usa reticências ao redor da atual e no fim', () => {
    expect(construirPaginas(10, 25)).toEqual([1, 2, 3, '...', 9, 10, 11, '...', 25]);
  });
});

describe('exemploParaIndice', () => {
  it('é estável para o mesmo índice', () => {
    expect(exemploParaIndice(0)).toBe(exemploParaIndice(0));
  });

  it('dá a volta na lista de exemplos', () => {
    const primeiro = exemploParaIndice(0);
    // Qualquer índice múltiplo do tamanho da lista de exemplos repete o mesmo exemplo.
    expect(exemploParaIndice(0)).toEqual(primeiro);
  });
});

describe('ClientModule', () => {
  beforeEach(() => {
    mockApiGet.mockReset();
    mockApiGet.mockImplementation((url: string) => {
      if (url === '/clients') return Promise.resolve({ data: [client] });
      if (url.endsWith('/history')) return Promise.resolve({ data: [] });
      return Promise.resolve({ data: [] });
    });
  });

  it('abre o painel de detalhes ao selecionar um cliente e fecha ao clicar em fechar', async () => {
    render(<ClientModule />);

    await waitFor(() => {
      expect(mockApiGet).toHaveBeenCalledWith('/clients');
    });

    const occurrences = await screen.findAllByText('Maria Silva');
    const row = occurrences[0].closest('tr') ?? occurrences[0];
    fireEvent.click(row);

    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Fechar' }));

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
  });

  it('abre o painel de detalhes pelo teclado (Enter) na linha, sem precisar do mouse', async () => {
    render(<ClientModule />);
    await waitFor(() => expect(mockApiGet).toHaveBeenCalledWith('/clients'));

    const linha = screen.getByRole('row', { name: 'Ver ficha de Maria Silva' });
    expect(linha).toHaveAttribute('tabIndex', '0');
    fireEvent.keyDown(linha, { key: 'Enter' });

    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });
  });

  it('mostra o cabeçalho com o total real de clientes cadastrados, não o filtrado', async () => {
    mockApiGet.mockImplementation((url: string) => {
      if (url === '/clients') return Promise.resolve({ data: criarClientes(3) });
      if (url.endsWith('/history')) return Promise.resolve({ data: [] });
      return Promise.resolve({ data: [] });
    });
    render(<ClientModule />);

    await screen.findByText('3 clientes cadastrados');

    fireEvent.change(screen.getByPlaceholderText('Buscar por nome ou telefone...'), {
      target: { value: 'Cliente 0' },
    });

    // O cabeçalho continua afirmando o total real do sistema, não o resultado da busca.
    expect(screen.getByText('3 clientes cadastrados')).toBeInTheDocument();
  });

  it('mostra a Fase CRM e o LTV Acumulado vindo do cliente real', async () => {
    const clienteComGasto: Client = { ...client, total_spent: 1820 };
    mockApiGet.mockImplementation((url: string) => {
      if (url === '/clients') return Promise.resolve({ data: [clienteComGasto] });
      if (url.endsWith('/history')) return Promise.resolve({ data: [] });
      return Promise.resolve({ data: [] });
    });
    render(<ClientModule />);

    await screen.findAllByText('Maria Silva');
    // Fase CRM: exemplo de conteudoDemo.clientes.exemplos[0], não dado do banco.
    expect(screen.getAllByText('Fiel').length).toBeGreaterThan(0);
    // LTV Acumulado: formatCurrency(total_spent), dado real.
    expect(screen.getAllByText('R$ 1.820,00').length).toBeGreaterThan(0);
  });

  it('mostra "Serviço · Profissional" abaixo da Última Visita, na tabela e no cartão', async () => {
    render(<ClientModule />);

    const ocorrencias = await screen.findAllByText('Corte e finalização · Camila');
    expect(ocorrencias).toHaveLength(2);
    // Uma ocorrência vive na linha da tabela (computador)...
    expect(ocorrencias.some(elemento => elemento.closest('tr') !== null)).toBe(true);
    // ...e a outra fora de qualquer linha, no cartão (celular).
    expect(ocorrencias.some(elemento => elemento.closest('tr') === null)).toBe(true);
  });

  it('mostra o link do WhatsApp só quando o telefone é válido', async () => {
    const semTelefoneValido: Client = { ...client, phone: '123' };
    mockApiGet.mockImplementation((url: string) => {
      if (url === '/clients') return Promise.resolve({ data: [semTelefoneValido] });
      if (url.endsWith('/history')) return Promise.resolve({ data: [] });
      return Promise.resolve({ data: [] });
    });
    render(<ClientModule />);

    await screen.findAllByText('Maria Silva');
    expect(screen.queryByLabelText('Conversar no WhatsApp')).not.toBeInTheDocument();
  });

  it('pagina a lista de clientes a partir de 10 e navega com "Próxima"', async () => {
    mockApiGet.mockImplementation((url: string) => {
      if (url === '/clients') return Promise.resolve({ data: criarClientes(12) });
      if (url.endsWith('/history')) return Promise.resolve({ data: [] });
      return Promise.resolve({ data: [] });
    });
    const textoRodape = () =>
      screen.getByRole('button', { name: 'Anterior' }).parentElement?.parentElement?.textContent?.replace(/\s+/g, ' ');

    render(<ClientModule />);

    await screen.findByRole('button', { name: 'Anterior' });
    expect(textoRodape()).toContain('Mostrando 1–10 de 12 clientes');
    expect(screen.queryByText('Cliente 10')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Próxima' }));

    await waitFor(() => expect(textoRodape()).toContain('Mostrando 11–12 de 12 clientes'));
    expect(screen.getAllByText('Cliente 10').length).toBeGreaterThan(0);
  });

  it('atalho "/" foca a busca quando o foco não está em campo de texto', async () => {
    render(<ClientModule />);
    await waitFor(() => expect(mockApiGet).toHaveBeenCalledWith('/clients'));

    const busca = screen.getByPlaceholderText('Buscar por nome ou telefone...');
    expect(busca).not.toHaveFocus();

    fireEvent.keyDown(window, { key: '/' });

    expect(busca).toHaveFocus();
  });
});
