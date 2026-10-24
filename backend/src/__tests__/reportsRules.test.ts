import { describe, it, expect } from 'vitest';
import { intervaloUtc, mesAnterior, periodoAnterior, quinzenaDe, ultimos30 } from '../modules/reports/periodo.js';
import { apurar, consumirAdiantamentos, diferencaDesdePagamento, statusRepasse, totalizar } from '../modules/reports/comissoes.rules.js';
import {
  classificarOrigem, horarioDePico, insightOcupacao, mapaOcupacao, metaMensal, projecaoDoMes,
  retornoNoCiclo, taxaFaltas, ticketMedio, variacao,
} from '../modules/reports/indicadores.rules.js';

describe('períodos', () => {
  it('quinzenas: 1–15 e 16 ao fim, inclusive fevereiro e mês de 31 dias', () => {
    expect(quinzenaDe('2026-10-15')).toEqual({ inicio: '2026-10-01', fim: '2026-10-15' });
    expect(quinzenaDe('2026-10-16')).toEqual({ inicio: '2026-10-16', fim: '2026-10-31' });
    expect(quinzenaDe('2026-02-20')).toEqual({ inicio: '2026-02-16', fim: '2026-02-28' });
    expect(quinzenaDe('2028-02-29')).toEqual({ inicio: '2028-02-16', fim: '2028-02-29' });
  });

  it('últimos 30 dias, mês anterior e período anterior de mesmo tamanho', () => {
    expect(ultimos30('2026-10-24')).toEqual({ inicio: '2026-09-25', fim: '2026-10-24' });
    expect(mesAnterior('2026-01-10')).toEqual({ inicio: '2025-12-01', fim: '2025-12-31' });
    expect(periodoAnterior({ inicio: '2026-10-01', fim: '2026-10-15' })).toEqual({ inicio: '2026-09-16', fim: '2026-09-30' });
  });

  it('o intervalo UTC segue o fuso do negócio (comanda das 23h30 fica no dia certo)', () => {
    const { gte, lt } = intervaloUtc({ inicio: '2026-10-01', fim: '2026-10-15' }, 'America/Sao_Paulo');
    expect(gte.toISOString()).toBe('2026-10-01T03:00:00.000Z');
    expect(lt.toISOString()).toBe('2026-10-16T03:00:00.000Z');
    const fechadaAs2330 = new Date('2026-10-16T02:30:00.000Z');
    expect(fechadaAs2330 < lt).toBe(true);
  });
});

const comanda = (over: Partial<Parameters<typeof apurar>[0][number]> = {}) => ({
  professionalId: 'p1', servicos: 100, produtos: 50, desconto: 10, gorjeta: 5, comissaoServico: 40, comissaoProduto: 8, ...over,
});

describe('apuração', () => {
  it('soma o que a comanda gravou; gorjeta vai inteira para a profissional', () => {
    const [l] = apurar([comanda(), comanda({ gorjeta: 0 })], []);
    expect(l).toMatchObject({
      atendimentos: 2, servicos: 20000, produtos: 10000, faturamento: 28000,
      comissao: 9600, cotaSalao: 18400, gorjetas: 500, adiantamentos: 0, aPagar: 10100,
    });
  });

  it('adiantamento parcial: abate até zerar e nunca deixa negativo', () => {
    const [l] = apurar([comanda()], [{ id: 'a1', professionalId: 'p1', valor: 100, valorAbatido: 0, data: '2026-10-02' }]);
    expect(l.aPagar).toBe(0);
    expect(l.adiantamentos).toBe(5300);
    expect(l.adiantamentosAbertos).toBe(10000);
  });

  it('consome os mais antigos primeiro e respeita o já abatido', () => {
    const r = consumirAdiantamentos(5000, [
      { id: 'b', professionalId: 'p1', valor: 40, valorAbatido: 0, data: '2026-10-05' },
      { id: 'a', professionalId: 'p1', valor: 30, valorAbatido: 10, data: '2026-10-01' },
    ]);
    expect(r).toEqual({ abatimentos: [{ id: 'a', valor: 2000 }, { id: 'b', valor: 3000 }], total: 5000 });
  });

  it('totais, retenção média e status', () => {
    const t = totalizar([{ faturamento: 10000, comissao: 4000, gorjetas: 300 }, { faturamento: 10000, comissao: 6000, gorjetas: 0 }]);
    expect(t).toEqual({ faturamento: 20000, cotaSalao: 10000, cotaProfissionais: 10000, gorjetas: 300, retencaoMedia: 50 });
    expect(totalizar([]).retencaoMedia).toBeNull();
    expect(statusRepasse(100, false)).toBe('pendente');
    expect(statusRepasse(0, false)).toBe('sem_valor');
    expect(statusRepasse(0, true)).toBe('pago');
  });

  it('diferença desde o pagamento compara comissão + gorjeta com a foto', () => {
    expect(diferencaDesdePagamento({ comissao: 5000, gorjetas: 500 }, { comissaoServico: '40', comissaoProduto: '8', gorjetas: '5' })).toBe(200);
  });
});

describe('indicadores', () => {
  it('ticket, variação e faltas', () => {
    expect(ticketMedio(30000, 4)).toBe(7500);
    expect(ticketMedio(0, 0)).toBeNull();
    expect(variacao(110, 100)).toBe(10);
    expect(variacao(10, 0)).toBeNull();
    expect(taxaFaltas(97, 3)).toBe(3);
    expect(taxaFaltas(0, 0)).toBeNull();
  });

  it('retorno no ciclo: precisa de 5 clientes com ciclo; tolerância de 20%', () => {
    const p = { inicio: '2026-10-01', fim: '2026-10-31' };
    const m = new Map<string, string[]>();
    // ciclo 30 dias; voltou em 35 (≤ 36) → no ciclo
    for (const c of ['a', 'b', 'c', 'd']) m.set(c, ['2026-08-01', '2026-08-31', '2026-10-05']);
    // ciclo 20; voltou em 40 → fora
    m.set('e', ['2026-08-01', '2026-08-21', '2026-09-30', '2026-10-10'].filter((d) => d !== '2026-09-30'));
    expect(retornoNoCiclo(m, p)).toEqual({ taxa: 80, base: 5 });
    m.delete('e');
    expect(retornoNoCiclo(m, p)).toEqual({ taxa: null, base: 4 });
  });

  it('meta mensal = meta diária × dias abertos; projeção linear', () => {
    const mes = { inicio: '2026-10-01', fim: '2026-10-31' };
    const abertos = { seg: true, ter: true, qua: true, qui: true, sex: true, sab: false, dom: false };
    expect(metaMensal(1000, mes, abertos)).toBe(100000 * 22);
    expect(metaMensal(null, mes, abertos)).toBeNull();
    expect(projecaoDoMes(100000, '2026-10-10', mes)).toBe(310000);
  });

  it('origem: envio de retorno/campanha até 7 dias antes tem prioridade', () => {
    const criado = new Date('2026-10-10T12:00:00Z');
    expect(classificarOrigem('publico', criado, [new Date('2026-10-05T12:00:00Z')])).toBe('retorno_campanhas');
    expect(classificarOrigem('publico', criado, [new Date('2026-10-01T12:00:00Z')])).toBe('publico');
    expect(classificarOrigem('whatsapp', criado, [])).toBe('whatsapp');
    expect(classificarOrigem(null, criado, [])).toBe('painel');
  });
});

describe('mapa de ocupação', () => {
  const expediente = { openingTime: '09:00', closingTime: '18:00', diasAbertos: { seg: false, ter: true, qua: true, qui: true, sex: true, sab: true, dom: false } };
  // 2 semanas: 2026-10-05 (seg) a 2026-10-18 (dom)
  const p = { inicio: '2026-10-05', fim: '2026-10-18' };
  const prof = [{ id: 'p1', breakStart: '12:00', breakEnd: '13:00' }];

  it('dia fechado é null; intervalo sai do disponível da tarde; manhã/tarde separados', () => {
    const ags = [
      { professionalId: 'p1', date: '2026-10-06', time: '09:00', duracao: 90 }, // terça manhã
      { professionalId: 'p1', date: '2026-10-06', time: '11:30', duracao: 60 }, // 30 manhã + 30 tarde
    ];
    const { linhas, media } = mapaOcupacao(p, expediente, prof, ags);
    const cel = (dia: string, turno: string) => linhas[0].celulas.find((c) => c.dia === dia && c.turno === turno)!;
    expect(cel('seg', 'manha').ocupacao).toBeNull();
    // manhã: 180 min × 2 terças = 360; agendado 90 + 30 = 120 → 33%
    expect(cel('ter', 'manha')).toMatchObject({ agendado: 120, disponivel: 360, ocupacao: 33 });
    // tarde: (360 − 60 de intervalo) × 2 = 600; agendado 30 → 5%
    expect(cel('ter', 'tarde')).toMatchObject({ agendado: 30, disponivel: 600, ocupacao: 5 });
    expect(media.find((c) => c.dia === 'ter' && c.turno === 'manha')!.ocupacao).toBe(33);
    expect(horarioDePico(media)).toEqual({ rotulo: 'Terça de manhã', ocupacao: 33 });
  });

  it('insight aponta a célula aberta mais vazia e some com menos de 2 semanas', () => {
    const ags = [{ professionalId: 'p1', date: '2026-10-06', time: '09:00', duracao: 60 }];
    const { media } = mapaOcupacao(p, expediente, prof, ags);
    expect(insightOcupacao(media, p)?.texto).toMatch(/^Terça à tarde está com 0% de ocupação/);
    expect(insightOcupacao(media, { inicio: '2026-10-05', fim: '2026-10-11' })).toBeNull();
  });
});
