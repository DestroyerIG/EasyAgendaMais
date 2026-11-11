import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../config/prisma.js', () => ({ prisma: {} }));
vi.mock('../utils/logger.js', () => ({ default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }));

const comandas = vi.hoisted(() => ({ get: vi.fn(), save: vi.fn() }));
vi.mock('../modules/comandas/comandas.service.js', () => ({ comandasService: comandas }));

const conexao = vi.hoisted(() => ({
  tokenAtivo: vi.fn(), alertarRecusa: vi.fn(), acessoRevogado: vi.fn(), marcarReconectar: vi.fn(),
}));
vi.mock('../modules/recebimentos/conexao.service.js', () => ({ conexaoService: conexao }));

const repo = vi.hoisted(() => ({
  substituirSaldoPendente: vi.fn(), criarCobrancaSaldo: vi.fn(), completarCobranca: vi.fn(), apagarCobranca: vi.fn(),
  ultimaCobrancaSaldo: vi.fn(), cancelarSaldoPendente: vi.fn(), terminalPadrao: vi.fn(),
}));
vi.mock('../modules/recebimentos/recebimentos.repository.js', () => ({ recebimentosRepository: repo }));

const gw = vi.hoisted(() => ({ criarPix: vi.fn(), criarOrdemPoint: vi.fn(), cancelarOrdem: vi.fn() }));
vi.mock('../modules/recebimentos/gateways/porId.js', () => ({ gatewayDe: () => gw }));
vi.mock('../modules/recebimentos/gateways/infinitePay.js', () => ({ infinitePay: {} }));

const { cobrancaSaldoService } = await import('../modules/recebimentos/cobrancaSaldo.service.js');
const { GatewayRecusou, GatewayTerminalOcupado, GatewayIndisponivel } = await import('../modules/recebimentos/gateways/index.js');

const dto = (over: Record<string, unknown> = {}) => ({
  id: 'k1', number: 1042, status: 'rascunho', appointment: { id: 'a1' }, calc: { totalCharged: 80 }, ...over,
});
const entrada = { extras: [], discount: 0, tip: 0 };

beforeEach(() => {
  vi.clearAllMocks();
  comandas.get.mockResolvedValue(dto());
  comandas.save.mockResolvedValue(dto());
  conexao.tokenAtivo.mockResolvedValue({ gateway: 'mercadopago', accessToken: 'APP_USR-segredo' });
  conexao.acessoRevogado.mockResolvedValue(false);
  repo.criarCobrancaSaldo.mockResolvedValue({ id: 'c1' });
  gw.criarPix.mockResolvedValue({ idExterno: 'ORD1', codigoPix: '000201PIX' });
  repo.ultimaCobrancaSaldo.mockResolvedValue(null);
  repo.terminalPadrao.mockResolvedValue(null);
  gw.criarOrdemPoint.mockResolvedValue({ idExterno: 'ORDPOINT1' });
});

describe('cobrancaSaldoService.criar', () => {
  it('salva o rascunho como Pix, cobra o saldo no gateway por 15 minutos e devolve o código', async () => {
    const antes = Date.now();
    const r = await cobrancaSaldoService.criar('k1', 'b1', 'u1', entrada, { via: 'pix' });

    expect(comandas.save).toHaveBeenCalledWith('k1', 'b1', { ...entrada, paymentMethod: 'pix' });
    const criada = repo.criarCobrancaSaldo.mock.calls[0]![0];
    expect(criada).toMatchObject({ businessId: 'b1', appointmentId: 'a1', usuarioId: 'u1', gateway: 'mercadopago', valor: 80 });
    expect(criada.venceEm.getTime() - antes).toBeGreaterThanOrEqual(15 * 60_000 - 1000);
    expect(criada.venceEm.getTime() - antes).toBeLessThanOrEqual(15 * 60_000 + 5000);
    expect(gw.criarPix).toHaveBeenCalledWith('APP_USR-segredo', expect.objectContaining({ cobrancaId: 'c1', valor: 80, descricao: 'Comanda 1042' }));
    expect(repo.completarCobranca).toHaveBeenCalledWith('c1', { idExterno: 'ORD1', codigoPix: '000201PIX' });
    expect(r).toMatchObject({ id: 'c1', via: 'pix', situacao: 'pendente', valor: 80, codigoPix: '000201PIX', pagoEm: null });
  });

  it('a cobrança anterior em aberto é substituída antes de gravar o rascunho (senão a trava bloquearia)', async () => {
    const ordem: string[] = [];
    repo.substituirSaldoPendente.mockImplementation(async () => { ordem.push('substituir'); });
    comandas.save.mockImplementation(async () => { ordem.push('salvar'); return dto(); });
    await cobrancaSaldoService.criar('k1', 'b1', 'u1', entrada, { via: 'pix' });
    expect(ordem).toEqual(['substituir', 'salvar']);
  });

  it('comanda já fechada: 409 sem chamar o gateway', async () => {
    comandas.get.mockResolvedValue(dto({ status: 'fechada' }));
    await expect(cobrancaSaldoService.criar('k1', 'b1', 'u1', entrada, { via: 'pix' })).rejects.toMatchObject({ statusCode: 409 });
    expect(gw.criarPix).not.toHaveBeenCalled();
  });

  it('sem Mercado Pago ativo: 409 SEM_GATEWAY e nenhuma linha criada', async () => {
    conexao.tokenAtivo.mockResolvedValue(null);
    await expect(cobrancaSaldoService.criar('k1', 'b1', 'u1', entrada, { via: 'pix' })).rejects.toMatchObject({ statusCode: 409, code: 'SEM_GATEWAY' });
    conexao.tokenAtivo.mockResolvedValue({ gateway: 'infinitepay', accessToken: 'x' });
    await expect(cobrancaSaldoService.criar('k1', 'b1', 'u1', entrada, { via: 'pix' })).rejects.toMatchObject({ code: 'SEM_GATEWAY' });
    expect(repo.criarCobrancaSaldo).not.toHaveBeenCalled();
  });

  it('saldo zero: 409 e nenhuma linha criada', async () => {
    comandas.save.mockResolvedValue(dto({ calc: { totalCharged: 0 } }));
    await expect(cobrancaSaldoService.criar('k1', 'b1', 'u1', entrada, { via: 'pix' })).rejects.toMatchObject({ statusCode: 409 });
    expect(repo.criarCobrancaSaldo).not.toHaveBeenCalled();
  });

  it('falha do gateway: apaga a linha, devolve 502 GATEWAY_INDISPONIVEL e alerta quando a conta recusou', async () => {
    gw.criarPix.mockRejectedValue(new GatewayRecusou());
    await expect(cobrancaSaldoService.criar('k1', 'b1', 'u1', entrada, { via: 'pix' })).rejects.toMatchObject({ statusCode: 502, code: 'GATEWAY_INDISPONIVEL' });
    expect(repo.apagarCobranca).toHaveBeenCalledWith('c1');
    expect(conexao.alertarRecusa).toHaveBeenCalledWith('b1');
  });
});

describe('cobrancaSaldoService.estado e cancelar', () => {
  const linha = (over: Record<string, unknown> = {}) => ({
    id: 'c1', gateway: 'mercadopago', forma: 'pix', situacao: 'pendente', valor: '80.00', codigoPix: '000201PIX',
    venceEm: new Date(Date.now() + 10 * 60_000), pagoEm: null, criadoEm: new Date(), ...over,
  });

  it('estado devolve o gateway ativo e a última cobrança em formato de tela', async () => {
    repo.ultimaCobrancaSaldo.mockResolvedValue(linha());
    const e = await cobrancaSaldoService.estado('k1', 'b1');
    expect(repo.ultimaCobrancaSaldo).toHaveBeenCalledWith('a1');
    expect(e.gateway).toBe('mercadopago');
    expect(e.cobranca).toMatchObject({ id: 'c1', via: 'pix', situacao: 'pendente', valor: 80, codigoPix: '000201PIX' });
    expect(typeof e.cobranca!.venceEm).toBe('string');
  });

  it('sem conexão do Mercado Pago o gateway é null e sem cobrança a cobrança é null', async () => {
    conexao.tokenAtivo.mockResolvedValue(null);
    expect(await cobrancaSaldoService.estado('k1', 'b1')).toEqual({ gateway: null, cobranca: null, terminal: null, avisoMaquininha: false });
  });

  it('cobrança pendente que passou do prazo aparece como expirada, antes de a rotina marcar', async () => {
    repo.ultimaCobrancaSaldo.mockResolvedValue(linha({ venceEm: new Date(Date.now() - 60_000) }));
    expect((await cobrancaSaldoService.estado('k1', 'b1')).cobranca!.situacao).toBe('expirada');
  });

  it('cancelar marca a cobrança pendente como cancelada e devolve o estado', async () => {
    repo.cancelarSaldoPendente.mockResolvedValue(1);
    repo.ultimaCobrancaSaldo.mockResolvedValue(linha({ situacao: 'cancelada' }));
    const e = await cobrancaSaldoService.cancelar('k1', 'b1');
    expect(repo.cancelarSaldoPendente).toHaveBeenCalledWith('a1');
    expect(e.cobranca!.situacao).toBe('cancelada');
  });
});

describe('cobrança do saldo na maquininha Point', () => {
  const TERMINAL = 'NEWLAND_N950__ABC12345';
  const debito = { via: 'maquininha' as const, forma: 'debito' as const };
  beforeEach(() => { repo.terminalPadrao.mockResolvedValue(TERMINAL); });

  it('débito: salva o rascunho como débito, cria a linha point no terminal padrão e manda a ordem ao terminal', async () => {
    const r = await cobrancaSaldoService.criar('k1', 'b1', 'u1', entrada, debito);

    expect(comandas.save).toHaveBeenCalledWith('k1', 'b1', { ...entrada, paymentMethod: 'debito' });
    expect(repo.criarCobrancaSaldo).toHaveBeenCalledWith(expect.objectContaining({
      businessId: 'b1', appointmentId: 'a1', usuarioId: 'u1', gateway: 'mercadopago', valor: 80, forma: 'point', terminalId: TERMINAL,
    }));
    expect(gw.criarOrdemPoint).toHaveBeenCalledWith(
      'APP_USR-segredo', expect.objectContaining({ cobrancaId: 'c1', valor: 80, descricao: 'Comanda 1042' }), { terminalId: TERMINAL, tipo: 'debit_card' },
    );
    expect(gw.criarPix).not.toHaveBeenCalled();
    expect(repo.completarCobranca).toHaveBeenCalledWith('c1', { idExterno: 'ORDPOINT1' });
    expect(r).toMatchObject({ id: 'c1', via: 'maquininha', situacao: 'pendente', valor: 80, codigoPix: null, pagoEm: null });
  });

  it('crédito manda credit_card e grava a forma crédito na comanda', async () => {
    await cobrancaSaldoService.criar('k1', 'b1', 'u1', entrada, { via: 'maquininha', forma: 'credito' });
    expect(comandas.save).toHaveBeenCalledWith('k1', 'b1', { ...entrada, paymentMethod: 'credito' });
    expect(gw.criarOrdemPoint.mock.calls[0]![2]).toEqual({ terminalId: TERMINAL, tipo: 'credit_card' });
  });

  it('sem maquininha escolhida: 409 SEM_MAQUININHA, sem mexer na comanda nem criar linha', async () => {
    repo.terminalPadrao.mockResolvedValue(null);
    await expect(cobrancaSaldoService.criar('k1', 'b1', 'u1', entrada, debito)).rejects.toMatchObject({ statusCode: 409, code: 'SEM_MAQUININHA' });
    expect(repo.substituirSaldoPendente).not.toHaveBeenCalled();
    expect(comandas.save).not.toHaveBeenCalled();
    expect(repo.criarCobrancaSaldo).not.toHaveBeenCalled();
  });

  it('maquininha com outra cobrança na fila: apaga a linha, 409 MAQUININHA_OCUPADA e não alerta a conta', async () => {
    gw.criarOrdemPoint.mockRejectedValue(new GatewayTerminalOcupado());
    await expect(cobrancaSaldoService.criar('k1', 'b1', 'u1', entrada, debito)).rejects.toMatchObject({ statusCode: 409, code: 'MAQUININHA_OCUPADA' });
    expect(repo.apagarCobranca).toHaveBeenCalledWith('c1');
    expect(conexao.alertarRecusa).not.toHaveBeenCalled();
  });

  it('outra falha do gateway: apaga a linha e devolve 502 GATEWAY_INDISPONIVEL', async () => {
    gw.criarOrdemPoint.mockRejectedValue(new GatewayIndisponivel());
    await expect(cobrancaSaldoService.criar('k1', 'b1', 'u1', entrada, debito)).rejects.toMatchObject({ statusCode: 502, code: 'GATEWAY_INDISPONIVEL' });
    expect(repo.apagarCobranca).toHaveBeenCalledWith('c1');
  });

  describe('estado e cancelamento', () => {
    const linha = (over: Record<string, unknown> = {}) => ({
      id: 'c1', gateway: 'mercadopago', forma: 'point', situacao: 'pendente', valor: '80.00', codigoPix: null, terminalId: TERMINAL, idExterno: 'ORDPOINT1',
      venceEm: new Date(Date.now() + 10 * 60_000), pagoEm: null, criadoEm: new Date(), ...over,
    });

    it('estado mostra o terminal padrão (com nome para a tela) e a cobrança como maquininha', async () => {
      repo.ultimaCobrancaSaldo.mockResolvedValue(linha());
      const e = await cobrancaSaldoService.estado('k1', 'b1');
      expect(e.terminal).toEqual({ id: TERMINAL, nome: 'Point final 2345' });
      expect(e.avisoMaquininha).toBe(false);
      expect(e.cobranca).toMatchObject({ via: 'maquininha', codigoPix: null });
    });

    it('sem Mercado Pago ativo não há terminal', async () => {
      conexao.tokenAtivo.mockResolvedValue(null);
      expect((await cobrancaSaldoService.estado('k1', 'b1')).terminal).toBeNull();
    });

    it('cancelar uma ordem Point cancela no gateway e marca cancelada; terminal que não deixa cancelar avisa', async () => {
      repo.ultimaCobrancaSaldo.mockResolvedValue(linha());
      gw.cancelarOrdem.mockResolvedValue('cancelada');
      repo.cancelarSaldoPendente.mockResolvedValue(1);
      expect((await cobrancaSaldoService.cancelar('k1', 'b1')).avisoMaquininha).toBe(false);
      expect(gw.cancelarOrdem).toHaveBeenCalledWith('APP_USR-segredo', 'ORDPOINT1', 'c1');
      expect(repo.cancelarSaldoPendente).toHaveBeenCalledWith('a1');

      gw.cancelarOrdem.mockResolvedValue('pedir_no_terminal');
      expect((await cobrancaSaldoService.cancelar('k1', 'b1')).avisoMaquininha).toBe(true);
    });

    it('falha do gateway ao cancelar: cancela aqui mesmo e pede para cancelar na maquininha', async () => {
      repo.ultimaCobrancaSaldo.mockResolvedValue(linha());
      gw.cancelarOrdem.mockRejectedValue(new GatewayIndisponivel());
      const e = await cobrancaSaldoService.cancelar('k1', 'b1');
      expect(repo.cancelarSaldoPendente).toHaveBeenCalledWith('a1');
      expect(e.avisoMaquininha).toBe(true);
    });

    it('cancelar uma cobrança Pix não chama o gateway da maquininha', async () => {
      repo.ultimaCobrancaSaldo.mockResolvedValue(linha({ forma: 'pix', idExterno: 'ORD1', codigoPix: 'X', terminalId: null }));
      await cobrancaSaldoService.cancelar('k1', 'b1');
      expect(gw.cancelarOrdem).not.toHaveBeenCalled();
      expect(repo.cancelarSaldoPendente).toHaveBeenCalledWith('a1');
    });
  });
});
