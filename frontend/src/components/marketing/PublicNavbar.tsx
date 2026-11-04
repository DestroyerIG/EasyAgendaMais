'use client';

import { useState } from 'react';
import Link from 'next/link';
import { BrandLogo, Icon } from '@/components/ui';

const navItems = [
  { href: '#inicio', label: 'Início' },
  { href: '#recursos', label: 'Recursos' },
  { href: '#planos', label: 'Planos' },
  { href: '#contato', label: 'Contato' },
];

export function PublicNavbar() {
  const [open, setOpen] = useState(false);

  return (
    <header className="sticky top-0 z-50 border-b border-line bg-surface/80 shadow-[0_1px_8px_rgba(0,0,0,0.04)] backdrop-blur-xl">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 lg:px-8">
        <Link href="/" className="flex items-center gap-1" aria-label="EasyAgenda+ página inicial">
          <BrandLogo size={32} decorativa priority className="mr-1.5" />
          <span className="text-xl font-black tracking-tight text-ink">EasyAgenda</span>
          <span className="text-xl font-black text-brand">+</span>
        </Link>

        <nav className="hidden items-center gap-8 lg:flex" aria-label="Navegação pública">
          {navItems.map((item) => (
            <a key={item.href} href={item.href} className="text-sm font-semibold text-muted transition-colors hover:text-ink">
              {item.label}
            </a>
          ))}
        </nav>

        <div className="hidden items-center gap-3 lg:flex">
          <Link
            href="/login"
            className="inline-flex items-center justify-center rounded-lg border border-line px-4 py-2 text-sm font-semibold text-ink transition-colors hover:border-ink/40"
          >
            Login
          </Link>
          <Link
            href="/cadastro"
            className="inline-flex items-center justify-center rounded-lg bg-brand px-5 py-2 text-sm font-bold text-on-brand transition-opacity hover:opacity-90"
          >
            Testar grátis
          </Link>
        </div>

        <button
          type="button"
          onClick={() => setOpen((prev) => !prev)}
          className="rounded-lg border border-line p-2 text-ink lg:hidden"
          aria-label={open ? 'Fechar menu' : 'Abrir menu'}
          aria-expanded={open}
          aria-controls="mobile-menu"
        >
          <Icon name={open ? 'close' : 'menu'} size={20} />
        </button>
      </div>

      {open && (
        <div id="mobile-menu" className="border-t border-line bg-surface lg:hidden">
          <div className="mx-auto flex max-w-7xl flex-col gap-2 px-4 py-4">
            {navItems.map((item) => (
              <a
                key={item.href}
                href={item.href}
                onClick={() => setOpen(false)}
                className="rounded-lg px-3 py-2 text-sm font-semibold text-ink hover:bg-surface-2"
              >
                {item.label}
              </a>
            ))}
            <div className="mt-2 flex flex-col gap-2">
              <Link
                href="/login"
                onClick={() => setOpen(false)}
                className="rounded-lg border border-line px-4 py-2 text-center text-sm font-semibold text-ink"
              >
                Login
              </Link>
              <Link
                href="/cadastro"
                onClick={() => setOpen(false)}
                className="rounded-lg bg-brand px-4 py-2 text-center text-sm font-bold text-on-brand"
              >
                Testar grátis
              </Link>
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
