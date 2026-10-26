'use client';

import { useEffect, type ReactNode } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { BarChart3, CalendarDays, LogOut, Scissors, Users } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useRequireRole } from '@/hooks/useRequireRole';
import { registrarServiceWorker } from '@/lib/push';
import { cn } from '@/lib/cn';
import { useVocabulario } from '@/hooks/useVocabulario';

// Casca do app da profissional (fase 5): celular primeiro, coluna central no computador,
// barra inferior Agenda · Clientes · Atendimento · Números.

export const ABAS_BANCADA = [
  { href: '/bancada', label: 'Agenda', icon: CalendarDays, ativa: (p: string) => p === '/bancada' },
  { href: '/bancada/clientes', label: 'Clientes', icon: Users, ativa: (p: string) => p.startsWith('/bancada/clientes') },
  { href: '/bancada/atendimento', label: 'Atendimento', icon: Scissors, ativa: (p: string) => p.startsWith('/bancada/atendimento') },
  { href: '/bancada/numeros', label: 'Números', icon: BarChart3, ativa: (p: string) => p.startsWith('/bancada/numeros') },
] as const;

export function BancadaShell({ children }: { children: ReactNode }) {
  const { prof } = useVocabulario();
  const pathname = usePathname() ?? '/bancada';
  const { logout } = useAuth();
  const { isChecking, isAuthorized, user } = useRequireRole({
    allowedRoles: ['professional'],
    redirectTo: '/dashboard',
    unauthenticatedRedirectTo: '/login?next=/bancada',
  });

  useEffect(() => {
    if (isAuthorized) void registrarServiceWorker();
  }, [isAuthorized]);

  if (isChecking || !isAuthorized) {
    return <div className="app-theme min-h-screen" aria-busy="true" />;
  }

  return (
    <div className="app-theme min-h-screen">
      <header className="sticky top-0 z-20 border-b border-line bg-surface/95 backdrop-blur">
        <div className="mx-auto flex max-w-xl items-center gap-3 px-4 py-3">
          {/* eslint-disable-next-line @next/next/no-img-element -- ícone estático do PWA */}
          <img src="/icons/icon-192.png" alt="" className="h-8 w-8 rounded-lg" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-[15px] font-bold text-ink">{user?.businessName || 'EasyAgenda+'}</p>
            <p className="text-[11px] font-medium text-muted">App {prof.doS}</p>
          </div>
          <button
            type="button"
            onClick={() => void logout()}
            aria-label="Sair"
            className="flex h-11 w-11 items-center justify-center rounded-control text-muted hover:bg-surface-2 hover:text-ink"
          >
            <LogOut className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>
      </header>

      <main id="main-content" className="mx-auto max-w-xl px-4 pb-28 pt-4">{children}</main>

      <nav
        aria-label="Navegação do app"
        className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-surface pb-[env(safe-area-inset-bottom)]"
      >
        <ul className="mx-auto grid max-w-xl grid-cols-4">
          {ABAS_BANCADA.map(({ href, label, icon: Icone, ativa }) => {
            const atual = ativa(pathname);
            return (
              <li key={href}>
                <Link
                  href={href}
                  aria-current={atual ? 'page' : undefined}
                  className={cn(
                    'flex h-16 flex-col items-center justify-center gap-1 text-[11px] font-semibold',
                    atual ? 'text-brand-text' : 'text-muted hover:text-ink',
                  )}
                >
                  <Icone className="h-5 w-5" aria-hidden="true" />
                  {label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </div>
  );
}
