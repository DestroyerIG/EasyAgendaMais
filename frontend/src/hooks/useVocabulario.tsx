'use client';

import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { termosDe, type Termos, type Vocabulario } from '@/lib/vocabulario';

// Termos do segmento para as telas (fase 6). No painel e na bancada vêm do usuário logado; na página
// pública, do payload da vitrine (VocabularioProvider).

const VocabularioContext = createContext<Vocabulario | null>(null);

export function VocabularioProvider({ vocabulario, children }: { vocabulario: Vocabulario | null | undefined; children: ReactNode }) {
  return <VocabularioContext.Provider value={vocabulario ?? null}>{children}</VocabularioContext.Provider>;
}

// Fora do AuthProvider (página pública sem vitrine, telas isoladas) fica o vocabulário padrão. O
// useAuth só lê o contexto, então a ordem dos hooks é a mesma com ou sem provider.
function vocabularioDaSessao(): Vocabulario | null {
  try {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    return useAuth().user?.vocabulario ?? null;
  } catch {
    return null;
  }
}

export function useVocabulario(): Termos {
  const daPagina = useContext(VocabularioContext);
  const v = daPagina ?? vocabularioDaSessao();
  // Pela chave em texto: o /auth/me devolve um objeto novo a cada refresh, mas os termos são os mesmos.
  const chave = v ? JSON.stringify(v) : '';
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => termosDe(v), [chave]);
}
