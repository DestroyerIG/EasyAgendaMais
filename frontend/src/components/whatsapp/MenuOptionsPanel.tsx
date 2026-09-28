'use client';

import { useState } from 'react';
import { Card, Button, Icon, Modal, Field, Input, Textarea, Skeleton } from '@/components/ui';
import { cn } from '@/lib/cn';

/** Botão de ícone local (Material Symbols) — mesma marcação do IconButton compartilhado,
 * que ainda espera um componente de ícone em SVG e por isso não é usado aqui. */
function MenuIconButton({
  icon,
  label,
  onClick,
  disabled,
  className,
}: {
  icon: string;
  label: string;
  onClick?: () => void;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-control text-ink transition-colors hover:bg-surface-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:cursor-not-allowed disabled:opacity-50 lg:h-9 lg:w-9',
        className,
      )}
    >
      <Icon name={icon} size={18} />
    </button>
  );
}

export interface MenuOption {
  id: string;
  option_order: number;
  label: string;
  emoji: string;
  type: 'system' | 'custom';
  handler: string | null;
  response_message: string | null;
  active: boolean;
}

interface MenuOptionsPanelProps {
  options: MenuOption[];
  loading: boolean;
  actionLoading: boolean;
  onToggle: (id: string, active: boolean) => void;
  onUpdate: (id: string, data: Partial<MenuOption>) => void;
  onDelete: (id: string) => void;
  onCreate: (data: { label: string; emoji: string; response_message: string }) => void;
  onReorder: (ids: string[]) => void;
  onReset: () => void;
}

type ModalState = { mode: 'create' } | { mode: 'edit'; target: MenuOption } | null;

export const MenuOptionsPanel = ({
  options,
  loading,
  actionLoading,
  onToggle,
  onUpdate,
  onDelete,
  onCreate,
  onReorder,
  onReset,
}: MenuOptionsPanelProps) => {
  const [modalState, setModalState] = useState<ModalState>(null);
  const [formLabel, setFormLabel] = useState('');
  const [formEmoji, setFormEmoji] = useState('');
  const [formResponse, setFormResponse] = useState('');

  const openCreateModal = () => {
    setFormLabel('');
    setFormEmoji('');
    setFormResponse('');
    setModalState({ mode: 'create' });
  };

  const openEditModal = (opt: MenuOption) => {
    setFormLabel(opt.label);
    setFormEmoji(opt.emoji);
    setFormResponse(opt.response_message || '');
    setModalState({ mode: 'edit', target: opt });
  };

  const closeModal = () => setModalState(null);

  const handleSubmit = () => {
    if (!modalState) return;

    if (modalState.mode === 'create') {
      if (!formLabel.trim() || !formResponse.trim()) return;
      onCreate({ label: formLabel.trim(), emoji: formEmoji.trim(), response_message: formResponse.trim() });
      closeModal();
      return;
    }

    const opt = modalState.target;
    const updates: Partial<MenuOption> = {};
    if (formLabel !== opt.label) updates.label = formLabel;
    if (formEmoji !== opt.emoji) updates.emoji = formEmoji;
    if (opt.type === 'custom' && formResponse !== (opt.response_message || '')) {
      updates.response_message = formResponse;
    }
    if (Object.keys(updates).length > 0) onUpdate(opt.id, updates);
    closeModal();
  };

  const handleMoveUp = (index: number) => {
    if (index === 0) return;
    const ids = options.map(o => o.id);
    [ids[index - 1], ids[index]] = [ids[index], ids[index - 1]];
    onReorder(ids);
  };

  const handleMoveDown = (index: number) => {
    if (index === options.length - 1) return;
    const ids = options.map(o => o.id);
    [ids[index], ids[index + 1]] = [ids[index + 1], ids[index]];
    onReorder(ids);
  };

  const isEditing = modalState?.mode === 'edit';
  const editingTarget = modalState && modalState.mode === 'edit' ? modalState.target : null;
  const isCreateInvalid = modalState?.mode === 'create' && (!formLabel.trim() || !formResponse.trim());
  const showResponseField = !isEditing || editingTarget?.type === 'custom';

  return (
    <Card className="overflow-hidden">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h3 className="mb-2 text-lg font-bold text-ink">Opções do Menu</h3>
          <p className="text-[15px] text-muted">Configure as opções do menu principal do bot.</p>
        </div>
        <div className="flex gap-2">
          <MenuIconButton
            icon="restart_alt"
            label="Resetar menu para padrão"
            onClick={onReset}
            disabled={actionLoading || loading}
            className="border border-line bg-surface-2 hover:bg-line/60"
          />
          <Button onClick={openCreateModal} disabled={actionLoading || loading || options.length >= 15}>
            <Icon name="add" size={16} />
            Nova Opção
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full" label={i === 0 ? 'Carregando menu...' : undefined} />
          ))}
        </div>
      ) : (
        <div className="max-h-[600px] space-y-3 overflow-y-auto">
          {options.map((opt, index) => (
            <Card
              key={opt.id}
              className={cn('flex items-center gap-3 p-4', !opt.active && 'opacity-60')}
            >
              <div className="flex flex-col items-center gap-0.5 text-muted">
                <MenuIconButton
                  icon="keyboard_arrow_up"
                  label="Mover para cima"
                  onClick={() => handleMoveUp(index)}
                  disabled={index === 0 || actionLoading}
                  className="h-7 w-7"
                />
                <Icon name="drag_indicator" size={14} className="text-muted" />
                <MenuIconButton
                  icon="keyboard_arrow_down"
                  label="Mover para baixo"
                  onClick={() => handleMoveDown(index)}
                  disabled={index === options.length - 1 || actionLoading}
                  className="h-7 w-7"
                />
              </div>

              <div className="min-w-0 flex-1">
                <p className="text-[15px] font-medium text-ink">
                  {opt.emoji} {opt.label}
                </p>
                <p className="text-[13px] text-muted">
                  {opt.type === 'system' ? `Sistema • ${opt.handler}` : 'Personalizada'}
                  {opt.response_message && opt.type === 'custom' && (
                    <span className="ml-2 text-muted">
                      — {opt.response_message.substring(0, 50)}{opt.response_message.length > 50 ? '...' : ''}
                    </span>
                  )}
                </p>
              </div>

              <div className="flex items-center gap-1">
                <MenuIconButton
                  icon={opt.active ? 'toggle_on' : 'toggle_off'}
                  label={opt.active ? 'Desativar opção' : 'Ativar opção'}
                  onClick={() => onToggle(opt.id, !opt.active)}
                  disabled={actionLoading}
                />
                <MenuIconButton
                  icon="edit"
                  label="Editar opção"
                  onClick={() => openEditModal(opt)}
                  disabled={actionLoading}
                />
                {opt.type === 'custom' && (
                  <MenuIconButton
                    icon="delete"
                    label="Excluir opção"
                    onClick={() => { if (confirm('Excluir esta opção?')) onDelete(opt.id); }}
                    disabled={actionLoading}
                  />
                )}
              </div>
            </Card>
          ))}

          {options.length === 0 && (
            <div className="flex flex-col items-center gap-3 px-4 py-10 text-center">
              <Icon name="list" size={40} className="text-muted" />
              <p className="text-[15px] font-semibold text-ink">Nenhuma opção configurada</p>
              <Button variant="secondary" onClick={openCreateModal}>
                <Icon name="add" size={16} />
                Nova Opção
              </Button>
            </div>
          )}
        </div>
      )}

      <Modal
        isOpen={modalState !== null}
        onClose={closeModal}
        title={isEditing ? 'Editar Opção' : 'Nova Opção Personalizada'}
        footer={
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button variant="secondary" onClick={closeModal} disabled={actionLoading}>
              Cancelar
            </Button>
            <Button onClick={handleSubmit} loading={actionLoading} disabled={isCreateInvalid}>
              {!actionLoading && <Icon name="save" size={16} />}
              {isEditing ? 'Salvar' : 'Criar'}
            </Button>
          </div>
        }
      >
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-[80px_1fr]">
            <Field id="menu-option-emoji" label="Emoji">
              <Input
                id="menu-option-emoji"
                type="text"
                value={formEmoji}
                onChange={e => setFormEmoji(e.target.value)}
                placeholder="🕐"
                maxLength={4}
              />
            </Field>
            <Field id="menu-option-label" label="Nome da opção" required>
              <Input
                id="menu-option-label"
                type="text"
                value={formLabel}
                onChange={e => setFormLabel(e.target.value)}
                placeholder="Ex: Horário de funcionamento"
                maxLength={50}
              />
            </Field>
          </div>
          {showResponseField && (
            <Field id="menu-option-response" label="Mensagem de resposta" required>
              <Textarea
                id="menu-option-response"
                value={formResponse}
                onChange={e => setFormResponse(e.target.value)}
                placeholder="Mensagem que o bot enviará quando o cliente escolher esta opção..."
                rows={3}
              />
            </Field>
          )}
        </div>
      </Modal>
    </Card>
  );
};
