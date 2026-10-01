'use client';

import { useState, type ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { getPlanShellLabel } from '@/lib/plans';
import { NAV_ITEMS, getActiveNavItem } from '@/lib/navigation';
import { Sidebar } from './Sidebar';
import { TopBar } from './TopBar';
import { BottomNav } from './BottomNav';
import { MoreSheet } from './MoreSheet';
import { TrialBanner } from './TrialBanner';
import { TopBarSearchProvider } from './TopBarSearchContext';

// Cargo exibido na pílula de usuário da barra superior — só os papéis que chegam
// à casca do painel (tenant_admin e employee; platform_admin vai para /admin).
const ROLE_LABEL: Record<string, string> = {
  tenant_admin: 'Administradora',
  employee: 'Profissional',
};

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { user, logout } = useAuth();
  const [moreOpen, setMoreOpen] = useState(false);

  const activeId = getActiveNavItem(pathname);
  const businessName = user?.businessName || 'Seu negócio';
  const planLabel = getPlanShellLabel(user?.plan || '');
  const roleLabel = (user?.role && ROLE_LABEL[user.role]) || 'Administradora';
  const title = NAV_ITEMS.find((item) => item.id === activeId)?.label ?? 'EasyAgenda+';
  const handleLogout = () => {
    void logout();
  };

  return (
    <div className="app-theme min-h-screen">
      <TopBarSearchProvider>
        <Sidebar activeId={activeId} businessName={businessName} planLabel={planLabel} onLogout={handleLogout} />
        <div className="lg:pl-[248px]">
          <TopBar activeId={activeId} pageTitle={title} businessName={businessName} roleLabel={roleLabel} onLogout={handleLogout} />
          <TrialBanner />
          <main id="main-content" className="mx-auto max-w-7xl px-4 pb-28 pt-4 lg:px-8 lg:pb-10 lg:pt-8">
            {children}
          </main>
        </div>
      </TopBarSearchProvider>
      <BottomNav activeId={activeId} onOpenMore={() => setMoreOpen(true)} />
      <MoreSheet open={moreOpen} onOpenChange={setMoreOpen} activeId={activeId} onLogout={handleLogout} />
    </div>
  );
}
