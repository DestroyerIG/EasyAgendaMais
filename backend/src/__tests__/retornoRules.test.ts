import { describe, it, expect } from 'vitest';
import { formatarEncaixe, primeiroNome, montarMensagemRetorno } from '../modules/whatsappRetorno/retorno.rules.js';

const TZ = 'America/Sao_Paulo';
const enc = (d: string, h: string) => formatarEncaixe(d, h, TZ);
const base = { nome: 'Beatriz Lima', negocio: 'Studio Aurora', servico: 'Manutenção Fibra de Vidro', profissional: 'Camila', dias: 39 };

describe('formatarEncaixe', () => {
  it('curto, longo e instante UTC no fuso do negócio', () => {
    expect(enc('2026-10-21', '14:30')).toEqual({
      curto: 'Qua 14:30', longo: 'Quarta-feira (21/out) às 14:30', inicio: '2026-10-21T17:30:00.000Z',
    });
  });
  it('sábado e domingo', () => {
    expect(enc('2026-10-24', '09:00').curto).toBe('Sáb 09:00');
    expect(enc('2026-10-25', '09:00').longo).toBe('Domingo (25/out) às 09:00');
  });
});

describe('primeiroNome', () => {
  it('mantém o nome e tira espaços', () => {
    expect(primeiroNome('ANA')).toBe('ANA');
    expect(primeiroNome('  Júlia  Mendes ')).toBe('Júlia');
  });
});

describe('montarMensagemRetorno', () => {
  it('2 encaixes com link', () => {
    const t = montarMensagemRetorno({ ...base, encaixes: [enc('2026-10-21', '14:30'), enc('2026-10-22', '10:00')], link: 'https://x/agendar/aurora' });
    expect(t).toBe([
      'Oi, Beatriz! 💕 Aqui é da equipe do Studio Aurora.',
      'Notamos que seu Manutenção Fibra de Vidro com Camila já completou 39 dias e deve estar precisando daquele cuidado especial ✨',
      'Temos 2 opções para você nesta semana:',
      '1️⃣ Quarta-feira (21/out) às 14:30',
      '2️⃣ Quinta-feira (22/out) às 10:00',
      'Posso garantir seu horário em algum desses? Se preferir outro dia, é só me avisar!',
      'Se preferir, agende sozinha por aqui: https://x/agendar/aurora',
    ].join('\n'));
  });
  it('1 encaixe, sem link', () => {
    const t = montarMensagemRetorno({ ...base, encaixes: [enc('2026-10-21', '14:30')], link: null });
    expect(t).toContain('Temos uma opção para você nesta semana:');
    expect(t).toContain('1️⃣ Quarta-feira (21/out) às 14:30');
    expect(t).not.toContain('2️⃣');
    expect(t).not.toContain('Se preferir, agende');
  });
  it('0 encaixes', () => {
    const t = montarMensagemRetorno({ ...base, encaixes: [], link: null });
    expect(t).toContain('Me conta o melhor dia para você que eu encontro um horário!');
    expect(t).not.toContain('1️⃣');
    expect(t).not.toContain('Temos');
  });
});
