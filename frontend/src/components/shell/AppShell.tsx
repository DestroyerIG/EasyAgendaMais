'use client';

import { useState, type ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { NAV_ITEMS, getActiveNavItem } from '@/lib/navigation';
import { Sidebar } from './Sidebar';
import { TopBar } from './TopBar';
import { BottomNav } from './BottomNav';
import { MoreSheet } from './MoreSheet';
import { TrialBanner } from './TrialBanner';

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { user, logout } = useAuth();
  const [moreOpen, setMoreOpen] = useState(false);

  const activeId = getActiveNavItem(pathname);
  const businessName = user?.businessName || 'Seu negócio';
  const title = NAV_ITEMS.find((item) => item.id === activeId)?.label ?? 'EasyAgenda+';
  const handleLogout = () => {
    void logout();
  };

  return (
    <div className="app-theme min-h-screen">
      <Sidebar activeId={activeId} businessName={businessName} onLogout={handleLogout} />
      <div className="lg:pl-[248px]">
        <TopBar title={title} />
        <TrialBanner />
        <main id="main-content" className="mx-auto max-w-7xl px-4 pb-28 pt-4 lg:px-8 lg:pb-10 lg:pt-8">
          {children}
        </main>
      </div>
      <BottomNav activeId={activeId} onOpenMore={() => setMoreOpen(true)} />
      <MoreSheet open={moreOpen} onOpenChange={setMoreOpen} activeId={activeId} onLogout={handleLogout} />
    </div>
  );
}
