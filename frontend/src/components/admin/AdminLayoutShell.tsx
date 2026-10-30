'use client';

import type { ReactNode } from 'react';
import { AdminSidebar } from '@/components/admin/AdminSidebar';
import { AdminTopbar } from '@/components/admin/AdminTopbar';

// O admin segue o tema do aparelho, como o painel.
export function AdminLayoutShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-bg text-ink lg:flex">
      <AdminSidebar />
      <div className="min-w-0 flex-1">
        <AdminTopbar />
        <main className="mx-auto w-full max-w-7xl p-4 lg:p-6">{children}</main>
      </div>
    </div>
  );
}
