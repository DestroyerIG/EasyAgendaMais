'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { getPlanShellLabel } from '@/lib/plans';
import { NAV_ITEMS, getActiveNavItem } from '@/lib/navigation';
import { Sidebar } from './Sidebar';
import { TopBar } from './TopBar';
import { BottomNav } from './BottomNav';
import { MoreSheet } from './MoreSheet';
import { TrialBanner } from './TrialBanner';
import { TopBarSearchProvider } from './TopBarSearchContext';
import { useVocabulario } from '@/hooks/useVocabulario';
import { useEstadoConta } from '@/hooks/useEstadoConta';
import { FaixaContingencia } from '@/components/assinatura/FaixaContingencia';

const MARCA_CONTINGENCIA = 'easyagenda:contingenciaVista';
const PAGINAS_LIVRES_BLOQUEIO = ['/dashboard/assinatura', '/dashboard/planos'];
const naPagina = (pathname: string, base: string) => pathname === base || pathname.startsWith(`${base}/`);

// Cargo exibido na pílula de usuário da barra superior — só os papéis que chegam
// à casca do painel (tenant_admin e employee; platform_admin vai para /admin).
// O employee aparece com o termo do segmento ("Barbeiro", "Nail designer").
const ROLE_LABEL: Record<string, string> = {
  tenant_admin: 'Administradora',
};

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, logout } = useAuth();
  const { prof } = useVocabulario();
  const [moreOpen, setMoreOpen] = useState(false);
  // O papel `professional` usa só o app da bancada (fase 5): o painel fica fechado para ele.
  const ehProfissional = user?.role === 'professional';
  // Conta nova da dona: as etapas 1 a 3 do onboarding vêm antes do painel (fase 6).
  const onboardingPendente = user?.role === 'tenant_admin' && user.onboarding?.bloqueante === true;

  const { estado } = useEstadoConta();
  const tipoEstado = estado?.tipo;

  useEffect(() => {
    if (!tipoEstado || tipoEstado === 'ativa' || ehProfissional || onboardingPendente) return;
    if (naPagina(pathname, '/dashboard/assinatura')) return;
    if (tipoEstado === 'bloqueada') {
      if (!PAGINAS_LIVRES_BLOQUEIO.some((p) => naPagina(pathname, p))) router.replace('/dashboard/assinatura');
      return;
    }
    // Carência: leva à tela da assinatura só na primeira tela da sessão.
    let vista = false;
    try {
      vista = window.sessionStorage.getItem(MARCA_CONTINGENCIA) === '1';
    } catch {
      /* sem sessionStorage: trata como não vista */
    }
    if (vista) return;
    try {
      window.sessionStorage.setItem(MARCA_CONTINGENCIA, '1');
    } catch {
      /* ignora */
    }
    router.replace('/dashboard/assinatura');
  }, [tipoEstado, pathname, ehProfissional, onboardingPendente, router]);

  useEffect(() => {
    if (ehProfissional) router.replace('/bancada');
    else if (onboardingPendente) router.replace('/onboarding');
  }, [ehProfissional, onboardingPendente, router]);

  const activeId = getActiveNavItem(pathname);
  const businessName = user?.businessName || 'Seu negócio';
  const planLabel = getPlanShellLabel(user?.plan || '');
  const roleLabel = user?.role === 'employee' ? prof.S : (user?.role && ROLE_LABEL[user.role]) || 'Administradora';
  const title = NAV_ITEMS.find((item) => item.id === activeId)?.label ?? 'EasyAgenda+';
  const handleLogout = () => {
    void logout();
  };

  if (ehProfissional || onboardingPendente) return <div className="app-theme min-h-screen" />;

  return (
    <div className="app-theme min-h-screen">
      <TopBarSearchProvider>
        <Sidebar activeId={activeId} businessName={businessName} planLabel={planLabel} onLogout={handleLogout} />
        <div className="lg:pl-[248px]">
          <TopBar activeId={activeId} pageTitle={title} businessName={businessName} roleLabel={roleLabel} onLogout={handleLogout} />
          <TrialBanner />
          {estado?.tipo === 'carencia' && <FaixaContingencia diasRestantes={estado.diasRestantes} />}
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
