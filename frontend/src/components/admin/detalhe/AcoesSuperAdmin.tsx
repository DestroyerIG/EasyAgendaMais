'use client';

import { useState } from 'react';
import { Icon, buttonVariants } from '@/components/ui';
import { useToast } from '@/components/Toast';
import { AcaoComMotivoModal, type CampoEscolha } from '@/components/admin/AcaoComMotivoModal';
import { adminApi } from '@/lib/adminApi';
import { PLANOS_ADMIN, rotuloPlano } from '@/lib/adminRotulos';
import { cn } from '@/lib/cn';
import { getApiErrorMessage } from '@/utils/handleApiError';
import type { DetalheNegocio } from '@/types/admin';

type Negocio = DetalheNegocio['negocio'];

type TipoAcao = 'estender' | 'bloquear' | 'desbloquear' | 'sincronizar' | 'plano' | 'status' | 'cancelar';

/** Status de assinatura aceitos por PATCH /admin/subscriptions/:id/status. */
const STATUS_ASSINATURA: Array<{ valor: string; rotulo: string }> = [
  { valor: 'active', rotulo: 'Ativa (active)' },
  { valor: 'trialing', rotulo: 'Em teste (trialing)' },
  { valor: 'pending', rotulo: 'Pendente (pending)' },
  { valor: 'past_due', rotulo: 'Em atraso (past_due)' },
  { valor: 'unpaid', rotulo: 'Não paga (unpaid)' },
  { valor: 'canceled', rotulo: 'Cancelada (canceled)' },
  { valor: 'incomplete', rotulo: 'Incompleta (incomplete)' },
];

interface Config {
  rotulo: string;
  icone: string;
  descricao: string;
  rotuloConfirmar: string;
  sucesso: string;
  perigo?: boolean;
  campoDias?: boolean;
  campoEscolha?: CampoEscolha;
  executar: (motivo: string, dias?: number, escolha?: string) => Promise<unknown>;
}

function configuracoes(n: Negocio): Record<TipoAcao, Config> {
  const id = n.id;
  return {
    estender: {
      rotulo: 'Estender teste grátis',
      icone: 'more_time',
      descricao: `O teste grátis de ${n.nome} ganha mais dias, sem cobrança.`,
      rotuloConfirmar: 'Estender teste',
      sucesso: 'Teste grátis estendido.',
      campoDias: true,
      executar: (motivo, dias) => adminApi.extendTrial(id, dias ?? 0, motivo),
    },
    bloquear: {
      rotulo: 'Bloquear acesso',
      icone: 'lock',
      descricao: `O painel e a página pública de ${n.nome} ficam fora do ar até o desbloqueio.`,
      rotuloConfirmar: 'Bloquear acesso',
      sucesso: 'Acesso bloqueado.',
      perigo: true,
      executar: (motivo) => adminApi.blockTenant(id, motivo),
    },
    desbloquear: {
      rotulo: 'Desbloquear acesso',
      icone: 'lock_open',
      descricao: `${n.nome} volta a acessar o painel e a página pública.`,
      rotuloConfirmar: 'Desbloquear acesso',
      sucesso: 'Acesso desbloqueado.',
      executar: (motivo) => adminApi.unblockTenant(id, motivo),
    },
    sincronizar: {
      rotulo: 'Sincronizar com o gateway',
      icone: 'sync',
      descricao: 'Busca no gateway o estado atual da assinatura e atualiza o EasyAgenda+.',
      rotuloConfirmar: 'Sincronizar',
      sucesso: 'Assinatura sincronizada com o gateway.',
      executar: (motivo) => adminApi.resyncSubscription(id, motivo),
    },
    plano: {
      rotulo: 'Mudar plano',
      icone: 'swap_horiz',
      descricao: 'Muda o plano da assinatura direto no EasyAgenda+.',
      rotuloConfirmar: 'Mudar plano',
      sucesso: 'Plano alterado.',
      campoEscolha: {
        rotulo: 'Plano',
        opcoes: PLANOS_ADMIN.map((p) => ({ valor: p, rotulo: rotuloPlano(p) })),
        // Plano fora do catálogo: sem escolha inicial, o operador escolhe.
        inicial: PLANOS_ADMIN.includes(n.plano) ? n.plano : '',
      },
      executar: (motivo, _dias, plano) => adminApi.overrideSubscriptionPlan(id, plano ?? n.plano, motivo),
    },
    status: {
      rotulo: 'Mudar status',
      icone: 'tune',
      descricao: 'Muda o status da assinatura direto no EasyAgenda+.',
      rotuloConfirmar: 'Mudar status',
      sucesso: 'Status da assinatura alterado.',
      campoEscolha: {
        rotulo: 'Status da assinatura',
        opcoes: STATUS_ASSINATURA,
        inicial: STATUS_ASSINATURA.some((s) => s.valor === n.statusAssinatura) ? n.statusAssinatura : 'active',
      },
      executar: (motivo, _dias, status) => adminApi.overrideSubscriptionStatus(id, status ?? n.statusAssinatura, motivo),
    },
    cancelar: {
      rotulo: 'Cancelar assinatura',
      icone: 'cancel',
      descricao: `A assinatura de ${n.nome} é cancelada.`,
      rotuloConfirmar: 'Cancelar assinatura',
      sucesso: 'Assinatura cancelada.',
      perigo: true,
      executar: (motivo) => adminApi.cancelSubscriptionAdmin(id, motivo),
    },
  };
}

interface Props {
  negocio: Negocio;
  /** Chamado depois de uma ação bem-sucedida: a tela recarrega o detalhe e a auditoria. */
  onConcluido: () => void;
}

export function AcoesSuperAdmin({ negocio, onConcluido }: Props) {
  const { showToast } = useToast();
  const [aberta, setAberta] = useState<TipoAcao | null>(null);
  const [enviando, setEnviando] = useState(false);

  const config = configuracoes(negocio);
  const visiveis: TipoAcao[] = [
    // A regra (status normalizado, sem assinatura no gateway) vem do backend, a mesma da rota.
    ...(negocio.podeEstenderTeste ? (['estender'] as const) : []),
    negocio.status === 'bloqueado_admin' ? 'desbloquear' : 'bloquear',
    'sincronizar',
    'plano',
    'status',
    'cancelar',
  ];

  const confirmar = async (motivo: string, dias?: number, escolha?: string) => {
    if (!aberta) return;
    const acao = config[aberta];
    setEnviando(true);
    try {
      await acao.executar(motivo, dias, escolha);
      showToast(acao.sucesso, 'success');
      setAberta(null);
      onConcluido();
    } catch (e) {
      showToast(getApiErrorMessage(e, 'Não foi possível concluir a ação.'), 'error');
    } finally {
      setEnviando(false);
    }
  };

  const atual = aberta ? config[aberta] : null;

  return (
    <div className="flex flex-col gap-3 border-t border-line pt-4 lg:flex-row lg:items-center lg:justify-between">
      <p className="flex items-center gap-2 text-[13px] font-semibold text-muted">
        <Icon name="admin_panel_settings" size={18} />
        Ações do SuperAdmin
      </p>
      <div className="flex flex-wrap gap-2">
        {visiveis.map((tipo) => {
          const c = config[tipo];
          return (
            <button
              key={tipo}
              type="button"
              onClick={() => setAberta(tipo)}
              className={cn(
                buttonVariants({ variant: 'secondary', size: 'sm' }),
                'gap-1.5',
                c.perigo && 'border-danger/40 text-danger hover:bg-danger/12',
              )}
            >
              <Icon name={c.icone} size={18} />
              {c.rotulo}
            </button>
          );
        })}
      </div>

      {atual && (
        <AcaoComMotivoModal
          titulo={atual.rotulo}
          descricao={atual.descricao}
          rotuloConfirmar={atual.rotuloConfirmar}
          perigo={atual.perigo}
          campoDias={atual.campoDias}
          campoEscolha={atual.campoEscolha}
          enviando={enviando}
          onConfirmar={(motivo, dias, escolha) => void confirmar(motivo, dias, escolha)}
          onFechar={() => setAberta(null)}
        />
      )}
    </div>
  );
}
