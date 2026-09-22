'use client';

import { createContext, useContext, type ReactNode } from 'react';
import { cn } from '@/lib/cn';

const ForcedDarkContext = createContext(false);

// Usado pelos componentes do kit que abrem em portal (modal, painel, menu):
// dentro de uma área forçada no escuro, o portal também abre no escuro.
export function useForcedDarkClass(): 'dark' | '' {
  return useContext(ForcedDarkContext) ? 'dark' : '';
}

// Áreas que ainda não seguem o design system (landing, termos, privacidade, SuperAdmin,
// e o conteúdo da página de planos): mantêm o visual escuro de hoje em qualquer tema.
export function ForcedDark({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <ForcedDarkContext.Provider value>
      <div className={cn('dark bg-black text-white', className)}>{children}</div>
    </ForcedDarkContext.Provider>
  );
}
