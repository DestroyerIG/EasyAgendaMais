import { describe, it, expect } from 'vitest';
import {
  filtrarPublico, resumoParaPublico, nomeAutomatico, statusCampanha, validarInicio, comRodape,
  type ClienteDoPublico,
} from '../modules/whatsappCampanhas/campanhas.rules.js';
import { zonedToUtc } from '../utils/businessDate.js';
import { ValidationError } from '../utils/errors.js';

const HOJE = '2026-10-23';
const cli = (id: string, o: Partial<ClienteDoPublico> = {}): ClienteDoPublico => ({
  id, nome: id, telefone: '5511999990000', birthDate: null, diasSemVir: 10, visitas12m: 1,
  profissionalPreferida: null, ultimoServico: null, ...o,
});
const ids = (l: ClienteDoPublico[]) => l.map((c) => c.id);
const f = (segmento: Parameters<typeof filtrarPublico>[1]['segmento'], professionalId: string | null = null, serviceId: string | null = null) =>
  ({ segmento, professionalId, serviceId });

describe('filtrarPublico', () => {
  const dias = [30, 31, 60, 61].map((d) => cli(`d${d}`, { diasSemVir: d }));
  it('em_risco: 31 a 60 dias', () => expect(ids(filtrarPublico(dias, f('em_risco'), HOJE))).toEqual(['d31', 'd60']));
  it('reativacao: acima de 60', () => expect(ids(filtrarPublico(dias, f('reativacao'), HOJE))).toEqual(['d61']));
  it('cliente sem visita só entra em todas e aniversariantes', () => {
    const s = cli('sem', { diasSemVir: null, visitas12m: 0, birthDate: '1990-10-02' });
    expect(filtrarPublico([s], f('em_risco'), HOJE)).toEqual([]);
    expect(filtrarPublico([s], f('reativacao'), HOJE)).toEqual([]);
    expect(filtrarPublico([s], f('vips'), HOJE)).toEqual([]);
    expect(ids(filtrarPublico([s], f('todas'), HOJE))).toEqual(['sem']);
    expect(ids(filtrarPublico([s], f('aniversariantes'), HOJE))).toEqual(['sem']);
  });
  it('aniversariantes do mês', () => {
    const l = [cli('a', { birthDate: '1990-10-02' }), cli('b', { birthDate: '1990-11-23' }), cli('c')];
    expect(ids(filtrarPublico(l, f('aniversariantes'), HOJE))).toEqual(['a']);
  });
  it('vips: top 10%, com empate na última posição', () => {
    const vinte = Array.from({ length: 20 }, (_, i) => cli(`c${String(i + 1).padStart(2, '0')}`, { visitas12m: i + 1 }));
    expect(ids(filtrarPublico(vinte, f('vips'), HOJE))).toEqual(['c19', 'c20']);
    vinte[17] = cli('c18', { visitas12m: 19 });
    expect(ids(filtrarPublico(vinte, f('vips'), HOJE))).toEqual(['c18', 'c19', 'c20']);
  });
  it('vips: quem tem 0 visitas em 12 meses fica fora', () => {
    const l = [cli('zero', { visitas12m: 0 }), cli('um', { visitas12m: 1 })];
    expect(ids(filtrarPublico(l, f('vips'), HOJE))).toEqual(['um']);
  });
  it('filtra por profissional preferida e por último serviço, ordenando por nome', () => {
    const l = [
      cli('Zeca', { profissionalPreferida: { id: 'p1', nome: 'P' }, ultimoServico: { id: 's1', nome: 'Corte', duracao: 30 } }),
      cli('Ana', { profissionalPreferida: { id: 'p1', nome: 'P' }, ultimoServico: { id: 's2', nome: 'Barba', duracao: 30 } }),
      cli('Bia', { profissionalPreferida: { id: 'p2', nome: 'Q' }, ultimoServico: { id: 's1', nome: 'Corte', duracao: 30 } }),
    ];
    expect(ids(filtrarPublico(l, f('todas', 'p1'), HOJE))).toEqual(['Ana', 'Zeca']);
    expect(ids(filtrarPublico(l, f('todas', null, 's1'), HOJE))).toEqual(['Bia', 'Zeca']);
    expect(ids(filtrarPublico(l, f('todas', 'p1', 's1'), HOJE))).toEqual(['Zeca']);
  });
});

describe('resumoParaPublico', () => {
  const v = (date: string, professionalId: string, profissional: string, extra = {}) =>
    ({ date, receita: 50, servico: 'Corte', profissional, professionalId, serviceId: 's1', duracao: 30, ...extra });
  it('sem visitas', () => {
    expect(resumoParaPublico([], HOJE)).toEqual({ diasSemVir: null, visitas12m: 0, profissionalPreferida: null, ultimoServico: null });
  });
  it('preferida = mais visitas, não a última', () => {
    const r = resumoParaPublico([v('2026-01-01', 'p1', 'A'), v('2026-02-01', 'p1', 'A'), v('2026-10-01', 'p2', 'B')], HOJE);
    expect(r.profissionalPreferida).toEqual({ id: 'p1', nome: 'A' });
    expect(r.diasSemVir).toBe(22);
    expect(r.ultimoServico).toEqual({ id: 's1', nome: 'Corte', duracao: 30 });
  });
  it('empate de contagem: a mais recente', () => {
    const r = resumoParaPublico([v('2026-01-01', 'p1', 'A'), v('2026-10-01', 'p2', 'B')], HOJE);
    expect(r.profissionalPreferida).toEqual({ id: 'p2', nome: 'B' });
  });
  it('visitas12m conta só as de menos de 365 dias', () => {
    const r = resumoParaPublico([v('2025-10-23', 'p1', 'A'), v('2025-10-24', 'p1', 'A'), v('2026-10-01', 'p1', 'A')], HOJE);
    expect(r.visitas12m).toBe(2);
  });
  it('sem duracao/serviceId na última visita', () => {
    const r = resumoParaPublico([{ date: '2026-10-01', receita: 1, servico: 'Corte', profissional: 'A' }], HOJE);
    expect(r.ultimoServico).toEqual({ id: '', nome: 'Corte', duracao: 0 });
    expect(r.profissionalPreferida).toBeNull();
  });
});

describe('nomeAutomatico', () => {
  it('segmento + dia/mês', () => expect(nomeAutomatico('reativacao', '2026-10-21')).toBe('Reativação · 21/10'));
});

describe('statusCampanha', () => {
  const agora = new Date('2026-10-23T12:00:00Z');
  const passado = new Date('2026-10-23T11:00:00Z');
  const futuro = new Date('2026-10-23T13:00:00Z');
  it('as cinco saídas', () => {
    expect(statusCampanha({ status: 'agendada', inicioEm: futuro }, 5, agora)).toBe('agendada');
    expect(statusCampanha({ status: 'agendada', inicioEm: passado }, 5, agora)).toBe('enviando');
    expect(statusCampanha({ status: 'agendada', inicioEm: passado }, 0, agora)).toBe('concluida');
    expect(statusCampanha({ status: 'rascunho', inicioEm: passado }, 0, agora)).toBe('rascunho');
    expect(statusCampanha({ status: 'cancelada', inicioEm: futuro }, 3, agora)).toBe('cancelada');
  });
});

describe('validarInicio', () => {
  const tz = 'America/Sao_Paulo';
  const agora = zonedToUtc(HOJE, '12:00', tz);
  it('recusa horas fora de 08:00-19:30', () => {
    for (const h of ['07:30', '20:00']) expect(() => validarInicio('2026-10-24', h, tz, agora)).toThrow('Escolha um horário entre 08:00 e 19:30');
    expect(() => validarInicio('2026-10-24', '07:30', tz, agora)).toThrow(ValidationError);
    expect(validarInicio('2026-10-24', '19:30', tz, agora)).toEqual(zonedToUtc('2026-10-24', '19:30', tz));
  });
  it('recusa data além de 30 dias', () => {
    expect(() => validarInicio('2026-11-23', '10:00', tz, agora)).toThrow('Escolha uma data nos próximos 30 dias');
    expect(validarInicio('2026-11-22', '10:00', tz, agora)).toEqual(zonedToUtc('2026-11-22', '10:00', tz));
  });
  it('recusa instante no passado', () => {
    const a = zonedToUtc(HOJE, '10:01', tz);
    expect(() => validarInicio(HOJE, '10:00', tz, a)).toThrow('Escolha um horário no futuro');
  });
  it('amanhã 10:00', () => {
    expect(validarInicio('2026-10-24', '10:00', tz, agora).toISOString()).toBe('2026-10-24T13:00:00.000Z');
  });
});

describe('comRodape', () => {
  it('acrescenta o rodapé de saída', () => expect(comRodape('Oi\n')).toBe('Oi\n\nResponda SAIR para não receber novidades.'));
});
