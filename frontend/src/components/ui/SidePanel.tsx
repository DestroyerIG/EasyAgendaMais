'use client';

import type { ReactNode } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { cn } from '@/lib/cn';
import { useForcedDarkClass } from '@/components/theme/ForcedDark';
import { IconButton } from './IconButton';

const SIDE_CLASS = {
  right: 'inset-y-0 right-0 h-full w-full border-l sm:max-w-[480px]',
  bottom: 'inset-x-0 bottom-0 max-h-[85vh] rounded-t-card border-t',
} as const;

export interface SidePanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  side?: keyof typeof SIDE_CLASS;
  children: ReactNode;
  footer?: ReactNode;
}

export function SidePanel({ open, onOpenChange, title, description, side = 'right', children, footer }: SidePanelProps) {
  const themeClass = useForcedDarkClass();

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <div className={themeClass}>
          <Dialog.Overlay className="fixed inset-0 z-50 bg-scrim/50" />
          <Dialog.Content
            {...(description ? {} : { 'aria-describedby': undefined })}
            className={cn('fixed z-50 flex flex-col border-line bg-surface text-ink shadow-xl focus:outline-none', SIDE_CLASS[side])}
          >
            <header className="flex items-center gap-3 border-b border-line px-5 py-4">
              <Dialog.Title className="flex-1 text-lg font-bold">{title}</Dialog.Title>
              <Dialog.Close asChild>
                <IconButton icon={X} label="Fechar" />
              </Dialog.Close>
            </header>
            {description ? (
              <Dialog.Description className="px-5 pt-4 text-[15px] text-muted">{description}</Dialog.Description>
            ) : null}
            <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
            {footer ? <footer className="border-t border-line px-5 py-4">{footer}</footer> : null}
          </Dialog.Content>
        </div>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
