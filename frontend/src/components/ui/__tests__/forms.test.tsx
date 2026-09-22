import { describe, it, expect, vi } from 'vitest';
import { useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Field, fieldDescribedBy } from '../Field';
import { Input } from '../Input';
import { Select } from '../Select';
import { Switch } from '../Switch';
import { PasswordInput } from '../PasswordInput';
import { Table, TableBody, TableCell, TableHead, TableHeaderCell, TableRow } from '../Table';

describe('Field', () => {
  it('liga rótulo, dica e erro ao controle', () => {
    render(
      <Field id="nome" label="Nome do negócio" hint="Aparece para as clientes" error="Obrigatório">
        <Input id="nome" invalid aria-describedby={fieldDescribedBy('nome', { hint: 'x', error: 'y' })} />
      </Field>,
    );
    const input = screen.getByLabelText('Nome do negócio');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input).toHaveAttribute('aria-describedby', 'nome-hint nome-error');
    expect(screen.getByRole('alert')).toHaveTextContent('Obrigatório');
  });

  it('sem dica nem erro não descreve nada', () => {
    expect(fieldDescribedBy('x', {})).toBeUndefined();
  });
});

describe('Select', () => {
  it('é um select nativo com as opções', async () => {
    render(
      <Select aria-label="Intervalo" defaultValue="30">
        <option value="15">15 min</option>
        <option value="30">30 min</option>
      </Select>,
    );
    const select = screen.getByRole('combobox', { name: 'Intervalo' });
    await userEvent.selectOptions(select, '15');
    expect(select).toHaveValue('15');
  });
});

describe('Switch', () => {
  it('alterna e informa o estado', async () => {
    function Controlled() {
      const [on, setOn] = useState(false);
      return <Switch checked={on} onCheckedChange={setOn} label="Lembretes por WhatsApp" />;
    }
    render(<Controlled />);
    const toggle = screen.getByRole('switch', { name: 'Lembretes por WhatsApp' });
    expect(toggle).toHaveAttribute('aria-checked', 'false');
    await userEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-checked', 'true');
  });

  it('desabilitado não muda', async () => {
    const onChange = vi.fn();
    render(<Switch checked={false} onCheckedChange={onChange} label="X" disabled />);
    await userEvent.click(screen.getByRole('switch', { name: 'X' }));
    expect(onChange).not.toHaveBeenCalled();
  });
});

describe('PasswordInput', () => {
  it('mostra e oculta a senha', async () => {
    render(<PasswordInput aria-label="Senha" />);
    const input = screen.getByLabelText('Senha');
    expect(input).toHaveAttribute('type', 'password');
    await userEvent.click(screen.getByRole('button', { name: 'Mostrar senha' }));
    expect(input).toHaveAttribute('type', 'text');
    expect(screen.getByRole('button', { name: 'Ocultar senha' })).toHaveAttribute('aria-pressed', 'true');
  });
});

describe('Table', () => {
  it('rola dentro do próprio contêiner', () => {
    const { container } = render(
      <Table>
        <TableHead>
          <TableRow><TableHeaderCell>Cliente</TableHeaderCell></TableRow>
        </TableHead>
        <TableBody>
          <TableRow><TableCell>Mariana</TableCell></TableRow>
        </TableBody>
      </Table>,
    );
    expect(container.firstElementChild).toHaveClass('overflow-x-auto');
    expect(screen.getByRole('columnheader', { name: 'Cliente' })).toHaveAttribute('scope', 'col');
  });
});
