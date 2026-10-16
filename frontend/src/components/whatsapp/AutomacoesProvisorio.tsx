'use client';

import { useState, type ReactNode } from 'react';
import { Tabs, TabsList, TabsTrigger, TabsContent, Icon } from '@/components/ui';

type SubAba = 'menu' | 'mensagens' | 'simulador';

const SUB_ABAS: { id: SubAba; label: string; icon: string }[] = [
  { id: 'menu', label: 'Menu', icon: 'list' },
  { id: 'mensagens', label: 'Mensagens', icon: 'tune' },
  { id: 'simulador', label: 'Simulador', icon: 'smart_toy' },
];

interface AutomacoesProvisorioProps {
  menu: ReactNode;
  mensagens: ReactNode;
  simulador: ReactNode;
}

/** Abriga os painéis atuais do robô (Menu, Mensagens, Simulador) em sub-abas até o redesenho de Automações. */
export function AutomacoesProvisorio({ menu, mensagens, simulador }: AutomacoesProvisorioProps) {
  const [sub, setSub] = useState<SubAba>('menu');
  const conteudo: Record<SubAba, ReactNode> = { menu, mensagens, simulador };

  return (
    <Tabs value={sub} onValueChange={(v) => setSub(v as SubAba)}>
      <TabsList>
        {SUB_ABAS.map((t) => (
          <TabsTrigger key={t.id} value={t.id} className="gap-2">
            <Icon name={t.icon} size={16} />
            {t.label}
          </TabsTrigger>
        ))}
      </TabsList>
      {SUB_ABAS.map((t) => (
        <TabsContent key={t.id} value={t.id}>
          {conteudo[t.id]}
        </TabsContent>
      ))}
    </Tabs>
  );
}
