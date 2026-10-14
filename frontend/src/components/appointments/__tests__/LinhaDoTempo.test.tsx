import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  ALTURA_HORA,
  ALTURA_MINIMA_BLOCO_PX,
  LinhaDoTempo,
  agruparPorProfissional,
  calcularAlturaHora,
  calcularFaixaHoras,
  calcularVagasLivres,
  duracaoReal,
  faixaHorariaTexto,
  formatarDuracao,
  formatarHorarioFuncionamento,
  formatarMinutos,
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

  it('escreve a duração do bloco de horário livre como o arquivo ("Livre 30m", "1h30 livre")', () => {
    expect(formatarDuracao(30)).toBe('30m');
    expect(formatarDuracao(60)).toBe('1h');
    expect(formatarDuracao(90)).toBe('1h30');
    expect(formatarDuracao(150)).toBe('2h30');
  });

  it('escreve a duração do cartão em minutos, como todo cartão do arquivo do celular', () => {
    expect(formatarMinutos(45)).toBe('45 min');
    expect(formatarMinutos(60)).toBe('60 min');
    expect(formatarMinutos(75)).toBe('75 min');
  });

  it('escreve o horário de funcionamento como agenda-mobile.html', () => {
    expect(formatarHorarioFuncionamento(8 * 60, 19 * 60)).toBe('8h - 19h');
    expect(formatarHorarioFuncionamento(8 * 60 + 30, 19 * 60)).toBe('8h30 - 19h');
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
  it(`calcula top e altura a partir do horário e da duração, com ${ALTURA_HORA}px por hora`, () => {
    // 08:30 com 90 min numa faixa que começa às 08:00.
    expect(posicaoDoBloco(510, 90, 480)).toEqual({ top: ALTURA_HORA / 2, altura: ALTURA_HORA * 1.5 });
    // 10:00 com 60 min: uma hora abaixo do início, um bloco de uma hora.
    expect(posicaoDoBloco(600, 60, 480)).toEqual({ top: 2 * ALTURA_HORA, altura: ALTURA_HORA });
  });

  it('não depende de posição fixa: mover o início da faixa move o bloco', () => {
    expect(posicaoDoBloco(600, 60, 420).top).toBe(3 * ALTURA_HORA);
  });
});

describe('calcularAlturaHora', () => {
  it('sem agendamento nenhum, cai na altura compacta do arquivo', () => {
    expect(calcularAlturaHora([], 60)).toBe(ALTURA_HORA);
  });

  it('estica o suficiente para o atendimento mais curto do dia não cortar texto, mesmo que seja o único', () => {
    // 60min a 80px/h dá 80px — menos que o mínimo do bloco cheio (achado do usuário).
    const altura = calcularAlturaHora([agendamento({ id: '1', time: '09:00:00', service_duration_minutes: 60 })], 60);
    expect(altura).toBe(Math.ceil((ALTURA_MINIMA_BLOCO_PX * 60) / 60));
    expect((altura / 60) * 60).toBeGreaterThanOrEqual(ALTURA_MINIMA_BLOCO_PX);
  });

  it('usa o MENOR atendimento do dia, não o maior nem a média — um só atendimento curto entre vários longos já obriga a régua a esticar', () => {
    const altura = calcularAlturaHora(
      [
        agendamento({ id: '1', time: '09:00:00', service_duration_minutes: 120 }),
        agendamento({ id: '2', time: '11:00:00', service_duration_minutes: 30 }),
      ],
      60,
    );
    expect(altura).toBe(Math.ceil((ALTURA_MINIMA_BLOCO_PX * 60) / 30));
  });

  it('dia só com atendimentos de 90min+ fica na altura compacta do arquivo (não precisa esticar)', () => {
    const altura = calcularAlturaHora([agendamento({ id: '1', time: '09:00:00', service_duration_minutes: 90 })], 60);
    expect(altura).toBe(ALTURA_HORA);
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

  it('parte do horário de funcionamento configurado quando ele existe', () => {
    const faixa = calcularFaixaHoras([agendamento({ id: '1', time: '10:00:00' })], 60, {
      aberturaMinutos: 9 * 60,
      fechamentoMinutos: 19 * 60 + 30,
    });
    expect([faixa.horaInicio, faixa.horaFim]).toEqual([9, 20]);
    expect(faixa.inicioMinutos).toBe(540);
  });

  it('não passa das 24h: atendimento às 23:30 não vira régua até "25:00"', () => {
    const faixa = calcularFaixaHoras([agendamento({ id: '1', time: '23:30:00' })], 60);
    expect(faixa.horaFim).toBe(24);
    expect(faixa.horas[faixa.horas.length - 1]).toBe(24);
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

  it('só entre atendimentos, deixa as pontas de fora (lista do celular)', () => {
    const vagas = calcularVagasLivres(
      [agendamento({ id: '1', time: '09:00:00' }), agendamento({ id: '2', time: '11:00:00' })],
      faixa,
      60,
      { apenasEntreAtendimentos: true },
    );
    expect(vagas).toEqual([{ inicioMinutos: 600, duracaoMinutos: 60 }]);
  });

  it('trata horário de cancelado como livre', () => {
    const vagas = calcularVagasLivres(
      [agendamento({ id: '1', time: '08:00:00', status: 'cancelado' })],
      faixa,
      60,
    );
    expect(vagas).toEqual([{ inicioMinutos: 480, duracaoMinutos: 720 }]);
  });

  it('usa a duração real do atendimento, não a padrão, para achar onde o buraco seguinte começa (achado do usuário: cards se sobrepondo com serviço mais curto que a duração padrão)', () => {
    const vagas = calcularVagasLivres(
      [agendamento({ id: '1', time: '08:00:00', service_duration_minutes: 30 })],
      faixa,
      60,
    );
    // 08:00 + 30min reais (não os 60min padrão) = 08:30 → o buraco começa em 510, não 540.
    expect(vagas[0]).toEqual({ inicioMinutos: 510, duracaoMinutos: 690 });
  });
});

describe('duracaoReal', () => {
  it('usa a duração real do serviço (service_duration_minutes) quando ela existe', () => {
    expect(
      duracaoReal(agendamento({ id: '1', time: '09:00:00', service_duration_minutes: 30 }), 60),
    ).toBe(30);
  });

  it('cai na duração padrão só quando o agendamento não traz a própria', () => {
    expect(duracaoReal(agendamento({ id: '1', time: '09:00:00' }), 60)).toBe(60);
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
    onAcao: vi.fn(),
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

  it('clicar no bloco abre o painel de detalhes, e as ações rápidas continuam as suas', async () => {
    const onAbrirDetalhes = vi.fn();
    const onAcao = vi.fn();
    render(
      <LinhaDoTempo
        {...props}
        onAcao={onAcao}
        onAbrirDetalhes={onAbrirDetalhes}
        agendamentos={[agendamento({ id: 'a1', time: '09:00:00' })]}
      />,
    );

    await userEvent.click(
      screen.getByRole('button', { name: 'Ver detalhes do agendamento de Mariana Souza' }),
    );
    expect(onAbrirDetalhes).toHaveBeenCalledWith(expect.objectContaining({ id: 'a1' }));
    expect(onAcao).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole('button', { name: 'Concluir atendimento de Mariana Souza' }));
    expect(onAcao).toHaveBeenCalledWith(expect.objectContaining({ id: 'a1' }), 'concluir');
    expect(onAbrirDetalhes).toHaveBeenCalledTimes(1);
  });

  it('sem a prop de detalhes o bloco não ganha alvo de clique', () => {
    render(<LinhaDoTempo {...props} agendamentos={[agendamento({ id: 'a1', time: '09:00:00' })]} />);
    expect(screen.queryByRole('button', { name: /Ver detalhes/ })).not.toBeInTheDocument();
  });

  it('posiciona e dimensiona o bloco pelo cálculo, não por pixel fixo do arquivo', () => {
    render(
      <LinhaDoTempo
        {...props}
        agendamentos={[agendamento({ id: '1', time: '10:00:00', service_duration_minutes: 90 })]}
      />,
    );

    const bloco = screen.getByText('Mariana Souza').closest('div[style]') as HTMLElement;
    expect(bloco.style.top).toBe(`${2 * ALTURA_HORA}px`);
    expect(bloco.style.height).toBe(`${ALTURA_HORA * 1.5}px`);
  });

  it('sem sombra em repouso e com o padding do chip de status conferidos ao vivo no arquivo de referência (agenda-desktop.html: boxShadow computado "none", chip "2px 8px")', () => {
    render(<LinhaDoTempo {...props} agendamentos={[agendamento({ id: '1', time: '09:00:00' })]} />);

    const bloco = screen.getByText('Mariana Souza').closest('div[style]') as HTMLElement;
    expect(bloco).not.toHaveClass('shadow-sm');
    expect(bloco).toHaveClass('hover:shadow-md');
    expect(screen.getByText('Confirmado')).toHaveClass('px-2');
  });

  it('a régua do dia se ajusta ao atendimento real mais curto (calcularAlturaHora), não a uma escala fixa igual para o dia inteiro — um atendimento de 60min sozinho já obriga a régua a esticar além do valor compacto do arquivo (achado do usuário: em 80px/h fixo o bloco cheio cortava nome, preço e selo; numa escala fixa grande o bastante para qualquer atendimento curto, um dia comum ficava com buracos enormes)', () => {
    render(
      <LinhaDoTempo
        {...props}
        agendamentos={[agendamento({ id: '1', time: '08:00:00', service_duration_minutes: 60 })]}
      />,
    );

    const bloco = screen.getByText('Mariana Souza').closest('div[style]') as HTMLElement;
    const alturaEsperada = calcularAlturaHora(
      [agendamento({ id: '1', time: '08:00:00', service_duration_minutes: 60 })],
      60,
    );
    expect(bloco.style.height).toBe(`${alturaEsperada}px`);
    expect(alturaEsperada).toBeGreaterThan(ALTURA_HORA);
  });

  it('dois atendimentos de 30min voltados a voltados não se sobrepõem e mostram o conteúdo inteiro — a correção certa era ajustar o espaçamento da linha do tempo ao dia, não uma altura mínima dissociada do horário nem uma escala fixa grande demais (achado do usuário)', () => {
    const agendamentosDoDia = [
      agendamento({
        id: '1',
        time: '08:00:00',
        client_name: 'Ana Paula',
        service_name: 'Corte masculino',
        professional_id: 'p1',
        service_duration_minutes: 30,
      }),
      agendamento({
        id: '2',
        time: '08:30:00',
        client_name: 'Bianca Reis',
        professional_id: 'p1',
        service_duration_minutes: 30,
      }),
    ];
    render(<LinhaDoTempo {...props} agendamentos={agendamentosDoDia} />);

    const blocoAna = screen.getByText('Ana Paula').closest('div[style]') as HTMLElement;
    const blocoBianca = screen.getByText('Bianca Reis').closest('div[style]') as HTMLElement;
    const alturaHora = calcularAlturaHora(agendamentosDoDia, 60);
    const alturaBloco30min = (30 / 60) * alturaHora;

    // Com a grade ajustada ao dia, 30min já rendem espaço de verdade — o
    // bloco de Ana termina exatamente onde o de Bianca começa, sem se tocarem, e o
    // conteúdo cheio (nome, serviço, preço, selo) cabe sem cortar nada.
    expect(blocoAna.style.top).toBe('0px');
    expect(blocoAna.style.height).toBe(`${alturaBloco30min}px`);
    expect(blocoBianca.style.top).toBe(`${alturaBloco30min}px`);
    expect(alturaBloco30min).toBeGreaterThanOrEqual(ALTURA_MINIMA_BLOCO_PX);
    expect(screen.getByText('Ana Paula')).toBeInTheDocument();
    expect(screen.getByText('Corte masculino')).toBeInTheDocument();
  });

  it('usa sempre o layout cheio do arquivo de referência (horário, ícone, cliente, serviço, preço, selo), mesmo em atendimento curto — decisão explícita do usuário de não ter uma versão resumida', () => {
    render(
      <LinhaDoTempo
        {...props}
        agendamentos={[
          agendamento({
            id: '1',
            time: '08:00:00',
            client_name: 'Gustavo Pinto',
            service_name: 'Corte masculino',
            service_price: 55,
            service_duration_minutes: 30,
          }),
        ]}
      />,
    );

    expect(screen.getByText('Gustavo Pinto')).toBeInTheDocument();
    expect(screen.getByText('Corte masculino')).toBeInTheDocument();
    expect(screen.getByText('R$ 55')).toBeInTheDocument();
    expect(screen.getByText('Confirmado')).toBeInTheDocument();
  });

  it('no bloco confirmado oferece iniciar, concluir e cliente faltou; cancelar fica no painel de detalhes', async () => {
    const onAcao = vi.fn();
    render(
      <LinhaDoTempo {...props} onAcao={onAcao} agendamentos={[agendamento({ id: 'a1', time: '09:00:00' })]} />,
    );

    await userEvent.click(screen.getByRole('button', { name: 'Iniciar atendimento de Mariana Souza' }));
    expect(onAcao).toHaveBeenLastCalledWith(expect.objectContaining({ id: 'a1' }), 'iniciar');
    await userEvent.click(screen.getByRole('button', { name: 'Concluir atendimento de Mariana Souza' }));
    expect(onAcao).toHaveBeenLastCalledWith(expect.objectContaining({ id: 'a1' }), 'concluir');
    await userEvent.click(screen.getByRole('button', { name: 'Cliente faltou de Mariana Souza' }));
    expect(onAcao).toHaveBeenLastCalledWith(expect.objectContaining({ id: 'a1' }), 'faltou');
    expect(screen.queryByRole('button', { name: /^Cancelar/ })).not.toBeInTheDocument();
  });

  it('em atendimento, o bloco só oferece concluir (voltar e cancelar ficam no painel)', () => {
    render(
      <LinhaDoTempo {...props} agendamentos={[agendamento({ id: 'a1', time: '09:00:00', status: 'em_atendimento' })]} />,
    );
    expect(screen.getByRole('button', { name: 'Concluir atendimento de Mariana Souza' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Iniciar atendimento/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Voltar para confirmado/ })).not.toBeInTheDocument();
  });

  it('não oferece ação em agendamento concluído', () => {
    render(
      <LinhaDoTempo {...props} agendamentos={[agendamento({ id: '1', time: '09:00:00', status: 'concluido' })]} />,
    );
    expect(screen.queryByRole('button', { name: /Concluir atendimento/ })).not.toBeInTheDocument();
  });

  it('o rótulo do horário livre começa pelo que o clique faz, não pelo horário prometido', async () => {
    const onNovoAgendamento = vi.fn();
    render(
      <LinhaDoTempo
        {...props}
        onNovoAgendamento={onNovoAgendamento}
        agendamentos={[agendamento({ id: '1', time: '08:00:00' })]}
      />,
    );

    expect(screen.queryByRole('button', { name: /Agendar no horário livre/ })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Novo agendamento: 09:00, 11h livre' }));
    // O clique leva a profissional da coluna, a data do dia e o horário da vaga.
    expect(onNovoAgendamento).toHaveBeenCalledWith({ professionalId: 'p1', date: '2026-09-17', time: '09:00' });
    expect(screen.getByText('Clique para agendar')).toBeInTheDocument();
  });

  it('o tom da coluna sai da ordem do período inteiro, não do índice desta grade', () => {
    // Camila é a segunda da ordem, então leva o segundo tom mesmo sendo a única coluna
    // desenhada — é isso que faz o chip e a coluna pintarem a pessoa da mesma cor.
    const { container } = render(
      <LinhaDoTempo
        {...props}
        ordemProfissionais={['p2', 'p1']}
        agendamentos={[agendamento({ id: '1', time: '09:00:00' })]}
      />,
    );

    expect(container.querySelector('[aria-label="Camila Rocha"]')).toHaveClass('bg-tertiary/15');
  });

  it('sem a ordem do período, o tom cai no índice da coluna, como era', () => {
    const { container } = render(
      <LinhaDoTempo {...props} agendamentos={[agendamento({ id: '1', time: '09:00:00' })]} />,
    );

    expect(container.querySelector('[aria-label="Camila Rocha"]')).toHaveClass('bg-brand-text/15');
  });

  it('risca o agendamento cancelado e não mostra chip de status', () => {
    render(
      <LinhaDoTempo {...props} agendamentos={[agendamento({ id: '1', time: '09:00:00', status: 'cancelado' })]} />,
    );
    expect(screen.getByText('Mariana Souza')).toHaveClass('line-through');
    expect(screen.queryByText('Confirmado')).not.toBeInTheDocument();
  });

  it('diminui serviço e preço do cancelado, como o arquivo de referência (agenda-desktop.html:499,502) — não só risca, encolhe e tira o negrito', () => {
    render(
      <LinhaDoTempo
        {...props}
        agendamentos={[agendamento({ id: '1', time: '09:00:00', status: 'cancelado', service_name: 'Corte' })]}
      />,
    );
    expect(screen.getByText('Corte')).toHaveClass('text-[11px]');
    expect(screen.getByText('R$ 110')).toHaveClass('text-[11px]');
    expect(screen.getByText('R$ 110')).not.toHaveClass('font-bold');
  });
});

describe('vagas livres respeitam duração real e almoço', () => {
  const faixa = { inicioMinutos: 9 * 60, fimMinutos: 15 * 60 } as const;

  it('a vaga começa quando o atendimento de 150 min termina', () => {
    const vagas = calcularVagasLivres([agendamento({ id: 'a1', time: '09:00:00', service_duration_minutes: 150 })], faixa as never, 30);
    expect(vagas[0]).toEqual({ inicioMinutos: 11 * 60 + 30, duracaoMinutos: 210 });
  });

  it('o almoço conta como ocupado', () => {
    const vagas = calcularVagasLivres(
      [agendamento({ id: 'a1', time: '09:00:00', service_duration_minutes: 60 })],
      faixa as never, 30, undefined, [{ inicio: 12 * 60, fim: 13 * 60 }],
    );
    expect(vagas).toEqual([
      { inicioMinutos: 10 * 60, duracaoMinutos: 120 },
      { inicioMinutos: 13 * 60, duracaoMinutos: 120 },
    ]);
  });
});

// O brief pedia '23:30 às 02:00', mas faixaHorariaTexto escreve com o travessão do Stitch
// (44833f: "13:30 – 15:00"); o que muda aqui é só a volta para 00h depois da meia-noite.
it('faixa horária que passa da meia-noite volta para 00h', () => {
  expect(faixaHorariaTexto(23 * 60 + 30, 150)).toBe('23:30 – 02:00');
});

describe('LinhaDoTempo: almoço da profissional', () => {
  it('desenha o almoço e não oferece horário livre em cima dele', () => {
    render(
      <LinhaDoTempo
        duracaoPadraoMinutos={30}
        actionLoading={null}
        onAcao={vi.fn()}
        onNovoAgendamento={vi.fn()}
        intervalos={{ p1: { inicio: '12:00', fim: '13:00' } }}
        agendamentos={[agendamento({ id: 'a1', time: '08:00:00', service_duration_minutes: 60 })]}
      />,
    );
    expect(screen.getByText('Almoço')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Novo agendamento: 09:00, 3h livre' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Novo agendamento: 13:00, 7h livre' })).toBeInTheDocument();
  });
});
