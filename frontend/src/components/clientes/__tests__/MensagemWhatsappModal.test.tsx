import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MensagemWhatsappModal } from '../MensagemWhatsappModal';
import { linkWhatsapp } from '@/lib/whatsappLink';

describe('MensagemWhatsappModal', () => {
  it('deixa editar a mensagem e abre o WhatsApp com o texto editado, depois fecha', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const abrir = vi.spyOn(window, 'open').mockImplementation(() => null);
    render(
      <MensagemWhatsappModal isOpen onClose={onClose} telefone="83988887777" nomeCliente="Joana Lima" mensagemInicial="Oi, Joana!" />,
    );

    const caixa = screen.getByRole('textbox');
    expect(caixa).toHaveValue('Oi, Joana!');
    await user.clear(caixa);
    await user.type(caixa, 'Olá de novo');
    await user.click(screen.getByRole('button', { name: 'Abrir conversa no WhatsApp' }));

    expect(abrir).toHaveBeenCalledWith(linkWhatsapp('83988887777', 'Olá de novo'), '_blank', 'noopener');
    expect(onClose).toHaveBeenCalled();
    abrir.mockRestore();
  });

  it('sem telefone o botão fica desabilitado e pede o cadastro do telefone', () => {
    render(<MensagemWhatsappModal isOpen onClose={vi.fn()} telefone={null} nomeCliente="Joana" mensagemInicial="Oi" />);
    expect(screen.getByRole('button', { name: 'Abrir conversa no WhatsApp' })).toBeDisabled();
    expect(screen.getByText('Cadastre o telefone da cliente')).toBeInTheDocument();
  });
});
