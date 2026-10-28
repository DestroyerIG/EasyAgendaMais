import { describe, it, expect } from 'vitest';
import { calcularEstadoConta, type EntradaEstado } from '../modules/conta/estadoConta.rules.js';

const agora = new Date('2026-10-28T15:00:00Z');

function entrada(parcial: Partial<EntradaEstado>): EntradaEstado {
  return { status: 'active', inadimplenteDesde: null, jaPagou: true, fimDoPeriodo: null, agora, ...parcial };
}

describe('calcularEstadoConta', () => {
  it('active e trialing ficam ativas', () => {
    expect(calcularEstadoConta(entrada({ status: 'active' }))).toEqual({ tipo: 'ativa' });
    expect(calcularEstadoConta(entrada({ status: 'trialing', jaPagou: false }))).toEqual({ tipo: 'ativa' });
  });

  it('past_due dentro da carência', () => {
    const r = calcularEstadoConta(entrada({ status: 'past_due', inadimplenteDesde: new Date('2026-10-25T15:00:00Z') }));
    expect(r).toEqual({
      tipo: 'carencia',
      desde: new Date('2026-10-25T15:00:00Z'),
      ate: new Date('2026-11-01T15:00:00Z'),
      diasRestantes: 4,
    });
  });

  it('exatamente 7 dias já bloqueia por cobrança', () => {
    const r = calcularEstadoConta(entrada({ status: 'past_due', inadimplenteDesde: new Date('2026-10-21T15:00:00Z') }));
    expect(r).toEqual({ tipo: 'bloqueada', motivo: 'cobranca' });
  });

  it('diasRestantes arredonda para cima', () => {
    const r = calcularEstadoConta(entrada({ status: 'past_due', inadimplenteDesde: new Date('2026-10-21T16:00:00Z') }));
    expect(r).toMatchObject({ tipo: 'carencia', diasRestantes: 1 });
  });

  it('pending com período pago no futuro continua ativa', () => {
    const r = calcularEstadoConta(entrada({ status: 'pending', fimDoPeriodo: new Date('2026-11-02T00:00:00Z') }));
    expect(r).toEqual({ tipo: 'ativa' });
  });

  it('pending sem pagamento anterior é bloqueada por teste', () => {
    expect(calcularEstadoConta(entrada({ status: 'pending', jaPagou: false }))).toEqual({ tipo: 'bloqueada', motivo: 'teste' });
  });

  it('pending já pago com período vencido entra na carência', () => {
    const r = calcularEstadoConta(entrada({
      status: 'pending',
      fimDoPeriodo: new Date('2026-10-27T00:00:00Z'),
      inadimplenteDesde: new Date('2026-10-27T15:00:00Z'),
    }));
    expect(r).toMatchObject({ tipo: 'carencia', diasRestantes: 6 });
  });

  it('Pix gerado antes do vencimento: a carência conta do fim do período', () => {
    // Cobrança gerada 20 dias antes do fim do período; hoje é o dia seguinte ao fim.
    const fim = new Date('2026-10-27T15:00:00Z');
    const r = calcularEstadoConta(entrada({
      status: 'pending',
      fimDoPeriodo: fim,
      inadimplenteDesde: new Date('2026-10-07T15:00:00Z'),
      pix: true,
    }));
    expect(r).toEqual({ tipo: 'carencia', desde: fim, ate: new Date('2026-11-03T15:00:00Z'), diasRestantes: 6 });
  });

  it('a cobrança vencida (past_due) do Pix antecipado também conta do fim do período', () => {
    const fim = new Date('2026-10-27T15:00:00Z');
    const r = calcularEstadoConta(entrada({
      status: 'past_due',
      fimDoPeriodo: fim,
      inadimplenteDesde: new Date('2026-10-07T15:00:00Z'),
      pix: true,
    }));
    expect(r).toMatchObject({ tipo: 'carencia', desde: fim, diasRestantes: 6 });
  });

  it('cartão bloqueado não volta para a carência quando o período renovado acaba', () => {
    // Fatura falhou há 31 dias; o Stripe tinha avançado o fim do período para ontem.
    const r = calcularEstadoConta(entrada({
      status: 'past_due',
      fimDoPeriodo: new Date('2026-10-27T15:00:00Z'),
      inadimplenteDesde: new Date('2026-09-27T15:00:00Z'),
    }));
    expect(r).toEqual({ tipo: 'bloqueada', motivo: 'cobranca' });
  });

  it('past_due com período já renovado no futuro (cartão) conta de inadimplenteDesde', () => {
    const r = calcularEstadoConta(entrada({
      status: 'past_due',
      fimDoPeriodo: new Date('2026-11-25T00:00:00Z'),
      inadimplenteDesde: new Date('2026-10-25T15:00:00Z'),
    }));
    expect(r).toMatchObject({ tipo: 'carencia', desde: new Date('2026-10-25T15:00:00Z'), diasRestantes: 4 });
  });

  it('quem já pagou e cai em status fora da contingência é bloqueada por cobrança', () => {
    expect(calcularEstadoConta(entrada({ status: 'incomplete', jaPagou: true }))).toEqual({ tipo: 'bloqueada', motivo: 'cobranca' });
  });

  it('incomplete é bloqueada por teste', () => {
    expect(calcularEstadoConta(entrada({ status: 'incomplete', jaPagou: false }))).toEqual({ tipo: 'bloqueada', motivo: 'teste' });
  });

  it('canceled é bloqueada como cancelada, mesmo tendo pago', () => {
    expect(calcularEstadoConta(entrada({ status: 'canceled' }))).toEqual({ tipo: 'bloqueada', motivo: 'cancelada' });
  });

  it('unpaid sem inadimplenteDesde conta a carência a partir de agora', () => {
    const r = calcularEstadoConta(entrada({ status: 'unpaid', inadimplenteDesde: null }));
    expect(r).toEqual({
      tipo: 'carencia',
      desde: agora,
      ate: new Date('2026-11-04T15:00:00Z'),
      diasRestantes: 7,
    });
  });

  it('status desconhecido é bloqueada por teste', () => {
    expect(calcularEstadoConta(entrada({ status: 'xyz', jaPagou: false }))).toEqual({ tipo: 'bloqueada', motivo: 'teste' });
  });
});
