'use client';

import { Edit2, Trash2, Receipt } from 'lucide-react';
import { formatCurrency } from '@/lib/formatters';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
  Table,
  TableHead,
  TableBody,
  TableRow,
  TableHeaderCell,
  TableCell,
  EmptyState,
  IconButton,
} from '@/components/ui';
import type { Expense } from '@/types';

function safeFormatDate(dateStr: string, formatStr: string) {
  try {
    if (!dateStr) return '---';
    const date = new Date(dateStr.includes('T') ? dateStr : `${dateStr}T12:00:00`);
    if (isNaN(date.getTime())) return 'Data inválida';
    return format(date, formatStr, { locale: ptBR });
  } catch {
    return 'Erro na data';
  }
}

interface ExpensesTableProps {
  expenses: Expense[];
  onEdit: (expense: Expense) => void;
  onDelete: (id: string) => void;
}

export function ExpensesTable({ expenses, onEdit, onDelete }: ExpensesTableProps) {
  if (expenses.length === 0) {
    return (
      <EmptyState
        icon={Receipt}
        title="Nenhum gasto registrado"
      />
    );
  }

  return (
    <Table>
      <TableHead>
        <TableRow>
          <TableHeaderCell>Data</TableHeaderCell>
          <TableHeaderCell>Descrição</TableHeaderCell>
          <TableHeaderCell>Categoria</TableHeaderCell>
          <TableHeaderCell>Valor</TableHeaderCell>
          <TableHeaderCell className="text-right">Ações</TableHeaderCell>
        </TableRow>
      </TableHead>
      <TableBody>
        {expenses.map(expense => (
          <TableRow key={expense.id}>
            <TableCell className="tabular-nums text-muted">
              {safeFormatDate(expense.date, 'dd MMM yyyy')}
            </TableCell>
            <TableCell className="font-semibold text-ink">{expense.description}</TableCell>
            <TableCell>
              <span className="rounded-full border border-line bg-surface-2 px-3 py-1 text-[11px] font-bold text-muted">
                {expense.category}
              </span>
            </TableCell>
            <TableCell className="tabular-nums font-bold text-danger">
              {formatCurrency(expense.amount)}
            </TableCell>
            <TableCell className="text-right">
              <div className="flex justify-end gap-2">
                <IconButton icon={Edit2} label="Editar" onClick={() => onEdit(expense)} />
                <IconButton icon={Trash2} label="Excluir" onClick={() => onDelete(expense.id)} />
              </div>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
