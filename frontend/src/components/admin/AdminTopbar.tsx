'use client';

import { useAuth } from '@/contexts/AuthContext';
import { Button, Icon, ThemeSelect } from '@/components/ui';

export function AdminTopbar() {
  const { user, logout } = useAuth();

  return (
    <header className="flex h-16 items-center justify-between gap-3 border-b border-line bg-surface px-4 lg:px-6">
      <div className="flex min-w-0 items-center gap-2 text-[13px] font-semibold text-muted">
        <Icon name="admin_panel_settings" size={20} className="text-brand" />
        <span className="truncate">Administração da plataforma</span>
      </div>

      <div className="flex items-center gap-2">
        <ThemeSelect className="hidden md:flex" />
        <span className="hidden max-w-[220px] truncate text-[13px] font-semibold text-ink sm:inline">
          {user?.email || 'Administrador'}
        </span>
        <Button variant="secondary" size="sm" onClick={logout}>
          <Icon name="logout" size={18} />
          Sair
        </Button>
      </div>
    </header>
  );
}
