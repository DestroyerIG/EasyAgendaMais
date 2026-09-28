import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ToastProvider } from '@/components/Toast';
import { AVISO_RECURSO_A_CAMINHO } from '@/components/ui';
import { conteudoDemo } from '@/lib/conteudoDemo';
import {
  PainelDetalhesAgendamento,
  agendadoEmTexto,
  faixaDoAtendimento,
  linkWhatsapp,
  numeroDoAgendamento,
  repartirValor,
} from '../PainelDetalhesAgendamento';
import type { Appointment } from '@/types';

const agendamento = (partes: Partial<Appointment> = {}): Appointment => ({
  id: '3f1c9a2b-7d40-4e11-9b8c-000000ab12cd',
  business_id: 'b1',
  client_id: 'c1',
  professional_id: 'p1',
  service_id: 's1',
  date: '2026-09-17T00:00:00',
  time: '10:00:00',
  status: 'confirmado',
  reminder_sent: true,
  created_at: '2026-09-14T21:14:00',
  client_name: 'Rafaela Diniz',
  client_phone: '83996542210',
  professional_name: 'Camila Rocha',
  service_name: 'Atendimento completo',
  service_price: 180,
  ...partes,
});

const abrir = (partes: Partial<Appointment> = {}, extras: { duracaoMinutos?: number } = {}) => {
  const onStatusChange = vi.fn();
  render(
    <ToastProvider>
      <PainelDetalhesAgendamento
        agendamento={agendamento(partes)}
        duracaoMinutos={extras.duracaoMinutos ?? 150}
        actionLoading={null}
        onFechar={vi.fn()}
        onStatusChange={onStatusChange}
      />
    </ToastProvider>,
  );
  return { onStatusChange };
};

describe('numeroDoAgendamento', () => {
  it('são os últimos 4 caracteres do id real, em maiúsculas', () => {
    expect(numeroDoAgendamento('3f1c9a2b-7d40-4e11-9b8c-000000ab12cd')).toBe('12CD');
    expect(numeroDoAgendamento('ab')).toBe('AB');
    expect(numeroDoAgendamento('')).toBe('');
  });
});

describe('faixaDoAtendimento', () => {
  it('o fim é o início mais a duração', () => {
    expect(faixaDoAtendimento('10:00:00', 150)).toBe('10:00 às 12:30');
    expect(faixaDoAtendimento('09:30:00', 60)).toBe('09:30 às 10:30');
    expect(faixaDoAtendimento('08:15:00', 90)).toBe('08:15 às 09:45');
  });
});

describe('repartirValor', () => {
  it('sinal e valor a pagar somam sempre o preço real', () => {
    expect(repartirValor(180, 30)).toEqual({ sinal: 30, aPagar: 150 });
    // Serviço mais barato que o sinal de exemplo: o sinal encolhe e nada sobra a pagar.
    expect(repartirValor(20, 30)).toEqual({ sinal: 20, aPagar: 0 });
    expect(repartirValor(0, 30)).toEqual({ sinal: 0, aPagar: 0 });
    for (const preco of [0, 20, 30, 180, 999]) {
      const { sinal, aPagar } = repartirValor(preco, 30);
      expect(sinal + aPagar).toBe(preco);
      expect(sinal).toBeLessThanOrEqual(preco);
    }
  });
});

describe('agendadoEmTexto e linkWhatsapp', () => {
  it('o "agendado em" sai do created_at do registro', () => {
    expect(agendadoEmTexto('2026-09-14T21:14:00')).toBe('Agendado em 14/09 às 21:14');
    expect(agendadoEmTexto('nada')).toBeNull();
  });

  it('o link do WhatsApp só existe com um número brasileiro completo', () => {
    expect(linkWhatsapp('83996542210')).toBe('https://wa.me/5583996542210');
    expect(linkWhatsapp('8332211')).toBeNull();
    expect(linkWhatsapp(undefined)).toBeNull();
  });
});

describe('PainelDetalhesAgendamento', () => {
  it('mostra o número do registro, o cliente, o horário com a duração e o profissional', () => {
    abrir();

    expect(screen.getByText('Agendamento #12CD')).toBeInTheDocument();
    expect(screen.getByText('Rafaela Diniz')).toBeInTheDocument();
    expect(screen.getByText('(83) 99654-2210')).toBeInTheDocument();
    expect(screen.getByText('10:00 às 12:30 (Duração estimada: 2h30)')).toBeInTheDocument();
    expect(screen.getByText('Quinta, 17 de setembro de 2026')).toBeInTheDocument();
    expect(screen.getByText('Camila Rocha')).toBeInTheDocument();
    expect(screen.getByText('Profissional responsável')).toBeInTheDocument();
    expect(screen.getByText('Agendado em 14/09 às 21:14')).toBeInTheDocument();
  });

  it('o preço é o real e o sinal com o valor a pagar fecham com ele', () => {
    abrir();

    expect(screen.getByText('R$ 180,00')).toBeInTheDocument();
    expect(screen.getByText('Sinal pago R$ 30,00 via Pix')).toBeInTheDocument();
    expect(screen.getByText('R$ 150,00')).toBeInTheDocument();
  });

  it('serviço mais barato que o sinal de exemplo: o sinal encolhe e nada sobra a pagar', () => {
    abrir({ service_price: 20 });

    expect(screen.getByText('Sinal pago R$ 20,00 via Pix')).toBeInTheDocument();
    expect(screen.getByText('R$ 0,00')).toBeInTheDocument();
    expect(screen.queryByText('Sinal pago R$ 30,00 via Pix')).not.toBeInTheDocument();
  });

  it('lembrete não enviado aparece na negativa, no mesmo lugar', () => {
    abrir({ reminder_sent: false });

    expect(screen.getByText('Lembrete WhatsApp não enviado')).toBeInTheDocument();
    expect(screen.queryByText('Lembrete WhatsApp enviado')).not.toBeInTheDocument();
  });

  it('lembrete enviado aparece na afirmativa', () => {
    abrir({ reminder_sent: true });

    expect(screen.getByText('Lembrete WhatsApp enviado')).toBeInTheDocument();
  });

  it('o conteúdo de exemplo sai todo de conteudoDemo.agenda.detalhes', () => {
    abrir();
    const detalhes = conteudoDemo.agenda.detalhes;

    expect(screen.getByText(`em ${detalhes.totalVisitasAno}`)).toBeInTheDocument();
    expect(screen.getByText(detalhes.origem)).toBeInTheDocument();
    expect(screen.getByText(`“${detalhes.observacoes}”`)).toBeInTheDocument();
    expect(screen.getByText(`Última: ${detalhes.ultimaVisitaResumo}`)).toBeInTheDocument();
  });

  it('concluir e cancelar chamam o handler existente com o status certo', async () => {
    const { onStatusChange } = abrir();

    await userEvent.click(screen.getByRole('button', { name: /Concluir atendimento/ }));
    expect(onStatusChange).toHaveBeenCalledWith('3f1c9a2b-7d40-4e11-9b8c-000000ab12cd', 'concluido');

    await userEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(onStatusChange).toHaveBeenCalledWith('3f1c9a2b-7d40-4e11-9b8c-000000ab12cd', 'cancelado');
    expect(onStatusChange).toHaveBeenCalledTimes(2);
  });

  it('num agendamento já concluído as duas ações de status ficam indisponíveis', () => {
    abrir({ status: 'concluido' });

    expect(screen.getByRole('button', { name: /Concluir atendimento/ })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Cancelar' })).toBeDisabled();
  });

  it('confirmar, remarcar e cliente faltou mostram o aviso e não chamam handler nenhum', async () => {
    const { onStatusChange } = abrir();

    for (const nome of ['Confirmar', 'Remarcar', 'Cliente faltou']) {
      await userEvent.click(screen.getByRole('button', { name: nome }));
      expect(screen.getAllByText(AVISO_RECURSO_A_CAMINHO).length).toBeGreaterThan(0);
    }

    expect(onStatusChange).not.toHaveBeenCalled();
  });

  it('fechado, não mostra nada do agendamento', () => {
    render(
      <ToastProvider>
        <PainelDetalhesAgendamento
          agendamento={null}
          duracaoMinutos={150}
          actionLoading={null}
          onFechar={vi.fn()}
          onStatusChange={vi.fn()}
        />
      </ToastProvider>,
    );

    expect(screen.queryByText('Detalhes da Sessão')).not.toBeInTheDocument();
  });
});
