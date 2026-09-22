import type { LucideIcon } from 'lucide-react';
import { Button } from './Button';

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description: string;
  action?: {
    label: string;
    icon?: LucideIcon;
    onClick: () => void;
  };
}

export function EmptyState({ icon: Icon, title, description, action }: EmptyStateProps) {
  const ActionIcon = action?.icon;
  return (
    <div className="flex flex-col items-center gap-3 px-4 py-10 text-center">
      <Icon className="h-10 w-10 text-muted" strokeWidth={1.5} aria-hidden="true" />
      <p className="text-[15px] font-semibold text-ink">{title}</p>
      <p className="max-w-sm text-[15px] text-muted">{description}</p>
      {action ? (
        <Button onClick={action.onClick}>
          {ActionIcon ? <ActionIcon className="h-4 w-4" aria-hidden="true" /> : null}
          {action.label}
        </Button>
      ) : null}
    </div>
  );
}
