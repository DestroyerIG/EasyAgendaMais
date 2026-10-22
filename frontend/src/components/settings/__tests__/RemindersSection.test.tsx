import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { RemindersSection } from '@/components/settings/RemindersSection';

describe('RemindersSection', () => {
  it('não controla mais o lembrete por WhatsApp: mostra o aviso com link para Automações', () => {
    render(<RemindersSection />);
    expect(screen.queryByRole('switch')).not.toBeInTheDocument();
    expect(screen.queryByText('Enviar lembretes por WhatsApp')).not.toBeInTheDocument();
    expect(screen.getByText(/Os lembretes por WhatsApp agora ficam em Automações/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Abrir Automações/ })).toHaveAttribute('href', '/dashboard/whatsapp?aba=automacoes');
  });
});
