'use client';

import { FileText } from 'lucide-react';
import { Field, Input, Modal, ModalFooter } from '@/components/ui';

interface CpfCnpjModalProps {
  isOpen: boolean;
  value: string;
  errorMessage?: string | null;
  submitting?: boolean;
  onChange: (value: string) => void;
  onClose: () => void;
  onSubmit: () => void;
}

export function CpfCnpjModal({
  isOpen,
  value,
  errorMessage,
  submitting = false,
  onChange,
  onClose,
  onSubmit,
}: CpfCnpjModalProps) {
  return (
    <Modal
      isOpen={isOpen}
      onClose={() => {
        if (!submitting) {
          onClose();
        }
      }}
      title="Informe CPF/CNPJ para Pix"
      icon={FileText}
      footer={
        <ModalFooter
          onCancel={onClose}
          onSubmit={onSubmit}
          submitLabel={submitting ? 'Salvando...' : 'Salvar e continuar'}
          submitting={submitting}
          cancelLabel="Agora nao"
        />
      }
    >
      <div className="space-y-4">
        <p className="text-[15px] text-muted">
          Para gerar cobranças Pix via Asaas, precisamos do CPF ou CNPJ do negócio.
        </p>

        <Field id="cpf-cnpj-input" label="CPF/CNPJ" error={errorMessage ?? undefined}>
          <Input
            id="cpf-cnpj-input"
            value={value}
            onChange={(event) => onChange(event.target.value)}
            placeholder="Digite o CPF ou CNPJ"
            maxLength={18}
            invalid={Boolean(errorMessage)}
          />
        </Field>
      </div>
    </Modal>
  );
}
