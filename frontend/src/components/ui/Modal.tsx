'use client';

import type { ReactNode } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { X, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/cn';
import { useForcedDarkClass } from '@/components/theme/ForcedDark';
import { useForcedLightClass } from '@/components/theme/ForcedLight';
import { Button } from './Button';
import { IconButton } from './IconButton';

const SIZE_CLASS = {
  sm: 'max-w-sm',
  md: 'max-w-lg',
  lg: 'max-w-2xl',
  // Telas de trabalho largas (comanda): grande no desktop, tela cheia no celular.
  xl: 'max-w-5xl max-sm:h-dvh max-sm:max-h-none max-sm:w-full max-sm:max-w-none max-sm:rounded-none max-sm:border-0',
} as const;

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  icon?: LucideIcon;
  description?: string;
  size?: keyof typeof SIZE_CLASS;
  children: ReactNode;
  footer?: ReactNode;
  // Sem o cabeçalho padrão: a tela desenha o próprio cabeçalho (e o próprio botão de fechar).
  // O título continua no Dialog.Title, só que visível apenas para leitores de tela.
  headerless?: boolean;
}

export function Modal({ isOpen, onClose, title, icon: Icon, description, size = 'md', children, footer, headerless = false }: ModalProps) {
  const forcedDark = useForcedDarkClass();
  const forcedLight = useForcedLightClass();
  const themeClass = forcedDark || forcedLight;

  return (
    <Dialog.Root open={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
      <Dialog.Portal>
        <div className={themeClass}>
          <Dialog.Overlay className="fixed inset-0 z-50 bg-scrim/50" />
          <Dialog.Content
            {...(description ? {} : { 'aria-describedby': undefined })}
            className={cn(
              'fixed left-1/2 top-1/2 z-50 flex max-h-[90vh] w-[calc(100%-2rem)] -translate-x-1/2 -translate-y-1/2 flex-col rounded-card border border-line bg-surface text-ink shadow-xl focus:outline-none',
              SIZE_CLASS[size],
            )}
          >
            {headerless ? (
              <Dialog.Title className="sr-only">{title}</Dialog.Title>
            ) : (
              <header className="flex items-center gap-3 border-b border-line px-5 py-4">
                {Icon ? <Icon className="h-5 w-5 text-brand-text" aria-hidden="true" /> : null}
                <Dialog.Title className="flex-1 text-lg font-bold">{title}</Dialog.Title>
                <Dialog.Close asChild>
                  <IconButton icon={X} label="Fechar" />
                </Dialog.Close>
              </header>
            )}
            {description ? (
              <Dialog.Description className="px-5 pt-4 text-[15px] text-muted">{description}</Dialog.Description>
            ) : null}
            <div className={headerless ? 'flex min-h-0 flex-1 flex-col' : 'flex-1 overflow-y-auto px-5 py-4'}>
              {children}
            </div>
            {footer ? (
              <footer className="flex flex-col-reverse gap-2 border-t border-line px-5 py-4 sm:flex-row sm:justify-end">
                {footer}
              </footer>
            ) : null}
          </Dialog.Content>
        </div>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

interface ModalFooterProps {
  onCancel: () => void;
  onSubmit: () => void;
  submitLabel: string;
  submitIcon?: LucideIcon;
  submitting?: boolean;
  disabled?: boolean;
  cancelLabel?: string;
}

export function ModalFooter({
  onCancel,
  onSubmit,
  submitLabel,
  submitIcon: SubmitIcon,
  submitting,
  disabled,
  cancelLabel = 'Cancelar',
}: ModalFooterProps) {
  return (
    <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
      <Button variant="secondary" onClick={onCancel} disabled={submitting}>
        {cancelLabel}
      </Button>
      <Button onClick={onSubmit} loading={submitting} disabled={disabled}>
        {SubmitIcon && !submitting ? <SubmitIcon className="h-4 w-4" aria-hidden="true" /> : null}
        {submitLabel}
      </Button>
    </div>
  );
}
