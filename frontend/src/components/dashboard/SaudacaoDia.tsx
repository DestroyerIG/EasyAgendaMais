'use client';

import Link from 'next/link';
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

// "YYYY-MM-DD" (dia do negócio, vindo do servidor) -> Date local ao meio-dia, sem
// passar por UTC (new Date('2026-10-13') cairia no dia anterior no Brasil).
export function dataDoDia(ymd: string): Date {
  const [ano, mes, dia] = ymd.split('-').map(Number);
  return new Date(ano, (mes || 1) - 1, dia || 1, 12);
}

export interface SaudacaoDiaProps {
  /** Nome de quem é dona do negócio (GET /dashboard/today → saudacao.ownerName). */
  ownerName: string;
  /** Dia do negócio em "YYYY-MM-DD"; sem ele, usa o relógio local. */
  data?: string;
  /** Nome do negócio para a pílula do celular (hoje-mobile.html: "Studio Aurora · …"). */
  businessName?: string;
}

// Saudação da tela Hoje (hoje-desktop.html / hoje-mobile.html: "Bom dia, Carla"):
// saudação pela hora local + nome da dona; a data por extenso é a do negócio.
// A pílula do celular traz só o nome do negócio — a referência soma "· 3 ativas",
// número que o sistema não calcula, então ele fica de fora em vez de inventado.
export function SaudacaoDia({ ownerName, data, businessName }: SaudacaoDiaProps) {
  const agora = new Date();
  const dia = data ? dataDoDia(data) : agora;

  return (
    <div className="flex items-center justify-between gap-3">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-ink">
          {saudacaoPorHora(agora.getHours())}, {ownerName}
        </h1>
        <p className="mt-0.5 text-[14px] font-medium text-muted">{formatarDataPorExtenso(dia)}</p>
      </div>
      {businessName ? (
        <div className="inline-flex min-w-0 shrink items-center gap-1.5 rounded-full bg-surface-2 px-3 py-1.5 text-[11px] font-semibold text-ink lg:hidden">
          <span className="h-2 w-2 shrink-0 rounded-full bg-success" />
          <span className="truncate">{businessName}</span>
        </div>
      ) : null}
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
