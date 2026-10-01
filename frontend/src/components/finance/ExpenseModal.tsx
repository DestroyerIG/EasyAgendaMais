'use client';

import { useState, useEffect } from 'react';
import { Save } from 'lucide-react';
import { Modal, ModalFooter, Field, Input, Select } from '@/components/ui';
import { EXPENSE_CATEGORIES } from '@/lib/constants';
import type { Expense } from '@/types';

interface ExpenseModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: { description: string; category: string; amount: number; date: string }) => Promise<void>;
  editingExpense: Expense | null;
}

export function ExpenseModal({ isOpen, onClose, onSubmit, editingExpense }: ExpenseModalProps) {
  const [formData, setFormData] = useState({
    description: '',
    category: '',
    amount: '',
    date: new Date().toISOString().split('T')[0],
  });
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (editingExpense) {
      setFormData({
        description: editingExpense.description,
        category: editingExpense.category,
        amount: editingExpense.amount.toString(),
        date: editingExpense.date.split('T')[0],
      });
    } else {
      setFormData({ description: '', category: '', amount: '', date: new Date().toISOString().split('T')[0] });
    }
  }, [editingExpense, isOpen]);

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      await onSubmit({ ...formData, amount: parseFloat(formData.amount) });
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

        <Field id="expense-date" label="Data">
          <Input
            id="expense-date"
            type="date"
            value={formData.date}
            onChange={e => setFormData({ ...formData, date: e.target.value })}
          />
        </Field>
      </div>
    </Modal>
  );
}
