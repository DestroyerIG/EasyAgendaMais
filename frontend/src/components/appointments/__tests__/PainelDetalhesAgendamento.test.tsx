import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ToastProvider } from '@/components/Toast';
import { AVISO_RECURSO_A_CAMINHO } from '@/components/ui';
import { conteudoDemo } from '@/lib/conteudoDemo';
import {
  MEDIA_COMPUTADOR,
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

  it('faixa que passa da meia-noite volta para 00h', () => {
    expect(faixaDoAtendimento('23:30', 150)).toBe('23:30 às 02:00');
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
      // Sem estas duas, repartirValor(20, 30) devolveria {sinal: 30, aPagar: -10}: a
      // soma ainda fecharia em 20, mas aPagar negativo e sinal maior que o preço são as
      // duas formas de essa conta mentir sem quebrar a soma sozinha.
      expect(aPagar).toBeGreaterThanOrEqual(0);
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

  it('sem preço de serviço não há sinal pago para afirmar, então o bloco do Pix some', () => {
    abrir({ service_price: undefined });

    expect(screen.queryByText(/Sinal pago/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Comp\./)).not.toBeInTheDocument();
    expect(screen.queryByText('Valor a pagar no estúdio')).not.toBeInTheDocument();
  });

  it('preço de serviço zerado tem o mesmo resultado: nenhum sinal a mostrar', () => {
    abrir({ service_price: 0 });

    expect(screen.queryByText(/Sinal pago/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Comp\./)).not.toBeInTheDocument();
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

  it('o conteúdo de exemplo sai de conteudoDemo.agenda.detalhes', () => {
    abrir();
    const detalhes = conteudoDemo.agenda.detalhes;

    expect(screen.getByText(detalhes.origem)).toBeInTheDocument();
  });

  it('não mostra “Observações da Cliente” fabricadas (achado da varredura: texto fixo idêntico para qualquer cliente, contradizendo client.notes real na Ficha da Cliente)', () => {
    abrir();
    expect(screen.queryByText('Observações da Cliente')).not.toBeInTheDocument();
  });

  it('não mostra selo de cliente recorrente nem números de ciclo médio/total de visitas (N1: era um booleano fixo, sempre true)', () => {
    abrir();
    expect(screen.queryByText('Cliente Recorrente')).not.toBeInTheDocument();
    expect(screen.queryByText('Ciclo médio')).not.toBeInTheDocument();
    expect(screen.queryByText('Total de visitas')).not.toBeInTheDocument();
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

  it('remarcar e cliente faltou mostram o aviso e não chamam handler nenhum', async () => {
    const { onStatusChange } = abrir();

    for (const nome of ['Remarcar', 'Cliente faltou']) {
      await userEvent.click(screen.getByRole('button', { name: nome }));
      expect(screen.getAllByText(AVISO_RECURSO_A_CAMINHO).length).toBeGreaterThan(0);
    }

    expect(onStatusChange).not.toHaveBeenCalled();
  });

  it('num agendamento já confirmado, Confirmar fica indisponível (não há volta para confirmado)', () => {
    abrir({ status: 'confirmado' });
    expect(screen.getByRole('button', { name: 'Confirmar' })).toBeDisabled();
  });

  it('numa reserva aguardando pagamento, Confirmar chama o handler com "confirmado" e Cancelar fica disponível', async () => {
    const { onStatusChange } = abrir({ status: 'aguardando_pagamento' });

    expect(screen.getByRole('button', { name: /Concluir atendimento/ })).toBeDisabled();

    await userEvent.click(screen.getByRole('button', { name: 'Confirmar recebimento do Pix' }));
    expect(onStatusChange).toHaveBeenCalledWith('3f1c9a2b-7d40-4e11-9b8c-000000ab12cd', 'confirmado');

    await userEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(onStatusChange).toHaveBeenCalledWith('3f1c9a2b-7d40-4e11-9b8c-000000ab12cd', 'cancelado');
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

/**
 * `vitest.setup.ts` devolve `matches: false` para toda consulta de mídia — é o que os
 * outros testes deste arquivo herdam sem saber, e por isso eles só provam o ramo de
 * celular. Aqui sobrescrevemos `window.matchMedia` dentro do teste (e restauramos depois)
 * para os dois ramos de fato existirem em algum teste.
 */
describe('largura do painel por tamanho de tela', () => {
  const definirMatchMedia = (bateComputador: boolean) => {
    const original = window.matchMedia;
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: vi.fn().mockImplementation((query: string) => ({
        matches: query === MEDIA_COMPUTADOR ? bateComputador : false,
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    });
    return () => {
      Object.defineProperty(window, 'matchMedia', { writable: true, value: original });
    };
  };

  it('no computador, abre à direita com os 440px de agendamento-detalhes.html', () => {
    const restaurar = definirMatchMedia(true);
    try {
      abrir();
      const dialogo = screen.getByRole('dialog', { name: 'Detalhes da Sessão' });
      expect(dialogo).toHaveClass('sm:max-w-[440px]');
      expect(dialogo).toHaveClass('right-0');
      expect(dialogo).not.toHaveClass('bottom-0');
      expect(dialogo).not.toHaveClass('sm:max-w-[480px]');
    } finally {
      restaurar();
    }
  });

  it('no celular, abre como folha de baixo, sem a classe de 440px', () => {
    const restaurar = definirMatchMedia(false);
    try {
      abrir();
      const dialogo = screen.getByRole('dialog', { name: 'Detalhes da Sessão' });
      expect(dialogo).toHaveClass('bottom-0');
      expect(dialogo).not.toHaveClass('right-0');
      expect(dialogo).not.toHaveClass('sm:max-w-[440px]');
    } finally {
      restaurar();
    }
  });
});
