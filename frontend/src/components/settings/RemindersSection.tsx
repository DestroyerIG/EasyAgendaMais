'use client';

import { Card, Switch, Skeleton } from '@/components/ui';
import type { SettingsState } from './types';

export interface RemindersSectionProps {
  settingsLoading: boolean;
  whatsappReminders: boolean;
  onFieldChange: <K extends keyof SettingsState>(field: K, value: SettingsState[K]) => void;
}

export function RemindersSection({ settingsLoading, whatsappReminders, onFieldChange }: RemindersSectionProps) {
  return (
    <Card className="space-y-6">
      <div>
        <h2 className="text-lg font-bold text-ink">Lembretes e notificações</h2>
        <p className="mt-1 text-[15px] text-muted">
          Escolha como seu negócio se comunica com os clientes ao longo da agenda.
        </p>
      </div>

      {settingsLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, index) => (
            <Skeleton key={index} className="h-11 w-full" label={index === 0 ? 'Carregando…' : undefined} />
          ))}
        </div>
      ) : (
        <div className="space-y-3">
          <Switch
            checked={whatsappReminders}
            onCheckedChange={(checked) => onFieldChange('whatsappReminders', checked)}
            label="Enviar lembretes por WhatsApp"
            description="Usa o canal com melhor taxa de abertura para lembrar os clientes."
          />
        </div>
      )}
    </Card>
  );
}
