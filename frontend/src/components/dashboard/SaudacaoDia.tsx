'use client';

import Link from 'next/link';
import { conteudoDemo } from '@/lib/conteudoDemo';
import { Icon } from '@/components/ui';
import { NEW_APPOINTMENT_HREF, getNavItem } from '@/lib/navigation';

const DIAS_DA_SEMANA = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];

// Bom dia / Boa tarde / Boa noite conforme a hora do relógio local (hoje-desktop.html,
// hoje-mobile.html: "Bom dia, Carla"). Limites: manhã até 11h59, tarde até 17h59, noite depois.
export function saudacaoPorHora(hora: number): string {
  if (hora < 12) return 'Bom dia';
  if (hora < 18) return 'Boa tarde';
  return 'Boa noite';
}

// Data por extenso no formato do arquivo de referência ("terça, 17 de setembro de 2026"):
// dia da semana sem o sufixo "-feira", dia sem zero à esquerda, mês por extenso, ano completo.
export function formatarDataPorExtenso(data: Date): string {
  const diaSemana = DIAS_DA_SEMANA[data.getDay()];
  const dia = data.getDate();
  const mes = data.toLocaleDateString('pt-BR', { month: 'long' });
  const ano = data.getFullYear();
  return `${diaSemana}, ${dia} de ${mes} de ${ano}`;
}

export interface SaudacaoDiaProps {
  businessName: string;
}

// Saudação da tela Hoje: substitui o PageHeader genérico pelo cabeçalho da referência.
// Nome e data são sempre reais. A pílula de status (só no celular, hoje-mobile.html)
// traz a contagem de profissionais ativas de conteudoDemo — o sistema ainda não
// calcula "profissionais ativas agora". A referência escreve "Studio Aurora · 3
// ativas" porque lá a saudação usa o nome da pessoa; aqui a saudação já usa o nome
// do negócio (a sessão não guarda o nome do dono), então repetir o nome na pílula
// pareceria defeito e a palavra "profissionais" fica no lugar dele.
export function SaudacaoDia({ businessName }: SaudacaoDiaProps) {
  const agora = new Date();
  const { profissionaisAtivasHoje } = conteudoDemo.hoje;

  return (
    <div className="flex items-center justify-between gap-3">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-ink">
          {saudacaoPorHora(agora.getHours())}, {businessName}
        </h1>
        <p className="mt-0.5 text-[14px] font-medium text-muted">{formatarDataPorExtenso(agora)}</p>
      </div>
      <div className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-surface-2 px-3 py-1.5 text-[11px] font-semibold text-ink lg:hidden">
        <span className="h-2 w-2 rounded-full bg-success" />
        <span>{profissionaisAtivasHoje} profissionais ativas</span>
      </div>
      {/* Ações do computador (hoje-desktop.html): sem equivalente no celular, onde o
          "+" da barra inferior já cobre "Novo agendamento" e o WhatsApp mora no menu
          "Mais". Os dois levam para telas reais — nenhuma é decorativa. */}
      <div className="hidden shrink-0 items-center gap-3 lg:flex">
        <Link
          href={getNavItem('whatsapp').href}
          className="inline-flex items-center gap-2 rounded-control border border-line bg-surface px-4 py-2 text-[14px] font-bold text-whatsapp shadow-sm transition-colors hover:border-whatsapp/40 hover:bg-whatsapp/5"
        >
          <Icon name="chat" size={18} />
          Disparos WhatsApp
        </Link>
        <Link
          href={NEW_APPOINTMENT_HREF}
          className="inline-flex items-center gap-2 rounded-control bg-brand px-4 py-2 text-[14px] font-bold text-on-brand shadow-sm transition-transform hover:brightness-105 active:scale-[0.98]"
        >
          <Icon name="add" size={19} />
          Novo agendamento
        </Link>
      </div>
    </div>
  );
}
