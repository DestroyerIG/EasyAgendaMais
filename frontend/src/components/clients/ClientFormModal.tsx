'use client';

import { useState, useEffect } from 'react';
import { Save, MapPin } from 'lucide-react';
import { Modal, ModalFooter, Field, Input, Textarea } from '@/components/ui';
import type { Client } from '@/types';

interface ClientFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: ClientFormData) => Promise<void>;
  editingClient: Client | null;
}

export interface ClientFormData {
  name: string;
  phone: string;
  email: string;
  birthDate: string;
  address: string;
  notes: string;
}

export function ClientFormModal({ isOpen, onClose, onSubmit, editingClient }: ClientFormModalProps) {
  const [formData, setFormData] = useState<ClientFormData>({
    name: '', phone: '', email: '', birthDate: '', address: '', notes: '',
  });
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (editingClient) {
      setFormData({
        name: editingClient.name,
        phone: editingClient.phone,
        email: editingClient.email || '',
        birthDate: editingClient.birth_date ? editingClient.birth_date.split('T')[0] : '',
        address: editingClient.address || '',
        notes: editingClient.notes || '',
      });
    } else {
      setFormData({ name: '', phone: '', email: '', birthDate: '', address: '', notes: '' });
    }
  }, [editingClient, isOpen]);

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      await onSubmit(formData);
      onClose();
    } catch {
      // O erro já é tratado por quem chamou o modal; mantemos aberto para correção.
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={editingClient ? 'Editar Cliente' : 'Novo Cadastro Completo'}
      footer={
        <ModalFooter
          onCancel={onClose}
          onSubmit={handleSubmit}
          submitLabel={editingClient ? 'Salvar Alterações' : 'Concluir Cadastro'}
          submitIcon={Save}
          submitting={submitting}
          disabled={!formData.name || !formData.phone}
        />
      }
    >
      <div className="flex flex-col gap-4">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Field id="client-name" label="Nome Completo">
            <Input
              id="client-name"
              type="text"
              value={formData.name}
              onChange={e => setFormData({ ...formData, name: e.target.value })}
              placeholder="Ex: João Silva"
            />
          </Field>
          <Field id="client-phone" label="Telefone / WhatsApp">
            <Input
              id="client-phone"
              type="text"
              value={formData.phone}
              onChange={e => setFormData({ ...formData, phone: e.target.value })}
              placeholder="Ex: 11999999999"
            />
          </Field>
          <Field id="client-email" label="E-mail">
            <Input
              id="client-email"
              type="email"
              value={formData.email}
              onChange={e => setFormData({ ...formData, email: e.target.value })}
              placeholder="Ex: joao@email.com"
            />
          </Field>
          <Field id="client-birth-date" label="Data de Nascimento">
            <Input
              id="client-birth-date"
              type="date"
              value={formData.birthDate}
              onChange={e => setFormData({ ...formData, birthDate: e.target.value })}
            />
          </Field>
        </div>

        <Field id="client-address" label="Endereço">
          <div className="relative">
            <MapPin className="pointer-events-none absolute left-3 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-muted" aria-hidden="true" />
            <Input
              id="client-address"
              type="text"
              value={formData.address}
              onChange={e => setFormData({ ...formData, address: e.target.value })}
              className="pl-10"
              placeholder="Ex: Rua das Flores, 123 - Centro"
            />
          </div>
        </Field>

        <Field id="client-notes" label="Notas e Observações">
          <Textarea
            id="client-notes"
            value={formData.notes}
            onChange={e => setFormData({ ...formData, notes: e.target.value })}
            className="min-h-[100px]"
            placeholder="Ex: Alérgico a certas pomadas, prefere corte baixo..."
          />
        </Field>
      </div>
    </Modal>
  );
}
