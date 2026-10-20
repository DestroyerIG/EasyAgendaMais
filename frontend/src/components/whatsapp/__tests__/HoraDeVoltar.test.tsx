import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const usuario = { businessId: 'b1', businessName: 'Studio Aurora' };
const authApi = { user: usuario };
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => authApi }));
const showToast = vi.fn();
const toastApi = { showToast };
vi.mock('@/components/Toast', () => ({ useToast: () => toastApi }));

const retorno = vi.hoisted(() => ({ buscarRetorno: vi.fn(), enviarConvites: vi.fn(), testarConvite: vi.fn() }));
vi.mock('@/lib/whatsappRetorno', () => retorno);

import { HoraDeVoltar } from '../retorno/HoraDeVoltar';
import type { OportunidadeDto, RetornoDto } from '@/lib/whatsappRetorno';

const diasAtras = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString();

const op = (o: Partial<OportunidadeDto> & { id: string; nome: string }): OportunidadeDto => {
  const { id, nome, ...resto } = o;
  return {
    cliente: { id, nome, telefone: '5583999990000' },
    atrasoDias: 10, servico: 'Esmaltação em Gel', profissional: 'Bruna Lima', professionalId: 'p2',
    ultimaVisitaHaDias: 28, cicloDias: 18, valorUltimaVisita: 100, encaixes: [],
    podeReceber: true, motivoBloqueio: null, ultimoConviteEm: null, envio: null,
    texto: `Oi, ${nome.split(' ')[0]}! Texto de ${nome}.\nSegunda linha.`,
    ...resto,
  };
};

const camila = op({
  id: 'c1', nome: 'Beatriz Costa', atrasoDias: 18, servico: 'Manutenção Fibra de Vidro', profissional: 'Camila Rocha',
  professionalId: 'p1', ultimaVisitaHaDias: 39, cicloDias: 21, valorUltimaVisita: 140,
  encaixes: [
    { inicio: '2026-10-21T17:30:00.000Z', curto: 'Qua 14:30', longo: 'Quarta-feira (21/out) às 14:30' },
    { inicio: '2026-10-22T13:00:00.000Z', curto: 'Qui 10:00', longo: 'Quinta-feira (22/out) às 10:00' },
  ],
});
const bloqueada = op({ id: 'c2', nome: 'Juliana Paes', atrasoDias: 14, podeReceber: false, motivoBloqueio: 'Pediu para não receber mensagens' });
const convidada = op({ id: 'c3', nome: 'Carla Silveira', atrasoDias: 8, ultimoConviteEm: diasAtras(3) });
const livre = op({ id: 'c4', nome: 'Patricia Novaes', atrasoDias: 5 });

const dto = (itens: OportunidadeDto[], o: Partial<RetornoDto> = {}): RetornoDto => ({
  resumo: { recuperacaoEstimada: 1180, oportunidades: 9 },
  linkAgendamento: 'https://app.easy.com/agendar/studio-aurora', numeroNegocio: '5583988421209', itens, ...o,
});

const padrao = () => dto([camila, bloqueada, convidada, livre]);

describe('HoraDeVoltar', () => {
  beforeEach(() => {
    retorno.buscarRetorno.mockReset();
    retorno.buscarRetorno.mockResolvedValue(padrao());
    retorno.enviarConvites.mockReset();
    retorno.testarConvite.mockReset();
    showToast.mockReset();
  });

  it('mostra o cabeçalho com a recuperação estimada e as oportunidades', async () => {
    render(<HoraDeVoltar conectado />);
    expect(await screen.findByRole('heading', { name: 'Hora de voltar' })).toBeInTheDocument();
    expect(screen.getByText(/RETENÇÃO ATIVA/i)).toBeInTheDocument();
    expect(await screen.findByText('R$ 1.180,00')).toBeInTheDocument();
    expect(screen.getByText('9')).toBeInTheDocument();
    expect(screen.getByText('Recuperação Estimada').closest('[title]')).toHaveAttribute('title', 'Soma do valor da última visita de cada cliente');
  });

  it('mostra o cartão da oportunidade com atraso, serviço, visita e encaixes', async () => {
    render(<HoraDeVoltar conectado />);
    expect(await screen.findByText('18 dias atrasada')).toBeInTheDocument();
    expect(screen.getByText((_, el) => el?.tagName === 'P' && el.textContent === 'Manutenção Fibra de Vidro · Camila Rocha')).toBeInTheDocument();
    expect(screen.getByText('Última visita: há 39 dias • Ciclo recomendado: 21 dias')).toBeInTheDocument();
    expect(screen.getByText('Qua 14:30')).toBeInTheDocument();
    expect(screen.getByText('Qui 10:00')).toBeInTheDocument();
    expect(screen.getAllByText('Sem encaixe nesta semana').length).toBeGreaterThan(0);
  });

  it('cliente que não pode receber fica sem caixa de seleção e com o motivo', async () => {
    render(<HoraDeVoltar conectado />);
    await screen.findByText('18 dias atrasada');
    expect(screen.getByText('Não recebe mensagens')).toBeInTheDocument();
    expect(screen.getByText('Pediu para não receber mensagens')).toBeInTheDocument();
    expect(screen.queryByRole('checkbox', { name: 'Selecionar Juliana Paes' })).toBeNull();
    expect(screen.getByRole('checkbox', { name: 'Selecionar Beatriz Costa' })).toBeInTheDocument();
  });

  it('"Selecionar todas" ignora bloqueadas e convidadas há menos de 7 dias, e o botão mostra a contagem', async () => {
    render(<HoraDeVoltar conectado />);
    await screen.findByText('18 dias atrasada');
    expect(screen.getByText('Convite enviado há 3 dias')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Enviar convites no WhatsApp \(0\)/ })).toBeDisabled();
    await userEvent.click(screen.getByRole('checkbox', { name: 'Selecionar todas (2)' }));
    expect(screen.getByRole('checkbox', { name: 'Selecionar Beatriz Costa' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Selecionar Patricia Novaes' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Selecionar Carla Silveira' })).not.toBeChecked();
    expect(screen.getByText('2 selecionadas')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Enviar convites no WhatsApp \(2\)/ })).toBeEnabled();
  });

  it('filtrar por profissional refaz a busca com professionalId', async () => {
    render(<HoraDeVoltar conectado />);
    await screen.findByText('18 dias atrasada');
    await userEvent.click(screen.getByRole('button', { name: 'Camila Rocha' }));
    await waitFor(() => expect(retorno.buscarRetorno).toHaveBeenLastCalledWith(expect.objectContaining({ professionalId: 'p1' })));
  });

  it('"Apenas com encaixe ideal" refaz a busca com somenteComEncaixe', async () => {
    render(<HoraDeVoltar conectado />);
    await screen.findByText('18 dias atrasada');
    await userEvent.selectOptions(screen.getByLabelText('Atraso:'), 'encaixe');
    await waitFor(() => expect(retorno.buscarRetorno).toHaveBeenLastCalledWith(expect.objectContaining({ somenteComEncaixe: true })));
  });

  it('clicar num cartão troca a cliente da prévia e o texto', async () => {
    render(<HoraDeVoltar conectado />);
    await screen.findByText('18 dias atrasada');
    expect(screen.getByText(/Simulação para/)).toHaveTextContent('Simulação para Beatriz Costa');
    expect(screen.getByText(/Texto de Beatriz Costa\./)).toBeInTheDocument();
    await userEvent.click(screen.getByText('Patricia Novaes'));
    expect(screen.getByText(/Simulação para/)).toHaveTextContent('Simulação para Patricia Novaes');
    expect(screen.getByText(/Texto de Patricia Novaes\./)).toBeInTheDocument();
    expect(screen.queryByText(/Texto de Beatriz Costa\./)).toBeNull();
  });

  it('a prévia mostra o negócio, HOJE e o número para o teste', async () => {
    render(<HoraDeVoltar conectado />);
    await screen.findByText('Prévia do WhatsApp');
    expect(screen.getByText('Tempo real')).toBeInTheDocument();
    expect(screen.getByText('HOJE')).toBeInTheDocument();
    expect(screen.getByText('Studio Aurora')).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: /Testar envio no meu número/ })).toBeEnabled();
    expect(screen.getByText('Envia exatamente a mensagem acima para +55 (83) 98842-1209')).toBeInTheDocument();
    expect(screen.getByText('Dica de conversão')).toBeInTheDocument();
  });

  it('a chave do link refaz a busca com incluirLink false', async () => {
    render(<HoraDeVoltar conectado />);
    await screen.findByText('18 dias atrasada');
    const chave = screen.getByRole('switch', { name: 'Link de auto-agendamento' });
    expect(chave).toHaveAttribute('aria-checked', 'true');
    await userEvent.click(chave);
    await waitFor(() => expect(retorno.buscarRetorno).toHaveBeenLastCalledWith(expect.objectContaining({ incluirLink: false })));
  });

  it('sem página pública a chave do link fica desabilitada com a dica', async () => {
    retorno.buscarRetorno.mockResolvedValue(dto([camila], { linkAgendamento: null }));
    render(<HoraDeVoltar conectado />);
    await screen.findByText('18 dias atrasada');
    expect(screen.getByRole('switch', { name: 'Link de auto-agendamento' })).toBeDisabled();
    expect(screen.getByText('Publique sua página em Minha página')).toBeInTheDocument();
  });

  it('mostra o estado do envio no cartão', async () => {
    const agendadoPara = new Date('2026-10-20T17:42:00.000Z').toISOString();
    retorno.buscarRetorno.mockResolvedValue(dto([
      op({ id: 'a', nome: 'Ana Fila', envio: { id: 'e1', clientId: 'a', status: 'na_fila', motivo: null, agendadoPara, enviadoEm: null } }),
      op({ id: 'b', nome: 'Bia Enviada', envio: { id: 'e2', clientId: 'b', status: 'enviado', motivo: null, agendadoPara, enviadoEm: agendadoPara } }),
      op({ id: 'c', nome: 'Cris Falhou', envio: { id: 'e3', clientId: 'c', status: 'pulado', motivo: 'Pediu para não receber mensagens', agendadoPara, enviadoEm: null } }),
    ]));
    render(<HoraDeVoltar conectado />);
    expect(await screen.findByText('Na fila (envio previsto ~14:42)')).toBeInTheDocument();
    expect(screen.getByText('Enviado')).toBeInTheDocument();
    expect(screen.getByText('Não enviado: Pediu para não receber mensagens')).toBeInTheDocument();
  });

  it('lista vazia mostra a orientação', async () => {
    retorno.buscarRetorno.mockResolvedValue(dto([], { resumo: { recuperacaoEstimada: 0, oportunidades: 0 } }));
    render(<HoraDeVoltar conectado />);
    expect(await screen.findByText('Nenhuma cliente com retorno vencido agora. Quando alguém passar do ciclo, ela aparece aqui.')).toBeInTheDocument();
  });

  it('desconectado mostra a faixa e desabilita os envios, mas mantém a lista', async () => {
    render(<HoraDeVoltar conectado={false} />);
    await screen.findByText('18 dias atrasada');
    expect(screen.getByText('WhatsApp desconectado. Reconecte na aba Conexão.')).toBeInTheDocument();
    const cartao = screen.getByRole('group', { name: 'Oportunidade de Beatriz Costa' });
    expect(within(cartao).getByRole('button', { name: 'Enviar' })).toBeDisabled();
    await userEvent.click(screen.getByRole('checkbox', { name: 'Selecionar todas (2)' }));
    expect(screen.getByRole('button', { name: /Enviar convites no WhatsApp/ })).toBeDisabled();
    expect(screen.getByRole('button', { name: /Testar envio no meu número/ })).toBeDisabled();
  });

  it('erro na busca oferece tentar novamente', async () => {
    retorno.buscarRetorno.mockRejectedValueOnce(new Error('x'));
    render(<HoraDeVoltar conectado />);
    await userEvent.click(await screen.findByRole('button', { name: 'Tentar novamente' }));
    expect(await screen.findByText('18 dias atrasada')).toBeInTheDocument();
  });

  const envioNaFila = (clientId: string) => ({ id: `e-${clientId}`, clientId, status: 'na_fila' as const, motivo: null, agendadoPara: new Date().toISOString(), enviadoEm: null });
  const cartaoDe = (nome: string) => screen.getByRole('group', { name: `Oportunidade de ${nome}` });

  it('Enviar do cartão enfileira com o link atual, avisa e mostra "Na fila"', async () => {
    retorno.enviarConvites.mockResolvedValue({ envios: [envioNaFila('c4')], recusados: [] });
    render(<HoraDeVoltar conectado />);
    await screen.findByText('18 dias atrasada');
    retorno.buscarRetorno.mockResolvedValue(dto([camila, bloqueada, convidada, { ...livre, envio: envioNaFila('c4') }]));
    await userEvent.click(within(cartaoDe('Patricia Novaes')).getByRole('button', { name: 'Enviar' }));
    await waitFor(() => expect(retorno.enviarConvites).toHaveBeenCalledWith([{ clientId: 'c4' }], true));
    expect(showToast).toHaveBeenCalledWith('1 convite na fila. Envio espaçado para proteger seu número.', 'success');
    expect(await screen.findByText(/^Na fila \(envio previsto/)).toBeInTheDocument();
  });

  it('convidada há menos de 7 dias pede confirmação e cancelar não envia', async () => {
    const confirmar = vi.spyOn(window, 'confirm').mockReturnValue(false);
    render(<HoraDeVoltar conectado />);
    await screen.findByText('18 dias atrasada');
    await userEvent.click(within(cartaoDe('Carla Silveira')).getByRole('button', { name: 'Enviar' }));
    expect(confirmar).toHaveBeenCalledWith('Ela já recebeu um convite há 3 dias. Enviar de novo?');
    expect(retorno.enviarConvites).not.toHaveBeenCalled();
    confirmar.mockRestore();
  });

  it('convidada recente envia depois de confirmar', async () => {
    const confirmar = vi.spyOn(window, 'confirm').mockReturnValue(true);
    retorno.enviarConvites.mockResolvedValue({ envios: [envioNaFila('c3')], recusados: [] });
    render(<HoraDeVoltar conectado />);
    await screen.findByText('18 dias atrasada');
    await userEvent.click(within(cartaoDe('Carla Silveira')).getByRole('button', { name: 'Enviar' }));
    await waitFor(() => expect(retorno.enviarConvites).toHaveBeenCalledWith([{ clientId: 'c3' }], true));
    confirmar.mockRestore();
  });

  it('"Ver texto" abre o modal, permite editar e envia o texto editado', async () => {
    retorno.enviarConvites.mockResolvedValue({ envios: [envioNaFila('c1')], recusados: [] });
    render(<HoraDeVoltar conectado />);
    await screen.findByText('18 dias atrasada');
    await userEvent.click(within(cartaoDe('Beatriz Costa')).getByRole('button', { name: 'Ver texto' }));
    const campo = await screen.findByLabelText('Texto do convite');
    expect(campo).toHaveValue(camila.texto);
    await userEvent.clear(campo);
    await userEvent.type(campo, 'Oi Bia, vamos voltar?');
    await userEvent.click(screen.getByRole('button', { name: 'Enviar este texto' }));
    await waitFor(() => expect(retorno.enviarConvites).toHaveBeenCalledWith([{ clientId: 'c1', texto: 'Oi Bia, vamos voltar?' }], true));
    await waitFor(() => expect(screen.queryByLabelText('Texto do convite')).toBeNull());
  });

  it('lote com recusado avisa quantos não foram enviados, limpa a seleção e recarrega', async () => {
    retorno.enviarConvites.mockResolvedValue({ envios: [envioNaFila('c1')], recusados: [{ clientId: 'c4', motivo: 'Cliente fora da lista' }] });
    render(<HoraDeVoltar conectado />);
    await screen.findByText('18 dias atrasada');
    await userEvent.click(screen.getByRole('checkbox', { name: 'Selecionar todas (2)' }));
    const antes = retorno.buscarRetorno.mock.calls.length;
    await userEvent.click(screen.getByRole('button', { name: /Enviar convites no WhatsApp \(2\)/ }));
    await waitFor(() => expect(retorno.enviarConvites).toHaveBeenCalledWith([{ clientId: 'c1' }, { clientId: 'c4' }], true));
    await waitFor(() => expect(showToast).toHaveBeenCalledWith('1 convite na fila. Envio espaçado para proteger seu número. 1 não enviado.', 'success'));
    await waitFor(() => expect(retorno.buscarRetorno.mock.calls.length).toBeGreaterThan(antes));
    expect(screen.getByText('0 selecionadas')).toBeInTheDocument();
  });

  it('falha ao recarregar com dados na tela avisa e mantém a lista', async () => {
    retorno.enviarConvites.mockResolvedValue({ envios: [envioNaFila('c4')], recusados: [] });
    render(<HoraDeVoltar conectado />);
    await screen.findByText('18 dias atrasada');
    retorno.buscarRetorno.mockRejectedValue(new Error('x'));
    await userEvent.click(within(cartaoDe('Patricia Novaes')).getByRole('button', { name: 'Enviar' }));
    await waitFor(() => expect(showToast).toHaveBeenCalledWith('Não foi possível atualizar a lista.', 'error'));
    expect(screen.getByText('18 dias atrasada')).toBeInTheDocument();
  });

  it('mostra um indicador discreto enquanto refaz a busca', async () => {
    render(<HoraDeVoltar conectado />);
    await screen.findByText('18 dias atrasada');
    let resolver: (v: RetornoDto) => void = () => {};
    retorno.buscarRetorno.mockReturnValue(new Promise<RetornoDto>((r) => { resolver = r; }));
    await userEvent.click(screen.getByRole('button', { name: 'Camila Rocha' }));
    expect(await screen.findByRole('status', { name: 'Atualizando a lista' })).toBeInTheDocument();
    resolver(padrao());
    await waitFor(() => expect(screen.queryByRole('status', { name: 'Atualizando a lista' })).toBeNull());
  });

  it('a dica da recuperação muda quando o valor é das selecionadas', async () => {
    render(<HoraDeVoltar conectado />);
    await screen.findByText('18 dias atrasada');
    await userEvent.click(screen.getByRole('checkbox', { name: 'Selecionar Beatriz Costa' }));
    expect(screen.getByText('R$ 140,00')).toBeInTheDocument();
    expect(screen.getByText('Recuperação Estimada').closest('[title]')).toHaveAttribute('title', 'Soma do valor da última visita das clientes selecionadas');
  });

  it('testar envio avisa o sucesso com o número', async () => {
    retorno.testarConvite.mockResolvedValue({});
    render(<HoraDeVoltar conectado />);
    await userEvent.click(await screen.findByRole('button', { name: /Testar envio no meu número/ }));
    await waitFor(() => expect(retorno.testarConvite).toHaveBeenCalledWith('c1', true));
    expect(showToast).toHaveBeenCalledWith('Teste enviado para +55 (83) 98842-1209', 'success');
  });

  it('testar envio com erro mostra a mensagem', async () => {
    retorno.testarConvite.mockRejectedValue(new Error('WhatsApp desconectado. Reconecte na aba Conexão.'));
    render(<HoraDeVoltar conectado />);
    await userEvent.click(await screen.findByRole('button', { name: /Testar envio no meu número/ }));
    await waitFor(() => expect(showToast).toHaveBeenCalledWith('WhatsApp desconectado. Reconecte na aba Conexão.', 'error'));
  });

  it('no celular a prévia some e a barra fixa aparece quando há seleção', async () => {
    render(<HoraDeVoltar conectado />);
    await screen.findByText('18 dias atrasada');
    expect(screen.getByLabelText('Prévia do convite').parentElement).toHaveClass('hidden', 'lg:block');
    expect(screen.queryByRole('region', { name: 'Enviar convites selecionados' })).toBeNull();
    await userEvent.click(screen.getByRole('checkbox', { name: 'Selecionar todas (2)' }));
    const barra = screen.getByRole('region', { name: 'Enviar convites selecionados' });
    expect(barra).toHaveClass('fixed', 'lg:hidden');
    retorno.enviarConvites.mockResolvedValue({ envios: [envioNaFila('c1'), envioNaFila('c4')], recusados: [] });
    await userEvent.click(within(barra).getByRole('button', { name: 'Enviar convites (2)' }));
    await waitFor(() => expect(retorno.enviarConvites).toHaveBeenCalledWith([{ clientId: 'c1' }, { clientId: 'c4' }], true));
  });
});
