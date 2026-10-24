import { describe, it, expect, vi, beforeEach } from 'vitest';

const repo = vi.hoisted(() => ({
  clientePorTelefone: vi.fn(), conversaPorChave: vi.fn(), criarConversa: vi.fn(), atualizarConversa: vi.fn(),
  inserirMensagem: vi.fn(), corrigirSaidaDoEco: vi.fn(), mensagemPorProvider: vi.fn(), atualizarStatusMensagem: vi.fn(),
  optOutAtivo: vi.fn(), gravarOptOut: vi.fn(), reativarOptOut: vi.fn(), registrarConsentimento: vi.fn(),
}));
vi.mock('../modules/whatsappInbox/inbox.repository.js', () => ({ inboxRepository: repo }));
const { inboxRecorder } = await import('../modules/whatsappInbox/inbox.recorder.js');

const B = 'b1';
const TEL = '5583999990000';
const CONV = { id: 'cv1', handler: 'bot', status: 'aberta', clientId: null, unreadCount: 0 };
const entrada = (over: Record<string, unknown> = {}) => ({
  businessId: B, phone: TEL, texto: 'oi', messageType: 'conversation', providerMessageId: 'm1', sessaoRoboAtiva: false, ...over,
});
beforeEach(() => {
  vi.clearAllMocks();
  repo.clientePorTelefone.mockResolvedValue(null);
  repo.conversaPorChave.mockResolvedValue(null);
  repo.criarConversa.mockResolvedValue(CONV);
  repo.atualizarConversa.mockImplementation(async (_id: string, data: object) => ({ ...CONV, ...data }));
  repo.inserirMensagem.mockResolvedValue(true);
  repo.optOutAtivo.mockResolvedValue(null);
});

describe('registrarEntrada — regra B', () => {
  it('número desconhecido sem sessão do robô: não grava nada', async () => {
    expect(await inboxRecorder.registrarEntrada(entrada())).toBeNull();
    expect(repo.inserirMensagem).not.toHaveBeenCalled();
    expect(repo.criarConversa).not.toHaveBeenCalled();
  });
  it('cliente cadastrada: cria conversa vinculada e grava', async () => {
    repo.clientePorTelefone.mockResolvedValue({ id: 'c1', name: 'Maria' });
    repo.criarConversa.mockResolvedValue({ ...CONV, clientId: 'c1' });
    const r = await inboxRecorder.registrarEntrada(entrada());
    expect(r?.clientId).toBe('c1');
    expect(repo.criarConversa).toHaveBeenCalledWith(expect.objectContaining({ businessId: B, phoneKey: '8399990000', clientId: 'c1' }));
    expect(repo.inserirMensagem).toHaveBeenCalledWith(expect.objectContaining({ direction: 'in', origin: 'cliente', status: 'recebida', body: 'oi', providerMessageId: 'm1' }));
    expect(repo.atualizarConversa).toHaveBeenCalledWith('cv1', expect.objectContaining({ lastMessagePreview: 'oi', unreadCount: { increment: 1 } }));
  });
  it('sessão do robô ativa: grava mesmo sem cadastro', async () => {
    expect(await inboxRecorder.registrarEntrada(entrada({ texto: '1', sessaoRoboAtiva: true }))).not.toBeNull();
  });
  it('mídia sem legenda vira marcador; com legenda junta', async () => {
    repo.conversaPorChave.mockResolvedValue(CONV);
    await inboxRecorder.registrarEntrada(entrada({ texto: null, messageType: 'imageMessage' }));
    expect(repo.inserirMensagem).toHaveBeenLastCalledWith(expect.objectContaining({ body: '[Foto]', mediaType: 'imagem' }));
    await inboxRecorder.registrarEntrada(entrada({ texto: 'olha', messageType: 'imageMessage', providerMessageId: 'm2' }));
    expect(repo.inserirMensagem).toHaveBeenLastCalledWith(expect.objectContaining({ body: '[Foto] olha' }));
  });
  it('sem texto e sem mídia: não grava', async () => {
    repo.conversaPorChave.mockResolvedValue(CONV);
    expect(await inboxRecorder.registrarEntrada(entrada({ texto: null, messageType: 'reactionMessage' }))).toBeNull();
    expect(repo.inserirMensagem).not.toHaveBeenCalled();
  });
  it('duplicata (inserirMensagem=false) não mexe na conversa', async () => {
    repo.conversaPorChave.mockResolvedValue(CONV);
    repo.inserirMensagem.mockResolvedValue(false);
    await inboxRecorder.registrarEntrada(entrada());
    expect(repo.atualizarConversa).not.toHaveBeenCalled();
  });
  it('conversa humana vira "aguardando"; finalizada reabre', async () => {
    repo.conversaPorChave.mockResolvedValue({ ...CONV, handler: 'humano', status: 'aberta' });
    const r = await inboxRecorder.registrarEntrada(entrada());
    expect(r?.handler).toBe('humano');
    expect(repo.atualizarConversa).toHaveBeenCalledWith('cv1', expect.objectContaining({ status: 'aguardando' }));
    repo.conversaPorChave.mockResolvedValue({ ...CONV, status: 'finalizada' });
    await inboxRecorder.registrarEntrada(entrada({ providerMessageId: 'm2' }));
    expect(repo.atualizarConversa).toHaveBeenLastCalledWith('cv1', expect.objectContaining({ status: 'aberta' }));
  });
  it('erro do repositório não lança', async () => {
    repo.conversaPorChave.mockRejectedValue(new Error('db'));
    await expect(inboxRecorder.registrarEntrada(entrada())).resolves.toBeNull();
  });
});

describe('registrarSaida — corrida eco x saída', () => {
  beforeEach(() => { repo.conversaPorChave.mockResolvedValue(CONV); });
  const saida = { businessId: B, phone: TEL, body: 'Olá real', origem: 'manual_painel' as const, providerMessageId: 'p1', status: 'enviada' as const, sentByUserId: 'u1' };
  it('eco gravado antes: corrige para a origem real', async () => {
    repo.inserirMensagem.mockResolvedValue(false);
    repo.mensagemPorProvider.mockResolvedValue({ id: 'm9', status: 'enviada', origin: 'manual_celular' });
    await inboxRecorder.registrarSaida(saida);
    expect(repo.mensagemPorProvider).toHaveBeenCalledWith(B, 'p1');
    expect(repo.corrigirSaidaDoEco).toHaveBeenCalledWith('m9', { origin: 'manual_painel', sentByUserId: 'u1', body: 'Olá real', status: 'enviada' });
  });
  it('eco já entregue: mantém o status', async () => {
    repo.inserirMensagem.mockResolvedValue(false);
    repo.mensagemPorProvider.mockResolvedValue({ id: 'm9', status: 'entregue', origin: 'manual_celular' });
    await inboxRecorder.registrarSaida(saida);
    expect(repo.corrigirSaidaDoEco).toHaveBeenCalledWith('m9', { origin: 'manual_painel', sentByUserId: 'u1', body: 'Olá real', status: 'entregue' });
  });
  it('existente com outra origem: nada muda', async () => {
    repo.inserirMensagem.mockResolvedValue(false);
    repo.mensagemPorProvider.mockResolvedValue({ id: 'm9', status: 'enviada', origin: 'bot' });
    await inboxRecorder.registrarSaida(saida);
    expect(repo.corrigirSaidaDoEco).not.toHaveBeenCalled();
  });
  it('inserção normal não consulta nem corrige', async () => {
    await inboxRecorder.registrarSaida(saida);
    expect(repo.mensagemPorProvider).not.toHaveBeenCalled();
    expect(repo.corrigirSaidaDoEco).not.toHaveBeenCalled();
  });
});

describe('registrarSaida', () => {
  it('fora da regra B: grava só para contagem, sem conversa e sem texto', async () => {
    await inboxRecorder.registrarSaida({ businessId: B, phone: TEL, body: 'teste', origem: 'sistema', providerMessageId: 'p1', status: 'enviada' });
    expect(repo.inserirMensagem).toHaveBeenCalledWith(expect.objectContaining({ conversationId: null, body: '', direction: 'out', origin: 'sistema' }));
    expect(repo.criarConversa).not.toHaveBeenCalled();
  });
  it('resposta do robô cria a conversa do número novo', async () => {
    await inboxRecorder.registrarSaida({ businessId: B, phone: TEL, body: 'Menu', origem: 'bot', providerMessageId: 'p1', status: 'enviada' });
    expect(repo.criarConversa).toHaveBeenCalled();
    expect(repo.inserirMensagem).toHaveBeenCalledWith(expect.objectContaining({ conversationId: 'cv1', body: 'Menu' }));
  });
  it('conversa existente: atualiza prévia sem somar não lida', async () => {
    repo.conversaPorChave.mockResolvedValue(CONV);
    await inboxRecorder.registrarSaida({ businessId: B, phone: TEL, body: 'Olá', origem: 'lembrete', providerMessageId: null, status: 'falhou' });
    expect(repo.inserirMensagem).toHaveBeenCalledWith(expect.objectContaining({ status: 'falhou' }));
    const data = repo.atualizarConversa.mock.calls[0]![1];
    expect(data.lastMessagePreview).toBe('Olá');
    expect(data.unreadCount).toBeUndefined();
  });
  it('erro do repositório não lança', async () => {
    repo.conversaPorChave.mockRejectedValue(new Error('db'));
    await expect(inboxRecorder.registrarSaida({ businessId: B, phone: TEL, body: 'x', origem: 'bot', providerMessageId: null, status: 'enviada' })).resolves.toBeUndefined();
  });
});

describe('registrarEco (fromMe)', () => {
  it('eco do que o sistema enviou: não duplica', async () => {
    repo.mensagemPorProvider.mockResolvedValue({ id: 'x', status: 'enviada' });
    await inboxRecorder.registrarEco({ businessId: B, phone: TEL, texto: 'Olá', messageType: 'conversation', providerMessageId: 'p1' });
    expect(repo.inserirMensagem).not.toHaveBeenCalled();
  });
  it('digitado no celular para conversa existente: grava manual_celular', async () => {
    repo.mensagemPorProvider.mockResolvedValue(null);
    repo.conversaPorChave.mockResolvedValue(CONV);
    await inboxRecorder.registrarEco({ businessId: B, phone: TEL, texto: 'Já te respondo', messageType: 'conversation', providerMessageId: 'p9' });
    expect(repo.inserirMensagem).toHaveBeenCalledWith(expect.objectContaining({ direction: 'out', origin: 'manual_celular', status: 'enviada' }));
  });
  it('digitado no celular para número fora da regra B: não grava', async () => {
    repo.mensagemPorProvider.mockResolvedValue(null);
    await inboxRecorder.registrarEco({ businessId: B, phone: TEL, texto: 'oi mãe', messageType: 'conversation', providerMessageId: 'p9' });
    expect(repo.inserirMensagem).not.toHaveBeenCalled();
  });
});

describe('entrega, opt-out e humano', () => {
  it('atualizarEntrega não regride', async () => {
    repo.mensagemPorProvider.mockResolvedValue({ id: 'x', status: 'lida' });
    await inboxRecorder.atualizarEntrega({ businessId: B, providerMessageId: 'p1', status: 'entregue' });
    expect(repo.atualizarStatusMensagem).not.toHaveBeenCalled();
    repo.mensagemPorProvider.mockResolvedValue({ id: 'x', status: 'enviada' });
    await inboxRecorder.atualizarEntrega({ businessId: B, providerMessageId: 'p1', status: 'lida' });
    expect(repo.atualizarStatusMensagem).toHaveBeenCalledWith('x', 'lida');
  });
  it('opt-out de cliente revoga consentimento; opt-in concede', async () => {
    repo.clientePorTelefone.mockResolvedValue({ id: 'c1', name: 'Maria' });
    await inboxRecorder.registrarOptOut({ businessId: B, phone: TEL, keyword: 'sair' });
    expect(repo.gravarOptOut).toHaveBeenCalledWith({ businessId: B, phoneKey: '8399990000', clientId: 'c1', keyword: 'sair' });
    expect(repo.registrarConsentimento).toHaveBeenCalledWith({ businessId: B, clientId: 'c1', granted: false });
    await inboxRecorder.registrarOptIn({ businessId: B, phone: TEL });
    expect(repo.reativarOptOut).toHaveBeenCalledWith(B, '8399990000');
    expect(repo.registrarConsentimento).toHaveBeenLastCalledWith({ businessId: B, clientId: 'c1', granted: true });
  });
  it('opt-out de número sem cadastro grava sem consentimento', async () => {
    await inboxRecorder.registrarOptOut({ businessId: B, phone: TEL, keyword: 'parar' });
    expect(repo.gravarOptOut).toHaveBeenCalled();
    expect(repo.registrarConsentimento).not.toHaveBeenCalled();
  });
  it('estaEmOptOut pela chave canônica (com ou sem 9 e 55)', async () => {
    repo.optOutAtivo.mockResolvedValue({ id: 'o' });
    expect(await inboxRecorder.estaEmOptOut(B, '(83) 99999-0000')).toBe(true);
    expect(repo.optOutAtivo).toHaveBeenCalledWith(B, '8399990000');
    repo.optOutAtivo.mockRejectedValue(new Error('db'));
    expect(await inboxRecorder.estaEmOptOut(B, TEL)).toBe(false);
  });
  it('estaEmOptOutOuFalha: mesma resposta, mas relança quando a consulta falha', async () => {
    repo.optOutAtivo.mockResolvedValue({ id: 'o' });
    expect(await inboxRecorder.estaEmOptOutOuFalha(B, '(83) 99999-0000')).toBe(true);
    expect(repo.optOutAtivo).toHaveBeenCalledWith(B, '8399990000');
    repo.optOutAtivo.mockResolvedValue(null);
    expect(await inboxRecorder.estaEmOptOutOuFalha(B, TEL)).toBe(false);
    repo.optOutAtivo.mockRejectedValue(new Error('db'));
    await expect(inboxRecorder.estaEmOptOutOuFalha(B, TEL)).rejects.toThrow('db');
    // A versão tolerante continua devolvendo false para os outros chamadores.
    expect(await inboxRecorder.estaEmOptOut(B, TEL)).toBe(false);
  });
  it('pedirAtendimentoHumano põe a conversa na fila "aguardando" sem responsável', async () => {
    await inboxRecorder.pedirAtendimentoHumano(B, TEL);
    expect(repo.atualizarConversa).toHaveBeenCalledWith('cv1', { handler: 'humano', status: 'aguardando', assignedUserId: null });
  });
});
