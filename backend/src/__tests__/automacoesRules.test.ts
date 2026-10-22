import { describe, it, expect } from 'vitest';
import {
  renderizarTexto, respostaConfirmacao, notaAvaliacao, aniversarianteEm, periodoDoHorario,
  entradaCompativel, lerConfig, seloTaxa, CONFIG_SCHEMA, TEXTO_PADRAO, VARIAVEIS, TEXTO_PADRAO_LEMBRETE_2H,
} from '../modules/whatsappAutomacoes/automacoes.rules.js';
import { REGRAS } from '../modules/whatsappAutomacoes/automacoes.types.js';

describe('automacoes.rules', () => {
  it('renderizarTexto troca variáveis e some com linha que ficou vazia', () => {
    expect(renderizarTexto('Oi {primeiro_nome}!\nEstamos na {endereco}.\nAté', { primeiro_nome: 'Ana', endereco: null })).toBe('Oi Ana!\nAté');
    expect(renderizarTexto('Link: {link}', { link: '' })).toBe('');
    expect(renderizarTexto('Oi {desconhecida}', {})).toBe('Oi {desconhecida}');
  });
  it('respostaConfirmacao', () => {
    for (const t of ['1', ' sim ', 'Confirmo', 'SIM!']) expect(respostaConfirmacao(t)).toBe('sim');
    for (const t of ['2', 'não', 'nao', 'Reagendar']) expect(respostaConfirmacao(t)).toBe('nao');
    for (const t of ['12', 'sim, mas atraso 10 min', '3', '']) expect(respostaConfirmacao(t)).toBeNull();
  });
  it('notaAvaliacao', () => {
    expect(notaAvaliacao('5')).toBe(5); expect(notaAvaliacao(' 4 ⭐')).toBe(4);
    expect(notaAvaliacao('6')).toBeNull(); expect(notaAvaliacao('nota 5 muito bom')).toBeNull();
  });
  it('aniversarianteEm trata 29/02 em ano não bissexto', () => {
    expect(aniversarianteEm(new Date('1992-02-29T00:00:00Z'), '2027-02-28')).toBe(true);
    expect(aniversarianteEm(new Date('1992-02-29T00:00:00Z'), '2028-02-28')).toBe(false);
    expect(aniversarianteEm(new Date('1990-10-21T00:00:00Z'), '2026-10-21')).toBe(true);
  });
  it('periodoDoHorario e entradaCompativel', () => {
    expect(periodoDoHorario('11:59')).toBe('manha'); expect(periodoDoHorario('12:00')).toBe('tarde'); expect(periodoDoHorario('18:00')).toBe('noite');
    const vaga = { serviceId: 's1', professionalId: 'p1', data: '2026-10-22', hora: '14:00', duracao: 60 };
    expect(entradaCompativel({ serviceId: 's1', professionalId: null, desiredDate: null, period: 'qualquer', duracaoServico: 60 }, vaga)).toBe(true);
    expect(entradaCompativel({ serviceId: 's2', professionalId: 'p1', desiredDate: '2026-10-22', period: 'tarde', duracaoServico: 45 }, vaga)).toBe(true);
    expect(entradaCompativel({ serviceId: 's2', professionalId: null, desiredDate: null, period: 'qualquer', duracaoServico: 90 }, vaga)).toBe(false);
    expect(entradaCompativel({ serviceId: 's1', professionalId: 'p2', desiredDate: null, period: 'qualquer', duracaoServico: 60 }, vaga)).toBe(false);
    expect(entradaCompativel({ serviceId: 's1', professionalId: null, desiredDate: '2026-10-23', period: 'qualquer', duracaoServico: 60 }, vaga)).toBe(false);
    expect(entradaCompativel({ serviceId: 's1', professionalId: null, desiredDate: null, period: 'manha', duracaoServico: 60 }, vaga)).toBe(false);
  });
  it('lerConfig volta ao padrão em campo inválido', () => {
    expect(lerConfig('confirmacao', { hora: '15:00' })).toEqual({ hora: '09:00' });
    expect(lerConfig('lista_espera', { quantas: 5 })).toEqual({ quantas: 5 });
    expect(lerConfig('retorno', null)).toEqual({ modo: 'ciclo', dias: 21 });
    expect(lerConfig('retorno', { modo: 'dias', dias: 500 })).toEqual({ modo: 'dias', dias: 21 });
  });
  it('confirmação: hora só entre 08:00 e 12:00 (a fila abre às 08:00)', () => {
    expect(CONFIG_SCHEMA.confirmacao.safeParse({ hora: '07:55' }).success).toBe(false);
    expect(CONFIG_SCHEMA.confirmacao.safeParse({ hora: '08:00' }).success).toBe(true);
    expect(CONFIG_SCHEMA.confirmacao.safeParse({ hora: '12:00' }).success).toBe(true);
    expect(CONFIG_SCHEMA.confirmacao.safeParse({ hora: '12:05' }).success).toBe(false);
  });
  it('lembrete: hora da véspera só entre 08:00 e 20:00 (janela da fila)', () => {
    expect(CONFIG_SCHEMA.lembrete.safeParse({ modo: 'vespera', hora: '07:59' }).success).toBe(false);
    expect(CONFIG_SCHEMA.lembrete.safeParse({ modo: 'vespera', hora: '08:00' }).success).toBe(true);
    expect(CONFIG_SCHEMA.lembrete.safeParse({ modo: 'vespera', hora: '20:00' }).success).toBe(true);
    expect(CONFIG_SCHEMA.lembrete.safeParse({ modo: 'vespera', hora: '20:05' }).success).toBe(false);
    expect(lerConfig('lembrete', { modo: 'vespera', hora: '23:00' })).toEqual({ modo: 'vespera', hora: '18:00' });
  });
  it('avaliação: linkGoogle só aceita http/https', () => {
    const ok = (linkGoogle: string | null) => CONFIG_SCHEMA.avaliacao.safeParse({ horas: 2, linkGoogle }).success;
    expect(ok('https://g.page/r/abc')).toBe(true);
    expect(ok('http://exemplo.com/avaliar')).toBe(true);
    expect(ok(null)).toBe(true);
    expect(ok('javascript:alert(1)')).toBe(false);
    expect(ok('ftp://exemplo.com/x')).toBe(false);
  });
  it('avaliação: texto padrão sem data relativa (a fila pode atrasar para o dia seguinte)', () => {
    expect(TEXTO_PADRAO.avaliacao).not.toMatch(/hoje|amanhã|ontem/i);
    expect(TEXTO_PADRAO.avaliacao).toBe('Como foi sua experiência no {negocio}? Responda com uma nota de 1 a 5 ⭐');
  });
  it('seloTaxa', () => { expect(seloTaxa(80)).toBe('Excelente'); expect(seloTaxa(50)).toBe('Boa'); expect(seloTaxa(49.9)).toBe('Baixa'); });
  it('catálogo cobre todas as regras e textos só usam variáveis declaradas', () => {
    expect(REGRAS).toHaveLength(7);
    for (const r of REGRAS) {
      const usadas = [...TEXTO_PADRAO[r].matchAll(/\{(\w+)\}/g)].map((m) => m[1]);
      for (const v of usadas) expect(VARIAVEIS[r]).toContain(v);
    }
    for (const v of [...TEXTO_PADRAO_LEMBRETE_2H.matchAll(/\{(\w+)\}/g)].map((m) => m[1])) expect(VARIAVEIS.lembrete).toContain(v);
  });
});
