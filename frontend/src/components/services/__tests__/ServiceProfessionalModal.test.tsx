import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ToastProvider } from '@/components/Toast';
import { ServiceProfessionalModal, type ProfessionalFormData } from '../ServiceProfessionalModal';

vi.mock('@/lib/supabase/client', () => ({ getSupabaseClient: vi.fn() }));

const renderModal = (onSubmitProfessional: (d: ProfessionalFormData) => Promise<void>) =>
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

describe('ServiceProfessionalModal (profissional)', () => {
  it('bloqueia intervalo pela metade', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    renderModal(onSubmit);
    await user.type(screen.getByLabelText('Nome do Profissional'), 'Camila');
    await user.type(screen.getByLabelText('Início do almoço'), '12:00');
    await user.click(screen.getByRole('button', { name: /salvar/i }));
    expect(await screen.findByText('Informe início e fim do intervalo')).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('bloqueia comissão fora de 0 a 100', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    renderModal(onSubmit);
    await user.type(screen.getByLabelText('Nome do Profissional'), 'Camila');
    await user.type(screen.getByLabelText('% sobre serviços'), '150');
    await user.click(screen.getByRole('button', { name: /salvar/i }));
    expect(await screen.findByText('Comissão deve ficar entre 0% e 100%')).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('bloqueia CNPJ inválido e envia o válido só com dígitos, com a especialidade', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    renderModal(onSubmit);
    await user.type(screen.getByLabelText('Nome do Profissional'), 'Camila');
    await user.type(screen.getByLabelText('Especialidade (opcional)'), 'Nail designer');
    const cnpj = screen.getByLabelText('CNPJ do MEI (opcional)');
    await user.type(cnpj, '11111111111111');
    await user.click(screen.getByRole('button', { name: /salvar/i }));
    expect(await screen.findByText('CNPJ inválido')).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
    await user.clear(cnpj);
    await user.type(cnpj, '11222333000181');
    expect(cnpj).toHaveValue('11.222.333/0001-81');
    await user.click(screen.getByRole('button', { name: /salvar/i }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ cnpj: '11222333000181', especialidade: 'Nail designer' })));
  });

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
