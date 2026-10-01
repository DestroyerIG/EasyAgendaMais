'use client';

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

export interface TopBarSearchConfig {
  value: string;
  onChange: (value: string) => void;
}

interface TopBarSearchContextValue {
  config: TopBarSearchConfig | null;
  setConfig: (config: TopBarSearchConfig | null) => void;
}

const TopBarSearchContext = createContext<TopBarSearchContextValue | null>(null);

// Ponte entre a busca da barra superior e o filtro que já existe dentro do
// conteúdo da tela (ex.: ClientModule). A tela continua dona do seu próprio
// estado; aqui só publicamos o valor e o setter já existentes para a TopBar ler.
export function TopBarSearchProvider({ children }: { children: ReactNode }) {
  const [config, setConfig] = useState<TopBarSearchConfig | null>(null);
  const contextValue = useMemo(() => ({ config, setConfig }), [config]);
  return <TopBarSearchContext.Provider value={contextValue}>{children}</TopBarSearchContext.Provider>;
}

export function useTopBarSearchConfig(): TopBarSearchConfig | null {
  const ctx = useContext(TopBarSearchContext);
  return ctx?.config ?? null;
}

// Chamado pela tela que já tem um filtro de busca em texto (ex.: Clientes) para
// que a barra superior passe a controlar o mesmo estado. Sem provider (ex.: em
// testes isolados do módulo), não faz nada.
export function useRegisterTopBarSearch(config: TopBarSearchConfig | null): void {
  const ctx = useContext(TopBarSearchContext);
  // Depende do próprio `setConfig` (identidade estável, de useState), não do objeto
  // `ctx` — esse é recriado a cada render do Provider, inclusive pelos renders que
  // este mesmo efeito causa, o que virava um loop de atualização infinito.
  const setConfig = ctx?.setConfig ?? null;
  const value = config?.value ?? null;
  const onChange = config?.onChange ?? null;

  useEffect(() => {
    if (!setConfig) return;
    setConfig(value !== null && onChange ? { value, onChange } : null);
    return () => setConfig(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setConfig, value, onChange]);
}
