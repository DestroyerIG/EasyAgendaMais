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
  ultimaCobrancaSaldo: vi.fn(), cancelarSaldoPendente: vi.fn(),
}));
vi.mock('../modules/recebimentos/recebimentos.repository.js', () => ({ recebimentosRepository: repo }));

const gw = vi.hoisted(() => ({ criarPix: vi.fn() }));
vi.mock('../modules/recebimentos/gateways/porId.js', () => ({ gatewayDe: () => gw }));
vi.mock('../modules/recebimentos/gateways/infinitePay.js', () => ({ infinitePay: {} }));

const { cobrancaSaldoService } = await import('../modules/recebimentos/cobrancaSaldo.service.js');
const { GatewayRecusou } = await import('../modules/recebimentos/gateways/index.js');

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
});

describe('cobrancaSaldoService.criar', () => {
  it('salva o rascunho como Pix, cobra o saldo no gateway por 15 minutos e devolve o código', async () => {
    const antes = Date.now();
    const r = await cobrancaSaldoService.criar('k1', 'b1', 'u1', entrada);

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
    await cobrancaSaldoService.criar('k1', 'b1', 'u1', entrada);
    expect(ordem).toEqual(['substituir', 'salvar']);
  });

  it('comanda já fechada: 409 sem chamar o gateway', async () => {
    comandas.get.mockResolvedValue(dto({ status: 'fechada' }));
    await expect(cobrancaSaldoService.criar('k1', 'b1', 'u1', entrada)).rejects.toMatchObject({ statusCode: 409 });
    expect(gw.criarPix).not.toHaveBeenCalled();
  });

  it('sem Mercado Pago ativo: 409 SEM_GATEWAY e nenhuma linha criada', async () => {
    conexao.tokenAtivo.mockResolvedValue(null);
    await expect(cobrancaSaldoService.criar('k1', 'b1', 'u1', entrada)).rejects.toMatchObject({ statusCode: 409, code: 'SEM_GATEWAY' });
    conexao.tokenAtivo.mockResolvedValue({ gateway: 'infinitepay', accessToken: 'x' });
    await expect(cobrancaSaldoService.criar('k1', 'b1', 'u1', entrada)).rejects.toMatchObject({ code: 'SEM_GATEWAY' });
    expect(repo.criarCobrancaSaldo).not.toHaveBeenCalled();
  });

  it('saldo zero: 409 e nenhuma linha criada', async () => {
    comandas.save.mockResolvedValue(dto({ calc: { totalCharged: 0 } }));
    await expect(cobrancaSaldoService.criar('k1', 'b1', 'u1', entrada)).rejects.toMatchObject({ statusCode: 409 });
    expect(repo.criarCobrancaSaldo).not.toHaveBeenCalled();
  });

  it('falha do gateway: apaga a linha, devolve 502 GATEWAY_INDISPONIVEL e alerta quando a conta recusou', async () => {
    gw.criarPix.mockRejectedValue(new GatewayRecusou());
    await expect(cobrancaSaldoService.criar('k1', 'b1', 'u1', entrada)).rejects.toMatchObject({ statusCode: 502, code: 'GATEWAY_INDISPONIVEL' });
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
    expect(await cobrancaSaldoService.estado('k1', 'b1')).toEqual({ gateway: null, cobranca: null });
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
