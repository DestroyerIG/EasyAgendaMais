import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  ABERTURA_ARRASTE,
  AppointmentCard,
  CorpoCartaoAgendamento,
  LIMITE_ARRASTE,
  LIMITE_CLIQUE,
  ehClique,
  encaixarArraste,
} from '../AppointmentCard';
import type { Appointment } from '@/types';

const agendamento = (partes: Partial<Appointment> = {}): Appointment => ({
  id: 'a1',
  business_id: 'b1',
  client_id: 'c1',
  professional_id: 'p1',
  service_id: 's1',
  date: '2026-09-17T00:00:00',
  time: '10:00:00',
  status: 'confirmado',
  reminder_sent: false,
  created_at: '2026-09-14T00:00:00',
  client_name: 'Mariana Souza',
  professional_name: 'Camila Rocha',
  service_name: 'Alongamento em Gel',
  service_price: 180,
  ...partes,
});

const props = { actionLoading: null, duracaoMinutos: 60, onStatusChange: vi.fn() };

describe('encaixarArraste', () => {
  it('passando da virada, prende aberto no lado do gesto', () => {
    expect(encaixarArraste(90)).toBe(ABERTURA_ARRASTE);
    expect(encaixarArraste(-90)).toBe(-ABERTURA_ARRASTE);
  });

  it('antes da virada, volta ao lugar', () => {
    expect(encaixarArraste(40)).toBe(0);
    expect(encaixarArraste(-40)).toBe(0);
    expect(encaixarArraste(0)).toBe(0);
  });
});

describe('AppointmentCard', () => {
  it('mostra horário, duração, cliente, valor, serviço, profissional e status', () => {
    render(<AppointmentCard {...props} appointment={agendamento()} />);

    expect(screen.getByText('10:00')).toBeInTheDocument();
    expect(screen.getByText('60 min')).toBeInTheDocument();
    expect(screen.getByText('Mariana Souza')).toBeInTheDocument();
    expect(screen.getByText('R$ 180')).toBeInTheDocument();
    expect(screen.getByText('Alongamento em Gel')).toBeInTheDocument();
    expect(screen.getByText('Camila Rocha')).toBeInTheDocument();
    expect(screen.getByText('Confirmado')).toBeInTheDocument();
  });

  it('as duas ações do gesto são botões de verdade e chamam o handler existente', async () => {
    const onStatusChange = vi.fn();
    render(<AppointmentCard {...props} onStatusChange={onStatusChange} appointment={agendamento()} />);

    await userEvent.click(screen.getByRole('button', { name: 'Concluir atendimento de Mariana Souza' }));
    expect(onStatusChange).toHaveBeenCalledWith('a1', 'concluido');

    await userEvent.click(screen.getByRole('button', { name: 'Cancelar agendamento de Mariana Souza' }));
    expect(onStatusChange).toHaveBeenCalledWith('a1', 'cancelado');
  });

  it('foco no teclado abre o cartão do lado da ação em foco', async () => {
    render(<AppointmentCard {...props} appointment={agendamento()} />);
    const frente = screen.getByText('Mariana Souza').closest('div[style]') as HTMLElement;
    expect(frente.style.transform).toBe('translateX(0px)');

    await userEvent.tab();
    expect(screen.getByRole('button', { name: /Concluir atendimento/ })).toHaveFocus();
    expect(frente.style.transform).toBe(`translateX(${ABERTURA_ARRASTE}px)`);

    await userEvent.tab();
    expect(screen.getByRole('button', { name: /Cancelar agendamento/ })).toHaveFocus();
    expect(frente.style.transform).toBe(`translateX(${-ABERTURA_ARRASTE}px)`);
  });

  it('arrastar move o cartão e soltar depois da virada o deixa aberto', () => {
    render(<AppointmentCard {...props} appointment={agendamento()} />);
    const frente = screen.getByText('Mariana Souza').closest('div[style]') as HTMLElement;

    fireEvent.pointerDown(frente, { clientX: 0, pointerId: 1 });
    fireEvent.pointerMove(frente, { clientX: 70, pointerId: 1 });
    expect(frente.style.transform).toBe('translateX(70px)');

    fireEvent.pointerUp(frente, { clientX: 70, pointerId: 1 });
    expect(frente.style.transform).toBe(`translateX(${ABERTURA_ARRASTE}px)`);
  });

  it('o arrasto não passa do limite do arquivo de referência', () => {
    render(<AppointmentCard {...props} appointment={agendamento()} />);
    const frente = screen.getByText('Mariana Souza').closest('div[style]') as HTMLElement;

    fireEvent.pointerDown(frente, { clientX: 0, pointerId: 1 });
    fireEvent.pointerMove(frente, { clientX: 400, pointerId: 1 });
    expect(frente.style.transform).toBe(`translateX(${LIMITE_ARRASTE}px)`);
  });

  it('soltar antes da virada volta o cartão ao lugar', () => {
    render(<AppointmentCard {...props} appointment={agendamento()} />);
    const frente = screen.getByText('Mariana Souza').closest('div[style]') as HTMLElement;

    fireEvent.pointerDown(frente, { clientX: 0, pointerId: 1 });
    fireEvent.pointerMove(frente, { clientX: 30, pointerId: 1 });
    fireEvent.pointerUp(frente, { clientX: 30, pointerId: 1 });
    expect(frente.style.transform).toBe('translateX(0px)');
  });

  it('agendamento sem transição de status não tem gesto nem ações', () => {
    render(<AppointmentCard {...props} appointment={agendamento({ status: 'concluido' })} />);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();

    const frente = screen.getByText('Mariana Souza').closest('div[style]') as HTMLElement;
    fireEvent.pointerDown(frente, { clientX: 0, pointerId: 1 });
    fireEvent.pointerMove(frente, { clientX: 90, pointerId: 1 });
    expect(frente.style.transform).toBe('translateX(0px)');
  });

  it('o chip de status traz o ponto na cor do status (agenda-mobile.html)', () => {
    render(<AppointmentCard {...props} appointment={agendamento()} />);
    const chip = screen.getByText('Confirmado');
    // O ponto é decorativo: só existe como elemento dentro do chip, sem texto próprio.
    const ponto = chip.querySelector('span');
    expect(ponto).not.toBeNull();
    expect(ponto).toHaveClass('bg-status-confirmed');
  });

  it('o chip de status usa o padding do arquivo de referência (agenda-mobile.html:146, "2px 8px" ao vivo)', () => {
    render(<AppointmentCard {...props} appointment={agendamento()} />);
    expect(screen.getByText('Confirmado')).toHaveClass('px-2');
  });

  it('desabilita as ações enquanto a mudança de status está em voo', () => {
    render(<AppointmentCard {...props} actionLoading="a1" appointment={agendamento()} />);
    expect(screen.getByRole('button', { name: /Concluir atendimento/ })).toBeDisabled();
    expect(screen.getByRole('button', { name: /Cancelar agendamento/ })).toBeDisabled();
  });
});

describe('AppointmentCard: abrir o painel de detalhes', () => {
  const frenteDo = () => screen.getByText('Mariana Souza').closest('div[style]') as HTMLElement;

  it('ehClique aceita só o toque parado', () => {
    expect(ehClique(0, 0)).toBe(true);
    expect(ehClique(LIMITE_CLIQUE, -LIMITE_CLIQUE)).toBe(true);
    expect(ehClique(LIMITE_CLIQUE + 1, 0)).toBe(false);
    expect(ehClique(0, -(LIMITE_CLIQUE + 1))).toBe(false);
  });

  it('toque parado no corpo do cartão abre o painel', () => {
    const onAbrirDetalhes = vi.fn();
    render(<AppointmentCard {...props} appointment={agendamento()} onAbrirDetalhes={onAbrirDetalhes} />);
    const frente = frenteDo();

    fireEvent.pointerDown(frente, { clientX: 10, clientY: 10, pointerId: 1 });
    fireEvent.pointerUp(frente, { clientX: 12, clientY: 11, pointerId: 1 });

    expect(onAbrirDetalhes).toHaveBeenCalledTimes(1);
    expect(onAbrirDetalhes).toHaveBeenCalledWith(expect.objectContaining({ id: 'a1' }));
  });

  it('arrastar o cartão não abre o painel', () => {
    const onAbrirDetalhes = vi.fn();
    render(<AppointmentCard {...props} appointment={agendamento()} onAbrirDetalhes={onAbrirDetalhes} />);
    const frente = frenteDo();

    fireEvent.pointerDown(frente, { clientX: 10, clientY: 10, pointerId: 1 });
    fireEvent.pointerMove(frente, { clientX: 90, clientY: 12, pointerId: 1 });
    fireEvent.pointerUp(frente, { clientX: 90, clientY: 12, pointerId: 1 });

    expect(onAbrirDetalhes).not.toHaveBeenCalled();
    // E o gesto continua funcionando: o cartão ficou aberto no lado do arrasto.
    expect(frente.style.transform).toBe(`translateX(${ABERTURA_ARRASTE}px)`);
  });

  it('o cartão sem transição de status também abre o painel', () => {
    const onAbrirDetalhes = vi.fn();
    render(
      <AppointmentCard
        {...props}
        appointment={agendamento({ status: 'concluido' })}
        onAbrirDetalhes={onAbrirDetalhes}
      />,
    );
    const frente = frenteDo();

    fireEvent.pointerDown(frente, { clientX: 10, clientY: 10, pointerId: 1 });
    fireEvent.pointerUp(frente, { clientX: 10, clientY: 10, pointerId: 1 });

    expect(onAbrirDetalhes).toHaveBeenCalledTimes(1);
  });

  it('mostra o link de WhatsApp só em agendamentos confirmados com telefone válido (agenda-mobile.html)', () => {
    const { rerender } = render(
      <AppointmentCard {...props} appointment={agendamento({ client_phone: '11987654321' })} />,
    );
    expect(screen.getByRole('link', { name: 'Notificar Mariana Souza via WhatsApp' })).toHaveAttribute(
      'href',
      'https://wa.me/5511987654321',
    );

    rerender(<AppointmentCard {...props} appointment={agendamento({ client_phone: '123' })} />);
    expect(screen.queryByRole('link', { name: /Notificar/ })).not.toBeInTheDocument();

    rerender(
      <AppointmentCard
        {...props}
        appointment={agendamento({ client_phone: '11987654321', status: 'concluido' })}
      />,
    );
    expect(screen.queryByRole('link', { name: /Notificar/ })).not.toBeInTheDocument();
  });

  it('tocar no link de WhatsApp não abre o painel de detalhes', () => {
    const onAbrirDetalhes = vi.fn();
    render(
      <AppointmentCard
        {...props}
        appointment={agendamento({ client_phone: '11987654321' })}
        onAbrirDetalhes={onAbrirDetalhes}
      />,
    );
    const link = screen.getByRole('link', { name: /Notificar/ });

    fireEvent.pointerDown(link, { clientX: 10, clientY: 10, pointerId: 1 });
    fireEvent.pointerUp(link, { clientX: 10, clientY: 10, pointerId: 1 });

    expect(onAbrirDetalhes).not.toHaveBeenCalled();
  });

  it('o corpo do cartão vira alvo de teclado só quando há painel para abrir', async () => {
    const onAbrirDetalhes = vi.fn();
    const { unmount } = render(<AppointmentCard {...props} appointment={agendamento()} />);
    expect(screen.queryByRole('button', { name: /Ver detalhes/ })).not.toBeInTheDocument();
    unmount();

    render(<AppointmentCard {...props} appointment={agendamento()} onAbrirDetalhes={onAbrirDetalhes} />);
    const alvo = screen.getByRole('button', { name: 'Ver detalhes do agendamento de Mariana Souza' });
    alvo.focus();
    await userEvent.keyboard('{Enter}');
    expect(onAbrirDetalhes).toHaveBeenCalledTimes(1);
  });
});

describe('CorpoCartaoAgendamento fora da Agenda', () => {
  it('sem as opções da Agenda fica como a tela sem referência já era: "1h" e chip liso', () => {
    render(<CorpoCartaoAgendamento appointment={agendamento()} duracaoMinutos={60} />);

    expect(screen.getByText('1h')).toBeInTheDocument();
    expect(screen.queryByText('60 min')).not.toBeInTheDocument();
    expect(screen.getByText('Confirmado').querySelector('span')).toBeNull();
  });

  it('com as opções da Agenda escreve a duração em minutos e põe o ponto', () => {
    render(
      <CorpoCartaoAgendamento appointment={agendamento()} duracaoMinutos={60} duracaoEmMinutos comPontoDeStatus />,
    );

    expect(screen.getByText('60 min')).toBeInTheDocument();
    expect(screen.queryByText('1h')).not.toBeInTheDocument();
    expect(screen.getByText('Confirmado').querySelector('span')).not.toBeNull();
  });

  it('mostrarDuracaoEPreco={false} e mostrarNomeProfissional={false} restauram a base (aed10f1): sem duração, preço ou profissional (I9)', () => {
    render(
      <CorpoCartaoAgendamento
        appointment={agendamento()}
        duracaoMinutos={60}
        mostrarDuracaoEPreco={false}
        mostrarNomeProfissional={false}
      />,
    );

    expect(screen.queryByText('1h')).not.toBeInTheDocument();
    expect(screen.queryByText('60 min')).not.toBeInTheDocument();
    expect(screen.queryByText('R$ 180')).not.toBeInTheDocument();
    expect(screen.queryByText('Camila Rocha')).not.toBeInTheDocument();
    expect(screen.getByText('10:00')).toBeInTheDocument();
    expect(screen.getByText('Mariana Souza')).toBeInTheDocument();
    expect(screen.getByText('Alongamento em Gel')).toBeInTheDocument();
    expect(screen.getByText('Confirmado')).toBeInTheDocument();
  });
});
