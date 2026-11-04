'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/cn';
import { BrandLogo, Icon } from '@/components/ui';

export const ADMIN_LINKS = [
  { href: '/admin', label: 'Visão geral', icon: 'monitoring' },
  { href: '/admin/negocios', label: 'Negócios', icon: 'storefront' },
  { href: '/admin/depoimentos', label: 'Depoimentos', icon: 'reviews' },
  { href: '/admin/coupons', label: 'Cupons', icon: 'sell' },
  { href: '/admin/logs', label: 'Auditoria', icon: 'security' },
] as const;

// "/admin" só fica ativo na própria página; os demais também nas subpáginas (ex.: detalhe do negócio).
export const linkAtivo = (pathname: string | null, href: string): boolean =>
  href === '/admin' ? pathname === href : pathname === href || Boolean(pathname?.startsWith(`${href}/`));

export function AdminSidebar() {
  const pathname = usePathname();

  return (
    <aside className="w-full border-b border-line bg-surface lg:sticky lg:top-0 lg:h-screen lg:w-[248px] lg:shrink-0 lg:border-b-0 lg:border-r">
      <div className="flex h-16 items-center gap-2.5 border-b border-line px-5">
        <BrandLogo size={32} decorativa />
        <div className="flex flex-col leading-tight">
          <span className="text-[17px] font-bold tracking-tight text-ink">
            EasyAgenda<span className="text-brand">+</span>
          </span>
          <span className="text-[11px] font-medium text-muted">SuperAdmin</span>
        </div>
      </div>

      <nav
        aria-label="Navegação do admin"
        className="flex gap-1 overflow-x-auto p-3 lg:flex-col lg:overflow-visible"
      >
        {ADMIN_LINKS.map((item) => {
          const ativo = linkAtivo(pathname, item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={ativo ? 'page' : undefined}
              className={cn(
                'flex shrink-0 items-center gap-3 rounded-xl px-3 py-2.5 text-[14px] transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand',
                ativo
                  ? 'bg-surface-2 font-bold text-ink'
                  : 'font-semibold text-muted hover:bg-surface-2/60 hover:text-ink',
              )}
            >
              <Icon name={item.icon} size={20} filled={ativo} className={ativo ? 'text-brand' : undefined} />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
