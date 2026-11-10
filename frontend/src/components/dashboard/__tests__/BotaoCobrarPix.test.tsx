import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { AgendamentoHoje } from '@/lib/hoje';

const showToast = vi.fn();
vi.mock('@/components/Toast', () => ({ useToast: () => ({ showToast }) }));
vi.mock('@/components/comanda/ComandaModal', () => ({
  ComandaModal: ({ appointmentId, onAtualizada }: { appointmentId: string | null; onAtualizada: () => void }) =>
    appointmentId ? <div data-testid="comanda-aberta" onClick={onAtualizada}>{appointmentId}</div> : null,
}));

const { BotaoCobrarPix } = await import('../BotaoCobrarPix');

const ag = (over: Partial<AgendamentoHoje>): AgendamentoHoje => ({
  id: 'a1', date: '2026-11-10', time: '10:00:00', status: 'em_atendimento',
  client_name: 'Mariana Souza', client_phone: null, professional_name: 'Camila', service_name: 'Manicure',
  service_price: 50, service_duration_minutes: 60, source: 'painel', deposit_amount: null, started_at: null,
  comanda_id: 'k1', comanda_status: 'rascunho', comanda_number: 7, comanda_total_charged: null, comanda_deposit_applied: null,
  ...over,
});

describe('BotaoCobrarPix', () => {
  beforeEach(() => vi.clearAllMocks());

  it('sem atendimento em andamento: avisa o que fazer e não abre comanda', async () => {
    render(<BotaoCobrarPix agendamentos={[ag({ status: 'confirmado', comanda_id: null, comanda_status: null })]} onAtualizada={vi.fn()} />);
    await userEvent.click(screen.getByRole('button', { name: /cobrar pix/i }));
    expect(showToast).toHaveBeenCalledWith(expect.stringMatching(/nenhum atendimento em andamento/i), 'info');
    expect(screen.queryByTestId('comanda-aberta')).not.toBeInTheDocument();
  });

  it('um atendimento em andamento: abre a comanda dele direto', async () => {
    render(<BotaoCobrarPix agendamentos={[ag({}), ag({ id: 'a2', status: 'confirmado' })]} onAtualizada={vi.fn()} />);
    await userEvent.click(screen.getByRole('button', { name: /cobrar pix/i }));
    expect(screen.getByTestId('comanda-aberta')).toHaveTextContent('a1');
  });

  it('comanda já fechada não conta como atendimento a cobrar', async () => {
    render(<BotaoCobrarPix agendamentos={[ag({ comanda_status: 'fechada' })]} onAtualizada={vi.fn()} />);
    await userEvent.click(screen.getByRole('button', { name: /cobrar pix/i }));
    expect(showToast).toHaveBeenCalled();
    expect(screen.queryByTestId('comanda-aberta')).not.toBeInTheDocument();
  });

  it('mais de um em andamento: pergunta qual cliente cobrar', async () => {
    render(<BotaoCobrarPix agendamentos={[ag({}), ag({ id: 'a2', client_name: 'Joana Lima' })]} onAtualizada={vi.fn()} />);
    await userEvent.click(screen.getByRole('button', { name: /cobrar pix/i }));
    expect(screen.queryByTestId('comanda-aberta')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /joana lima/i }));
    expect(screen.getByTestId('comanda-aberta')).toHaveTextContent('a2');
  });

  it('quando a comanda é atualizada, avisa o dashboard para recarregar', async () => {
    const onAtualizada = vi.fn();
    render(<BotaoCobrarPix agendamentos={[ag({})]} onAtualizada={onAtualizada} />);
    await userEvent.click(screen.getByRole('button', { name: /cobrar pix/i }));
    await userEvent.click(screen.getByTestId('comanda-aberta'));
    expect(onAtualizada).toHaveBeenCalled();
  });
});
