import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { AgendamentoHoje } from '@/lib/hoje';
import { ProximasDuasHoras } from '../ProximasDuasHoras';

const agendamento = (parcial: Partial<AgendamentoHoje> & { id: string }): AgendamentoHoje => ({
  date: '2026-10-13', time: '10:00:00', status: 'confirmado',
  client_name: `Cliente ${parcial.id}`, client_phone: null, professional_name: 'Rita',
  service_name: 'Corte', service_price: 120, service_duration_minutes: 60, source: 'painel',
  deposit_amount: null, started_at: null, comanda_id: null, comanda_status: null,
  comanda_number: null, comanda_total_charged: null, comanda_deposit_applied: null,
  ...parcial,
});

const linhaDe = (nome: string) => screen.getByText(nome).closest('div.rounded-xl') as HTMLElement;

describe('ProximasDuasHoras: situação do pagamento', () => {
  it('com sinal pago mostra "Sinal pago R$ X" e não "Pagar no local"', () => {
    render(
      <ProximasDuasHoras
        agendamentos={[
          agendamento({ id: 'a', status: 'confirmado', deposit_amount: 30 }),
          agendamento({ id: 'b', status: 'em_atendimento', deposit_amount: 40.5 }),
          agendamento({ id: 'c', status: 'concluido', deposit_amount: 25 }),
        ]}
      />,
    );
    expect(linhaDe('Cliente a')).toHaveTextContent('Sinal pago R$ 30');
    expect(linhaDe('Cliente b')).toHaveTextContent('Sinal pago R$ 40,50');
    expect(linhaDe('Cliente c')).toHaveTextContent('Sinal pago R$ 25');
    expect(screen.queryByText('Pagar no local')).not.toBeInTheDocument();
  });

  it('reserva aguardando o Pix mostra "Aguardando Pix"', () => {
    render(<ProximasDuasHoras agendamentos={[agendamento({ id: 'a', status: 'aguardando_pagamento', deposit_amount: 30 })]} />);
    // O chip de status também diz "Aguardando Pix"; a linha do pagamento não pode dizer "Pagar no local".
    expect(linhaDe('Cliente a')).toHaveTextContent('Aguardando Pix');
    expect(linhaDe('Cliente a')).not.toHaveTextContent('Pagar no local');
    expect(screen.queryByText(/Sinal pago/)).not.toBeInTheDocument();
  });

  it('sem sinal: "Pagar no local" só para confirmado/em atendimento; nada para concluído', () => {
    render(
      <ProximasDuasHoras
        agendamentos={[
          agendamento({ id: 'a', status: 'confirmado' }),
          agendamento({ id: 'b', status: 'em_atendimento', deposit_amount: 0 }),
          agendamento({ id: 'c', status: 'concluido' }),
        ]}
      />,
    );
    expect(linhaDe('Cliente a')).toHaveTextContent('Pagar no local');
    expect(linhaDe('Cliente b')).toHaveTextContent('Pagar no local');
    expect(linhaDe('Cliente c')).not.toHaveTextContent('Pagar no local');
    expect(linhaDe('Cliente c')).not.toHaveTextContent(/Sinal pago|Aguardando Pix/);
  });
});
