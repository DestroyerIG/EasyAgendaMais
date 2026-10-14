'use client';

import { useState, useEffect } from 'react';
import { Save } from 'lucide-react';
import { Modal, ModalFooter, Field, Input, Select } from '@/components/ui';
import { EXPENSE_CATEGORIES } from '@/lib/constants';
import type { Expense, ExpenseFormData } from '@/types';

type FormaDespesa = NonNullable<ExpenseFormData['paymentMethod']>;

const FORMAS_DESPESA: Array<{ valor: FormaDespesa; rotulo: string }> = [
  { valor: 'dinheiro', rotulo: 'Dinheiro' },
  { valor: 'pix', rotulo: 'Pix' },
  { valor: 'debito', rotulo: 'Débito' },
  { valor: 'credito', rotulo: 'Crédito' },
];

interface ExpenseModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: ExpenseFormData) => Promise<void>;
  editingExpense: Expense | null;
  /** Data (yyyy-MM-dd) que uma despesa nova já traz preenchida; padrão: hoje. */
  defaultDate?: string;
}

export function ExpenseModal({ isOpen, onClose, onSubmit, editingExpense, defaultDate }: ExpenseModalProps) {
  const [formData, setFormData] = useState<{ description: string; category: string; amount: string; date: string; paymentMethod: FormaDespesa | '' }>({
    description: '',
    category: '',
    amount: '',
    date: defaultDate ?? new Date().toISOString().split('T')[0],
    paymentMethod: '',
  });
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (editingExpense) {
      setFormData({
        description: editingExpense.description,
        category: editingExpense.category,
        amount: editingExpense.amount.toString(),
        date: editingExpense.date.split('T')[0],
        paymentMethod: editingExpense.paymentMethod ?? editingExpense.payment_method ?? '',
      });
    } else {
      setFormData({ description: '', category: '', amount: '', date: defaultDate ?? new Date().toISOString().split('T')[0], paymentMethod: '' });
    }
  }, [editingExpense, isOpen, defaultDate]);

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      await onSubmit({ ...formData, amount: parseFloat(formData.amount), paymentMethod: formData.paymentMethod || null });
      onClose();
    } finally {
      setSubmitting(false);
    }
  };

  const isValid = formData.description && formData.category && formData.amount && formData.date;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={editingExpense ? 'Editar Gasto' : 'Novo Gasto'}
      footer={
        <ModalFooter
          onCancel={onClose}
          onSubmit={handleSubmit}
          submitLabel="Salvar Gasto"
          submitIcon={Save}
          submitting={submitting}
          disabled={!isValid}
        />
      }
    >
      <div className="flex flex-col gap-4">
        <Field id="expense-description" label="Descrição">
          <Input
            id="expense-description"
            type="text"
            value={formData.description}
            onChange={e => setFormData({ ...formData, description: e.target.value })}
            placeholder="Ex: Aluguel da sala"
          />
        </Field>

        <div className="grid grid-cols-2 gap-4">
          <Field id="expense-category" label="Categoria">
            <Select
              id="expense-category"
              value={formData.category}
              onChange={e => setFormData({ ...formData, category: e.target.value })}
            >
              <option value="" disabled>Selecione...</option>
              {EXPENSE_CATEGORIES.map(cat => (
                <option key={cat} value={cat}>{cat}</option>
              ))}
            </Select>
          </Field>
          <Field id="expense-amount" label="Valor (R$)">
            <Input
              id="expense-amount"
              type="number"
              step="0.01"
              value={formData.amount}
              onChange={e => setFormData({ ...formData, amount: e.target.value })}
              placeholder="100.00"
            />
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <Field id="expense-date" label="Data">
            <Input
              id="expense-date"
              type="date"
              value={formData.date}
              onChange={e => setFormData({ ...formData, date: e.target.value })}
            />
          </Field>
          <Field id="expense-payment" label="Forma de pagamento">
            <Select
              id="expense-payment"
              value={formData.paymentMethod}
              onChange={e => setFormData({ ...formData, paymentMethod: e.target.value as FormaDespesa | '' })}
            >
              <option value="">Não informado</option>
              {FORMAS_DESPESA.map(f => (
                <option key={f.valor} value={f.valor}>{f.rotulo}</option>
              ))}
            </Select>
          </Field>
        </div>
      </div>
    </Modal>
  );
}
