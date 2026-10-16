import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const showToast = vi.fn();
const toastApi = { showToast };
vi.mock('@/components/Toast', () => ({ useToast: () => toastApi }));

let usuario: { id: string; role: string; businessName: string } = { id: 'u-dona', role: 'tenant_admin', businessName: 'Studio Aurora' };
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: usuario }) }));

const inbox = vi.hoisted(() => ({
  listarConversas: vi.fn(),
  buscarConversa: vi.fn(),
  listarMensagens: vi.fn(),
  enviarMensagem: vi.fn(),
  assumirConversa: vi.fn(),
  devolverConversa: vi.fn(),
  marcarLidas: vi.fn(),
  buscarRespostasRapidas: vi.fn(),
  buscarResumoConexao: vi.fn(),
}));
vi.mock('@/lib/whatsappInbox', async (original) => ({
  ...(await original<typeof import('@/lib/whatsappInbox')>()),
  ...inbox,
}));
vi.mock('../conversas/ContextoCliente', () => ({ ContextoCliente: () => null }));

import { CentralConversas } from '../conversas/CentralConversas';
import type { ConversaResumoDto, ListaConversasDto, MensagemDto } from '@/lib/whatsappInbox';

const agora = () => new Date().toISOString();

const conversa = (o: Partial<ConversaResumoDto> = {}): ConversaResumoDto => ({
  id: 'c1', telefone: '5583998765432', nome: 'Mariana Souza', clientId: 'cli1',
  atendimento: 'humano', status: 'aberta', responsavel: { id: 'u-carla', nome: 'Carla' },
  ultimaMensagemEm: agora(), previa: 'Pode ser na quinta às 14h sim!', naoLidas: 1, sinalPendente: true, ...o,
});

const lista = (itens: ConversaResumoDto[], extra: Partial<ListaConversasDto> = {}): ListaConversasDto => ({
  itens, contadores: { todas: 14, aguardando: 3, bot: 9, finalizadas: 2 }, proximoCursor: null, ...extra,
});

const msg = (o: Partial<MensagemDto>): MensagemDto => ({
  id: 'm', direcao: 'in', origem: 'cliente', texto: '', tipoMidia: null, status: 'recebida', autor: null, criadaEm: agora(), ...o,
});

const mensagens = [
  msg({ id: 'm1', texto: 'Oi, tem horário quinta?' }),
  msg({ id: 'm2', direcao: 'out', origem: 'bot', texto: 'Tenho às 14h!', status: 'entregue' }),
  msg({ id: 'm3', direcao: 'out', origem: 'painel_evento', texto: 'Carla assumiu o atendimento', status: 'enviada' }),
  msg({ id: 'm4', direcao: 'out', origem: 'manual_painel', autor: 'Carla', texto: 'Posso confirmar?', status: 'lida' }),
];

const rapidas = [
  { chave: 'pix' as const, rotulo: 'Chave Pix', disponivel: true, texto: 'Nossa chave Pix: 123', motivo: null },
  { chave: 'como_chegar' as const, rotulo: 'Como chegar', disponivel: true, texto: 'Rua A, 10', motivo: null },
  { chave: 'horarios' as const, rotulo: 'Horários livres', disponivel: true, texto: 'Hoje às 15h', motivo: null },
  { chave: 'politica' as const, rotulo: 'Política', disponivel: false, texto: null, motivo: 'Cadastre a política na aba Mensagens.' },
];

const montar = (conectado = true) => render(<CentralConversas conectado={conectado} />);

const abrirConversa = async () => {
  const item = await screen.findByText('Mariana Souza');
  await userEvent.click(item);
  await screen.findByText('Oi, tem horário quinta?');
};

beforeEach(() => {
  Object.values(inbox).forEach((f) => f.mockReset());
  showToast.mockReset();
  usuario = { id: 'u-dona', role: 'tenant_admin', businessName: 'Studio Aurora' };
  inbox.listarConversas.mockResolvedValue(lista([
    conversa(),
    conversa({ id: 'c2', nome: null, telefone: '5583987112290', atendimento: 'bot', status: 'aberta', responsavel: null, naoLidas: 0, sinalPendente: false, previa: 'Menu' }),
    conversa({ id: 'c3', nome: 'Rafa Diniz', atendimento: 'humano', status: 'aguardando', responsavel: null, naoLidas: 0, sinalPendente: false, previa: 'Preciso de ajuda' }),
  ]));
  inbox.buscarConversa.mockImplementation(async (id: string) => ({ conversa: conversa({ id }), contexto: null }));
  inbox.listarMensagens.mockResolvedValue({ itens: mensagens, temMais: false });
  inbox.buscarRespostasRapidas.mockResolvedValue(rapidas);
  inbox.enviarMensagem.mockResolvedValue({ enviado: true });
  inbox.marcarLidas.mockResolvedValue({ atualizadas: 1 });
  inbox.buscarResumoConexao.mockResolvedValue({ numero: '5583981204000' });
  Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
});

afterEach(() => {
  vi.useRealTimers();
});

describe('CentralConversas - fila', () => {
  it('carrega a fila com contadores, selos, hora, não lidas e sinal pendente', async () => {
    montar();
    expect(await screen.findByText('Mariana Souza')).toBeInTheDocument();
    expect(screen.getByText('Conversas do WhatsApp')).toBeInTheDocument();
    expect(screen.getByText('14 abertas')).toBeInTheDocument();
    expect(await screen.findByText('Instância: +55 (83) 98120-4000')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Aguardando você/ })).toHaveTextContent('3');
    expect(screen.getByRole('button', { name: /Pelo Bot/ })).toHaveTextContent('9');
    expect(screen.getByText('Humano')).toBeInTheDocument();
    expect(screen.getByText('Bot')).toBeInTheDocument();
    expect(screen.getByText('Aguardando')).toBeInTheDocument();
    expect(screen.getByText('Sinal pendente')).toBeInTheDocument();
    expect(screen.getByLabelText('1 não lida')).toBeInTheDocument();
    expect(screen.getByText('Atendente: Carla')).toBeInTheDocument();
    expect(screen.getByText('+55 (83) 98711-2290', { selector: 'span.font-bold' })).toBeInTheDocument();
    expect(screen.getByText('MS')).toBeInTheDocument();
    expect(inbox.listarConversas).toHaveBeenCalledWith('todas');
  });

  it('clicar em Aguardando você busca o filtro', async () => {
    montar();
    await screen.findByText('Mariana Souza');
    await userEvent.click(screen.getByRole('button', { name: /Aguardando você/ }));
    await waitFor(() => expect(inbox.listarConversas).toHaveBeenCalledWith('aguardando'));
  });

  it('atualiza a cada 15 s e pausa em segundo plano', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    montar();
    await act(async () => { await Promise.resolve(); });
    const base = inbox.listarConversas.mock.calls.length;
    await act(async () => { vi.advanceTimersByTime(15000); });
    expect(inbox.listarConversas.mock.calls.length).toBe(base + 1);

    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
    await act(async () => { vi.advanceTimersByTime(30000); });
    expect(inbox.listarConversas.mock.calls.length).toBe(base + 1);

    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
    await act(async () => { document.dispatchEvent(new Event('visibilitychange')); });
    expect(inbox.listarConversas.mock.calls.length).toBe(base + 2);
  });

  it('para o polling ao desmontar', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    const { unmount } = montar();
    await act(async () => { await Promise.resolve(); });
    unmount();
    const base = inbox.listarConversas.mock.calls.length;
    await act(async () => { vi.advanceTimersByTime(60000); });
    expect(inbox.listarConversas.mock.calls.length).toBe(base);
  });

  it('Marcar lidas chama marcarLidas sem ids e recarrega', async () => {
    montar();
    await screen.findByText('Mariana Souza');
    const antes = inbox.listarConversas.mock.calls.length;
    await userEvent.click(screen.getByRole('button', { name: 'Marcar lidas' }));
    await waitFor(() => expect(inbox.marcarLidas).toHaveBeenCalledWith());
    await waitFor(() => expect(inbox.listarConversas.mock.calls.length).toBeGreaterThan(antes));
  });

  it('Carregar mais usa o cursor', async () => {
    inbox.listarConversas.mockResolvedValueOnce(lista([conversa()], { proximoCursor: 'cur1' }));
    inbox.listarConversas.mockResolvedValueOnce(lista([conversa({ id: 'c9', nome: 'Outra Cliente' })]));
    montar();
    await userEvent.click(await screen.findByRole('button', { name: 'Carregar mais' }));
    expect(await screen.findByText('Outra Cliente')).toBeInTheDocument();
    expect(inbox.listarConversas).toHaveBeenCalledWith('todas', 'cur1');
  });

  it('mostra estados vazio, filtro vazio e erro com Tentar de novo', async () => {
    inbox.listarConversas.mockResolvedValueOnce(lista([], { contadores: { todas: 0, aguardando: 0, bot: 0, finalizadas: 0 } }));
    const { unmount } = montar();
    expect(await screen.findByText('Nenhuma conversa ainda. As mensagens das clientes aparecem aqui.')).toBeInTheDocument();
    unmount();

    inbox.listarConversas.mockResolvedValueOnce(lista([], { contadores: { todas: 5, aguardando: 0, bot: 5, finalizadas: 0 } }));
    const segunda = montar();
    expect(await screen.findByText('Nenhuma conversa neste filtro.')).toBeInTheDocument();
    segunda.unmount();

    inbox.listarConversas.mockRejectedValueOnce(new Error('falha'));
    montar();
    expect(await screen.findByText('Não foi possível carregar as conversas.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }));
    expect(await screen.findByText('Mariana Souza')).toBeInTheDocument();
  });

  it('sem conversa selecionada orienta a escolher uma', async () => {
    montar();
    await screen.findByText('Mariana Souza');
    expect(screen.getByText('Escolha uma conversa para ver as mensagens.')).toBeInTheDocument();
  });
});

describe('CentralConversas - conversa aberta', () => {
  it('mostra separador de dia, balões, rótulos, evento e ícone de lida', async () => {
    montar();
    await abrirConversa();
    expect(screen.getByText(/^Hoje • \d{1,2} de \p{L}+$/u)).toBeInTheDocument();
    expect(screen.getByText('Tenho às 14h!')).toBeInTheDocument();
    expect(screen.getByText('Bot EasyAgenda+')).toBeInTheDocument();
    expect(screen.getAllByText(/• Automático/).length).toBe(1);
    expect(screen.getByText('Carla assumiu o atendimento')).toBeInTheDocument();
    expect(screen.getByText('Carla (Studio Aurora)')).toBeInTheDocument();
    expect(screen.getByLabelText('Lida')).toBeInTheDocument();
    expect(screen.getByLabelText('Entregue')).toBeInTheDocument();
    expect(screen.getByText('Em atendimento humano (Carla)')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Ver ficha CRM/ })).toHaveAttribute('href', '/clientes/cli1');
  });

  it('mostra mídia com aviso e mensagem que falhou', async () => {
    inbox.listarMensagens.mockResolvedValue({
      itens: [
        msg({ id: 'a', texto: '[Imagem]', tipoMidia: 'image' }),
        msg({ id: 'b', direcao: 'out', origem: 'manual_painel', autor: 'Carla', texto: 'Oi', status: 'falhou' }),
      ], temMais: false,
    });
    montar();
    await userEvent.click(await screen.findByText('Mariana Souza'));
    expect(await screen.findByText('Abra no celular para ver')).toBeInTheDocument();
    expect(screen.getByLabelText('Não enviada')).toBeInTheDocument();
  });

  it('carrega mensagens anteriores', async () => {
    inbox.listarMensagens.mockResolvedValueOnce({ itens: mensagens, temMais: true });
    inbox.listarMensagens.mockResolvedValueOnce({ itens: [msg({ id: 'm0', texto: 'Mensagem antiga' })], temMais: false });
    montar();
    await abrirConversa();
    await userEvent.click(screen.getByRole('button', { name: 'Carregar mensagens anteriores' }));
    expect(await screen.findByText('Mensagem antiga')).toBeInTheDocument();
    expect(inbox.listarMensagens).toHaveBeenLastCalledWith('c1', mensagens[0].criadaEm);
  });

  it('Enter envia e limpa; Shift+Enter não envia', async () => {
    montar();
    await abrirConversa();
    const campo = screen.getByPlaceholderText('Escreva uma mensagem…');
    await userEvent.type(campo, 'Olá{Shift>}{Enter}{/Shift}tudo bem');
    expect(inbox.enviarMensagem).not.toHaveBeenCalled();
    expect(campo).toHaveValue('Olá\ntudo bem');
    await userEvent.type(campo, '{Enter}');
    await waitFor(() => expect(inbox.enviarMensagem).toHaveBeenCalledWith('c1', 'Olá\ntudo bem'));
    await waitFor(() => expect(campo).toHaveValue(''));
    expect(inbox.listarMensagens.mock.calls.length).toBeGreaterThan(1);
  });

  it('erro no envio mantém o texto e mostra toast', async () => {
    inbox.enviarMensagem.mockRejectedValueOnce({});
    montar();
    await abrirConversa();
    const campo = screen.getByPlaceholderText('Escreva uma mensagem…');
    await userEvent.type(campo, 'Oi{Enter}');
    await waitFor(() => expect(showToast).toHaveBeenCalledWith('Não foi possível enviar a mensagem.', 'error'));
    expect(campo).toHaveValue('Oi');
  });

  it('resposta rápida insere o texto sem enviar; indisponível fica desabilitada com motivo', async () => {
    montar();
    await abrirConversa();
    await userEvent.click(await screen.findByRole('button', { name: 'Chave Pix' }));
    expect(screen.getByPlaceholderText('Escreva uma mensagem…')).toHaveValue('Nossa chave Pix: 123');
    expect(inbox.enviarMensagem).not.toHaveBeenCalled();
    const politica = screen.getByRole('button', { name: 'Política' });
    expect(politica).toBeDisabled();
    expect(politica).toHaveAttribute('title', 'Cadastre a política na aba Mensagens.');
  });

  it('Assumir chama assumirConversa e Devolver ao Bot chama devolverConversa', async () => {
    inbox.listarConversas.mockResolvedValue(lista([
      conversa({ atendimento: 'bot', status: 'aberta', responsavel: null }),
    ]));
    inbox.buscarConversa.mockResolvedValue({ conversa: conversa({ atendimento: 'bot', responsavel: null }), contexto: null });
    const assumida = conversa({ atendimento: 'humano', responsavel: { id: 'u-dona', nome: 'Carla' } });
    const devolvida = conversa({ atendimento: 'bot', responsavel: null });
    inbox.assumirConversa.mockImplementation(async () => { inbox.listarConversas.mockResolvedValue(lista([assumida])); return assumida; });
    inbox.devolverConversa.mockImplementation(async () => { inbox.listarConversas.mockResolvedValue(lista([devolvida])); return devolvida; });
    montar();
    await abrirConversa();
    expect(screen.getByText('Com o robô')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Assumir' }));
    await waitFor(() => expect(inbox.assumirConversa).toHaveBeenCalledWith('c1'));
    expect(await screen.findByText('Em atendimento humano (Carla)')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Devolver ao Bot' }));
    await waitFor(() => expect(inbox.devolverConversa).toHaveBeenCalledWith('c1'));
    expect(await screen.findByText('Com o robô')).toBeInTheDocument();
  });

  it('sem cliente mostra Cadastrar cliente', async () => {
    inbox.listarConversas.mockResolvedValue(lista([conversa({ clientId: null, nome: null })]));
    inbox.buscarConversa.mockResolvedValue({ conversa: conversa({ clientId: null, nome: null }), contexto: null });
    montar();
    await userEvent.click(await screen.findByText('+55 (83) 99876-5432', { selector: 'span.font-bold' }));
    expect(await screen.findByRole('button', { name: 'Cadastrar cliente' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Ver ficha CRM/ })).not.toBeInTheDocument();
  });
});

describe('CentralConversas - bloqueios', () => {
  it('desconectado mostra faixa com link para a aba Conexão e desabilita o campo', async () => {
    montar(false);
    await abrirConversa();
    expect(screen.getByText(/WhatsApp desconectado\. Reconecte na aba/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Conexão' })).toHaveAttribute('href', '?aba=conexao');
    expect(screen.getByPlaceholderText('Escreva uma mensagem…')).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Enviar mensagem' })).toBeDisabled();
  });

  it('funcionária em conversa de outra pessoa não pode responder', async () => {
    usuario = { id: 'u-func', role: 'employee', businessName: 'Studio Aurora' };
    montar();
    await abrirConversa();
    expect(screen.getByPlaceholderText('Esta conversa está com outra pessoa')).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Assumir' })).not.toBeInTheDocument();
  });

  it('funcionária na própria conversa pode responder', async () => {
    usuario = { id: 'u-carla', role: 'employee', businessName: 'Studio Aurora' };
    montar();
    await abrirConversa();
    expect(screen.getByPlaceholderText('Escreva uma mensagem…')).toBeEnabled();
  });
});

describe('CentralConversas - celular', () => {
  it('voltar fecha a conversa e devolve a fila', async () => {
    montar();
    await abrirConversa();
    await userEvent.click(screen.getByRole('button', { name: 'Voltar para conversas' }));
    expect(screen.getByText('Escolha uma conversa para ver as mensagens.')).toBeInTheDocument();
  });
});

describe('CentralConversas - leitura automática', () => {
  it('abrir conversa com não lidas marca como lida e zera o contador na fila', async () => {
    montar();
    await abrirConversa();
    expect(inbox.marcarLidas).toHaveBeenCalledWith(['c1']);
    expect(screen.queryByLabelText('1 não lida')).not.toBeInTheDocument();
  });

  it('erro ao marcar como lida não bloqueia a conversa', async () => {
    inbox.marcarLidas.mockRejectedValue(new Error('x'));
    montar();
    await abrirConversa();
    expect(showToast).not.toHaveBeenCalled();
    expect(screen.getByText('Tenho às 14h!')).toBeInTheDocument();
  });

  it('mensagem nova na conversa aberta e visível é marcada como lida no polling', async () => {
    inbox.listarConversas.mockResolvedValue(lista([conversa({ naoLidas: 0 })]));
    montar();
    await abrirConversa();
    expect(inbox.marcarLidas).not.toHaveBeenCalled();
    inbox.listarConversas.mockResolvedValue(lista([conversa({ naoLidas: 2 })]));
    await act(async () => { document.dispatchEvent(new Event('visibilitychange')); });
    await waitFor(() => expect(inbox.marcarLidas).toHaveBeenCalledWith(['c1']));
    expect(screen.queryByLabelText('2 não lidas')).not.toBeInTheDocument();
  });

  it('em segundo plano não marca como lida', async () => {
    inbox.listarConversas.mockResolvedValue(lista([conversa({ naoLidas: 0 })]));
    montar();
    await abrirConversa();
    const callsAntes = inbox.listarConversas.mock.calls.length;
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
    inbox.listarConversas.mockResolvedValue(lista([conversa({ naoLidas: 2 })]));
    await act(async () => { document.dispatchEvent(new Event('visibilitychange')); });
    expect(inbox.listarConversas).toHaveBeenCalledTimes(callsAntes);
    expect(inbox.marcarLidas).not.toHaveBeenCalled();
  });
});
