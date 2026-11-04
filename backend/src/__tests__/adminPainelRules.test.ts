import { describe, it, expect } from 'vitest';
import {
  inicioDoMes, precoDoPlano, segmentoDe, statusAdmin, resumoMrr, resumoTestes,
  conversaoPorSegmento, resumoCancelamentos, cartoesGestao, negociosEmRisco, motivoParaNaoEstenderTeste,
  type LinhaNegocio,
} from '../modules/admin/painel.rules.js';
import { PLAN_PRICES } from '../config/planCatalog.js';
import { SEGMENTOS_VALIDOS } from '../config/vocabulario.js';

const agora = new Date('2026-10-28T15:00:00Z');
const MS_DIA = 86_400_000;
const h = (n: number) => new Date(agora.getTime() + n * 3_600_000);
const dias = (n: number) => new Date(agora.getTime() + n * MS_DIA);
let seq = 0;

function linha(parcial: Partial<LinhaNegocio> = {}): LinhaNegocio {
  seq += 1;
  return {
    id: `n${seq}`, nome: `Negócio ${seq}`, dono: 'Dona', email: 'a@b.com', whatsapp: '11999999999',
    cpfCnpj: null, endereco: null, segmento: 'barbearia',
    plano: 'profissional', statusAssinatura: 'active', ativo: true,
    inadimplenteDesde: null, jaPagou: true, fimDoPeriodo: null,
    criadoEm: dias(-100), canceladoEm: null, onboardingConcluido: true,
    temInstanciaWhatsapp: false, whatsappConectadoEm: null, ultimoEnvioEm: null,
    agendamentos30d: 0, ultimoAgendamentoEm: null,
    primeiroPagamentoEm: null, pagouMesAnterior: false,
    ...parcial,
  };
}

describe('statusAdmin', () => {
  it('bloqueado pelo admin vence qualquer outra regra', () => {
    expect(statusAdmin(linha({ ativo: false, statusAssinatura: 'active' }), agora)).toBe('bloqueado_admin');
  });
  it('trialing é teste e active é ativo', () => {
    expect(statusAdmin(linha({ statusAssinatura: 'trialing', jaPagou: false }), agora)).toBe('teste');
    expect(statusAdmin(linha(), agora)).toBe('ativo');
  });
  it('past_due há 3 dias é carência e há 8 dias é bloqueio por cobrança', () => {
    expect(statusAdmin(linha({ statusAssinatura: 'past_due', inadimplenteDesde: dias(-3) }), agora)).toBe('carencia');
    expect(statusAdmin(linha({ statusAssinatura: 'past_due', inadimplenteDesde: dias(-8) }), agora)).toBe('bloqueado_cobranca');
  });
  it('incomplete sem pagamento é teste encerrado', () => {
    expect(statusAdmin(linha({ statusAssinatura: 'incomplete', jaPagou: false }), agora)).toBe('teste_encerrado');
  });
  it('canceled é cancelado', () => {
    expect(statusAdmin(linha({ statusAssinatura: 'canceled' }), agora)).toBe('cancelado');
  });
});

describe('catálogo', () => {
  it('plano fora do catálogo vale 0 e segmento desconhecido vira outro', () => {
    expect(precoDoPlano('anual')).toBe(0);
    expect(precoDoPlano('basico')).toBe(PLAN_PRICES.basico);
    expect(segmentoDe(null)).toBe('outro');
    expect(segmentoDe('xyz')).toBe('outro');
    expect(segmentoDe('unhas')).toBe('unhas');
  });

  it('Salão sob consulta: o preço do negócio é o valor combinado, senão o legado', () => {
    expect(precoDoPlano('premium', 450)).toBe(450);
    expect(precoDoPlano('premium', null)).toBe(199.9);
    expect(precoDoPlano('basico', 450)).toBe(PLAN_PRICES.basico);
  });
});

describe('inicioDoMes', () => {
  it('usa o mês de São Paulo: 02:30Z de 1º/11 ainda é 31/10', () => {
    expect(inicioDoMes(new Date('2026-11-01T02:30:00Z')).toISOString()).toBe('2026-10-01T03:00:00.000Z');
  });
  it('volta meses, virando o ano', () => {
    expect(inicioDoMes(new Date('2026-01-15T12:00:00Z'), 1).toISOString()).toBe('2025-12-01T03:00:00.000Z');
  });
});

describe('resumoMrr', () => {
  it('soma só pagantes (ativos e em carência)', () => {
    const ls = [
      linha(), linha(),
      linha({ plano: 'basico', statusAssinatura: 'past_due', inadimplenteDesde: dias(-2) }),
      linha({ statusAssinatura: 'trialing', jaPagou: false }),
    ];
    expect(resumoMrr(ls, agora).mrr).toBeCloseTo(2 * PLAN_PRICES.profissional + PLAN_PRICES.basico, 5);
  });
  it('sem base do mês anterior, a variação é null', () => {
    const r = resumoMrr([linha()], agora);
    expect(r.mrrMesAnterior).toBe(0);
    expect(r.variacaoPct).toBeNull();
  });
  it('churn soma quem pagou no mês anterior e hoje está cancelado', () => {
    const ls = [linha({ pagouMesAnterior: true, statusAssinatura: 'canceled' })];
    const r = resumoMrr(ls, agora);
    expect(r.churn).toBe(PLAN_PRICES.profissional);
    expect(r.mrr).toBe(0);
  });
  it('novos considera o primeiro pagamento no mês local e calcula a variação', () => {
    const ls = [
      linha({ pagouMesAnterior: true, primeiroPagamentoEm: dias(-60) }),
      linha({ primeiroPagamentoEm: new Date('2026-10-05T12:00:00Z') }),
    ];
    const r = resumoMrr(ls, agora);
    expect(r.novos).toBe(PLAN_PRICES.profissional);
    expect(r.variacaoPct).toBeCloseTo(100, 5);
  });
});

describe('resumoTestes', () => {
  it('conta ativos, vencendo em 48h e novos na semana', () => {
    const ls = [
      linha({ statusAssinatura: 'trialing', jaPagou: false, fimDoPeriodo: h(30), criadoEm: dias(-2) }),
      linha({ statusAssinatura: 'trialing', jaPagou: false, fimDoPeriodo: h(100), criadoEm: dias(-10) }),
      linha(),
    ];
    expect(resumoTestes(ls, agora)).toEqual({ ativos: 2, vencendo48h: 1, novosNaSemana: 1 });
  });
});

describe('conversaoPorSegmento', () => {
  it('lista vazia devolve os 6 segmentos com taxa null', () => {
    const r = conversaoPorSegmento([], agora, 30);
    expect(r.segmentos.map((s) => s.segmento)).toEqual([...SEGMENTOS_VALIDOS]);
    expect(r.segmentos).toHaveLength(6);
    expect(r.segmentos.every((s) => s.taxaPct === null && s.ticketMedio === null)).toBe(true);
    expect(r.geral.taxaPct).toBeNull();
  });
  it('1 de 4 pagou: 25%', () => {
    const base = { segmento: 'unhas', criadoEm: dias(-10), statusAssinatura: 'trialing' };
    const ls = [
      linha({ ...base, jaPagou: true }), linha({ ...base, jaPagou: false }),
      linha({ ...base, jaPagou: false }), linha({ ...base, jaPagou: false }),
    ];
    const r = conversaoPorSegmento(ls, agora, 30);
    expect(r.segmentos.find((s) => s.segmento === 'unhas')?.taxaPct).toBe(25);
    expect(r.geral).toEqual({ criados: 4, pagantes: 1, taxaPct: 25 });
  });
  it('ticket médio usa pagantes de hoje, mesmo fora da coorte', () => {
    const ls = [linha({ segmento: 'cabelo', criadoEm: dias(-200), plano: 'basico' })];
    const s = conversaoPorSegmento(ls, agora, 30).segmentos.find((x) => x.segmento === 'cabelo')!;
    expect(s.criados).toBe(0);
    expect(s.ticketMedio).toBe(PLAN_PRICES.basico);
  });
});

describe('resumoCancelamentos', () => {
  it('sem pagantes no mês anterior, retenção é null', () => {
    const r = resumoCancelamentos([linha()], agora);
    expect(r.retencaoPct).toBeNull();
  });
  it('calcula cancelamentos do mês, churn e retenção', () => {
    const ls = [
      linha({ pagouMesAnterior: true }),
      linha({ pagouMesAnterior: true, statusAssinatura: 'canceled', canceladoEm: new Date('2026-10-10T12:00:00Z') }),
      linha({ statusAssinatura: 'canceled', canceladoEm: new Date('2026-09-10T12:00:00Z') }),
    ];
    const r = resumoCancelamentos(ls, agora);
    expect(r.cancelamentosMes).toBe(1);
    expect(r.churnContas).toBe(1);
    expect(r.receitaCancelada).toBe(PLAN_PRICES.profissional);
    expect(r.retencaoPct).toBe(50);
  });
});

describe('cartoesGestao', () => {
  it('agrega base, pagantes, inadimplência e testes do dia', () => {
    const ls = [
      linha(),
      linha({ plano: 'basico', statusAssinatura: 'past_due', inadimplenteDesde: dias(-2) }),
      linha({ statusAssinatura: 'past_due', inadimplenteDesde: dias(-9) }),
      linha({ statusAssinatura: 'trialing', jaPagou: false, fimDoPeriodo: h(2) }),
      linha({ statusAssinatura: 'trialing', jaPagou: false, fimDoPeriodo: h(40) }),
    ];
    const c = cartoesGestao(ls, agora);
    expect(c.base).toBe(5);
    expect(c.pagantes).toBe(2);
    expect(c.mrr).toBeCloseTo(PLAN_PRICES.profissional + PLAN_PRICES.basico, 5);
    expect(c.ticketMedio).toBeCloseTo((PLAN_PRICES.profissional + PLAN_PRICES.basico) / 2, 5);
    expect(c.testes).toBe(2);
    expect(c.testesVencemHoje).toBe(1);
    expect(c.inadimplentes).toBe(2);
    expect(c.valorPendente).toBeCloseTo(PLAN_PRICES.profissional + PLAN_PRICES.basico, 5);
    expect(c.bloqueioTotal).toBe(1);
  });
  it('sem pagantes o ticket médio é null', () => {
    expect(cartoesGestao([], agora).ticketMedio).toBeNull();
  });
});

describe('negociosEmRisco', () => {
  it('carência com WhatsApp caído sai uma vez só, como cobrança', () => {
    const l = linha({
      statusAssinatura: 'past_due', inadimplenteDesde: dias(-3),
      temInstanciaWhatsapp: true, ultimoEnvioEm: dias(-5),
    });
    const r = negociosEmRisco([l], agora);
    expect(r).toHaveLength(1);
    expect(r[0].tipo).toBe('cobranca');
    expect(r[0].desde).toEqual(l.inadimplenteDesde);
  });
  it('sem último envio não há alerta de WhatsApp', () => {
    const l = linha({ temInstanciaWhatsapp: true, ultimoEnvioEm: null, ultimoAgendamentoEm: dias(-1) });
    expect(negociosEmRisco([l], agora)).toEqual([]);
  });
  it('WhatsApp desconectado com último envio antigo alerta', () => {
    const l = linha({ temInstanciaWhatsapp: true, ultimoEnvioEm: dias(-3), ultimoAgendamentoEm: dias(-1) });
    expect(negociosEmRisco([l], agora).map((x) => x.tipo)).toEqual(['whatsapp']);
  });
  it('teste vencendo em 30 h sem onboarding alerta; com onboarding não', () => {
    const base = { statusAssinatura: 'trialing', jaPagou: false, fimDoPeriodo: h(30) };
    expect(negociosEmRisco([linha({ ...base, onboardingConcluido: false })], agora).map((x) => x.tipo))
      .toEqual(['teste_sem_onboarding']);
    expect(negociosEmRisco([linha({ ...base, onboardingConcluido: true })], agora)).toEqual([]);
  });
  it('pagante sem agendamento há 8 dias alerta; há 6 não', () => {
    expect(negociosEmRisco([linha({ ultimoAgendamentoEm: dias(-8) })], agora).map((x) => x.tipo))
      .toEqual(['sem_agendamento']);
    expect(negociosEmRisco([linha({ ultimoAgendamentoEm: dias(-6) })], agora)).toEqual([]);
  });
  it('sem agendamento usa o primeiro pagamento como referência', () => {
    const r = negociosEmRisco([linha({ ultimoAgendamentoEm: null, primeiroPagamentoEm: dias(-9) })], agora);
    expect(r[0].tipo).toBe('sem_agendamento');
  });
  it('ordena por tipo e, dentro do tipo, pelo desde mais antigo', () => {
    const a = linha({ ultimoAgendamentoEm: dias(-20) });
    const b = linha({ statusAssinatura: 'past_due', inadimplenteDesde: dias(-2) });
    const c = linha({ statusAssinatura: 'past_due', inadimplenteDesde: dias(-5) });
    const r = negociosEmRisco([a, b, c], agora);
    expect(r.map((x) => x.id)).toEqual([c.id, b.id, a.id]);
  });
});

describe('negociosEmRisco: pagante', () => {
  it('pagante é true para ativo e carência e false para teste (valor em potencial)', () => {
    const ativo = linha({ ultimoAgendamentoEm: dias(-8) });
    const carencia = linha({ statusAssinatura: 'past_due', inadimplenteDesde: dias(-2) });
    const teste = linha({
      statusAssinatura: 'trialing', jaPagou: false, fimDoPeriodo: h(30), onboardingConcluido: false,
    });
    const bloqueado = linha({ statusAssinatura: 'past_due', inadimplenteDesde: dias(-10) });
    const r = negociosEmRisco([ativo, carencia, teste, bloqueado], agora);
    const porId = Object.fromEntries(r.map((x) => [x.id, x.pagante]));
    expect(porId).toEqual({ [ativo.id]: true, [carencia.id]: true, [teste.id]: false, [bloqueado.id]: false });
  });
});

describe('motivoParaNaoEstenderTeste', () => {
  it('trialing sem gateway pode; incomplete sem pagamento pode', () => {
    expect(motivoParaNaoEstenderTeste(linha({ statusAssinatura: 'trialing', jaPagou: false }))).toBeNull();
    expect(motivoParaNaoEstenderTeste(linha({ statusAssinatura: 'incomplete', jaPagou: false }))).toBeNull();
  });
  it('status cru é normalizado antes da regra', () => {
    // Maiúsculas e status vazio passam pelo normalizador, como na rota: vazio vira incomplete.
    expect(motivoParaNaoEstenderTeste(linha({ statusAssinatura: ' TRIALING ', jaPagou: false }))).toBeNull();
    expect(motivoParaNaoEstenderTeste(linha({ statusAssinatura: '', jaPagou: false }))).toBeNull();
  });
  it('incomplete de quem já pagou e active não podem (status)', () => {
    expect(motivoParaNaoEstenderTeste(linha({ statusAssinatura: 'incomplete', jaPagou: true }))).toBe('status');
    expect(motivoParaNaoEstenderTeste(linha({ statusAssinatura: 'active' }))).toBe('status');
  });
  it('teste com cartão cadastrado também pode (o vencimento é movido no Asaas)', () => {
    expect(motivoParaNaoEstenderTeste(linha({ statusAssinatura: 'trialing', jaPagou: false }))).toBeNull();
  });
});
