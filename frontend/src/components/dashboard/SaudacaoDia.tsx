'use client';

import { conteudoDemo } from '@/lib/conteudoDemo';

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
// mistura o nome real do negócio com a contagem de profissionais ativas de
// conteudoDemo — o sistema ainda não calcula "profissionais ativas agora".
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
        <span>
          {businessName} · {profissionaisAtivasHoje} ativas
        </span>
      </div>
    </div>
  );
}
