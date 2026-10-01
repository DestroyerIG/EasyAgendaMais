'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { TrendingUp } from 'lucide-react';
import { formatCurrency } from '@/lib/formatters';

const SEMANAS_POR_MES = 4; // mesma aproximação usada na referência Stitch
const TAXA_RECUPERACAO_SINAL = 0.9; // parcela do prejuízo evitável com sinal Pix + lembretes

export function RoiCalculator() {
  const [atendimentosDia, setAtendimentosDia] = useState(6);
  const [ticketMedio, setTicketMedio] = useState(120);
  const [faltasSemana, setFaltasSemana] = useState(3);

  const { prejuizoMensal, recuperado } = useMemo(() => {
    const prejuizo = faltasSemana * SEMANAS_POR_MES * ticketMedio;
    return {
      prejuizoMensal: prejuizo,
      recuperado: Math.round(prejuizo * TAXA_RECUPERACAO_SINAL),
    };
  }, [faltasSemana, ticketMedio]);

  return (
    <div className="grid grid-cols-1 items-stretch gap-6 lg:grid-cols-12">
      <div className="flex flex-col gap-6 rounded-card border border-line bg-bg p-6 lg:col-span-7 lg:p-8">
        <Slider
          label="Atendimentos por dia"
          hint="Média de atendimentos diários em sua cadeira ou estúdio."
          value={atendimentosDia}
          min={2}
          max={25}
          onChange={setAtendimentosDia}
          formatValue={(v) => String(v)}
        />
        <Slider
          label="Ticket médio por serviço (R$)"
          hint="Valor médio pago por cliente a cada visita."
          value={ticketMedio}
          min={30}
          max={400}
          step={10}
          onChange={setTicketMedio}
          formatValue={(v) => formatCurrency(v)}
        />
        <Slider
          label="Faltas ou desistências por semana"
          hint="Clientes que marcam e desmarcam em cima da hora ou simplesmente não aparecem."
          value={faltasSemana}
          min={1}
          max={15}
          onChange={setFaltasSemana}
          formatValue={(v) => String(v)}
        />
      </div>

      <div className="flex flex-col justify-between gap-6 rounded-card border border-line bg-surface-2 p-6 shadow-sm lg:col-span-5 lg:p-8">
        <div className="flex flex-col gap-6">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-muted">
              Prejuízo mensal direto com no-show
            </p>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="text-3xl font-black tabular-nums text-danger sm:text-4xl">
                {formatCurrency(prejuizoMensal)}
              </span>
              <span className="text-sm text-muted">/mês</span>
            </div>
            <p className="mt-1 text-sm text-muted">
              Dinheiro líquido que deixou de entrar no caixa por horários ociosos na sua grade.
            </p>
          </div>

          <div className="flex flex-col gap-2 rounded-xl border border-line bg-surface p-5 shadow-sm">
            <div className="flex items-center gap-2 text-whatsapp">
              <TrendingUp className="h-5 w-5" aria-hidden="true" />
              <span className="text-sm font-bold">Com o EasyAgenda+</span>
            </div>
            <p className="text-sm text-ink">
              Com cobrança de sinal Pix antecipado e lembretes automáticos em 24h e 2h:
            </p>
            <div className="mt-1 flex flex-wrap items-baseline gap-1.5">
              <span className="text-sm text-ink">Você recupera até</span>
              <span className="text-lg font-black tabular-nums text-ink">{formatCurrency(recuperado)}</span>
              <span className="text-sm text-ink">todos os meses.</span>
            </div>
          </div>
        </div>

        <Link
          href="/cadastro"
          className="inline-flex w-full items-center justify-center rounded-xl bg-brand px-6 py-4 text-center text-sm font-bold text-on-brand shadow-md transition-opacity hover:opacity-90"
        >
          Parar de perder dinheiro agora
        </Link>
      </div>
    </div>
  );
}

function Slider({
  label,
  hint,
  value,
  min,
  max,
  step = 1,
  onChange,
  formatValue,
}: {
  label: string;
  hint: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (value: number) => void;
  formatValue: (value: number) => string;
}) {
  return (
    <label className="flex flex-col gap-2">
      <span className="flex items-center justify-between gap-3">
        <span className="text-sm font-bold text-ink sm:text-base">{label}</span>
        <span className="rounded-lg border border-line bg-surface px-3 py-1 text-sm font-bold tabular-nums text-ink sm:text-base">
          {formatValue(value)}
        </span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="h-2 w-full cursor-pointer appearance-none rounded-full bg-line accent-brand"
      />
      <span className="text-xs text-muted">{hint}</span>
    </label>
  );
}
