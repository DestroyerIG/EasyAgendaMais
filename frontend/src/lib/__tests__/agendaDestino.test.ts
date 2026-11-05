import { describe, it, expect } from 'vitest';
import { lerDestinoAgenda } from '../agendaDestino';

const ID = '11111111-1111-4111-8111-111111111111';

describe('lerDestinoAgenda', () => {
  it('aceita data real e id em UUID', () => {
    expect(lerDestinoAgenda('2026-11-06', ID)).toEqual({ data: '2026-11-06', agendamentoId: ID });
  });
  it('rejeita data que não existe no calendário', () => {
    expect(lerDestinoAgenda('2026-13-40', ID)).toBeNull();
    expect(lerDestinoAgenda('2026-02-30', ID)).toBeNull();
  });
  it('rejeita data fora do formato', () => {
    expect(lerDestinoAgenda('lixo', ID)).toBeNull();
  });
  it('rejeita id que não é UUID', () => {
    expect(lerDestinoAgenda('2026-11-06', 'x')).toBeNull();
  });
  it('rejeita parâmetros ausentes', () => {
    expect(lerDestinoAgenda(null, null)).toBeNull();
    expect(lerDestinoAgenda('2026-11-06', null)).toBeNull();
  });
});
