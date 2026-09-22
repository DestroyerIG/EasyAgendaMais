'use client';

import { forwardRef, type ComponentPropsWithoutRef, type ElementRef } from 'react';
import * as Menu from '@radix-ui/react-dropdown-menu';
import { cn } from '@/lib/cn';
import { useForcedDarkClass } from '@/components/theme/ForcedDark';

export const DropdownMenu = Menu.Root;
export const DropdownMenuTrigger = Menu.Trigger;

export const DropdownMenuContent = forwardRef<ElementRef<typeof Menu.Content>, ComponentPropsWithoutRef<typeof Menu.Content>>(
  function DropdownMenuContent({ className, sideOffset = 6, ...props }, ref) {
    const themeClass = useForcedDarkClass();
    return (
      <Menu.Portal>
        <div className={themeClass}>
          <Menu.Content
            ref={ref}
            sideOffset={sideOffset}
            className={cn('z-50 min-w-[200px] rounded-control border border-line bg-surface p-1 text-ink shadow-lg', className)}
            {...props}
          />
        </div>
      </Menu.Portal>
    );
  },
);

export const DropdownMenuItem = forwardRef<
  ElementRef<typeof Menu.Item>,
  ComponentPropsWithoutRef<typeof Menu.Item> & { destructive?: boolean }
>(function DropdownMenuItem({ className, destructive, ...props }, ref) {
  return (
    <Menu.Item
      ref={ref}
      className={cn(
        'flex min-h-11 cursor-pointer select-none items-center gap-2 rounded-[8px] px-3 text-[15px] outline-none data-[highlighted]:bg-surface-2 data-[disabled]:pointer-events-none data-[disabled]:opacity-50 lg:min-h-9',
        destructive ? 'text-danger' : 'text-ink',
        className,
      )}
      {...props}
    />
  );
});

export const DropdownMenuLabel = forwardRef<ElementRef<typeof Menu.Label>, ComponentPropsWithoutRef<typeof Menu.Label>>(
  function DropdownMenuLabel({ className, ...props }, ref) {
    return <Menu.Label ref={ref} className={cn('px-3 py-2 text-[13px] font-semibold text-muted', className)} {...props} />;
  },
);

export const DropdownMenuSeparator = forwardRef<ElementRef<typeof Menu.Separator>, ComponentPropsWithoutRef<typeof Menu.Separator>>(
  function DropdownMenuSeparator({ className, ...props }, ref) {
    return <Menu.Separator ref={ref} className={cn('my-1 h-px bg-line', className)} {...props} />;
  },
);
