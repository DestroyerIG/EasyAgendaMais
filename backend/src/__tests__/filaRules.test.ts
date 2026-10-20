import { describe, it, expect } from 'vitest';
import {
  sortearIntervalo, dentroDaJanela, proximaAberturaDaJanela, podeEnviarAgora, previsaoDeEnvio,
} from '../modules/whatsappFila/fila.rules.js';

const TZ = 'America/Sao_Paulo';
const d = (s: string) => new Date(s);

describe('sortearIntervalo', () => {
  it('fica entre 45 e 90 s', () => {
    expect(sortearIntervalo(() => 0)).toBe(45);
    expect(sortearIntervalo(() => 0.9999)).toBe(90);
  });
});

describe('dentroDaJanela', () => {
  it('08:00 <= hora local < 20:00', () => {
    expect(dentroDaJanela(d('2026-10-20T10:59:00Z'), TZ)).toBe(false); // 07:59
    expect(dentroDaJanela(d('2026-10-20T11:00:00Z'), TZ)).toBe(true); // 08:00
    expect(dentroDaJanela(d('2026-10-20T22:59:00Z'), TZ)).toBe(true); // 19:59
    expect(dentroDaJanela(d('2026-10-20T23:00:00Z'), TZ)).toBe(false); // 20:00
  });
});

describe('proximaAberturaDaJanela', () => {
  it('depois das 20:00 vai para o 08:00 do dia seguinte', () => {
    expect(proximaAberturaDaJanela(d('2026-10-20T23:30:00Z'), TZ).toISOString()).toBe('2026-10-21T11:00:00.000Z');
  });
  it('antes das 08:00 abre no mesmo dia', () => {
    expect(proximaAberturaDaJanela(d('2026-10-20T10:00:00Z'), TZ).toISOString()).toBe('2026-10-20T11:00:00.000Z');
  });
  it('dentro da janela devolve o próprio agora', () => {
    const agora = d('2026-10-20T15:00:00Z');
    expect(proximaAberturaDaJanela(agora, TZ).getTime()).toBe(agora.getTime());
  });
});

describe('podeEnviarAgora', () => {
  const agora = d('2026-10-20T15:00:00Z');
  it('sem último e 0 na hora', () => {
    expect(podeEnviarAgora({ agora, tz: TZ, ultimo: null, enviadosUltimaHora: 0 })).toBe(true);
  });
  it('respeita o intervalo do último', () => {
    expect(podeEnviarAgora({ agora, tz: TZ, ultimo: { em: new Date(agora.getTime() - 44_000), intervaloS: 45 }, enviadosUltimaHora: 1 })).toBe(false);
    expect(podeEnviarAgora({ agora, tz: TZ, ultimo: { em: new Date(agora.getTime() - 46_000), intervaloS: 45 }, enviadosUltimaHora: 1 })).toBe(true);
  });
  it('limite de 25 por hora', () => {
    expect(podeEnviarAgora({ agora, tz: TZ, ultimo: null, enviadosUltimaHora: 25 })).toBe(false);
  });
  it('fora da janela', () => {
    expect(podeEnviarAgora({ agora: d('2026-10-20T23:30:00Z'), tz: TZ, ultimo: null, enviadosUltimaHora: 0 })).toBe(false);
  });
});

describe('previsaoDeEnvio', () => {
  const agora = d('2026-10-20T15:00:00Z');
  it('posição 0 sem último é agora', () => {
    expect(previsaoDeEnvio({ agora, tz: TZ, posicao: 0, ultimo: null }).getTime()).toBe(agora.getTime());
  });
  it('75 s por posição', () => {
    expect(previsaoDeEnvio({ agora, tz: TZ, posicao: 3, ultimo: null }).getTime()).toBe(agora.getTime() + 225_000);
  });
  it('espera o intervalo do último', () => {
    const ultimo = { em: new Date(agora.getTime() - 10_000), intervaloS: 60 };
    expect(previsaoDeEnvio({ agora, tz: TZ, posicao: 0, ultimo }).getTime()).toBe(agora.getTime() + 50_000);
  });
  it('fora da janela começa na próxima abertura', () => {
    expect(previsaoDeEnvio({ agora: d('2026-10-20T23:30:00Z'), tz: TZ, posicao: 0, ultimo: null }).toISOString()).toBe('2026-10-21T11:00:00.000Z');
  });
  it('lote às 19:58, posição 3: o que passa das 20:00 vai para o dia seguinte', () => {
    // 19:58 (22:58Z) restam 120 s de janela: as posições 0 (+0 s) e 1 (+75 s) cabem; a 2 (+150 s) já passa das 20:00.
    // A posição 2 vira a 1ª do dia seguinte (08:00 = 11:00Z) e a 3 a 2ª: 08:00 + 75 s = 11:01:15Z.
    const base = d('2026-10-20T22:58:00Z');
    expect(previsaoDeEnvio({ agora: base, tz: TZ, posicao: 1, ultimo: null }).toISOString()).toBe('2026-10-20T22:59:15.000Z');
    expect(previsaoDeEnvio({ agora: base, tz: TZ, posicao: 2, ultimo: null }).toISOString()).toBe('2026-10-21T11:00:00.000Z');
    expect(previsaoDeEnvio({ agora: base, tz: TZ, posicao: 3, ultimo: null }).toISOString()).toBe('2026-10-21T11:01:15.000Z');
  });
});
