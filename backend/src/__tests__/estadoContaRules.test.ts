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
