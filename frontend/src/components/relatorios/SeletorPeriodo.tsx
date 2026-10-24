'use client';

import { useState } from 'react';
import { Button, Icon, Input } from '@/components/ui';
import { cn } from '@/lib/cn';
import { type Periodo, hojeLocal, mesAnterior, mesDe, quinzenaDe, quinzenaVizinha, rotuloPeriodo, ultimos30 } from '@/lib/relatorios';

// Seletor de período das telas de Relatórios e Comissões. Nas comissões, as setas andam
// de quinzena em quinzena (a quinzena é o período padrão do acerto).

type Opcao = 'quinzena' | '30dias' | 'mes' | 'mes_anterior' | 'livre';

interface SeletorPeriodoProps {
  periodo: Periodo;
  onChange: (p: Periodo) => void;
  opcoes: Opcao[];
  setasQuinzena?: boolean;
}

const ROTULO: Record<Opcao, string> = {
  quinzena: 'Esta quinzena',
  '30dias': 'Últimos 30 dias',
  mes: 'Mês atual',
  mes_anterior: 'Mês anterior',
  livre: 'Personalizado',
};

const periodoDa = (o: Exclude<Opcao, 'livre'>, hoje: string): Periodo =>
  o === 'quinzena' ? quinzenaDe(hoje) : o === '30dias' ? ultimos30(hoje) : o === 'mes' ? mesDe(hoje) : mesAnterior(hoje);

export const MAX_DIAS = 366;

export function SeletorPeriodo({ periodo, onChange, opcoes, setasQuinzena = false }: SeletorPeriodoProps) {
  const [aberto, setAberto] = useState(false);
  const [livre, setLivre] = useState<Periodo>(periodo);
  const [erro, setErro] = useState<string | null>(null);
  const hoje = hojeLocal();

  const aplicarLivre = () => {
    if (!livre.inicio || !livre.fim || livre.inicio > livre.fim) return setErro('O início precisa ser antes do fim.');
    const dias = (Date.parse(livre.fim) - Date.parse(livre.inicio)) / 86400000 + 1;
    if (dias > MAX_DIAS) return setErro('Escolha um período de até 366 dias.');
    setErro(null);
    setAberto(false);
    onChange(livre);
  };

  return (
    <div className="relative flex items-center gap-1">
      {setasQuinzena && (
        <Button variant="ghost" size="sm" aria-label="Quinzena anterior" onClick={() => onChange(quinzenaVizinha(periodo, -1))}>
          <Icon name="chevron_left" size={18} />
        </Button>
      )}
      <button
        type="button"
        aria-haspopup="dialog"
        aria-expanded={aberto}
        onClick={() => setAberto((v) => !v)}
        className="flex h-11 items-center gap-2 rounded-control border border-line bg-surface px-3 text-[14px] font-semibold text-ink hover:bg-surface-2"
      >
        <Icon name="calendar_today" size={18} className="text-muted" />
        {rotuloPeriodo(periodo)}
        <Icon name="expand_more" size={18} className="text-muted" />
      </button>
      {setasQuinzena && (
        <Button variant="ghost" size="sm" aria-label="Próxima quinzena" onClick={() => onChange(quinzenaVizinha(periodo, 1))}>
          <Icon name="chevron_right" size={18} />
        </Button>
      )}
      {aberto && (
        <div role="dialog" aria-label="Escolher período" className="absolute left-0 top-12 z-30 w-72 space-y-2 rounded-card border border-line bg-surface p-3 shadow-lg">
          {opcoes.filter((o): o is Exclude<Opcao, 'livre'> => o !== 'livre').map((o) => {
            const p = periodoDa(o, hoje);
            const ativa = p.inicio === periodo.inicio && p.fim === periodo.fim;
            return (
              <button
                key={o}
                type="button"
                onClick={() => { setAberto(false); onChange(p); }}
                className={cn('flex w-full items-center justify-between rounded-control px-3 py-2 text-left text-[14px] hover:bg-surface-2', ativa && 'bg-surface-2 font-semibold')}
              >
                {ROTULO[o]}
                {ativa && <Icon name="check" size={16} />}
              </button>
            );
          })}
          {opcoes.includes('livre') && (
            <div className="space-y-2 border-t border-line pt-2">
              <p className="px-1 text-[13px] font-semibold text-muted">{ROTULO.livre}</p>
              <div className="flex gap-2">
                <Input type="date" aria-label="Início" value={livre.inicio} max={hoje} onChange={(e) => setLivre((l) => ({ ...l, inicio: e.target.value }))} />
                <Input type="date" aria-label="Fim" value={livre.fim} onChange={(e) => setLivre((l) => ({ ...l, fim: e.target.value }))} />
              </div>
              {erro && <p role="alert" className="text-[13px] text-danger">{erro}</p>}
              <Button size="sm" fullWidth onClick={aplicarLivre}>Aplicar</Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
