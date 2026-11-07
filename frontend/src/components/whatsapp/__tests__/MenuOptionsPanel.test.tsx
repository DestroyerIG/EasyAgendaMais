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

describe('MenuOptionsPanel - numero e motivo vindos do backend', () => {
  const montarCom = (options: MenuOption[]) =>
    render(
      <MenuOptionsPanel options={options} loading={false} actionLoading={false} onToggle={vi.fn()}
        onUpdate={vi.fn()} onDelete={vi.fn()} onCreate={vi.fn()} onReorder={vi.fn()} onReset={vi.fn()} />,
    );
  const promo = opcao({ id: 'p', handler: 'promotions', label: 'Promoções', numero: null, motivoOculta: 'sem_promocao' });

  it('promocao sem texto explica e aponta para a propria opcao', () => {
    montarCom([promo]);
    expect(screen.getByText('Não aparece: escreva sua promoção')).toBeInTheDocument();
    expect(screen.queryByText(/em Mensagens/)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Resolver' }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('instagram sem perfil explica o motivo', () => {
    montarCom([opcao({ numero: null, motivoOculta: 'sem_instagram' })]);
    expect(screen.getByText('Não aparece: cadastre seu Instagram')).toBeInTheDocument();
  });

  it('opcao desligada explica sem atalho', () => {
    montarCom([opcao({ active: false, numero: null, motivoOculta: 'desligada' })]);
    expect(screen.getByText('Não aparece: opção desligada')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Resolver' })).toBeNull();
  });

  it('opcao que aparece mostra o numero e nenhum aviso', () => {
    montarCom([opcao({ numero: 3 })]);
    expect(screen.getByLabelText('Número no menu')).toHaveTextContent('3');
    expect(screen.queryByText(/Não aparece/)).toBeNull();
  });

  it('mostra a descricao simples e nao o nome interno do handler', () => {
    montarCom([opcao({ id: 'v', handler: 'view_services', label: 'Serviços' })]);
    expect(screen.getByText('Mostra seus serviços e preços')).toBeInTheDocument();
    expect(screen.queryByText(/view_services|Sistema/)).toBeNull();
  });
});
