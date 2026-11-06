import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MenuOptionsPanel, type MenuOption } from '../MenuOptionsPanel';

const opcao = (parcial: Partial<MenuOption>): MenuOption => ({
  id: 'o1', option_order: 1, label: 'Instagram', emoji: '📱', type: 'system',
  handler: 'instagram', response_message: null, active: true, ...parcial,
});

const montar = (options: MenuOption[], onSalvarInstagram = vi.fn()) => {
  render(
    <MenuOptionsPanel options={options} loading={false} actionLoading={false} onToggle={vi.fn()}
      onUpdate={vi.fn()} onDelete={vi.fn()} onCreate={vi.fn()} onReorder={vi.fn()} onReset={vi.fn()}
      instagramHandle={null} onSalvarInstagram={onSalvarInstagram} />,
  );
  return onSalvarInstagram;
};

describe('MenuOptionsPanel - Instagram', () => {
  it('editar a opção instagram mostra o campo e salva o perfil', () => {
    const onSalvar = montar([opcao({})]);
    fireEvent.click(screen.getByRole('button', { name: 'Editar opção' }));
    fireEvent.change(screen.getByLabelText('Perfil do Instagram'), { target: { value: '@loja' } });
    fireEvent.click(screen.getByRole('button', { name: /Salvar/ }));
    expect(onSalvar).toHaveBeenCalledWith('@loja');
  });

  it('outras opções não mostram o campo', () => {
    montar([opcao({ id: 'o2', handler: 'attendant', label: 'Humano' })]);
    fireEvent.click(screen.getByRole('button', { name: 'Editar opção' }));
    expect(screen.queryByLabelText('Perfil do Instagram')).toBeNull();
  });
});

describe('MenuOptionsPanel - perfil recusado', () => {
  it('mantem o modal aberto com o digitado quando o backend recusa', async () => {
    const onSalvar = vi.fn().mockResolvedValue(false);
    montar([opcao({})], onSalvar);
    fireEvent.click(screen.getByRole('button', { name: 'Editar opção' }));
    fireEvent.change(screen.getByLabelText('Perfil do Instagram'), { target: { value: 'perfil invalido!!' } });
    fireEvent.click(screen.getByRole('button', { name: /Salvar/ }));
    await waitFor(() => expect(onSalvar).toHaveBeenCalledWith('perfil invalido!!'));
    expect(screen.getByLabelText('Perfil do Instagram')).toHaveValue('perfil invalido!!');
  });

  it('fecha o modal quando o perfil e aceito', async () => {
    const onSalvar = vi.fn().mockResolvedValue(true);
    montar([opcao({})], onSalvar);
    fireEvent.click(screen.getByRole('button', { name: 'Editar opção' }));
    fireEvent.change(screen.getByLabelText('Perfil do Instagram'), { target: { value: '@loja' } });
    fireEvent.click(screen.getByRole('button', { name: /Salvar/ }));
    await waitFor(() => expect(screen.queryByLabelText('Perfil do Instagram')).toBeNull());
  });
});

describe('MenuOptionsPanel - opcao ligada mas invisivel', () => {
  const montarCom = (options: MenuOption[], extra: { promocoesMessage?: string; instagramMessage?: string; instagramHandle?: string | null }) =>
    render(
      <MenuOptionsPanel options={options} loading={false} actionLoading={false} onToggle={vi.fn()}
        onUpdate={vi.fn()} onDelete={vi.fn()} onCreate={vi.fn()} onReorder={vi.fn()} onReset={vi.fn()} {...extra} />,
    );
  const promo = opcao({ id: 'p', handler: 'promotions', label: 'Promoções' });

  it('promocoes ligada sem texto avisa', () => {
    montarCom([promo], { promocoesMessage: '  ' });
    expect(screen.getByText('Não aparece: escreva sua promoção em Mensagens')).toBeInTheDocument();
  });

  it('promocoes com texto nao avisa', () => {
    montarCom([promo], { promocoesMessage: '10% na terça' });
    expect(screen.queryByText(/Não aparece/)).toBeNull();
  });

  it('promocoes desligada nao avisa', () => {
    montarCom([{ ...promo, active: false }], { promocoesMessage: '' });
    expect(screen.queryByText(/Não aparece/)).toBeNull();
  });

  it('instagram ligado sem perfil e com a variavel avisa', () => {
    montarCom([opcao({})], { instagramHandle: null, instagramMessage: 'Siga {instagram_handle}' });
    expect(screen.getByText('Não aparece: cadastre seu Instagram')).toBeInTheDocument();
  });

  it('instagram com texto proprio sem a variavel nao avisa', () => {
    montarCom([opcao({})], { instagramHandle: null, instagramMessage: 'Nos siga no Insta' });
    expect(screen.queryByText(/Não aparece/)).toBeNull();
  });

  it('instagram com perfil cadastrado nao avisa', () => {
    montarCom([opcao({})], { instagramHandle: '@loja', instagramMessage: 'Siga {instagram_handle}' });
    expect(screen.queryByText(/Não aparece/)).toBeNull();
  });
});