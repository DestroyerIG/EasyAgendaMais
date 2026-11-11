'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { onboardingApi } from '@/lib/onboarding';
import { getNavItem, normalizePath } from '@/lib/navigation';
import { PASSOS_TOUR, deveAbrirTour, passoAnterior, proximoPasso } from '@/lib/tour';
import { TourBalao } from './TourBalao';

interface TourContextValue {
  /** Só a dona vê o tour; para os outros papéis o item do menu não aparece. */
  disponivel: boolean;
  iniciar: () => void;
}

const TourContext = createContext<TourContextValue>({ disponivel: false, iniciar: () => undefined });
export const useTour = () => useContext(TourContext);

// O /auth/me só é recarregado ao abrir a página: este marcador evita reabrir o tour já visto
// quando o painel é desmontado e montado de novo na mesma sessão.
let tourVistoNestaSessao = false;

export function TourProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [passo, setPasso] = useState<number | null>(null);

  const disponivel = user?.role === 'tenant_admin' && user.onboarding?.bloqueante === false;

  useEffect(() => {
    if (!tourVistoNestaSessao && deveAbrirTour(user)) setPasso(0);
  }, [user]);

  const irPara = useCallback(
    (indice: number) => {
      setPasso(indice);
      const nav = PASSOS_TOUR[indice]?.nav;
      if (!nav) return;
      const destino = getNavItem(nav).href;
      if (normalizePath(pathname) !== destino) router.push(destino);
    },
    [pathname, router],
  );

  const fechar = useCallback(() => {
    tourVistoNestaSessao = true;
    setPasso(null);
    // Ao rever o tour a chamada não muda nada: o servidor guarda só a primeira data.
    void onboardingApi.concluirTour().catch(() => undefined);
  }, []);

  const avancar = useCallback(() => {
    if (passo === null) return;
    const prox = proximoPasso(passo);
    if (prox === null) fechar();
    else irPara(prox);
  }, [passo, fechar, irPara]);

  const voltar = useCallback(() => {
    if (passo !== null) irPara(passoAnterior(passo));
  }, [passo, irPara]);

  const value = useMemo<TourContextValue>(
    () => ({ disponivel, iniciar: () => irPara(0) }),
    [disponivel, irPara],
  );

  return (
    <TourContext.Provider value={value}>
      {children}
      {passo !== null && <TourBalao indice={passo} onAvancar={avancar} onVoltar={voltar} onPular={fechar} />}
    </TourContext.Provider>
  );
}
