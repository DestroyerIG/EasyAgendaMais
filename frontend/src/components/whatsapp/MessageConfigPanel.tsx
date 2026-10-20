'use client';

import { Card, Button, Icon, IconButton, Field, Textarea, Skeleton } from '@/components/ui';
import { materialIcon } from '@/lib/materialIconAdapter';

export interface BotConfig {
  welcome_header: string;
  ask_name_message: string;
  attendant_message: string;
  confirmation_message: string;
  reminder_message: string;
  invalid_option_message: string;
  session_expired_message: string;
  end_session_message: string;
  name_validation_message: string;
  no_slots_message: string;
  cancel_no_appointments_message: string;
  cancel_list_message: string;
  cancel_success_message: string;
  reschedule_no_appointments_message: string;
  reschedule_list_message: string;
  no_previous_appointments_message: string;
  rating_question_message: string;
  rating_confirmation_message: string;
  promotions_message: string;
  instagram_message: string;
  politica_message: string;
}

interface MessageConfigPanelProps {
  botConfig: BotConfig;
  onChange: (config: BotConfig) => void;
  configLoading: boolean;
  actionLoading: boolean;
  onSave: () => void;
  onReset: () => void;
}

interface FieldDef {
  key: keyof BotConfig;
  label: string;
  rows: number;
  hint?: string;
  maxLength?: number;
  category: string;
}

const FIELDS: FieldDef[] = [
  // Fluxo Principal
  { key: 'welcome_header', label: 'Cabeçalho de Boas-vindas', rows: 4, hint: 'Disponível: {nome_negocio}. O menu é gerado automaticamente.', category: 'Fluxo Principal' },
  { key: 'ask_name_message', label: 'Pergunta de Nome (Novo Cliente)', rows: 4, category: 'Fluxo Principal' },
  { key: 'name_validation_message', label: 'Nome Inválido', rows: 3, category: 'Fluxo Principal' },
  { key: 'invalid_option_message', label: 'Opção Inválida', rows: 3, category: 'Fluxo Principal' },
  { key: 'session_expired_message', label: 'Sessão Expirada', rows: 3, category: 'Fluxo Principal' },
  { key: 'end_session_message', label: 'Encerrar Atendimento', rows: 3, category: 'Fluxo Principal' },
  { key: 'attendant_message', label: 'Falar com Atendente', rows: 4, category: 'Fluxo Principal' },

  // Agendamento
  { key: 'confirmation_message', label: 'Confirmação de Agendamento', rows: 5, hint: 'Disponível: {servico}, {profissional}, {data}, {horario}, {valor}', category: 'Agendamento' },
  { key: 'reminder_message', label: 'Lembrete (2h antes)', rows: 5, hint: 'Disponível: {nome_cliente}, {servico}, {profissional}, {horario}', category: 'Agendamento' },
  { key: 'no_slots_message', label: 'Sem Horários Disponíveis', rows: 3, category: 'Agendamento' },

  // Cancelamento
  { key: 'cancel_no_appointments_message', label: 'Sem Agendamentos para Cancelar', rows: 3, category: 'Cancelamento' },
  { key: 'cancel_list_message', label: 'Lista de Agendamentos (Cancelar)', rows: 4, hint: 'Disponível: {lista_agendamentos}', category: 'Cancelamento' },
  { key: 'cancel_success_message', label: 'Cancelamento Confirmado', rows: 3, category: 'Cancelamento' },
  { key: 'politica_message', label: 'Política de cancelamento e sinal', rows: 4, maxLength: 1000, hint: 'Usado na resposta rápida "Política" da central de conversas.', category: 'Cancelamento' },

  // Reagendamento
  { key: 'reschedule_no_appointments_message', label: 'Sem Agendamentos para Reagendar', rows: 3, category: 'Reagendamento' },
  { key: 'reschedule_list_message', label: 'Lista de Agendamentos (Reagendar)', rows: 4, hint: 'Disponível: {lista_agendamentos}', category: 'Reagendamento' },

  // Avaliação & Extras
  { key: 'no_previous_appointments_message', label: 'Sem Atendimentos Anteriores', rows: 3, category: 'Avaliação & Extras' },
  { key: 'rating_question_message', label: 'Pergunta de Avaliação', rows: 4, category: 'Avaliação & Extras' },
  { key: 'rating_confirmation_message', label: 'Confirmação de Avaliação', rows: 3, hint: 'Disponível: {avaliacao}', category: 'Avaliação & Extras' },
  { key: 'promotions_message', label: 'Promoções', rows: 4, hint: 'Disponível: {nome_negocio}', category: 'Avaliação & Extras' },
  { key: 'instagram_message', label: 'Instagram', rows: 4, hint: 'Disponível: {nome_negocio}, {instagram_handle}', category: 'Avaliação & Extras' },
];

const CATEGORIES = ['Fluxo Principal', 'Agendamento', 'Cancelamento', 'Reagendamento', 'Avaliação & Extras'];

export const MessageConfigPanel = ({
  botConfig,
  onChange,
  configLoading,
  actionLoading,
  onSave,
  onReset,
}: MessageConfigPanelProps) => (
  <Card className="overflow-hidden">
    <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
      <div>
        <h3 className="mb-2 text-lg font-bold text-ink">Personalizar Mensagens</h3>
        <p className="text-[15px] text-muted">Defina como o bot deve falar com seus clientes.</p>
      </div>
      <div className="flex gap-2">
        <IconButton
          icon={materialIcon('restart_alt')}
          label="Resetar para o padrão"
          onClick={onReset}
          disabled={actionLoading || configLoading}
          variant="secondary"
        />
        <Button onClick={onSave} loading={actionLoading} disabled={configLoading}>
          {!actionLoading && <Icon name="save" size={16} />}
          Salvar Alterações
        </Button>
      </div>
    </div>

    {configLoading ? (
      <div className="space-y-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-24 w-full" label={i === 0 ? 'Carregando configurações...' : undefined} />
        ))}
      </div>
    ) : (
      <div className="max-h-[700px] space-y-8 overflow-y-auto pr-1">
        {CATEGORIES.map(category => {
          const categoryFields = FIELDS.filter(f => f.category === category);
          return (
            <div key={category}>
              <h4 className="mb-4 border-b border-line pb-2 text-[13px] font-semibold text-brand-text">
                {category}
              </h4>
              <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                {categoryFields.map(({ key, label, rows, hint, maxLength }) => (
                  <Field
                    key={key}
                    id={`bot-config-${key}`}
                    label={label}
                    hint={maxLength ? `${hint} ${(botConfig[key] || '').length}/${maxLength}` : hint}
                  >
                    <Textarea
                      id={`bot-config-${key}`}
                      value={botConfig[key] || ''}
                      onChange={e => onChange({ ...botConfig, [key]: e.target.value })}
                      rows={rows}
                      maxLength={maxLength}
                    />
                  </Field>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    )}
  </Card>
);
