import { describe, it, expect } from 'vitest';
import {
  type ContratoParaCobertura, avaliarCobertura, cicloQueComecaEm, contratoVigente, descontoSocia, escolherCobertura,
  saldo, sessoesDoPreco, somarMeses, validadeDaPrimeiraSessao, validadeSemUso, valorSessao,
} from '../modules/clube/clube.rules.js';

const clube = (over: Partial<ContratoParaCobertura> = {}): ContratoParaCobertura => ({
  id: 'ct1', tipo: 'clube', status: 'ativo', nome: 'Clube Mãos Sempre Prontas', valorSessao: 37.47,
  sessoesPorCiclo: 4, totalSessoes: null, sessoesUsadas: 0, intervaloMinimoDias: 0,
  cicloInicio: '2026-10-15', cicloFim: '2026-11-14', validoAte: null,
  servicos: ['s1'], profissionais: [], usosNoCiclo: 1, ultimoUso: '2026-10-16', ...over,
});
const pacote = (over: Partial<ContratoParaCobertura> = {}): ContratoParaCobertura => ({
  ...clube(), id: 'pk1', tipo: 'pacote', nome: 'Pacote Fibra 10 sessões', valorSessao: 85,
  sessoesPorCiclo: null, totalSessoes: 10, sessoesUsadas: 3, cicloInicio: null, cicloFim: null, validoAte: '2027-01-30', ...over,
});
const alvo = { data: '2026-10-24', serviceId: 's1', professionalId: 'p1' };

describe('valor por sessão', () => {
  it('preço ÷ sessões, para baixo no centavo', () => {
    expect(valorSessao(149.9, 4)).toBe(37.47);
    expect(valorSessao(850, 10)).toBe(85);
    expect(valorSessao(100, 3)).toBe(33.33);
  });
  it('clube ilimitado divide pela referência', () => {
    expect(sessoesDoPreco({ tipo: 'clube', sessoesPorCiclo: null, totalSessoes: null, sessoesReferencia: 4 })).toBe(4);
    expect(sessoesDoPreco({ tipo: 'pacote', sessoesPorCiclo: null, totalSessoes: 10, sessoesReferencia: 4 })).toBe(10);
  });
});

describe('ciclos', () => {
  it('mensal a partir do dia da ativação', () => {
    expect(cicloQueComecaEm('2026-10-15', 15)).toEqual({ inicio: '2026-10-15', fim: '2026-11-14' });
  });
  it('dia 31 vira o último dia em meses curtos e volta ao 31 depois', () => {
    expect(somarMeses('2026-01-31', 1)).toBe('2026-02-28');
    expect(somarMeses('2026-02-28', 1, 31)).toBe('2026-03-31');
    expect(cicloQueComecaEm('2026-01-31', 31)).toEqual({ inicio: '2026-01-31', fim: '2026-02-27' });
    expect(cicloQueComecaEm('2026-02-28', 31)).toEqual({ inicio: '2026-02-28', fim: '2026-03-30' });
  });
  it('virada de ano', () => {
    expect(somarMeses('2026-12-10', 1)).toBe('2027-01-10');
  });
});

describe('validade do pacote', () => {
  it('conta da primeira sessão; sem uso, da compra mais o dobro', () => {
    expect(validadeDaPrimeiraSessao('2026-10-01', 90)).toBe('2026-12-29');
    expect(validadeSemUso('2026-10-01', 90)).toBe('2027-03-29');
  });
});

describe('avaliarCobertura', () => {
  it('clube com saldo cobre e informa a sessão', () => {
    expect(avaliarCobertura(clube(), alvo)).toMatchObject({ ok: true, sessao: 2, de: 4, valorSessao: 37.47, venceEm: '2026-11-14' });
  });
  it('sem saldo neste mês', () => {
    expect(avaliarCobertura(clube({ usosNoCiclo: 4 }), alvo)).toMatchObject({ ok: false, motivo: 'Sem saldo neste mês' });
  });
  it('ilimitado sempre tem saldo', () => {
    expect(avaliarCobertura(clube({ sessoesPorCiclo: null, usosNoCiclo: 12 }), alvo)).toMatchObject({ ok: true, de: null });
  });
  it('em atraso bloqueia e mostra a data', () => {
    expect(avaliarCobertura(clube({ status: 'em_atraso', cicloInicio: '2026-09-15', cicloFim: '2026-10-14' }), alvo))
      .toMatchObject({ ok: false, motivo: 'Clube em atraso desde 15/10' });
  });
  it('depois do ciclo pago, sem confirmação, bloqueia como pendente', () => {
    expect(avaliarCobertura(clube({ cicloInicio: '2026-09-24', cicloFim: '2026-10-23' }), alvo))
      .toMatchObject({ ok: false, motivo: 'Mensalidade de 24/10 aguardando pagamento' });
  });
  it('clube cancelado vale até o fim do ciclo pago', () => {
    expect(avaliarCobertura(clube({ status: 'cancelado' }), alvo)).toMatchObject({ ok: true });
    expect(avaliarCobertura(clube({ status: 'cancelado' }), { ...alvo, data: '2026-11-15' })).toMatchObject({ ok: false, motivo: 'Clube cancelado' });
  });
  it('intervalo mínimo', () => {
    expect(avaliarCobertura(clube({ intervaloMinimoDias: 10, ultimoUso: '2026-10-16' }), alvo))
      .toMatchObject({ ok: false, motivo: 'Intervalo mínimo de 10 dias (liberado em 26/10)' });
    expect(avaliarCobertura(clube({ intervaloMinimoDias: 8, ultimoUso: '2026-10-16' }), alvo)).toMatchObject({ ok: true });
  });
  it('serviço e profissional', () => {
    expect(avaliarCobertura(clube(), { ...alvo, serviceId: 's2' })).toMatchObject({ ok: false, motivo: 'Serviço não incluso' });
    expect(avaliarCobertura(clube({ profissionais: ['p2'] }), alvo)).toMatchObject({ ok: false, motivo: 'Profissional não incluída' });
  });
  it('pacote: sessão X de Y, vencido e sem saldo', () => {
    expect(avaliarCobertura(pacote(), alvo)).toMatchObject({ ok: true, sessao: 4, de: 10, venceEm: '2027-01-30' });
    expect(avaliarCobertura(pacote({ validoAte: '2026-10-23' }), alvo)).toMatchObject({ ok: false, motivo: 'Pacote vencido' });
    expect(avaliarCobertura(pacote({ sessoesUsadas: 10 }), alvo)).toMatchObject({ ok: false, motivo: 'Pacote sem saldo' });
  });
  it('aguardando o primeiro pagamento não cobre', () => {
    expect(avaliarCobertura(pacote({ status: 'aguardando_pagamento' }), alvo)).toMatchObject({ ok: false, motivo: 'Aguardando o primeiro pagamento' });
  });
});

describe('escolherCobertura', () => {
  it('entre os válidos, o que vence antes', () => {
    const r = escolherCobertura([avaliarCobertura(pacote(), alvo), avaliarCobertura(clube(), alvo)]);
    expect(r).toMatchObject({ ok: true, contratoId: 'ct1' });
  });
  it('sem válido, explica pelo contrato que inclui o serviço', () => {
    const r = escolherCobertura([
      avaliarCobertura(clube({ id: 'outro', servicos: ['s9'] }), alvo),
      avaliarCobertura(clube({ usosNoCiclo: 4 }), alvo),
    ]);
    expect(r).toMatchObject({ ok: false, contratoId: 'ct1', motivo: 'Sem saldo neste mês' });
  });
  it('nenhum contrato que inclua o serviço: null', () => {
    expect(escolherCobertura([avaliarCobertura(clube({ servicos: ['s9'] }), alvo)])).toBeNull();
    expect(escolherCobertura([])).toBeNull();
  });
});

describe('saldo, vigência e desconto de sócia', () => {
  it('saldo do clube e do pacote', () => {
    expect(saldo({ tipo: 'clube', sessoesPorCiclo: 4, totalSessoes: null, sessoesUsadas: 0, usosNoCiclo: 1 })).toEqual({ restantes: 3, total: 4, usadas: 1 });
    expect(saldo({ tipo: 'pacote', sessoesPorCiclo: null, totalSessoes: 10, sessoesUsadas: 4, usosNoCiclo: 0 })).toEqual({ restantes: 6, total: 10, usadas: 4 });
  });
  it('vigente: ativo no ciclo, cancelado até o fim do ciclo, pacote dentro da validade', () => {
    expect(contratoVigente({ tipo: 'clube', status: 'ativo', cicloFim: '2026-11-14', validoAte: null }, '2026-10-24')).toBe(true);
    expect(contratoVigente({ tipo: 'clube', status: 'em_atraso', cicloFim: '2026-10-14', validoAte: null }, '2026-10-24')).toBe(false);
    expect(contratoVigente({ tipo: 'clube', status: 'cancelado', cicloFim: '2026-11-14', validoAte: null }, '2026-10-24')).toBe(true);
    expect(contratoVigente({ tipo: 'pacote', status: 'ativo', cicloFim: null, validoAte: '2026-10-23' }, '2026-10-24')).toBe(false);
  });
  it('desconto: o maior entre os contratos vigentes', () => {
    expect(descontoSocia([{ valido: true, descontoExtrasPct: 10 }, { valido: true, descontoExtrasPct: 15 }, { valido: false, descontoExtrasPct: 30 }])).toBe(15);
    expect(descontoSocia([])).toBe(0);
  });
});
