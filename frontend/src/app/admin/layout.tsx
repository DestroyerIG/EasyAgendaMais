'use client';

import type { ReactNode } from 'react';
import { Skeleton } from '@/components/ui';
import { AdminLayoutShell } from '@/components/admin/AdminLayoutShell';
import { useRequireRole } from '@/hooks/useRequireRole';

export default function AdminLayout({ children }: { children: ReactNode }) {
  const { isChecking, isAuthorized } = useRequireRole({
    allowedRoles: ['platform_admin'],
    redirectTo: '/dashboard',
    unauthenticatedRedirectTo: '/login',
  });

  if (isChecking || !isAuthorized) {
    return (
      <div className="flex min-h-screen flex-col gap-4 bg-bg p-6">
        <Skeleton className="h-10 w-64" label="Carregando o admin" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return <AdminLayoutShell>{children}</AdminLayoutShell>;
}
