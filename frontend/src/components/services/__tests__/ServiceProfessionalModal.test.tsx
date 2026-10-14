import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ToastProvider } from '@/components/Toast';
import { ServiceProfessionalModal } from '../ServiceProfessionalModal';

vi.mock('@/lib/supabase/client', () => ({ getSupabaseClient: vi.fn() }));

describe('ServiceProfessionalModal (profissional)', () => {
  it('envia intervalo e comissão própria da profissional', async () => {
    const user = userEvent.setup();
    const onSubmitProfessional = vi.fn().mockResolvedValue(undefined);
    render(
      <ToastProvider>
        <ServiceProfessionalModal
          isOpen
          onClose={vi.fn()}
          onSubmitService={vi.fn()}
          onSubmitProfessional={onSubmitProfessional}
          activeTab="profissionais"
          editingItem={null}
        />
      </ToastProvider>,
    );
    await user.type(screen.getByLabelText('Nome do Profissional'), 'Camila');
    await user.type(screen.getByLabelText('Início do almoço'), '12:00');
    await user.type(screen.getByLabelText('Fim do almoço'), '13:00');
    await user.type(screen.getByLabelText('% sobre serviços'), '50');
    await user.click(screen.getByRole('button', { name: /salvar/i }));
    await waitFor(() => expect(onSubmitProfessional).toHaveBeenCalledWith(expect.objectContaining({
      name: 'Camila', breakStart: '12:00', breakEnd: '13:00', commissionServicePct: 50, commissionProductPct: null,
    })));
  });
});
