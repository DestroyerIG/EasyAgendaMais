import { describe, it, expect } from 'vitest';
import { resumirCliente, taxaRetencao, diasEntre, type Visita } from '../modules/crm/crmMetrics.js';

const v = (date: string, receita = 100, servico = 'Corte', profissional = 'Camila'): Visita => ({ date, receita, servico, profissional });
const HOJE = '2026-10-14';

describe('diasEntre', () => {
  it('conta dias de calendário', () => {
    expect(diasEntre('2026-10-01', '2026-10-14')).toBe(13);
    expect(diasEntre('2026-02-28', '2026-03-01')).toBe(1);
  });
});

describe('resumirCliente', () => {
  it('sem visitas: novo, sem ciclo, retorno "—"', () => {
    const r = resumirCliente([], HOJE, null);
    expect(r).toMatchObject({ visitas: 0, cicloMedio: null, ultimaVisita: null, fase: 'novo', ltv: 0, ticketMedio: null });
    expect(r.retornoPrevisto).toEqual({ data: null, venceuHa: null, texto: '—' });
  });

  it('uma visita recente: novo, primeira vez, sugerir retorno', () => {
    const r = resumirCliente([v('2026-10-01', 80)], HOJE, null);
    expect(r.fase).toBe('novo');
    expect(r.etiquetasAuto).toContain('Primeira vez');
    expect(r.retornoPrevisto.texto).toBe('Sugerir retorno em ~45 dias');
    expect(r.ltv).toBe(80);
    expect(r.ticketMedio).toBe(80);
  });

  it('ciclo médio e retorno previsto futuro', () => {
    const r = resumirCliente([v('2026-09-02'), v('2026-09-23'), v('2026-10-08')], HOJE, null);
    expect(r.cicloMedio).toBe(18); // (21 + 15) / 2
    expect(r.retornoPrevisto).toEqual({ data: '2026-10-26', venceuHa: null, texto: '26/10 · em 12 dias' });
    expect(r.fase).toBe('recorrente');
  });

  it('visitas no mesmo dia não zeram o ciclo', () => {
    const r = resumirCliente([v('2026-09-01'), v('2026-09-01'), v('2026-09-21')], HOJE, null);
    expect(r.cicloMedio).toBe(20);
    expect(r.visitas).toBe(3);
  });

  it('em risco quando passa de 1,5× o ciclo', () => {
    const r = resumirCliente([v('2026-08-01'), v('2026-08-21')], HOJE, null); // ciclo 20, limite 30, dias 54
    expect(r.fase).toBe('em_risco');
    expect(r.etiquetasAuto).toContain('Resgatável');
    expect(r.retornoPrevisto).toEqual({ data: '2026-09-10', venceuHa: 34, texto: 'Venceu há 34 dias' });
  });

  it('limite de 45 dias quando não há ciclo', () => {
    expect(resumirCliente([v('2026-08-31')], HOJE, null).fase).toBe('novo');        // 44 dias
    expect(resumirCliente([v('2026-08-29')], HOJE, null).fase).toBe('em_risco');    // 46 dias
  });

  it('perdido acima de 120 dias', () => {
    expect(resumirCliente([v('2026-06-15'), v('2026-06-16')], HOJE, null).fase).toBe('em_risco'); // exatamente 120 dias
    expect(resumirCliente([v('2026-06-13'), v('2026-06-14')], HOJE, null).fase).toBe('perdido'); // 122
  });

  it('fiel com 5 visitas dentro do limite', () => {
    const datas = ['2026-08-10', '2026-08-31', '2026-09-14', '2026-09-28', '2026-10-12'];
    expect(resumirCliente(datas.map((d) => v(d)), HOJE, null).fase).toBe('fiel');
  });

  it('aniversariante do mês ganha etiqueta; fora do mês não; sem data não quebra', () => {
    expect(resumirCliente([], HOJE, '1990-10-20').etiquetasAuto).toContain('Aniversário 20/10');
    expect(resumirCliente([], HOJE, '1990-11-20').etiquetasAuto.some((e) => e.startsWith('Aniversário'))).toBe(false);
    expect(resumirCliente([], '2027-02-10', '1992-02-29').etiquetasAuto).toContain('Aniversário 29/02');
    expect(() => resumirCliente([], HOJE, null)).not.toThrow();
  });

  it('última visita traz serviço, profissional e dias atrás, mesmo com entrada fora de ordem', () => {
    const r = resumirCliente([v('2026-10-08', 100, 'Gel', 'Bruna'), v('2026-09-01')], HOJE, null);
    expect(r.ultimaVisita).toEqual({ date: '2026-10-08', receita: 100, servico: 'Gel', profissional: 'Bruna', diasAtras: 6 });
  });
});

describe('taxaRetencao', () => {
  it('quem veio nos 90 dias anteriores e voltou nos últimos 90', () => {
    const m = new Map<string, string[]>([
      ['a', ['2026-06-01', '2026-09-01']], // voltou
      ['b', ['2026-06-10']],               // não voltou
      ['c', ['2026-10-01']],               // só recente: fora da base
    ]);
    expect(taxaRetencao(m, HOJE)).toBe(50);
  });
  it('sem base devolve null', () => {
    expect(taxaRetencao(new Map(), HOJE)).toBeNull();
  });
});
