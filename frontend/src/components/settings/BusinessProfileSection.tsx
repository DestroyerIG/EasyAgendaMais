'use client';

import { Save } from 'lucide-react';
import { Card, Field, Input, Button, Skeleton } from '@/components/ui';
import { formatCpfCnpj } from '@/utils/cpfCnpj';
import { formatPhoneInput, type AccountProfileState, type FormErrors } from './types';

export interface BusinessProfileSectionProps {
  isTenantAdmin: boolean;
  accountLoading: boolean;
  accountSaving: boolean;
  accountProfile: AccountProfileState;
  accountErrors: FormErrors<keyof AccountProfileState>;
  onFieldChange: <K extends keyof AccountProfileState>(field: K, value: AccountProfileState[K]) => void;
  onSave: () => void;
}

export function BusinessProfileSection({
  isTenantAdmin,
  accountLoading,
  accountSaving,
  accountProfile,
  accountErrors,
  onFieldChange,
  onSave,
}: BusinessProfileSectionProps) {
  return (
    <Card className="space-y-6">
      <div>
        <h2 className="text-lg font-bold text-ink">Dados cadastrais</h2>
        <p className="mt-1 text-[15px] text-muted">
          Edite aqui os dados oficiais da conta. Nome do negócio, telefone, CPF/CNPJ e e-mail passam a ter uma única
          fonte de verdade.
        </p>
      </div>

      {!isTenantAdmin && (
        <p className="rounded-control border border-line bg-surface-2 px-4 py-4 text-[15px] text-muted">
          Essa área fica disponível apenas para o administrador da conta do tenant.
        </p>
      )}

      {isTenantAdmin && accountLoading && (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, index) => (
            <Skeleton key={index} className="h-11 w-full" />
          ))}
        </div>
      )}

      {isTenantAdmin && !accountLoading && (
        <div className="space-y-5">
          <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
            <Field id="accountBusinessName" label="Nome do negócio" error={accountErrors.businessName}>
              <Input
                id="accountBusinessName"
                value={accountProfile.businessName}
                onChange={(event) => onFieldChange('businessName', event.target.value)}
                placeholder="Ex: Studio Prime"
                invalid={Boolean(accountErrors.businessName)}
              />
            </Field>

            <Field id="ownerName" label="Nome do responsável" error={accountErrors.ownerName}>
              <Input
                id="ownerName"
                value={accountProfile.ownerName}
                onChange={(event) => onFieldChange('ownerName', event.target.value)}
                placeholder="Nome completo do responsável"
                invalid={Boolean(accountErrors.ownerName)}
              />
            </Field>

            <Field id="whatsapp" label="WhatsApp" error={accountErrors.whatsapp}>
              <Input
                id="whatsapp"
                value={accountProfile.whatsapp}
                onChange={(event) => onFieldChange('whatsapp', formatPhoneInput(event.target.value))}
                placeholder="(11) 99999-9999"
                invalid={Boolean(accountErrors.whatsapp)}
              />
            </Field>

            <Field id="cpfCnpj" label="CPF/CNPJ" error={accountErrors.cpfCnpj}>
              <Input
                id="cpfCnpj"
                value={accountProfile.cpfCnpj}
                onChange={(event) => onFieldChange('cpfCnpj', formatCpfCnpj(event.target.value))}
                placeholder="000.000.000-00"
                invalid={Boolean(accountErrors.cpfCnpj)}
              />
            </Field>
          </div>

          <Field id="accountEmail" label="E-mail da conta" error={accountErrors.email}>
            <Input
              id="accountEmail"
              type="email"
              value={accountProfile.email}
              onChange={(event) => onFieldChange('email', event.target.value)}
              placeholder="contato@seunegocio.com"
              invalid={Boolean(accountErrors.email)}
            />
          </Field>

          <div className="flex flex-col gap-3 border-t border-line pt-5 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-[13px] text-muted">
              As alterações ficam no formulário mesmo se houver erro, para você ajustar e reenviar.
            </p>
            <Button variant="secondary" onClick={onSave} loading={accountSaving}>
              {!accountSaving && <Save className="h-[18px] w-[18px]" aria-hidden="true" />}
              {accountSaving ? 'Salvando...' : 'Salvar dados cadastrais'}
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}
