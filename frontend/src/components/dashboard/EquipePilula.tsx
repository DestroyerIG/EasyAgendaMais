'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import api from '@/lib/api';
import { cn } from '@/lib/cn';
import { Avatar } from '@/components/ui';
import { useToast } from '@/components/Toast';
import { getApiErrorMessage } from '@/utils/handleApiError';
import { avisoAgendamentosMantidos, disponibilidadeApi } from '@/lib/disponibilidade';
import { SwitchDisponibilidade } from '@/components/disponibilidade/SwitchDisponibilidade';
import type { Professional } from '@/types';

type Linha = Pick<Professional, 'id' | 'name' | 'photo'> & { available: boolean; agendamentosFuturos: number };

// Atalho do dashboard: a pílula mostra de relance quem está atendendo e abre a lista
// com o botão de ligar/desligar de cada uma. Sem profissionais (ou se a busca falhar), some.
export function EquipePilula() {
  const [equipe, setEquipe] = useState<Linha[] | null>(null);
  const [aberta, setAberta] = useState(false);
  const [salvando, setSalvando] = useState<string | null>(null);
  const raiz = useRef<HTMLDivElement>(null);
  const { showToast } = useToast();

  useEffect(() => {
    let vivo = true;
    api.get<Professional[]>('/business/professionals')
      .then(({ data }) => {
        if (!vivo) return;
        setEquipe(data.map((p) => ({
          id: p.id, name: p.name, photo: p.photo, available: p.available !== false, agendamentosFuturos: p.agendamentosFuturos ?? 0,
        })));
      })
      .catch(() => { if (vivo) setEquipe([]); });
    return () => { vivo = false; };
  }, []);

  useEffect(() => {
    if (!aberta) return;
    const fora = (e: MouseEvent) => { if (!raiz.current?.contains(e.target as Node)) setAberta(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setAberta(false); };
    document.addEventListener('mousedown', fora);
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', fora); document.removeEventListener('keydown', esc); };
  }, [aberta]);

  const alternar = useCallback(async (p: Linha, available: boolean) => {
    setSalvando(p.id);
    try {
      const r = await disponibilidadeApi.definir(p.id, available);
      setEquipe((atual) => atual?.map((x) => (x.id === p.id ? { ...x, available: r.available, agendamentosFuturos: r.agendamentosFuturos } : x)) ?? atual);
      const mantidos = avisoAgendamentosMantidos(r.agendamentosFuturos);
      showToast(
        available
          ? `${p.name} voltou a ficar disponível`
          : `${p.name} está indisponível. ${mantidos ? `${mantidos}.` : 'Novos agendamentos estão bloqueados.'}`,
        'success',
      );
    } catch (error: unknown) {
      showToast(getApiErrorMessage(error, 'Não foi possível alterar a disponibilidade'), 'error');
    } finally {
      setSalvando(null);
    }
  }, [showToast]);

  if (!equipe || equipe.length === 0) return null;

  const disponiveis = equipe.filter((p) => p.available).length;

  return (
    <div ref={raiz} className="relative">
      <button
        type="button"
        aria-haspopup="true"
        aria-expanded={aberta}
        onClick={() => setAberta((v) => !v)}
        className="inline-flex items-center gap-2 rounded-full border border-line bg-surface px-3 py-1.5 text-[13px] font-bold text-ink shadow-sm transition-colors hover:bg-surface-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
      >
        <span className="flex gap-0.5" aria-hidden="true">
          {equipe.slice(0, 6).map((p) => (
            <span key={p.id} className={cn('h-2 w-2 rounded-full', p.available ? 'bg-success' : 'bg-line ring-1 ring-inset ring-muted')} />
          ))}
        </span>
        <span>
          <span className="hidden sm:inline">Equipe </span>
          {disponiveis}/{equipe.length}
        </span>
        <ChevronDown className={cn('h-3.5 w-3.5 text-muted transition-transform', aberta && 'rotate-180')} aria-hidden="true" />
      </button>

      {aberta && (
        <div
          role="dialog"
          aria-label="Disponibilidade da equipe"
          className="absolute right-0 top-full z-30 mt-2 w-[min(20rem,calc(100vw-2rem))] rounded-card border border-line bg-surface p-3 shadow-xl"
        >
          <p className="px-1 pb-1 text-[12px] font-bold text-muted">Disponibilidade da equipe</p>
          <ul>
            {equipe.map((p) => {
              const mantidos = !p.available ? avisoAgendamentosMantidos(p.agendamentosFuturos) : '';
              return (
                <li key={p.id} className="flex items-center gap-3 border-t border-line py-2 first:border-t-0">
                  <span className={cn(!p.available && 'opacity-60 grayscale')}>
                    <Avatar name={p.name} src={p.photo} size={34} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className={cn('truncate text-[14px] font-semibold', p.available ? 'text-ink' : 'text-muted')}>{p.name}</p>
                    <p className={cn('text-[12px] font-semibold', p.available ? 'text-success-text' : 'text-warning-text')}>
                      {p.available ? 'Disponível' : `Indisponível${mantidos ? ` · ${mantidos}` : ''}`}
                    </p>
                  </div>
                  <SwitchDisponibilidade
                    checked={p.available}
                    disabled={salvando === p.id}
                    onCheckedChange={(v) => void alternar(p, v)}
                    label={`${p.name} disponível para agendamentos`}
                  />
                </li>
              );
            })}
          </ul>
          <p className="border-t border-line pt-2 text-[12px] text-muted">
            Agendamentos já marcados continuam. Só os novos ficam bloqueados.
          </p>
        </div>
      )}
    </div>
  );
}
