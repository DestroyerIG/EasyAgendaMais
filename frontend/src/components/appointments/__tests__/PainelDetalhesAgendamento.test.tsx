import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ToastProvider } from '@/components/Toast';
import { buscarDetalhesAgendamento, reenviarComprovante } from '@/lib/comanda';
import {
  MEDIA_COMPUTADOR,
  PainelDetalhesAgendamento,
  faixaDoAtendimento,
  linkWhatsapp,
  numeroDoAgendamento,
} from '../PainelDetalhesAgendamento';
import type { Appointment } from '@/types';

vi.mock('@/lib/comanda', async (orig) => ({
  ...(await orig<typeof import('@/lib/comanda')>()),
  buscarDetalhesAgendamento: vi.fn(), reenviarComprovante: vi.fn(),
}));

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
  service_duration_minutes: 150,
  source: 'painel',
  deposit_amount: 0,
  ...partes,
});

const detalhes = (over = {}) => ({
  appointment: agendamento(),
  client_stats: { visits_this_year: 8, average_cycle_days: 21, last_visit_days_ago: 19, last_visit_professional: 'Camila Rocha', is_recurring: true },
  client_notes: 'Sensível a primer ácido',
  ...over,
});

const abrir = (partes: Partial<Appointment> = {}) => {
  const onAcao = vi.fn();
  const onRemarcar = vi.fn();
  const onConfirmarPix = vi.fn();
  render(
    <ToastProvider>
      <PainelDetalhesAgendamento
        agendamento={agendamento(partes)}
        actionLoading={null}
        onFechar={vi.fn()}
        onAcao={onAcao}
        onRemarcar={onRemarcar}
        onConfirmarPix={onConfirmarPix}
      />
    </ToastProvider>,
  );
  return { onAcao, onRemarcar, onConfirmarPix };
};

beforeEach(() => {
  vi.mocked(buscarDetalhesAgendamento).mockReset();
  vi.mocked(buscarDetalhesAgendamento).mockResolvedValue(detalhes());
  vi.mocked(reenviarComprovante).mockReset();
});

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

describe('linkWhatsapp', () => {
  it('o link do WhatsApp só existe com um número brasileiro completo', () => {
    expect(linkWhatsapp('83996542210')).toBe('https://wa.me/5583996542210');
    expect(linkWhatsapp('8332211')).toBeNull();
    expect(linkWhatsapp(undefined)).toBeNull();
  });
});

describe('PainelDetalhesAgendamento', () => {
  it('cabeçalho, cliente, serviço, profissional e horário com a duração real', async () => {
    abrir();

    expect(screen.getByText('Agendamento #12CD')).toBeInTheDocument();
    expect(screen.getByText('Detalhes da sessão')).toBeInTheDocument();
    expect(screen.getByText('Rafaela Diniz')).toBeInTheDocument();
    expect(screen.getByText('(83) 99654-2210')).toBeInTheDocument();
    expect(screen.getByText('Atendimento completo')).toBeInTheDocument();
    expect(screen.getByText('Camila Rocha')).toBeInTheDocument();
    expect(screen.getByText('Quinta, 17 de setembro de 2026 · 10:00 às 12:30 (2h30)')).toBeInTheDocument();
    expect(screen.getByText(/Agendado no painel/)).toBeInTheDocument();
    await screen.findByText('21');
  });

  it('com comanda, o número do cabeçalho é o da comanda', async () => {
    abrir({ comanda_id: 'k1', comanda_status: 'rascunho', comanda_number: 1042, status: 'em_atendimento' });
    expect(screen.getByText('Agendamento #1042')).toBeInTheDocument();
    await screen.findByText('21');
  });

  it('mostra ciclo médio, visitas do ano e última visita reais', async () => {
    vi.mocked(buscarDetalhesAgendamento).mockResolvedValue(detalhes());
    abrir();
    expect(await screen.findByText('21')).toBeInTheDocument();
    expect(screen.getByText(new RegExp(`8 em ${new Date().getFullYear()}`))).toBeInTheDocument();
    expect(screen.getByText('Última há 19 dias com Camila Rocha')).toBeInTheDocument();
    expect(screen.getByText('Cliente recorrente')).toBeInTheDocument();
    expect(screen.getByText('Ciclo regular')).toBeInTheDocument();
    expect(buscarDetalhesAgendamento).toHaveBeenCalledWith('3f1c9a2b-7d40-4e11-9b8c-000000ab12cd');
  });

  it('com menos de 3 visitas no ano, sem o selo de ciclo regular', async () => {
    vi.mocked(buscarDetalhesAgendamento).mockResolvedValue(detalhes({ client_stats: { visits_this_year: 2, average_cycle_days: 30, last_visit_days_ago: 30, last_visit_professional: 'Camila Rocha', is_recurring: false } }));
    abrir();
    expect(await screen.findByText('30')).toBeInTheDocument();
    expect(screen.queryByText('Ciclo regular')).not.toBeInTheDocument();
  });

  it('cliente sem histórico mostra primeira visita', async () => {
    vi.mocked(buscarDetalhesAgendamento).mockResolvedValue(detalhes({ client_stats: { visits_this_year: 0, average_cycle_days: null, last_visit_days_ago: null, last_visit_professional: null, is_recurring: false } }));
    abrir();
    expect(await screen.findByText('Primeira visita')).toBeInTheDocument();
    expect(screen.getByText('Ainda não há atendimentos concluídos desta cliente')).toBeInTheDocument();
    expect(screen.queryByText('Cliente recorrente')).not.toBeInTheDocument();
  });

  it('enquanto carrega, mostra o esqueleto dos dados da cliente', () => {
    vi.mocked(buscarDetalhesAgendamento).mockReturnValue(new Promise(() => {}));
    abrir();
    expect(screen.getByText('Carregando histórico da cliente')).toBeInTheDocument();
    expect(screen.queryByText('Ciclo médio')).not.toBeInTheDocument();
  });

  it('erro ao carregar: toast e os blocos da cliente somem, o resto fica', async () => {
    vi.mocked(buscarDetalhesAgendamento).mockRejectedValue(new Error('falhou'));
    abrir();
    expect(await screen.findByText('Não foi possível carregar o histórico da cliente')).toBeInTheDocument();
    expect(screen.queryByText('Ciclo médio')).not.toBeInTheDocument();
    expect(screen.queryByText('Observações da ficha técnica')).not.toBeInTheDocument();
    expect(screen.getByText('Atendimento completo')).toBeInTheDocument();
  });

  it('observações da ficha técnica aparecem com o texto real', async () => {
    abrir();
    expect(await screen.findByText('Observações da ficha técnica')).toBeInTheDocument();
    expect(screen.getByText('Sensível a primer ácido')).toBeInTheDocument();
  });

  it('observações da ficha técnica só aparecem quando existem', async () => {
    vi.mocked(buscarDetalhesAgendamento).mockResolvedValue(detalhes({ client_notes: null }));
    abrir();
    await screen.findByText('Detalhes da sessão');
    await waitFor(() => expect(screen.queryByText('Observações da ficha técnica')).not.toBeInTheDocument());
  });

  it('sinal real e restante no balcão', async () => {
    vi.mocked(buscarDetalhesAgendamento).mockResolvedValue(detalhes());
    abrir({ deposit_amount: 30, source: 'publico', service_price: 180 });
    expect(await screen.findByText(/Sinal pago R\$ 30,00 via Pix/)).toBeInTheDocument();
    expect(screen.getByText('R$ 150,00')).toBeInTheDocument();
    expect(screen.getByText(/Página pública \(link da bio\)/)).toBeInTheDocument();
  });

  it('sem sinal, não afirma sinal pago e o restante é o valor total', async () => {
    abrir({ deposit_amount: 0 });
    await screen.findByText('21');
    expect(screen.queryByText(/Sinal pago/)).not.toBeInTheDocument();
    expect(screen.getAllByText('R$ 180,00')).toHaveLength(2);
  });

  it('aguardando o Pix, o sinal não aparece como pago', async () => {
    abrir({ status: 'aguardando_pagamento', deposit_amount: 30, source: 'publico' });
    await screen.findByText('21');
    expect(screen.queryByText(/Sinal pago/)).not.toBeInTheDocument();
  });

  it('reserva cancelada por expirar não afirma sinal pago nem restante', async () => {
    abrir({ status: 'cancelado', deposit_amount: 30, source: 'publico' });
    await screen.findByText('21');
    expect(screen.queryByText(/Sinal pago/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Restante no balcão/)).not.toBeInTheDocument();
  });

  it('cliente faltou: sinal retido aparece, restante no balcão some', async () => {
    abrir({ status: 'faltou', deposit_amount: 30, source: 'publico' });
    expect(await screen.findByText(/Sinal pago R\$ 30,00 via Pix/)).toBeInTheDocument();
    expect(screen.queryByText(/Restante no balcão/)).not.toBeInTheDocument();
  });

  it('comanda fechada mostra o valor real pago, não o restante do catálogo', async () => {
    abrir({
      status: 'concluido', deposit_amount: 30, source: 'publico', service_price: 180,
      comanda_id: 'k1', comanda_status: 'fechada', comanda_number: 1042,
      comanda_total_charged: 175, comanda_deposit_applied: 30,
    });
    expect(await screen.findByText('Comanda #1042 fechada')).toBeInTheDocument();
    expect(screen.queryByText(/Restante no balcão/)).not.toBeInTheDocument();
    expect(screen.getByText('Pago:')).toBeInTheDocument();
    expect(screen.getByText('R$ 205,00')).toBeInTheDocument();
  });

  it('botões dependem do status', async () => {
    vi.mocked(buscarDetalhesAgendamento).mockResolvedValue(detalhes());
    const { onAcao } = abrir({ status: 'confirmado' });
    await userEvent.setup().click(await screen.findByRole('button', { name: 'Concluir atendimento e receber' }));
    expect(onAcao).toHaveBeenCalledWith(expect.objectContaining({ id: expect.any(String) }), 'concluir');
    expect(screen.getByRole('button', { name: 'Cliente faltou' })).toBeInTheDocument();
  });

  it('cliente faltou e cancelar disparam as ações certas; remarcar chama onRemarcar', async () => {
    const user = userEvent.setup();
    const { onAcao, onRemarcar } = abrir({ status: 'confirmado' });
    await user.click(screen.getByRole('button', { name: 'Cliente faltou' }));
    expect(onAcao).toHaveBeenLastCalledWith(expect.objectContaining({ id: '3f1c9a2b-7d40-4e11-9b8c-000000ab12cd' }), 'faltou');
    await user.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(onAcao).toHaveBeenLastCalledWith(expect.anything(), 'cancelar');
    await user.click(screen.getByRole('button', { name: 'Remarcar' }));
    expect(onRemarcar).toHaveBeenCalledWith(expect.objectContaining({ id: '3f1c9a2b-7d40-4e11-9b8c-000000ab12cd' }));
    await screen.findByText('21');
  });

  it('confirmado: iniciar atendimento dispara a ação iniciar', async () => {
    const { onAcao } = abrir({ status: 'confirmado' });
    await userEvent.setup().click(screen.getByRole('button', { name: 'Iniciar atendimento' }));
    expect(onAcao).toHaveBeenCalledWith(expect.objectContaining({ id: '3f1c9a2b-7d40-4e11-9b8c-000000ab12cd' }), 'iniciar');
    expect(screen.getByRole('button', { name: 'Concluir atendimento e receber' })).toBeInTheDocument();
    await screen.findByText('21');
  });

  it('remarcar e iniciar só existem em confirmado', async () => {
    abrir({ status: 'em_atendimento' });
    expect(screen.queryByRole('button', { name: 'Remarcar' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Iniciar atendimento' })).not.toBeInTheDocument();
    await screen.findByText('21');
  });

  it('aguardando pagamento não oferece remarcar', async () => {
    abrir({ status: 'aguardando_pagamento' });
    expect(screen.queryByRole('button', { name: 'Remarcar' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Iniciar atendimento' })).not.toBeInTheDocument();
    await screen.findByText('21');
  });

  it('comanda em rascunho vira "Continuar comanda"', async () => {
    vi.mocked(buscarDetalhesAgendamento).mockResolvedValue(detalhes());
    abrir({ status: 'em_atendimento', comanda_id: 'k1', comanda_status: 'rascunho', comanda_number: 1042 });
    expect(await screen.findByRole('button', { name: 'Continuar comanda #1042' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Cliente faltou' })).not.toBeInTheDocument();
  });

  it('em atendimento, oferece voltar para confirmado', async () => {
    const { onAcao } = abrir({ status: 'em_atendimento' });
    await userEvent.setup().click(screen.getByRole('button', { name: 'Voltar para confirmado' }));
    expect(onAcao).toHaveBeenCalledWith(expect.anything(), 'desfazer_inicio');
    await screen.findByText('21');
  });

  it('atendimento concluído não oferece ações', async () => {
    vi.mocked(buscarDetalhesAgendamento).mockResolvedValue(detalhes());
    abrir({ status: 'concluido', comanda_id: 'k1', comanda_status: 'fechada', comanda_number: 1042 });
    expect(await screen.findByText('Comanda #1042 fechada')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Concluir/ })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reenviar comprovante' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Remarcar' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Cancelar' })).not.toBeInTheDocument();
  });

  it('reenviar comprovante chama a API com o id da comanda e avisa o resultado', async () => {
    vi.mocked(reenviarComprovante).mockResolvedValue({ sent: true });
    abrir({ status: 'concluido', comanda_id: 'k1', comanda_status: 'fechada', comanda_number: 1042 });
    await userEvent.setup().click(await screen.findByRole('button', { name: 'Reenviar comprovante' }));
    expect(reenviarComprovante).toHaveBeenCalledWith('k1');
    expect(await screen.findByText('Comprovante reenviado pelo WhatsApp')).toBeInTheDocument();
  });

  it('reenviar sem WhatsApp conectado avisa que não foi enviado', async () => {
    vi.mocked(reenviarComprovante).mockResolvedValue({ sent: false });
    abrir({ status: 'concluido', comanda_id: 'k1', comanda_status: 'fechada', comanda_number: 1042 });
    await userEvent.setup().click(await screen.findByRole('button', { name: 'Reenviar comprovante' }));
    expect(await screen.findByText(/Comprovante não enviado/)).toBeInTheDocument();
  });

  it('aguardando pagamento: confirmar o Pix recebido continua disponível, sem concluir', async () => {
    const { onConfirmarPix } = abrir({ status: 'aguardando_pagamento' });
    expect(screen.queryByRole('button', { name: 'Concluir atendimento e receber' })).not.toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole('button', { name: 'Confirmar Pix recebido' }));
    expect(onConfirmarPix).toHaveBeenCalledWith(expect.objectContaining({ id: '3f1c9a2b-7d40-4e11-9b8c-000000ab12cd' }));
    expect(screen.getByRole('button', { name: 'Cancelar' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Cliente faltou' })).not.toBeInTheDocument();
    await screen.findByText('21');
  });

  it('fechado, não mostra nada do agendamento nem busca detalhes', () => {
    render(
      <ToastProvider>
        <PainelDetalhesAgendamento
          agendamento={null}
          actionLoading={null}
          onFechar={vi.fn()}
          onAcao={vi.fn()}
          onRemarcar={vi.fn()}
        />
      </ToastProvider>,
    );

    expect(screen.queryByText('Detalhes da sessão')).not.toBeInTheDocument();
    expect(buscarDetalhesAgendamento).not.toHaveBeenCalled();
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
      const dialogo = screen.getByRole('dialog', { name: 'Detalhes da sessão' });
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
      const dialogo = screen.getByRole('dialog', { name: 'Detalhes da sessão' });
      expect(dialogo).toHaveClass('bottom-0');
      expect(dialogo).not.toHaveClass('right-0');
      expect(dialogo).not.toHaveClass('sm:max-w-[440px]');
    } finally {
      restaurar();
    }
  });
});
