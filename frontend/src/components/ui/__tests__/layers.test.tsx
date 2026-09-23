import { describe, it, expect, vi } from 'vitest';
import { useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Modal, ModalFooter } from '../Modal';
import { SidePanel } from '../SidePanel';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../Tabs';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '../DropdownMenu';
import { ThemeSelect } from '../ThemeSelect';
import { ThemeProvider } from '@/components/theme/ThemeProvider';
import { ForcedDark } from '@/components/theme/ForcedDark';

describe('Modal', () => {
  it('abre com título, fecha com Esc e chama onClose', async () => {
    const onClose = vi.fn();
    render(
      <Modal isOpen onClose={onClose} title="Novo agendamento">
        <input aria-label="Cliente" />
      </Modal>,
    );
    expect(screen.getByRole('dialog', { name: 'Novo agendamento' })).toBeInTheDocument();
    await userEvent.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalled();
  });

  it('botão Fechar chama onClose', async () => {
    const onClose = vi.fn();
    render(<Modal isOpen onClose={onClose} title="X">conteúdo</Modal>);
    await userEvent.click(screen.getByRole('button', { name: 'Fechar' }));
    expect(onClose).toHaveBeenCalled();
  });

  it('dentro de uma área escura, o portal abre no escuro', () => {
    render(
      <ForcedDark>
        <Modal isOpen onClose={() => {}} title="Escuro">conteúdo</Modal>
      </ForcedDark>,
    );
    expect(screen.getByRole('dialog', { name: 'Escuro' }).closest('.dark')).not.toBeNull();
  });

  it('rodapé padrão com Cancelar e a ação principal', async () => {
    const onSubmit = vi.fn();
    render(<ModalFooter onCancel={() => {}} onSubmit={onSubmit} submitLabel="Salvar" />);
    await userEvent.click(screen.getByRole('button', { name: 'Salvar' }));
    expect(onSubmit).toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Cancelar' })).toBeInTheDocument();
  });
});

describe('SidePanel', () => {
  it('abre como diálogo e fecha pelo botão', async () => {
    function Controlled() {
      const [open, setOpen] = useState(true);
      return (
        <SidePanel open={open} onOpenChange={setOpen} title="Ficha da cliente">
          conteúdo
        </SidePanel>
      );
    }
    render(<Controlled />);
    expect(screen.getByRole('dialog', { name: 'Ficha da cliente' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Fechar' }));
    expect(screen.queryByRole('dialog', { name: 'Ficha da cliente' })).not.toBeInTheDocument();
  });
});

describe('Tabs', () => {
  it('troca de conteúdo ao escolher outra aba', async () => {
    render(
      <Tabs defaultValue="a">
        <TabsList aria-label="Seções">
          <TabsTrigger value="a">Mensagens</TabsTrigger>
          <TabsTrigger value="b">Menu</TabsTrigger>
        </TabsList>
        <TabsContent value="a">Conteúdo A</TabsContent>
        <TabsContent value="b">Conteúdo B</TabsContent>
      </Tabs>,
    );
    await userEvent.click(screen.getByRole('tab', { name: 'Menu' }));
    expect(screen.getByText('Conteúdo B')).toBeVisible();
  });
});

describe('DropdownMenu', () => {
  it('abre e executa a ação escolhida', async () => {
    const onSelect = vi.fn();
    render(
      <DropdownMenu>
        <DropdownMenuTrigger>Ações</DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuItem onSelect={onSelect}>Editar</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Ações' }));
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Editar' }));
    expect(onSelect).toHaveBeenCalled();
  });
});

describe('ThemeSelect', () => {
  it('troca entre Escuro e Claro', async () => {
    render(
      <ThemeProvider>
        <ThemeSelect />
      </ThemeProvider>,
    );
    await userEvent.click(await screen.findByRole('radio', { name: 'Escuro' }));
    expect(document.documentElement).toHaveClass('dark');
    expect(screen.getByRole('radio', { name: 'Escuro' })).toHaveAttribute('aria-checked', 'true');

    await userEvent.click(screen.getByRole('radio', { name: 'Claro' }));
    expect(document.documentElement).not.toHaveClass('dark');
  });

  it('começa em Sistema', async () => {
    render(
      <ThemeProvider>
        <ThemeSelect />
      </ThemeProvider>,
    );
    expect(await screen.findByRole('radio', { name: 'Sistema' })).toHaveAttribute('aria-checked', 'true');
  });

  it('as setas andam pelas opções', async () => {
    render(
      <ThemeProvider>
        <ThemeSelect />
      </ThemeProvider>,
    );
    const sistema = await screen.findByRole('radio', { name: 'Sistema' });
    expect(sistema).toHaveAttribute('tabindex', '0');
    sistema.focus();
    await userEvent.keyboard('{ArrowRight}');
    const claro = screen.getByRole('radio', { name: 'Claro' });
    expect(claro).toHaveAttribute('aria-checked', 'true');
    expect(claro).toHaveFocus();
    expect(sistema).toHaveAttribute('tabindex', '-1');
  });
});
