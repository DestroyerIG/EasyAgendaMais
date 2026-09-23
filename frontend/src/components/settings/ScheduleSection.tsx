'use client';

import { Card, Field, Input, Select, Switch, Skeleton } from '@/components/ui';
import { cn } from '@/lib/cn';
import { DIAS_SEMANA, INTERVALOS, type DiasAbertosState, type SettingsState } from './types';

export interface ScheduleSectionProps {
  settingsLoading: boolean;
  diasAbertos: DiasAbertosState;
  openingTime: string;
  closingTime: string;
  slotIntervalMinutes: number;
  allowWalkins: boolean;
  autoConfirmAppointments: boolean;
  onFieldChange: <K extends keyof SettingsState>(field: K, value: SettingsState[K]) => void;
}

export function ScheduleSection({
  settingsLoading,
  diasAbertos,
  openingTime,
  closingTime,
  slotIntervalMinutes,
  allowWalkins,
  autoConfirmAppointments,
  onFieldChange,
}: ScheduleSectionProps) {
  return (
    <Card className="space-y-6">
      <div>
        <h2 className="text-lg font-bold text-ink">Horários de atendimento</h2>
        <p className="mt-1 text-[15px] text-muted">
          Defina a janela de atendimento e o comportamento padrão da agenda.
        </p>
      </div>

      {settingsLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, index) => (
            <Skeleton key={index} className="h-11 w-full" label={index === 0 ? 'Carregando…' : undefined} />
          ))}
        </div>
      ) : (
        <div className="space-y-5">
          {/* Grupo de alternadores, não um campo: o rótulo descreve o conjunto, não um controle. */}
          <div className="flex flex-col gap-1.5">
            <span id="diasAbertos-label" className="text-[13px] font-semibold text-ink">
              Dias de funcionamento
            </span>
            <div
              role="group"
              aria-labelledby="diasAbertos-label"
              className="flex flex-wrap gap-2 rounded-control border border-line bg-surface-2 p-4"
            >
              {DIAS_SEMANA.map((dia) => {
                const active = diasAbertos[dia.id];
                return (
                  <button
                    key={dia.id}
                    type="button"
                    aria-pressed={active}
                    onClick={() =>
                      onFieldChange('diasAbertos', {
                        ...diasAbertos,
                        [dia.id]: !active,
                      })
                    }
                    className={cn(
                      'min-h-11 rounded-full px-4 text-[13px] font-semibold transition-colors',
                      active ? 'bg-brand text-on-brand' : 'border border-line bg-surface text-ink',
                    )}
                  >
                    {dia.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <Field id="openingTime" label="Abre às">
              <Input
                id="openingTime"
                type="time"
                value={openingTime}
                onChange={(event) => onFieldChange('openingTime', event.target.value)}
              />
            </Field>

            <Field id="closingTime" label="Fecha às">
              <Input
                id="closingTime"
                type="time"
                value={closingTime}
                onChange={(event) => onFieldChange('closingTime', event.target.value)}
              />
            </Field>
          </div>

          <Field id="slotIntervalMinutes" label="Intervalo entre horários">
            <Select
              id="slotIntervalMinutes"
              value={slotIntervalMinutes}
              onChange={(event) => onFieldChange('slotIntervalMinutes', Number(event.target.value))}
            >
              {INTERVALOS.map((intervalo) => (
                <option key={intervalo.value} value={intervalo.value}>
                  {intervalo.label}
                </option>
              ))}
            </Select>
          </Field>

          <div className="space-y-3">
            <Switch
              checked={allowWalkins}
              onCheckedChange={(checked) => onFieldChange('allowWalkins', checked)}
              label="Permitir encaixes sem agendamento"
              description="Mantém a agenda flexível para atender clientes fora da marcação formal."
            />
            <Switch
              checked={autoConfirmAppointments}
              onCheckedChange={(checked) => onFieldChange('autoConfirmAppointments', checked)}
              label="Confirmação automática de agendamentos"
              description="Confirma novos agendamentos automaticamente para reduzir etapas no fluxo."
            />
          </div>
        </div>
      )}
    </Card>
  );
}
