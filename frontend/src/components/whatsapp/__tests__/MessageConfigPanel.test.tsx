import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MessageConfigPanel, type BotConfig } from '../MessageConfigPanel';

const config = (parcial: Partial<BotConfig> = {}): BotConfig => ({
  welcome_header: '', ask_name_message: '', attendant_message: '', confirmation_message: '', reminder_message: '',
  invalid_option_message: '', session_expired_message: '', end_session_message: '', name_validation_message: '',
  no_slots_message: '', cancel_no_appointments_message: '', cancel_list_message: '', cancel_success_message: '',
  reschedule_no_appointments_message: '', reschedule_list_message: '', no_previous_appointments_message: '',
  rating_question_message: '', rating_confirmation_message: '', promotions_message: '', instagram_message: '',
  politica_message: '', ...parcial,
});

describe('MessageConfigPanel - política', () => {
  it('edita politica_message pelo campo "Política de cancelamento e sinal"', () => {
    const onChange = vi.fn();
    render(
      <MessageConfigPanel botConfig={config()} onChange={onChange} configLoading={false} actionLoading={false}
        onSave={vi.fn()} onReset={vi.fn()} />,
    );
    const campo = screen.getByLabelText('Política de cancelamento e sinal');
    fireEvent.change(campo, { target: { value: 'Cancele com 24h.' } });
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ politica_message: 'Cancele com 24h.' }));
  });

  it('mostra a ajuda, o contador e o limite de 1000 caracteres', () => {
    render(
      <MessageConfigPanel botConfig={config({ politica_message: 'abc' })} onChange={vi.fn()} configLoading={false}
        actionLoading={false} onSave={vi.fn()} onReset={vi.fn()} />,
    );
    expect(screen.getByText(/resposta rápida "Política" da central de conversas/)).toHaveTextContent('3/1000');
    expect(screen.getByLabelText('Política de cancelamento e sinal')).toHaveAttribute('maxlength', '1000');
  });
});
