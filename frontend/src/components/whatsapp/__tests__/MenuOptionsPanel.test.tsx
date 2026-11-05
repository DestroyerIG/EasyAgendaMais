import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
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
