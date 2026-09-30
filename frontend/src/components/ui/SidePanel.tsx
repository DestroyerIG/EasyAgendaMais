'use client';

import type { ReactNode } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { cn } from '@/lib/cn';
import { useForcedDarkClass } from '@/components/theme/ForcedDark';
import { useForcedLightClass } from '@/components/theme/ForcedLight';
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
  /**
   * Largura do painel, quando a tela pede uma diferente da padrão. Entra por último no
   * `cn`, então a classe passada aqui vence a do `SIDE_CLASS` no tailwind-merge — é
   * assim que o painel de detalhes do agendamento chega aos 440px de
   * agendamento-detalhes.html sem mexer no padrão, que a Ficha da Cliente usa.
   */
  widthClass?: string;
  /**
   * Linha pequena acima do título (ex.: "Agendamento #4892" em
   * agendamento-detalhes.html) — fica no cabeçalho fixo, nunca rola com o conteúdo.
   */
  titleAbove?: ReactNode;
  /**
   * Conteúdo extra no fim do cabeçalho, antes do botão de fechar (ex.: o selo de
   * status em agendamento-detalhes.html) — mesmo motivo do `titleAbove`: precisa
   * continuar visível durante o scroll, não só na primeira tela.
   */
  headerEnd?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
}

export function SidePanel({
  open,
  onOpenChange,
  title,
  description,
  side = 'right',
  widthClass,
  titleAbove,
  headerEnd,
  children,
  footer,
}: SidePanelProps) {
  const forcedDark = useForcedDarkClass();
  const forcedLight = useForcedLightClass();
  const themeClass = forcedDark || forcedLight;

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <div className={themeClass}>
          <Dialog.Overlay className="fixed inset-0 z-50 bg-scrim/50" />
          <Dialog.Content
            {...(description ? {} : { 'aria-describedby': undefined })}
            className={cn(
              'fixed z-50 flex flex-col border-line bg-surface text-ink shadow-xl focus:outline-none',
              SIDE_CLASS[side],
              widthClass,
            )}
          >
            <header className="flex items-center gap-3 border-b border-line px-5 py-4">
              <div className="flex min-w-0 flex-1 flex-col">
                {titleAbove}
                <Dialog.Title className="text-lg font-bold">{title}</Dialog.Title>
              </div>
              {headerEnd}
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
