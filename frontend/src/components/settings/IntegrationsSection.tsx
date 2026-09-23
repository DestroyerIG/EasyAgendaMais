'use client';

import { Card, Field, Input, Skeleton } from '@/components/ui';
import { cn } from '@/lib/cn';
import type { SettingsState } from './types';

export interface IntegrationsSectionProps {
  settingsLoading: boolean;
  whatsappInstanceName: string;
  onFieldChange: <K extends keyof SettingsState>(field: K, value: SettingsState[K]) => void;
  className?: string;
}

export function IntegrationsSection({
  settingsLoading,
  whatsappInstanceName,
  onFieldChange,
  className,
}: IntegrationsSectionProps) {
  return (
    <Card className={cn('space-y-6', className)}>
      <div>
        <h2 className="text-lg font-bold text-ink">Integrações</h2>
        <p className="mt-1 text-[15px] text-muted">
          Gerencie identificadores técnicos e conexões externas sem misturar com os dados oficiais da conta.
        </p>
      </div>

      {settingsLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, index) => (
            <Skeleton key={index} className="h-11 w-full" label={index === 0 ? 'Carregando…' : undefined} />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-5">
          <Field id="whatsappInstanceName" label="Nome da instância WhatsApp (Evolution)">
            <Input
              id="whatsappInstanceName"
              value={whatsappInstanceName}
              onChange={(event) => onFieldChange('whatsappInstanceName', event.target.value)}
              placeholder="Gerado automaticamente ao conectar"
              readOnly
              className="opacity-60"
            />
          </Field>
        </div>
      )}
    </Card>
  );
}
