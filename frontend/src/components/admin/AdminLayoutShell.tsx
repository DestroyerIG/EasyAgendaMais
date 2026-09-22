'use client';

import type { ReactNode } from 'react';
import { AdminSidebar } from '@/components/admin/AdminSidebar';
import { AdminTopbar } from '@/components/admin/AdminTopbar';
import { ForcedDark } from '@/components/theme/ForcedDark';

export function AdminLayoutShell({ children }: { children: ReactNode }) {
  return (
    <ForcedDark className="min-h-screen lg:flex">
      <AdminSidebar />
      <div className="flex-1">
        <AdminTopbar />
        <main className="mx-auto w-full max-w-7xl p-4 lg:p-6">{children}</main>
      </div>
    </ForcedDark>
  );
}
