'use client';

import { useCallback, useEffect, useState } from 'react';
import { PauseCircle } from 'lucide-react';
import { Button, Modal } from '@/components/ui';
import { useToast } from '@/components/Toast';
import { getApiErrorMessage } from '@/utils/handleApiError';
import { avisoAgendamentosMantidos, disponibilidadeApi } from '@/lib/disponibilidade';
import { SwitchDisponibilidade } from '@/components/disponibilidade/SwitchDisponibilidade';
import { cn } from '@/lib/cn';

// Liga/desliga da própria agenda, no topo do app da profissional. Desligada, não entram
// agendamentos novos; os que já estão marcados continuam.

interface Estado {
  /** `null` enquanto não carregou (ou se a busca falhou): o controle não aparece. */
  disponivel: boolean | null;
  futuros: number;
}

export function useDisponibilidadeBancada(ativo: boolean) {
  const [estado, setEstado] = useState<Estado>({ disponivel: null, futuros: 0 });
  const [salvando, setSalvando] = useState(false);
  const { showToast } = useToast();

  useEffect(() => {
    if (!ativo) return;
    let vivo = true;
    disponibilidadeApi.daBancada()
      .then((r) => { if (vivo) setEstado({ disponivel: r.disponivel, futuros: r.agendamentosFuturos }); })
      .catch(() => { /* sem o controle: a bancada segue funcionando */ });
    return () => { vivo = false; };
  }, [ativo]);

  const definir = useCallback(async (disponivel: boolean) => {
    setSalvando(true);
    try {
      const r = await disponibilidadeApi.definirNaBancada(disponivel);
      setEstado({ disponivel: r.disponivel, futuros: r.agendamentosFuturos });
      showToast(disponivel ? 'Você voltou a ficar disponível' : 'Você está indisponível. Novos agendamentos estão bloqueados.', 'success');
    } catch (error: unknown) {
      showToast(getApiErrorMessage(error, 'Não foi possível alterar sua disponibilidade'), 'error');
    } finally {
      setSalvando(false);
    }
  }, [showToast]);

  return { ...estado, salvando, definir };
}

type Controle = ReturnType<typeof useDisponibilidadeBancada>;

/** Botão do cabeçalho; ao desligar, pede confirmação mostrando os agendamentos que continuam. */
export function ControleDisponibilidade({ controle }: { controle: Controle }) {
  const [confirmando, setConfirmando] = useState(false);
  const { disponivel, futuros, salvando, definir } = controle;
  if (disponivel === null) return null;

  return (
    <>
      <div className="flex items-center gap-1">
        <span className={cn('text-[12px] font-bold', disponivel ? 'text-success-text' : 'text-muted')}>
          {disponivel ? 'Disponível' : 'Indisponível'}
        </span>
        <SwitchDisponibilidade
          checked={disponivel}
          disabled={salvando}
          onCheckedChange={(v) => { if (v) void definir(true); else setConfirmando(true); }}
          label="Disponível para novos agendamentos"
        />
      </div>
      <Modal
        isOpen={confirmando}
        onClose={() => setConfirmando(false)}
        size="sm"
        title="Ficar indisponível?"
        description={`Novos agendamentos serão bloqueados. ${futuros > 0 ? `${avisoAgendamentosMantidos(futuros)}.` : 'Você não tem agendamentos futuros.'}`}
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirmando(false)}>Cancelar</Button>
            <Button onClick={() => { setConfirmando(false); void definir(false); }}>Ficar indisponível</Button>
          </>
        }
      >
        <p className="text-[13px] text-muted">Você pode voltar a ficar disponível quando quiser, por este mesmo botão.</p>
      </Modal>
    </>
  );
}

/** Faixa de aviso enquanto a agenda está desligada. */
export function FaixaIndisponivel({ controle }: { controle: Controle }) {
  if (controle.disponivel !== false) return null;
  const mantidos = avisoAgendamentosMantidos(controle.futuros);
  return (
    <div role="status" className="border-b border-line bg-warning/10 text-warning-text">
      <div className="mx-auto flex max-w-xl items-start gap-2 px-4 py-2.5 text-[13px] font-semibold">
        <PauseCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
        <p>
          Você está fora da agenda. Clientes não conseguem agendar com você.
          {mantidos ? ` ${mantidos[0]!.toUpperCase()}${mantidos.slice(1)}.` : ''}
        </p>
      </div>
    </div>
  );
}
