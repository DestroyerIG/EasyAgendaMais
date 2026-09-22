'use client';

import type { ReactNode } from 'react';
import { LoadingSkeleton } from '@/components/LoadingSkeleton';
import { AdminLayoutShell } from '@/components/admin/AdminLayoutShell';
import { ForcedDark } from '@/components/theme/ForcedDark';
import { useRequireRole } from '@/hooks/useRequireRole';

export default function AdminLayout({ children }: { children: ReactNode }) {
  const { isChecking, isAuthorized } = useRequireRole({
    allowedRoles: ['platform_admin'],
    redirectTo: '/dashboard',
    unauthenticatedRedirectTo: '/login',
  });

  if (isChecking || !isAuthorized) {
    return (
      <ForcedDark className="min-h-screen">
        <LoadingSkeleton />
      </ForcedDark>
    );
  }

  return <AdminLayoutShell>{children}</AdminLayoutShell>;
}
