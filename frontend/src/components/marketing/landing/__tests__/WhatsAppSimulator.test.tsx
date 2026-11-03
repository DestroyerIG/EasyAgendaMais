import { describe, it, expect, vi, afterEach } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import { WhatsAppSimulator, bubbles } from '../WhatsAppSimulator';

afterEach(() => {
  vi.useRealTimers();
});

describe('simulador do WhatsApp', () => {
  it('mostra o fluxo real do robô, por menu', () => {
    expect(bubbles.map((b) => [b.from, b.text])).toEqual([
      ['cliente', 'Oi! Tem horário pra sexta à tarde?'],
      ['bot', 'Olá! Bem-vinda ao Studio Exemplo. Responda com o número:\n1️⃣ Agendar um horário\n2️⃣ Ver nossos serviços\n3️⃣ Cancelar agendamento'],
      ['cliente', '1'],
      ['bot', 'Horários livres na sexta, 24/10:\n1️⃣ 14:00\n2️⃣ 16:30'],
      ['cliente', '1'],
      ['bot', 'Agendamento confirmado para sexta às 14:00. Você recebe um lembrete por aqui antes do horário.'],
    ]);
  });

  it('o robô não cobra sinal na conversa', () => {
    for (const b of bubbles) expect(b.text).not.toMatch(/Pix|sinal/i);
  });

  it('a conversa termina com o agendamento confirmado', () => {
    vi.useFakeTimers();
    render(<WhatsAppSimulator />);
    for (let i = 0; i < 20 && !screen.queryByText('Agendamento confirmado'); i += 1) {
      act(() => {
        vi.advanceTimersByTime(500);
      });
    }
    expect(screen.getByText('Agendamento confirmado')).toBeInTheDocument();
  });
});
