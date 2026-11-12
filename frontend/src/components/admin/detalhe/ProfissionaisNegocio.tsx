'use client';

import { useCallback, useEffect, useState } from 'react';
import { Avatar, Skeleton } from '@/components/ui';
import { useToast } from '@/components/Toast';
import { cn } from '@/lib/cn';
import { getApiErrorMessage } from '@/utils/handleApiError';
import { avisoAgendamentosMantidos, disponibilidadeApi, type ProfissionalDoNegocio } from '@/lib/disponibilidade';
import { SwitchDisponibilidade } from '@/components/disponibilidade/SwitchDisponibilidade';
import { CAIXA } from '../formato';

// Profissionais do negócio com o liga/desliga da agenda, para a administradora atender um
// pedido de suporte (ex.: a dona não consegue entrar). A ação fica no registro de auditoria.
export function ProfissionaisNegocio({ tenantId, onAlterado }: { tenantId: string; onAlterado?: () => void }) {
  const [lista, setLista] = useState<ProfissionalDoNegocio[] | null>(null);
  const [erro, setErro] = useState(false);
  const [salvando, setSalvando] = useState<string | null>(null);
  const { showToast } = useToast();

  const carregar = useCallback(async () => {
    setErro(false);
    try {
      setLista(await disponibilidadeApi.doNegocio(tenantId));
    } catch {
      setErro(true);
    }
  }, [tenantId]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  const alternar = async (p: ProfissionalDoNegocio, available: boolean) => {
    setSalvando(p.id);
    try {
      const r = await disponibilidadeApi.definirDoNegocio(tenantId, p.id, available);
      setLista((atual) => atual?.map((x) => (x.id === p.id ? { ...x, available: r.available, agendamentosFuturos: r.agendamentosFuturos } : x)) ?? atual);
      showToast(available ? `${p.name} voltou a ficar disponível` : `${p.name} está indisponível`, 'success');
      onAlterado?.();
    } catch (e) {
      showToast(getApiErrorMessage(e, 'Não foi possível alterar a disponibilidade'), 'error');
    } finally {
      setSalvando(null);
    }
  };

  return (
    <section aria-labelledby="dn-prof" className={cn(CAIXA, 'p-5 sm:p-6')}>
      <h2 id="dn-prof" className="text-[16px] font-bold text-ink">Profissionais</h2>
      <p className="mt-1 text-[13px] text-muted">
        Desligada, a profissional não recebe agendamentos novos. Os que já estão marcados continuam.
      </p>

      {!lista && !erro && <Skeleton className="mt-4 h-24" label="Carregando profissionais" />}
      {erro && (
        <p className="mt-4 text-[13px] text-danger">
          Não foi possível carregar as profissionais.{' '}
          <button type="button" onClick={() => void carregar()} className="font-bold text-ink underline underline-offset-2">Tentar de novo</button>
        </p>
      )}
      {lista && lista.length === 0 && <p className="mt-4 text-[13px] text-muted">Nenhuma profissional cadastrada neste negócio.</p>}

      {lista && lista.length > 0 && (
        <ul className="mt-3">
          {lista.map((p) => {
            const mantidos = !p.available ? avisoAgendamentosMantidos(p.agendamentosFuturos) : '';
            return (
              <li key={p.id} className="flex items-center gap-3 border-t border-line py-2 first:border-t-0">
                <span className={cn(!p.available && 'opacity-60 grayscale')}>
                  <Avatar name={p.name} src={p.photo} size={36} />
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
      )}
    </section>
  );
}
