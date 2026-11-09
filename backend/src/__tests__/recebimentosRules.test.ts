import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { randomBytes } from 'node:crypto';
import { Prisma } from '@prisma/client';
import {
  assinarEstado, centavos, decidirPagamento, backendUrl, desafioPkce, gatewayDisponivel, horarioJaPassou, lerEstado, recebimentosConfigurado,
  tokenPertoDeVencer, verificadorPkce,
} from '../modules/recebimentos/recebimentos.rules.js';
import { cifrarCom, decifrarCom } from '../utils/cifra.js';

const DIA = 24 * 60 * 60 * 1000;
const AGORA = Date.UTC(2026, 10, 8, 12, 0, 0);
const FUTURO = AGORA + 10 * 60 * 1000;
const PASSADO = AGORA - 10 * 60 * 1000;

const VARS = ['MERCADOPAGO_CLIENT_ID', 'MERCADOPAGO_CLIENT_SECRET', 'MERCADOPAGO_REDIRECT_URI', 'RECEBIMENTOS_TOKEN_KEY', 'BACKEND_URL'] as const;

const base = {
  cobranca: { id: 'c1', situacao: 'pendente', valor: '15.50', pagamentoExternoId: null as string | null },
  pagamento: { id: 'p1', status: 'approved', valor: 15.5, referencia: 'c1' as string | null, formaPaga: 'pix' as const },
  reserva: { status: 'aguardando_pagamento', expiresAt: new Date(FUTURO) as Date | null },
  outraCobrancaPaga: false, agora: new Date(AGORA),
};

describe('regras dos recebimentos', () => {
  beforeEach(() => {
    process.env.MERCADOPAGO_CLIENT_ID = 'cid';
    process.env.MERCADOPAGO_CLIENT_SECRET = 'segredo';
    process.env.MERCADOPAGO_REDIRECT_URI = 'https://api.exemplo.com/api/v1/recebimentos/callback';
    process.env.RECEBIMENTOS_TOKEN_KEY = randomBytes(32).toString('base64');
  });
  afterEach(() => { for (const v of VARS) delete process.env[v]; });

  it('confirma pagamento aprovado dentro do prazo, comparando em centavos', () => {
    expect(decidirPagamento(base)).toBe('confirmar');
  });
  it('ignora referência de outra cobrança', () => {
    expect(decidirPagamento({ ...base, pagamento: { ...base.pagamento, referencia: 'c2' } })).toBe('ignorar');
  });
  it('ignora valor diferente', () => {
    expect(decidirPagamento({ ...base, pagamento: { ...base.pagamento, valor: 15.49 } })).toBe('ignorar');
  });
  it('ignora status que não é aprovado nem final', () => {
    expect(decidirPagamento({ ...base, pagamento: { ...base.pagamento, status: 'pending' } })).toBe('ignorar');
  });
  it('repetição do mesmo pagamento não faz nada', () => {
    expect(decidirPagamento({ ...base, cobranca: { ...base.cobranca, situacao: 'paga', pagamentoExternoId: 'p1' } })).toBe('ignorar');
  });
  it('outro pagamento aprovado para cobrança já paga alerta duplicidade', () => {
    expect(decidirPagamento({ ...base, cobranca: { ...base.cobranca, situacao: 'paga', pagamentoExternoId: 'p0' } })).toBe('alertar_duplicado');
  });
  it('reserva vencida, ainda aguardando ou cancelada pela rotina, tenta reativar', () => {
    const vencida = { status: 'aguardando_pagamento', expiresAt: new Date(PASSADO) };
    expect(decidirPagamento({ ...base, reserva: vencida })).toBe('reativar');
    expect(decidirPagamento({ ...base, cobranca: { ...base.cobranca, situacao: 'expirada' }, reserva: { ...vencida, status: 'cancelado' } })).toBe('reativar');
  });
  it('cancelada por pessoa nunca reativa', () => {
    expect(decidirPagamento({ ...base, reserva: { status: 'cancelado', expiresAt: new Date(FUTURO) } })).toBe('alertar_atrasado');
  });
  it('já confirmada, ou com outra cobrança paga, alerta duplicidade', () => {
    expect(decidirPagamento({ ...base, reserva: { status: 'confirmado', expiresAt: null } })).toBe('alertar_duplicado');
    expect(decidirPagamento({ ...base, outraCobrancaPaga: true })).toBe('alertar_duplicado');
  });
  it('mapeia recusa, devolução e contestação', () => {
    const paga = { ...base.cobranca, situacao: 'paga', pagamentoExternoId: 'p1' };
    expect(decidirPagamento({ ...base, pagamento: { ...base.pagamento, status: 'rejected' } })).toBe('marcar_recusada');
    expect(decidirPagamento({ ...base, cobranca: paga, pagamento: { ...base.pagamento, status: 'refunded' } })).toBe('marcar_devolvida');
    expect(decidirPagamento({ ...base, cobranca: paga, pagamento: { ...base.pagamento, status: 'charged_back' } })).toBe('marcar_contestada');
  });
  it('devolução e contestação não dependem da situação desta cobrança: quem confere a linha paga é marcarEstorno', () => {
    for (const situacao of ['pendente', 'devolvida', 'contestada']) {
      const cobranca = { ...base.cobranca, situacao };
      expect(decidirPagamento({ ...base, cobranca, pagamento: { ...base.pagamento, status: 'refunded' } })).toBe('marcar_devolvida');
      expect(decidirPagamento({ ...base, cobranca, pagamento: { ...base.pagamento, status: 'charged_back' } })).toBe('marcar_contestada');
    }
  });
  it('devolução de pagamento de outra referência é ignorada', () => {
    const pagamento = { ...base.pagamento, status: 'refunded', referencia: 'outra' };
    expect(decidirPagamento({ ...base, pagamento })).toBe('ignorar');
  });
  it('recusa não mexe em cobrança paga', () => {
    const paga = { ...base.cobranca, situacao: 'paga', pagamentoExternoId: 'p1' };
    expect(decidirPagamento({ ...base, cobranca: paga, pagamento: { ...base.pagamento, status: 'rejected' } })).toBe('ignorar');
  });
  describe('horarioJaPassou', () => {
    const SP = 'America/Sao_Paulo';
    const agora = new Date('2026-11-10T13:00:30Z'); // 10:00 em São Paulo

    it('compara no fuso do negócio, não em UTC', () => {
      expect(horarioJaPassou('2026-11-10', '09:59:00', agora, SP)).toBe(true);
      expect(horarioJaPassou('2026-11-10', '11:00:00', agora, SP)).toBe(false);
      expect(horarioJaPassou('2026-11-10', '11:00:00', agora, 'UTC')).toBe(true);
    });
    it('o minuto em curso ainda vale', () => {
      expect(horarioJaPassou('2026-11-10', '10:00:00', agora, SP)).toBe(false);
    });
    it('considera a data, inclusive na virada do dia no fuso', () => {
      expect(horarioJaPassou('2026-11-09', '23:00:00', agora, SP)).toBe(true);
      expect(horarioJaPassou('2026-11-11', '08:00:00', agora, SP)).toBe(false);
      expect(horarioJaPassou('2026-11-10', '22:00:00', new Date('2026-11-11T01:30:00Z'), SP)).toBe(true);
      expect(horarioJaPassou('2026-11-11', '00:30:00', new Date('2026-11-11T02:00:00Z'), SP)).toBe(false);
    });
  });
  it('centavos aceita Decimal, texto e número', () => {
    expect(centavos('15.50')).toBe(1550);
    expect(centavos(15.5)).toBe(1550);
    expect(centavos(new Prisma.Decimal('15.50'))).toBe(1550);
    expect(centavos(19.99)).toBe(1999);
  });
  it('renova a menos de 30 dias do vencimento', () => {
    expect(tokenPertoDeVencer(new Date(AGORA + 29 * DIA), new Date(AGORA))).toBe(true);
    expect(tokenPertoDeVencer(new Date(AGORA + 31 * DIA), new Date(AGORA))).toBe(false);
  });
  it('estado assinado vale uma vez e recusa adulteração', () => {
    const estado = assinarEstado('u1', 'mercadopago', AGORA);
    expect(lerEstado(`${estado}x`, AGORA)).toBeNull();
    const lido = lerEstado(estado, AGORA);
    expect(lido?.userId).toBe('u1');
    expect(lido?.gateway).toBe('mercadopago');
    expect(lerEstado(estado, AGORA)).toBeNull();
  });
  it('estado vencido é recusado', () => {
    const estado = assinarEstado('u1', 'mercadopago', AGORA);
    expect(lerEstado(estado, AGORA + 11 * 60 * 1000)).toBeNull();
  });
  it('PKCE: verificador estável por nonce e desafio S256', () => {
    const v = verificadorPkce('n1');
    expect(verificadorPkce('n1')).toBe(v);
    expect(verificadorPkce('n2')).not.toBe(v);
    expect(v.length).toBeGreaterThanOrEqual(43);
    // Vetor do RFC 7636, apêndice B.
    expect(desafioPkce('dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk')).toBe('E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM');
  });
  it('recebimentosConfigurado exige as quatro variáveis', () => {
    expect(recebimentosConfigurado()).toBe(true);
    delete process.env.RECEBIMENTOS_TOKEN_KEY;
    expect(recebimentosConfigurado()).toBe(false);
  });
  it('gatewayDisponivel da InfinitePay exige só a chave e a URL do backend', () => {
    expect(gatewayDisponivel('infinitepay')).toBe(false);
    process.env.BACKEND_URL = 'https://api.exemplo.com';
    expect(gatewayDisponivel('infinitepay')).toBe(true);
    delete process.env.RECEBIMENTOS_TOKEN_KEY;
    expect(gatewayDisponivel('infinitepay')).toBe(false);
  });
  it('gatewayDisponivel do Mercado Pago falha sem MERCADOPAGO_CLIENT_ID', () => {
    expect(gatewayDisponivel('mercadopago')).toBe(true);
    delete process.env.MERCADOPAGO_CLIENT_ID;
    expect(gatewayDisponivel('mercadopago')).toBe(false);
  });
  it('recebimentosConfigurado vale com só as variáveis da InfinitePay', () => {
    for (const v of ['MERCADOPAGO_CLIENT_ID', 'MERCADOPAGO_CLIENT_SECRET', 'MERCADOPAGO_REDIRECT_URI']) delete process.env[v];
    expect(recebimentosConfigurado()).toBe(false);
    process.env.BACKEND_URL = 'https://api.exemplo.com';
    expect(recebimentosConfigurado()).toBe(true);
  });
  it('backendUrl tira a barra final', () => {
    process.env.BACKEND_URL = 'https://x.com/';
    expect(backendUrl()).toBe('https://x.com');
  });
  it('cifra com chave informada, ida e volta', () => {
    const chave = randomBytes(32);
    const c = cifrarCom(chave, 'APP_USR-token');
    expect(c).not.toContain('APP_USR');
    expect(decifrarCom(chave, c)).toBe('APP_USR-token');
    expect(() => decifrarCom(randomBytes(32), c)).toThrow();
  });
});
