import { describe, it, expect, vi, beforeEach } from 'vitest';

const repo = vi.hoisted(() => ({ listar: vi.fn(), salvar: vi.fn(), legadoLembrete: vi.fn(), negocio: vi.fn() }));
const zap = vi.hoisted(() => ({ getStatus: vi.fn(), send: vi.fn() }));
vi.mock('../modules/whatsappAutomacoes/automacoes.repository.js', () => ({ automacoesRepository: repo }));
vi.mock('../modules/whatsapp/whatsapp.service.js', () => ({ whatsappService: { getStatus: zap.getStatus } }));
vi.mock('../services/whatsapp/whatsappMessageService.js', () => ({ sendWhatsAppMessage: zap.send }));

const { automacoes } = await import('../modules/whatsappAutomacoes/automacoes.service.js');
const { TEXTO_PADRAO, TEXTO_PADRAO_LEMBRETE_2H } = await import('../modules/whatsappAutomacoes/automacoes.rules.js');

let linhas: Array<{ regra: string; ativa: boolean; texto: string | null; config: unknown }>;

beforeEach(() => {
  vi.clearAllMocks();
  linhas = [];
  repo.listar.mockImplementation(async () => linhas);
  repo.legadoLembrete.mockResolvedValue({ ativa: true, texto: null });
  repo.salvar.mockResolvedValue(undefined);
  repo.negocio.mockResolvedValue({ nome: 'Studio Bela', whatsapp: '83999990000' });
});

describe('automacoes.obterTodas', () => {
  it('sem linhas devolve as 7 regras, só o lembrete ativo, com texto padrão', async () => {
    const todas = await automacoes.obterTodas('b1');
    expect(todas.map((r) => r.regra)).toEqual(['confirmacao', 'sinal_pix', 'retorno', 'lista_espera', 'lembrete', 'aniversario', 'avaliacao']);
    expect(todas.filter((r) => r.ativa).map((r) => r.regra)).toEqual(['lembrete']);
    for (const r of todas) expect(r.texto).toBe(r.textoPadrao);
    expect(todas.find((r) => r.regra === 'lembrete')!.textoPadrao).toBe(TEXTO_PADRAO_LEMBRETE_2H);
    expect(todas.find((r) => r.regra === 'confirmacao')!.textoPadrao).toBe(TEXTO_PADRAO.confirmacao);
  });

  it('whatsappReminders=false desliga o lembrete', async () => {
    repo.legadoLembrete.mockResolvedValue({ ativa: false, texto: null });
    expect((await automacoes.obter('b1', 'lembrete')).ativa).toBe(false);
  });

  it('reminderMessage preenchido vira o texto, personalizado', async () => {
    repo.legadoLembrete.mockResolvedValue({ ativa: true, texto: 'Até já, {nome_cliente}!' });
    const l = await automacoes.obter('b1', 'lembrete');
    expect(l.texto).toBe('Até já, {nome_cliente}!');
    expect(l.personalizado).toBe(true);
  });

  it('linha salva do lembrete ganha do legado', async () => {
    repo.legadoLembrete.mockResolvedValue({ ativa: true, texto: 'Legado' });
    linhas = [{ regra: 'lembrete', ativa: false, texto: null, config: { modo: 'vespera', hora: '17:00' } }];
    const l = await automacoes.obter('b1', 'lembrete');
    expect(l.ativa).toBe(false);
    expect(l.personalizado).toBe(false);
    expect(l.textoPadrao).toBe(TEXTO_PADRAO.lembrete);
    expect(l.config).toEqual({ modo: 'vespera', hora: '17:00' });
  });
});

describe('automacoes.atualizar', () => {
  it('mescla a config e salva', async () => {
    await automacoes.atualizar('b1', 'confirmacao', { config: { hora: '10:30' } });
    expect(repo.salvar).toHaveBeenCalledWith('b1', 'confirmacao', expect.objectContaining({ config: { hora: '10:30' } }));
  });

  it('config inválida lança ValidationError e não salva', async () => {
    await expect(automacoes.atualizar('b1', 'confirmacao', { config: { hora: '23:00' } })).rejects.toMatchObject({ statusCode: 400 });
    expect(repo.salvar).not.toHaveBeenCalled();
  });

  it('texto: null restaura o padrão', async () => {
    linhas = [{ regra: 'aniversario', ativa: true, texto: 'Custom', config: {} }];
    const antes = linhas[0];
    repo.salvar.mockImplementation(async (_b: string, _r: string, d: { texto?: string | null }) => { antes.texto = d.texto ?? null; });
    const dto = await automacoes.atualizar('b1', 'aniversario', { texto: null });
    expect(repo.salvar).toHaveBeenCalledWith('b1', 'aniversario', { texto: null });
    expect(dto.personalizado).toBe(false);
  });

  it('texto fora de 1 a 1000 caracteres lança ValidationError', async () => {
    await expect(automacoes.atualizar('b1', 'avaliacao', { texto: '' })).rejects.toMatchObject({ statusCode: 400 });
    await expect(automacoes.atualizar('b1', 'avaliacao', { texto: 'x'.repeat(1001) })).rejects.toMatchObject({ statusCode: 400 });
  });

  it('primeira gravação do lembrete preserva o estado herdado do legado', async () => {
    repo.legadoLembrete.mockResolvedValue({ ativa: false, texto: 'Legado' });
    await automacoes.atualizar('b1', 'lembrete', { config: { hora: '17:00' } });
    expect(repo.salvar).toHaveBeenCalledWith('b1', 'lembrete', expect.objectContaining({ ativa: false, texto: 'Legado' }));
  });
});

describe('automacoes.testar', () => {
  it('sem conexão lança 409', async () => {
    zap.getStatus.mockResolvedValue({ status: 'disconnected' });
    await expect(automacoes.testar('b1', 'confirmacao')).rejects.toMatchObject({ statusCode: 409, code: 'WHATSAPP_DISCONNECTED' });
    expect(zap.send).not.toHaveBeenCalled();
  });

  it('envia o texto renderizado com dados de exemplo', async () => {
    zap.getStatus.mockResolvedValue({ status: 'connected' });
    zap.send.mockResolvedValue(true);
    const r = await automacoes.testar('b1', 'confirmacao');
    expect(r).toEqual({ enviado: true, para: '83999990000' });
    const [numero, texto, opts] = zap.send.mock.calls[0];
    expect(numero).toBe('83999990000');
    expect(texto).toContain('Mariana');
    expect(texto).toContain('Design de Sobrancelha');
    expect(texto).toContain('14:00');
    expect(opts).toEqual({ businessId: 'b1', origin: 'sistema' });
  });
});
