import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import { PublicPageSettingsForm } from '../PublicPageSettingsForm';
import { businessPublicPageApi } from '@/lib/businessPublicPage';
import { AxiosError, type AxiosResponse } from 'axios';

vi.mock('@/lib/businessPublicPage', () => ({
  businessPublicPageApi: {
    getSettings: vi.fn().mockResolvedValue({
      slug: null, pixKey: null, pixKeyType: null, logoUrl: null, brandColor: null, galleryPhotos: [], address: null,
    }),
    updateSettings: vi.fn().mockResolvedValue({
      slug: 'studio-aurora', pixKey: '83999990000', pixKeyType: 'telefone', logoUrl: null, brandColor: null, galleryPhotos: [], address: null,
    }),
    checkSlugAvailability: vi.fn().mockResolvedValue(true),
    uploadImage: vi.fn().mockResolvedValue('https://cdn.test/foto.jpg'),
  },
}));

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: { businessName: 'Studio Aurora' } }),
}));

describe('PublicPageSettingsForm', () => {
  it('salva o slug ao enviar o formulário, sem mexer na chave Pix', async () => {
    const user = userEvent.setup();
    render(<PublicPageSettingsForm />);

    await waitFor(() => expect(businessPublicPageApi.getSettings).toHaveBeenCalled());

    await user.type(screen.getByLabelText(/link da sua página/i), 'studio-aurora');
    await user.click(screen.getByRole('button', { name: /salvar alterações/i }));

    await waitFor(() => {
      expect(businessPublicPageApi.updateSettings).toHaveBeenCalledWith(
        expect.objectContaining({ slug: 'studio-aurora' })
      );
    });
    expect(screen.queryByLabelText(/^chave pix$/i)).not.toBeInTheDocument();
    const enviado = (businessPublicPageApi.updateSettings as unknown as ReturnType<typeof vi.fn>).mock.calls.at(-1)![0];
    expect(enviado).not.toHaveProperty('pixKey');
    expect(enviado).not.toHaveProperty('pixKeyType');
  });

  it('mostra "Disponível" quando o slug digitado não está em uso', async () => {
    const user = userEvent.setup();
    render(<PublicPageSettingsForm />);

    await waitFor(() => expect(businessPublicPageApi.getSettings).toHaveBeenCalled());
    await user.type(screen.getByLabelText(/link da sua página/i), 'novo-slug');

    expect(await screen.findByText('Disponível')).toBeInTheDocument();
    expect(businessPublicPageApi.checkSlugAvailability).toHaveBeenCalledWith('novo-slug');
  });

  it('mostra aviso quando o slug digitado já está em uso', async () => {
    (businessPublicPageApi.checkSlugAvailability as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(false);
    const user = userEvent.setup();
    render(<PublicPageSettingsForm />);

    await waitFor(() => expect(businessPublicPageApi.getSettings).toHaveBeenCalled());
    await user.type(screen.getByLabelText(/link da sua página/i), 'ja-existe');

    expect(await screen.findByText('Este link já está em uso')).toBeInTheDocument();
  });

  it('seleciona uma cor de destaque ao clicar em um swatch', async () => {
    const user = userEvent.setup();
    render(<PublicPageSettingsForm />);

    await waitFor(() => expect(businessPublicPageApi.getSettings).toHaveBeenCalled());
    await user.click(screen.getByRole('button', { name: 'Usar cor #2563EB' }));
    await user.click(screen.getByRole('button', { name: /salvar alterações/i }));

    await waitFor(() => {
      expect(businessPublicPageApi.updateSettings).toHaveBeenCalledWith(
        expect.objectContaining({ brandColor: '#2563EB' })
      );
    });
  });

  it('faz upload de uma foto para a galeria e envia a URL ao salvar', async () => {
    const user = userEvent.setup();
    render(<PublicPageSettingsForm />);

    await waitFor(() => expect(businessPublicPageApi.getSettings).toHaveBeenCalled());

    const file = new File(['conteudo'], 'trabalho.jpg', { type: 'image/jpeg' });
    const input = screen.getByLabelText(/adicionar fotos à galeria/i);
    await user.upload(input, file);

    await waitFor(() => expect(businessPublicPageApi.uploadImage).toHaveBeenCalledWith(file));
    await user.click(screen.getByRole('button', { name: /salvar alterações/i }));

    await waitFor(() => {
      expect(businessPublicPageApi.updateSettings).toHaveBeenCalledWith(
        expect.objectContaining({ galleryPhotos: ['https://cdn.test/foto.jpg'] })
      );
    });
  });

  it('salva o endereço preenchido', async () => {
    const user = userEvent.setup();
    render(<PublicPageSettingsForm />);

    await waitFor(() => expect(businessPublicPageApi.getSettings).toHaveBeenCalled());
    await user.type(screen.getByLabelText('Endereço'), 'Rua das Flores, 123 - Centro');
    await user.click(screen.getByRole('button', { name: /salvar alterações/i }));

    await waitFor(() => {
      expect(businessPublicPageApi.updateSettings).toHaveBeenCalledWith(
        expect.objectContaining({ address: 'Rua das Flores, 123 - Centro' })
      );
    });
  });
});

describe('PublicPageSettingsForm — falha ao salvar', () => {
  it('mostra mensagem visível quando o link já está em uso (409)', async () => {
    const user = userEvent.setup();
    (businessPublicPageApi.updateSettings as unknown as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new AxiosError('conflict', '409', undefined, undefined, {
        status: 409,
        data: { success: false, error: 'Este link já está em uso por outro negócio' },
      } as AxiosResponse)
    );
    render(<PublicPageSettingsForm />);

    await waitFor(() => expect(businessPublicPageApi.getSettings).toHaveBeenCalled());
    await user.type(await screen.findByLabelText(/link da sua página/i), 'studio-aurora');
    await user.click(screen.getByRole('button', { name: /salvar alterações/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Este link já está em uso por outro negócio');
    expect(screen.queryByText('Configurações salvas.')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /salvar alterações/i })).not.toBeDisabled();
  });

  it('salva apresentação, comodidades e a escolha de mostrar a nota', async () => {
    const user = userEvent.setup();
    render(<PublicPageSettingsForm />);
    await waitFor(() => expect(businessPublicPageApi.getSettings).toHaveBeenCalled());

    await user.type(await screen.findByLabelText('Apresentação'), 'Atendimento com hora marcada');
    await user.click(screen.getByRole('checkbox', { name: 'Wi-Fi' }));
    await user.click(screen.getByRole('checkbox', { name: 'Café' }));
    await user.click(screen.getByRole('checkbox', { name: 'Wi-Fi' }));
    await user.click(screen.getByRole('switch', { name: /mostrar minha nota/i }));
    await user.click(screen.getByRole('button', { name: /salvar alterações/i }));

    await waitFor(() => {
      expect(businessPublicPageApi.updateSettings).toHaveBeenCalledWith(expect.objectContaining({
        description: 'Atendimento com hora marcada', comodidades: ['cafe'], mostrarNota: true,
      }));
    });
  });

  it('a nota começa desligada', async () => {
    render(<PublicPageSettingsForm />);

    expect(await screen.findByRole('switch', { name: /mostrar minha nota/i })).not.toBeChecked();
  });

  it('envia a capa e permite remover', async () => {
    const user = userEvent.setup();
    render(<PublicPageSettingsForm />);
    await waitFor(() => expect(businessPublicPageApi.getSettings).toHaveBeenCalled());

    await user.upload(await screen.findByLabelText('Enviar foto de capa'), new File(['x'], 'capa.png', { type: 'image/png' }));
    await user.click(await screen.findByRole('button', { name: 'Remover capa' }));
    await user.click(screen.getByRole('button', { name: /salvar alterações/i }));

    await waitFor(() => {
      expect(businessPublicPageApi.updateSettings).toHaveBeenCalledWith(expect.objectContaining({ coverUrl: null }));
    });
  });
});
