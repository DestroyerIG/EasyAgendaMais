import { describe, it, expect, vi, beforeEach } from 'vitest';

const tx = vi.hoisted(() => ({
  repasse: { create: vi.fn(), delete: vi.fn() },
  adiantamento: { findUnique: vi.fn(), update: vi.fn() },
  repasseAdiantamento: { create: vi.fn() },
}));
const repo = vi.hoisted(() => ({
  comandasFechadas: vi.fn(), profissionais: vi.fn(), adiantamentos: vi.fn(), criarAdiantamento: vi.fn(),
  adiantamento: vi.fn(), excluirAdiantamentoAberto: vi.fn(), professional: vi.fn(), repasses: vi.fn(),
  repasse: vi.fn(), repassePorPeriodo: vi.fn(), modeloRepasse: vi.fn(), salvarModeloRepasse: vi.fn(),
  transacao: vi.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)),
}));
vi.mock('../modules/reports/reports.repository.js', () => ({ reportsRepository: repo }));
vi.mock('../services/scheduleSettingsService.js', () => ({ getBusinessScheduleSettings: vi.fn().mockResolvedValue({ timezone: 'America/Sao_Paulo' }) }));

const { comissoesService } = await import('../modules/reports/comissoes.service.js');

const P = { inicio: '2026-10-01', fim: '2026-10-15' };
const SALAO = { plan: 'premium', subscriptionStatus: 'active' };
const EQUIPE = { plan: 'profissional', subscriptionStatus: 'active' };

const comanda = (over: Record<string, unknown> = {}) => ({
  id: 'k1', professionalId: 'p1', clientId: 'c1', closedAt: new Date('2026-10-05T15:00:00Z'),
  servicesTotal: '100', productsTotal: '50', discountAmount: '0', tipAmount: '10',
  items: [{ kind: 'servico', commissionAmount: '40' }, { kind: 'produto', commissionAmount: '10' }],
  appointment: { id: 'a1' }, ...over,
});
const adiant = (over: Record<string, unknown> = {}) => ({
  id: 'ad1', professionalId: 'p1', valor: '80', valorAbatido: '0', data: new Date('2026-10-02T00:00:00Z'), descricao: null, ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-24T12:00:00-03:00'));
  repo.comandasFechadas.mockResolvedValue([comanda()]);
  repo.adiantamentos.mockResolvedValue([]);
  repo.repasses.mockResolvedValue([]);
  repo.repassePorPeriodo.mockResolvedValue(null);
  repo.modeloRepasse.mockResolvedValue('comissao');
  repo.professional.mockResolvedValue({ id: 'p1', name: 'Camila' });
  repo.profissionais.mockResolvedValue([{ id: 'p1', name: 'Camila', photo: null, active: true, cnpj: null, especialidade: 'Nail designer', breakStart: null, breakEnd: null }]);
  tx.repasse.create.mockImplementation(async ({ data }) => ({ id: 'r1', ...data }));
  tx.adiantamento.findUnique.mockResolvedValue({ valor: '80', valorAbatido: '0' });
});

describe('apuração', () => {
  it('sessão coberta por clube/pacote conta em Serviços pelo valor por sessão', async () => {
    repo.comandasFechadas.mockResolvedValue([comanda({
      servicesTotal: '0', productsTotal: '0', tipAmount: '0',
      items: [{ kind: 'servico', commissionAmount: '42.50', valorCoberto: '85.00' }],
    })]);
    const r = await comissoesService.apuracao('b1', P, EQUIPE);
    expect(r.itens[0]).toMatchObject({ servicos: 85, faturamento: 85, comissao: 42.5 });
  });

  it('linha pendente com comissão + gorjeta e totais do período', async () => {
    const r = await comissoesService.apuracao('b1', P, EQUIPE);
    expect(r.modelo).toBe('comissao');
    expect(r.itens[0]).toMatchObject({ comissao: 50, gorjetas: 10, aPagar: 60, status: 'pendente', cotaSalao: 100 });
    expect(r.totais).toMatchObject({ faturamento: 150, cotaSalao: 100, cotaProfissionais: 50, retencaoMedia: 67, aPagar: 60 });
  });

  it('linha paga mostra a foto do pagamento e a diferença se a comanda mudou', async () => {
    repo.repasses.mockResolvedValue([{
      id: 'r1', professionalId: 'p1', pagoEm: new Date('2026-10-16T12:00:00Z'), forma: 'pix', observacao: null,
      comissaoServico: '30', comissaoProduto: '10', gorjetas: '10', adiantamentos: '0', valorPago: '50',
    }]);
    const [i] = (await comissoesService.apuracao('b1', P, EQUIPE)).itens;
    expect(i).toMatchObject({ status: 'pago', aPagar: 50, diferencaDesdePagamento: 10 });
  });

  it('salão-parceiro salvo vale só no plano Salão', async () => {
    repo.modeloRepasse.mockResolvedValue('salao_parceiro');
    expect((await comissoesService.apuracao('b1', P, SALAO)).modelo).toBe('salao_parceiro');
    const equipe = await comissoesService.apuracao('b1', P, EQUIPE);
    expect(equipe).toMatchObject({ modelo: 'comissao', modeloSalvo: 'salao_parceiro', salaoParceiroLiberado: false });
  });
});

describe('pagar', () => {
  const pedido = { professionalId: 'p1', ...P, forma: 'pix' };

  it('grava a foto, abate o adiantamento em parte e o resto fica aberto', async () => {
    repo.adiantamentos.mockResolvedValue([adiant()]);
    const r = await comissoesService.pagar('b1', 'u1', EQUIPE, pedido);
    expect(tx.repasse.create).toHaveBeenCalledWith({ data: expect.objectContaining({
      comissaoServico: 40, comissaoProduto: 10, gorjetas: 10, adiantamentos: 60, valorPago: 0, forma: 'pix', pagoPor: 'u1',
    }) });
    expect(tx.adiantamento.update).toHaveBeenCalledWith({ where: { id: 'ad1' }, data: { valorAbatido: { increment: 60 } } });
    expect(tx.repasseAdiantamento.create).toHaveBeenCalledWith({ data: { repasseId: 'r1', adiantamentoId: 'ad1', valor: 60 } });
    expect(r).toMatchObject({ id: 'r1' });
  });

  it('segundo clique devolve o repasse que já existe', async () => {
    repo.repassePorPeriodo.mockResolvedValue({ id: 'r1' });
    expect(await comissoesService.pagar('b1', 'u1', EQUIPE, pedido)).toEqual({ id: 'r1' });
    expect(tx.repasse.create).not.toHaveBeenCalled();
  });

  it('corrida na chave única devolve o primeiro', async () => {
    tx.repasse.create.mockRejectedValue(Object.assign(new Error('dup'), { code: 'P2002' }));
    repo.repassePorPeriodo.mockResolvedValueOnce(null).mockResolvedValueOnce({ id: 'r0' });
    expect(await comissoesService.pagar('b1', 'u1', EQUIPE, pedido)).toEqual({ id: 'r0' });
  });

  it('adiantamento abatido por outro pagamento no meio → erro e nada gravado', async () => {
    repo.adiantamentos.mockResolvedValue([adiant()]);
    tx.adiantamento.findUnique.mockResolvedValue({ valor: '80', valorAbatido: '80' });
    await expect(comissoesService.pagar('b1', 'u1', EQUIPE, pedido)).rejects.toThrow(/adiantamento mudou/);
  });

  it('sem comanda no período → erro', async () => {
    repo.comandasFechadas.mockResolvedValue([]);
    await expect(comissoesService.pagar('b1', 'u1', EQUIPE, pedido)).rejects.toThrow(/Nenhuma comanda/);
  });
});

describe('desfazer e adiantamentos', () => {
  it('desfazer devolve o valor aos adiantamentos e apaga o repasse', async () => {
    repo.repasse.mockResolvedValue({ id: 'r1', abatimentos: [{ adiantamentoId: 'ad1', valor: '60' }] });
    await comissoesService.desfazer('b1', 'r1');
    expect(tx.adiantamento.update).toHaveBeenCalledWith({ where: { id: 'ad1' }, data: { valorAbatido: { decrement: 60 } } });
    expect(tx.repasse.delete).toHaveBeenCalledWith({ where: { id: 'r1' } });
  });

  it('adiantamento com data futura é recusado', async () => {
    await expect(comissoesService.lancarAdiantamento('b1', 'u1', { professionalId: 'p1', valor: 50, data: '2026-10-25' })).rejects.toThrow(/futura/);
    expect(repo.criarAdiantamento).not.toHaveBeenCalled();
  });

  it('adiantamento já abatido não pode ser excluído', async () => {
    repo.adiantamento.mockResolvedValue(adiant({ valorAbatido: '10' }));
    repo.excluirAdiantamentoAberto.mockResolvedValue(false);
    await expect(comissoesService.excluirAdiantamento('b1', 'ad1')).rejects.toThrow(/já foi descontado/);
  });

  it('salvar salão-parceiro fora do Salão → 403', async () => {
    await expect(comissoesService.salvarModelo('b1', EQUIPE, 'salao_parceiro')).rejects.toMatchObject({ statusCode: 403 });
    expect(repo.salvarModeloRepasse).not.toHaveBeenCalled();
    await comissoesService.salvarModelo('b1', SALAO, 'salao_parceiro');
    expect(repo.salvarModeloRepasse).toHaveBeenCalledWith('b1', 'salao_parceiro');
  });
});
