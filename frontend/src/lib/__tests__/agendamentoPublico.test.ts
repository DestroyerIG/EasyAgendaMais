import { describe, expect, it } from 'vitest';
import {
  dataCurta, dataPorExtenso, diaDaSemanaCurto, diaDoMes, formatarDuracao, gerarIcs, horaCurta, horaDeTermino, mesEAno,
  proximosDias, separarPorPeriodo,
} from '../agendamentoPublico';

describe('agendamentoPublico', () => {
  it('formata a duração como no Stitch', () => {
    expect(formatarDuracao(150)).toBe('2h30');
    expect(formatarDuracao(60)).toBe('1h00');
    expect(formatarDuracao(45)).toBe('45 min');
  });

  it('calcula o término e dá a volta na meia-noite', () => {
    expect(horaDeTermino('14:00', 150)).toBe('16:30');
    expect(horaDeTermino('23:30', 60)).toBe('00:30');
  });

  it('lista os próximos dias atravessando o fim do mês', () => {
    expect(proximosDias(3, new Date(2026, 9, 30))).toEqual(['2026-10-30', '2026-10-31', '2026-11-01']);
  });

  it('escreve as datas em português', () => {
    expect(diaDaSemanaCurto('2026-09-22')).toBe('Ter');
    expect(diaDoMes('2026-09-02')).toBe('2');
    expect(mesEAno('2026-09-22')).toBe('Setembro 2026');
    expect(dataPorExtenso('2026-09-22')).toBe('terça, 22 de setembro');
    expect(dataCurta('2026-09-22')).toBe('terça, 22/09');
  });

  it('separa os horários em manhã e tarde', () => {
    const h = (horario: string) => ({ horario, livre: true });
    expect(separarPorPeriodo([h('09:00'), h('11:59'), h('12:00'), h('17:00')])).toEqual({
      manha: [h('09:00'), h('11:59')],
      tarde: [h('12:00'), h('17:00')],
    });
  });

  it('encurta a hora do fechamento', () => {
    expect(horaCurta('19:00')).toBe('19h');
    expect(horaCurta('09:30')).toBe('9h30');
  });

  it('gera o evento de calendário com início, fim e texto escapado', () => {
    const ics = gerarIcs({ titulo: 'Corte, barba', data: '2026-09-22', horario: '23:30', duracaoMinutos: 60, local: 'Rua A, 10' });

    expect(ics).toContain('DTSTART:20260922T233000');
    expect(ics).toContain('DTEND:20260923T003000');
    expect(ics).toContain('SUMMARY:Corte\\, barba');
    expect(ics).toContain('LOCATION:Rua A\\, 10');
    expect(ics.split('\r\n')[0]).toBe('BEGIN:VCALENDAR');
  });
});
