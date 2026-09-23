'use client';

import { Save } from 'lucide-react';
import { Card, Field, PasswordInput, Button } from '@/components/ui';
import type { PasswordState, FormErrors } from './types';

export interface AccountSectionProps {
  isTenantAdmin: boolean;
  passwordForm: PasswordState;
  passwordErrors: FormErrors<keyof PasswordState>;
  passwordSaving: boolean;
  onFieldChange: <K extends keyof PasswordState>(field: K, value: PasswordState[K]) => void;
  onSave: () => void;
}

export function AccountSection({
  isTenantAdmin,
  passwordForm,
  passwordErrors,
  passwordSaving,
  onFieldChange,
  onSave,
}: AccountSectionProps) {
  return (
    <Card className="h-full space-y-6">
      <div>
        <h2 className="text-lg font-bold text-ink">Alterar senha</h2>
        <p className="mt-1 text-[15px] text-muted">
          A troca de senha fica isolada do cadastro principal para dar mais clareza e reforçar a segurança da conta.
        </p>
      </div>

      {!isTenantAdmin && (
        <p className="rounded-control border border-line bg-surface-2 px-4 py-4 text-[15px] text-muted">
          A troca de senha por essa tela fica disponível apenas para o administrador da conta.
        </p>
      )}

      {isTenantAdmin && (
        <div className="space-y-5">
          <p className="text-[15px] text-muted">
            Use a senha atual para confirmar sua identidade antes de definir uma nova senha.
          </p>

          <Field id="currentPassword" label="Senha atual" error={passwordErrors.currentPassword}>
            <PasswordInput
              id="currentPassword"
              value={passwordForm.currentPassword}
              onChange={(event) => onFieldChange('currentPassword', event.target.value)}
              placeholder="Digite sua senha atual"
              autoComplete="current-password"
              toggleLabel="senha atual"
              invalid={Boolean(passwordErrors.currentPassword)}
            />
          </Field>

          <Field id="newPassword" label="Nova senha" hint="Mínimo 8 caracteres" error={passwordErrors.newPassword}>
            <PasswordInput
              id="newPassword"
              value={passwordForm.newPassword}
              onChange={(event) => onFieldChange('newPassword', event.target.value)}
              placeholder="Inclua letra maiúscula e número"
              autoComplete="new-password"
              toggleLabel="nova senha"
              invalid={Boolean(passwordErrors.newPassword)}
            />
          </Field>

          <Field
            id="confirmNewPassword"
            label="Confirmar nova senha"
            error={passwordErrors.confirmNewPassword}
          >
            <PasswordInput
              id="confirmNewPassword"
              value={passwordForm.confirmNewPassword}
              onChange={(event) => onFieldChange('confirmNewPassword', event.target.value)}
              placeholder="Repita a nova senha"
              autoComplete="new-password"
              toggleLabel="confirmação da nova senha"
              invalid={Boolean(passwordErrors.confirmNewPassword)}
            />
          </Field>

          <div className="flex flex-col gap-3 border-t border-line pt-5">
            <Button onClick={onSave} loading={passwordSaving}>
              {!passwordSaving && <Save className="h-[18px] w-[18px]" aria-hidden="true" />}
              {passwordSaving ? 'Atualizando...' : 'Atualizar senha'}
            </Button>
            <p className="text-[13px] text-muted">
              A senha nunca é carregada do backend e continua sendo validada no fluxo seguro do provedor de
              autenticação quando aplicável.
            </p>
          </div>
        </div>
      )}
    </Card>
  );
}
