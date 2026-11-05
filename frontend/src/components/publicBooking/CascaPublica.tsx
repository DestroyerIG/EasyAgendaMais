'use client';

import type { ReactNode } from 'react';
import { Icon } from '@/components/ui';
import { ForcedLight } from '@/components/theme/ForcedLight';
import { cn } from '@/lib/cn';
import { temaDoNegocio } from '@/lib/temaNegocio';

/** Página pública: sempre no claro, como o Stitch, e com a cor do negócio no lugar do brand. */
export function CascaPublica({ cor, children }: { cor: string | null | undefined; children: ReactNode }) {
  return (
    // color-scheme: sem ele, caixa de seleção e campo de data seguem o tema escuro do aparelho.
    <ForcedLight className="min-h-screen bg-bg [color-scheme:light]">
      <div style={temaDoNegocio(cor)} className="mx-auto flex min-h-screen max-w-xl flex-col bg-bg text-ink">
        {children}
      </div>
    </ForcedLight>
  );
}

export const iniciais = (nome: string): string =>
  nome
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((parte) => parte.charAt(0).toUpperCase())
    .join('');

export function CabecalhoPublico({
  negocio,
  titulo,
  logoUrl,
  onVoltar,
}: {
  negocio: string;
  titulo: string;
  logoUrl: string | null;
  onVoltar?: () => void;
}) {
  return (
    <header className="sticky top-0 z-20 flex h-16 items-center justify-between gap-3 border-b border-line bg-surface/95 px-4 backdrop-blur">
      <div className="flex min-w-0 items-center gap-1">
        {onVoltar && (
          <button
            type="button"
            aria-label="Voltar"
            onClick={onVoltar}
            className="-ml-2 flex h-11 w-11 shrink-0 items-center justify-center text-ink"
          >
            <Icon name="arrow_back" size={24} />
          </button>
        )}
        <div className="flex min-w-0 flex-col">
          <span className="truncate text-[11px] font-semibold uppercase tracking-wider text-muted">{negocio}</span>
          <span className="truncate text-[17px] font-bold leading-tight text-ink">{titulo}</span>
        </div>
      </div>
      {logoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- URL externa (Supabase Storage), sem domínio pro next/image otimizar
        <img src={logoUrl} alt="" className="h-8 w-8 shrink-0 rounded-full border border-line object-cover" />
      ) : (
        <span aria-hidden="true" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand text-[12px] font-bold text-on-brand">
          {iniciais(negocio)}
        </span>
      )}
    </header>
  );
}

export function ProgressoEtapas({
  etapa,
  total,
  rotulo,
}: {
  etapa: number;
  total: number;
  rotulo: string;
}) {
  return (
    <div className="mb-4 flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="text-[12px] font-bold uppercase tracking-wider text-muted">
          Etapa {etapa} de {total}
        </span>
        <span className="text-[12px] font-bold text-brand-text">{rotulo}</span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-line">
        <div className="h-full rounded-full bg-brand transition-all duration-300" style={{ width: `${(etapa / total) * 100}%` }} />
      </div>
    </div>
  );
}

export type AbaPublica = 'inicio' | 'servicos' | 'horario';

function ItemNavegacao({
  rotulo,
  icone,
  ativo,
  disabled,
  onClick,
}: {
  rotulo: string;
  icone: string;
  ativo: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-current={ativo ? 'page' : undefined}
      className={cn(
        'flex min-h-11 min-w-[64px] flex-col items-center justify-center text-[12px] disabled:opacity-40',
        ativo ? 'font-bold text-brand-text' : 'text-muted',
      )}
    >
      <Icon name={icone} size={22} />
      {rotulo}
    </button>
  );
}

export function NavegacaoPublica({
  ativa,
  iconeServicos,
  horarioDisponivel,
  onInicio,
  onServicos,
  onHorario,
}: {
  ativa: AbaPublica;
  iconeServicos: string;
  horarioDisponivel: boolean;
  onInicio: () => void;
  onServicos: () => void;
  onHorario: () => void;
}) {
  return (
    <nav aria-label="Etapas do agendamento" className="flex h-16 items-center justify-around bg-surface px-2">
      <ItemNavegacao rotulo="Início" icone="storefront" ativo={ativa === 'inicio'} onClick={onInicio} />
      <ItemNavegacao rotulo="Serviços" icone={iconeServicos} ativo={ativa === 'servicos'} onClick={onServicos} />
      <ItemNavegacao rotulo="Horário" icone="calendar_today" ativo={ativa === 'horario'} disabled={!horarioDisponivel} onClick={onHorario} />
    </nav>
  );
}

export function MarcaPlataforma() {
  return <p className="bg-surface pb-2 text-center text-[11px] text-muted">Agendamento por EasyAgenda+</p>;
}
