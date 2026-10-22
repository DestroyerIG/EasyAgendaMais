'use client';

import { useState, type ReactNode } from 'react';
import { Tabs, TabsList, TabsTrigger, TabsContent, Icon } from '@/components/ui';

type SubAba = 'menu' | 'mensagens' | 'simulador';

const SUB_ABAS: { id: SubAba; label: string; icon: string }[] = [
  { id: 'menu', label: 'Menu', icon: 'list' },
  { id: 'mensagens', label: 'Mensagens', icon: 'tune' },
  { id: 'simulador', label: 'Simulador', icon: 'smart_toy' },
];

interface RoboAtendimentoProps {
  menu: ReactNode;
  mensagens: ReactNode;
  simulador: ReactNode;
}

/** Seção "Robô de atendimento" da aba Conexão: os painéis do robô (Menu, Mensagens, Simulador) em sub-abas. */
export function RoboAtendimento({ menu, mensagens, simulador }: RoboAtendimentoProps) {
  const [sub, setSub] = useState<SubAba>('menu');
  const conteudo: Record<SubAba, ReactNode> = { menu, mensagens, simulador };

  return (
    <section aria-labelledby="robo-atendimento-titulo" className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h2 id="robo-atendimento-titulo" className="text-[20px] font-bold leading-7 text-ink">Robô de atendimento</h2>
        <p className="text-[14px] leading-5 text-muted">Menu, mensagens e simulador do robô que responde as clientes no WhatsApp.</p>
      </div>
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
    </section>
  );
}
