'use client';

import { useEffect, useState } from 'react';
import { Bell, BellOff, Loader2, Smartphone } from 'lucide-react';
import { ativarPush, desativarPush, estadoPush, type EstadoPush } from '@/lib/push';
import { cn } from '@/lib/cn';

// "Ativar notificações" (Web Push). Sem as chaves no servidor ou sem suporte no navegador, não aparece.

export function AtivarNotificacoes({ compacto = false, className }: { compacto?: boolean; className?: string }) {
  const [estado, setEstado] = useState<EstadoPush | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    let vivo = true;
    estadoPush().then((e) => { if (vivo) setEstado(e); }).catch(() => { if (vivo) setEstado('indisponivel'); });
    return () => { vivo = false; };
  }, []);

  if (estado === null || estado === 'indisponivel') return null;

  const alternar = async () => {
    setOcupado(true);
    setErro(null);
    try {
      setEstado(estado === 'ativado' ? await desativarPush() : await ativarPush());
    } catch {
      setErro('Não foi possível ativar neste aparelho. Tente de novo.');
    } finally {
      setOcupado(false);
    }
  };

  if (estado === 'ios_tela_inicial') {
    return (
      <p className={cn('flex items-start gap-2 rounded-control border border-line bg-surface-2 p-3 text-[13px] text-muted', className)}>
        <Smartphone className="mt-0.5 h-4 w-4 shrink-0 text-brand" aria-hidden="true" />
        <span>
          No iPhone, as notificações só funcionam com o app na tela de início: toque em <b className="text-ink">Compartilhar</b> e
          depois em <b className="text-ink">Adicionar à Tela de Início</b> (iOS 16.4 ou mais novo).
        </span>
      </p>
    );
  }

  if (estado === 'bloqueado') {
    return (
      <p className={cn('flex items-start gap-2 text-[12px] text-muted', className)}>
        <BellOff className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
        As notificações estão bloqueadas neste navegador. Libere nas configurações do site.
      </p>
    );
  }

  const ativo = estado === 'ativado';
  return (
    <div className={className}>
      <button
        type="button"
        onClick={alternar}
        disabled={ocupado}
        aria-pressed={ativo}
        className={cn(
          'flex items-center gap-1.5 rounded-control font-semibold transition-colors disabled:opacity-60',
          compacto ? 'text-[12px] text-brand-text hover:underline' : 'h-11 border border-line bg-surface-2 px-3 text-[13px] text-ink hover:bg-line/60',
        )}
      >
        {ocupado
          ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          : ativo ? <BellOff className="h-4 w-4" aria-hidden="true" /> : <Bell className="h-4 w-4" aria-hidden="true" />}
        {ativo ? 'Desativar notificações neste aparelho' : 'Ativar notificações'}
      </button>
      {erro && <p role="alert" className="mt-1 text-[12px] text-danger">{erro}</p>}
    </div>
  );
}
