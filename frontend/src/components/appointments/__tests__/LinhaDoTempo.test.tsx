import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  ALTURA_HORA,
  LinhaDoTempo,
  agruparPorProfissional,
  calcularFaixaHoras,
  calcularVagasLivres,
  faixaHorariaTexto,
  formatarDuracao,
  fusoTexto,
  paraHoraTexto,
  paraMinutos,
  posicaoDoBloco,
} from '../LinhaDoTempo';
import type { Appointment } from '@/types';

const agendamento = (partes: Partial<Appointment> & { id: string; time: string }): Appointment => ({
  business_id: 'b1',
  client_id: 'c1',
  professional_id: 'p1',
  service_id: 's1',
  date: '2026-09-17T00:00:00',
  status: 'confirmado',
  reminder_sent: false,
  created_at: '2026-09-14T00:00:00',
  client_name: 'Mariana Souza',
  professional_name: 'Camila Rocha',
  service_name: 'Atendimento',
  service_price: 110,
  ...partes,
});

describe('conversões de horário', () => {
  it('lê "HH:MM:SS" em minutos e volta em "HH:MM"', () => {
    expect(paraMinutos('09:30:00')).toBe(570);
    expect(paraHoraTexto(570)).toBe('09:30');
    expect(paraHoraTexto(480)).toBe('08:00');
  });

  it('escreve a duração como o arquivo de referência', () => {
    expect(formatarDuracao(30)).toBe('30m');
    expect(formatarDuracao(60)).toBe('1h');
    expect(formatarDuracao(90)).toBe('1h30');
    expect(formatarDuracao(150)).toBe('2h30');
  });

  it('escreve a faixa do bloco com travessão', () => {
    expect(faixaHorariaTexto(510, 90)).toBe('08:30 – 10:00');
  });

  it('escreve o fuso do aparelho', () => {
    expect(fusoTexto(180)).toBe('GMT-3');
    expect(fusoTexto(-120)).toBe('GMT+2');
  });
});

describe('posicaoDoBloco', () => {
  it('calcula top e altura a partir do horário e da duração, com 80px por hora', () => {
    // 08:30 com 90 min numa faixa que começa às 08:00.
    expect(posicaoDoBloco(510, 90, 480)).toEqual({ top: 40, altura: 120 });
    // 10:00 com 60 min: uma hora abaixo do início, um bloco de uma hora.
    expect(posicaoDoBloco(600, 60, 480)).toEqual({ top: 2 * ALTURA_HORA, altura: ALTURA_HORA });
  });

  it('não depende de posição fixa: mover o início da faixa move o bloco', () => {
    expect(posicaoDoBloco(600, 60, 420).top).toBe(240);
  });
});

describe('calcularFaixaHoras', () => {
  it('usa a janela 08:00–20:00 do arquivo quando tudo cabe nela', () => {
    const faixa = calcularFaixaHoras([agendamento({ id: '1', time: '09:00:00' })], 60);
    expect([faixa.horaInicio, faixa.horaFim]).toEqual([8, 20]);
    expect(faixa.inicioMinutos).toBe(480);
    expect(faixa.horas).toHaveLength(13);
  });

  it('estica a faixa quando há agendamento fora da janela', () => {
    const faixa = calcularFaixaHoras(
      [agendamento({ id: '1', time: '07:15:00' }), agendamento({ id: '2', time: '20:30:00' })],
      60,
    );
    expect([faixa.horaInicio, faixa.horaFim]).toEqual([7, 22]);
  });
});

describe('calcularVagasLivres', () => {
  const faixa = calcularFaixaHoras([], 60);

  it('acha o buraco entre dois atendimentos e o rabo do dia', () => {
    const vagas = calcularVagasLivres(
      [agendamento({ id: '1', time: '08:00:00' }), agendamento({ id: '2', time: '09:30:00' })],
      faixa,
      60,
    );
    expect(vagas[0]).toEqual({ inicioMinutos: 540, duracaoMinutos: 30 });
    expect(vagas[vagas.length - 1]).toEqual({ inicioMinutos: 630, duracaoMinutos: 570 });
  });

  it('ignora buraco menor que 30 minutos', () => {
    const vagas = calcularVagasLivres(
      [agendamento({ id: '1', time: '08:00:00' }), agendamento({ id: '2', time: '09:15:00' })],
      faixa,
      60,
    );
    expect(vagas.map((v) => v.inicioMinutos)).not.toContain(540);
  });

  it('trata horário de cancelado como livre', () => {
    const vagas = calcularVagasLivres(
      [agendamento({ id: '1', time: '08:00:00', status: 'cancelado' })],
      faixa,
      60,
    );
    expect(vagas).toEqual([{ inicioMinutos: 480, duracaoMinutos: 720 }]);
  });
});

describe('agruparPorProfissional', () => {
  it('faz uma coluna por profissional, em ordem alfabética e com os horários ordenados', () => {
    const colunas = agruparPorProfissional([
      agendamento({ id: '1', time: '11:00:00', professional_id: 'p2', professional_name: 'Paula Mendes' }),
      agendamento({ id: '2', time: '10:00:00', professional_id: 'p1', professional_name: 'Bruna Lima' }),
      agendamento({ id: '3', time: '09:00:00', professional_id: 'p1', professional_name: 'Bruna Lima' }),
    ]);
    expect(colunas.map((c) => c.nome)).toEqual(['Bruna Lima', 'Paula Mendes']);
    expect(colunas[0].agendamentos.map((a) => a.time)).toEqual(['09:00:00', '10:00:00']);
  });
});

describe('LinhaDoTempo', () => {
  const props = {
    duracaoPadraoMinutos: 60,
    actionLoading: null,
    onStatusChange: vi.fn(),
    onNovoAgendamento: vi.fn(),
  };

  it('desenha a régua de horas, a coluna do profissional e o bloco do agendamento', () => {
    render(
      <LinhaDoTempo
        {...props}
        agendamentos={[agendamento({ id: '1', time: '08:30:00', service_name: 'Corte' })]}
      />,
    );

    expect(screen.getByText('08:00')).toBeInTheDocument();
    expect(screen.getByText('20:00')).toBeInTheDocument();
    expect(screen.getByText('Camila Rocha')).toBeInTheDocument();
    expect(screen.getByText('1 atendimento')).toBeInTheDocument();
    expect(screen.getByText('Mariana Souza')).toBeInTheDocument();
    expect(screen.getByText('Corte')).toBeInTheDocument();
    expect(screen.getByText('08:30 – 09:30')).toBeInTheDocument();
    expect(screen.getByText('R$ 110')).toBeInTheDocument();
  });

  it('posiciona o bloco pelo cálculo, não por pixel fixo do arquivo', () => {
    render(<LinhaDoTempo {...props} agendamentos={[agendamento({ id: '1', time: '10:00:00' })]} />);

    const bloco = screen.getByText('Mariana Souza').closest('div[style]') as HTMLElement;
    expect(bloco.style.top).toBe('160px');
    expect(bloco.style.height).toBe('80px');
  });

  it('oferece concluir e cancelar em botão de verdade no bloco confirmado', async () => {
    const onStatusChange = vi.fn();
    render(
      <LinhaDoTempo {...props} onStatusChange={onStatusChange} agendamentos={[agendamento({ id: 'a1', time: '09:00:00' })]} />,
    );

    await userEvent.click(screen.getByRole('button', { name: 'Concluir atendimento de Mariana Souza' }));
    expect(onStatusChange).toHaveBeenCalledWith('a1', 'concluido');

    await userEvent.click(screen.getByRole('button', { name: 'Cancelar agendamento de Mariana Souza' }));
    expect(onStatusChange).toHaveBeenCalledWith('a1', 'cancelado');
  });

  it('não oferece ação em agendamento concluído', () => {
    render(
      <LinhaDoTempo {...props} agendamentos={[agendamento({ id: '1', time: '09:00:00', status: 'concluido' })]} />,
    );
    expect(screen.queryByRole('button', { name: /Concluir atendimento/ })).not.toBeInTheDocument();
  });

  it('mostra o horário livre como botão que abre o cadastro', async () => {
    const onNovoAgendamento = vi.fn();
    render(
      <LinhaDoTempo
        {...props}
        onNovoAgendamento={onNovoAgendamento}
        agendamentos={[agendamento({ id: '1', time: '08:00:00' })]}
      />,
    );

    await userEvent.click(screen.getByRole('button', { name: /Agendar no horário livre das 09:00/ }));
    expect(onNovoAgendamento).toHaveBeenCalled();
    expect(screen.getByText('Clique para agendar')).toBeInTheDocument();
  });

  it('risca o agendamento cancelado e não mostra chip de status', () => {
    render(
      <LinhaDoTempo {...props} agendamentos={[agendamento({ id: '1', time: '09:00:00', status: 'cancelado' })]} />,
    );
    expect(screen.getByText('Mariana Souza')).toHaveClass('line-through');
    expect(screen.queryByText('Confirmado')).not.toBeInTheDocument();
  });
});
