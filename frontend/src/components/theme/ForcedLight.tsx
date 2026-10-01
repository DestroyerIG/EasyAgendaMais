'use client';

import { createContext, useContext, type ReactNode } from 'react';
import { cn } from '@/lib/cn';

const ForcedLightContext = createContext(false);

// Usado pelos componentes do kit que abrem em portal (modal, dropdown, painel):
// dentro de uma área forçada no claro, o portal também abre no claro.
export function useForcedLightClass(): 'light' | '' {
  return useContext(ForcedLightContext) ? 'light' : '';
}

// Landing pública: segue sempre o tema claro do Stitch, mesmo que o visitante
// tenha o sistema/navegador no escuro (o site público não tem alternância de tema).
export function ForcedLight({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <ForcedLightContext.Provider value>
      <div className={cn('light', className)}>{children}</div>
    </ForcedLightContext.Provider>
  );
}
