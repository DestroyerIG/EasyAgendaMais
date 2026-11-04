'use client';

/**
 * Assinatura vencida / modo de contingência (Stitch
 * `studio-aurora-assinatura-vencida-modo-de-contingencia-corrigida--2f4a56` e `-mobile--702444`).
 *
 * Só diz o que o sistema faz de verdade: o prazo vem de `conta/estado`, o plano e o preço do
 * catálogo único, o vencimento de `billing/status`. Duas colunas no computador (situação e
 * pagamento à esquerda, backup e suporte à direita) e uma no celular, na ordem do Stitch.
 */

import { useEffect, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { useAuth } from '@/contexts/AuthContext';
import { useEstadoConta } from '@/hooks/useEstadoConta';
import { useDashboardBilling } from '@/hooks/useDashboardBilling';
import { billingApi, type CatalogoPlanos, type SubscriptionStatusResponse } from '@/lib/billing';
import { contaApi, type EstadoConta } from '@/lib/conta';
import { isPlanId } from '@/lib/plans';
import { NOME_PLANO, dataLonga, linkSuporteWhatsapp } from '@/lib/planoCobranca';
import { formatCurrency } from '@/lib/formatters';
import { getApiErrorMessage } from '@/utils/handleApiError';
import { Button, Icon, Skeleton, buttonVariants } from '@/components/ui';
import { cn } from '@/lib/cn';
import { PagamentoContingencia } from './PagamentoContingencia';

const LIBERADOS = [
  {
    icone: 'calendar_today',
    titulo: 'Agenda e atendimentos de hoje',
    texto: 'Consulte a agenda e conclua os atendimentos do dia, com comanda e caixa.',
  },
  {
    icone: 'download_for_offline',
    titulo: 'Backup dos seus dados',
    texto: 'Clientes, agendamentos, serviços, comandas, caixa e despesas em CSV, que abre no Excel.',
  },
  {
    icone: 'forum',
    titulo: 'Lembretes já marcados',
    texto: 'Os lembretes e as confirmações das clientes que já têm horário continuam sendo enviados.',
  },
];

const irParaOPainel = () => {
  // Recarga completa: o AppShell guarda a própria cópia do estado da conta.
  window.location.assign('/dashboard');
};

function CartaoSituacao({
  selo,
  prazo,
  icone,
  titulo,
  children,
}: {
  selo: ReactNode;
  prazo?: string | null;
  icone: string;
  titulo: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-card border border-line bg-surface p-4 shadow-sm sm:p-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="text-[15px] font-bold text-ink">
            EasyAgenda<span className="text-brand-text">+</span>
          </span>
          {selo}
        </div>
        {prazo && <span className="text-[13px] font-semibold text-muted">{prazo}</span>}
      </div>
      <div className="flex items-start gap-4">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-brand/12 text-brand-text">
          <Icon name={icone} size={26} filled />
        </div>
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-bold leading-snug text-ink">{titulo}</h1>
          {children}
        </div>
      </div>
    </section>
  );
}

const Selo = ({ tom, children }: { tom: 'aviso' | 'perigo' | 'neutro'; children: ReactNode }) => (
  <span
    className={cn(
      'rounded-full px-2 py-0.5 text-[12px] font-semibold',
      tom === 'aviso' && 'bg-warning/12 text-warning-text',
      tom === 'perigo' && 'bg-danger/12 text-danger',
      tom === 'neutro' && 'bg-surface-2 text-muted',
    )}
  >
    {children}
  </span>
);

function OQueContinuaLiberado() {
  return (
    <section className="rounded-card border border-line bg-surface p-4 shadow-sm sm:p-6" aria-labelledby="liberado-titulo">
      <div className="flex items-center gap-2">
        <Icon name="check_circle" size={22} filled className="text-success-text" />
        <h2 id="liberado-titulo" className="text-lg font-bold text-ink">
          O que continua liberado
        </h2>
      </div>
      <ul className="mt-4 space-y-3">
        {LIBERADOS.map((item) => (
          <li key={item.titulo} className="flex items-start gap-3 rounded-xl bg-surface-2 p-3">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-surface text-brand-text shadow-sm">
              <Icon name={item.icone} size={18} />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[15px] font-semibold text-ink">{item.titulo}</p>
              <p className="text-[13px] text-muted">{item.texto}</p>
            </div>
          </li>
        ))}
      </ul>
      <div className="mt-4 flex items-start gap-2 rounded-xl border border-warning/40 bg-warning/12 p-3">
        <Icon name="info" size={18} className="mt-0.5 shrink-0 text-warning-text" />
        <p className="text-[13px] font-medium text-ink">
          Novos agendamentos pelo link público e campanhas estão pausados até a regularização.
        </p>
      </div>
    </section>
  );
}

function CartaoBackup() {
  const [baixando, setBaixando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const baixar = async () => {
    setBaixando(true);
    setErro(null);
    try {
      await contaApi.baixarBackup();
    } catch (error) {
      setErro(getApiErrorMessage(error, 'Não foi possível gerar o backup agora. Tente de novo.'));
    } finally {
      setBaixando(false);
    }
  };

  return (
    <section className="rounded-card border border-line bg-surface p-4 shadow-sm sm:p-6" aria-labelledby="backup-titulo">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-surface-2 text-ink">
          <Icon name="lock_reset" size={22} />
        </div>
        <div className="min-w-0 flex-1">
          <h2 id="backup-titulo" className="text-[17px] font-bold text-ink">
            Seus dados são seus
          </h2>
          <p className="mt-1 text-[14px] text-muted">
            Em qualquer situação da assinatura, você baixa clientes, agendamentos, serviços, profissionais, comandas, caixa e
            despesas.
          </p>
        </div>
      </div>
      <Button variant="secondary" fullWidth className="mt-4 h-auto min-h-11 whitespace-normal py-2" onClick={baixar} loading={baixando}>
        <Icon name="file_download" size={20} />
        Baixar backup completo (CSV, abre no Excel)
      </Button>
      {erro && (
        <p role="alert" className="mt-2 text-[13px] text-danger">
          {erro}
        </p>
      )}
    </section>
  );
}

function CartaoSuporte({ link }: { link: string }) {
  return (
    <section className="flex flex-col items-center rounded-card border border-line bg-surface p-4 text-center shadow-sm sm:p-6">
      <div className="mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-surface-2 text-brand-text">
        <Icon name="support_agent" size={26} />
      </div>
      <h2 className="text-[17px] font-bold text-ink">Precisa de ajuda?</h2>
      <p className="mt-1 max-w-xs text-[14px] text-muted">Fale com o suporte do EasyAgenda+ pelo WhatsApp.</p>
      <a
        href={link}
        target="_blank"
        rel="noreferrer"
        className={cn(buttonVariants({ variant: 'whatsapp', fullWidth: true }), 'mt-4')}
      >
        <Icon name="chat" size={20} />
        Falar com o suporte no WhatsApp
      </a>
    </section>
  );
}

const diasRestantes = (dias: number) => `Carência: ${dias} ${dias === 1 ? 'dia restante' : 'dias restantes'}`;

export function TelaContingencia() {
  const { user } = useAuth();
  const { estado, recarregar } = useEstadoConta();
  const { openBillingPortal, portalLoading } = useDashboardBilling();
  const [status, setStatus] = useState<SubscriptionStatusResponse | null>(null);
  const [catalogo, setCatalogo] = useState<CatalogoPlanos | null>(null);
  const [cobrancaLida, setCobrancaLida] = useState<'carregando' | 'ok' | 'falhou'>('carregando');

  useEffect(() => {
    let ativo = true;
    void Promise.allSettled([billingApi.getStatus(), billingApi.getPlans()]).then(([s, c]) => {
      if (!ativo) return;
      if (s.status === 'fulfilled') setStatus(s.value);
      if (c.status === 'fulfilled') setCatalogo(c.value);
      setCobrancaLida(s.status === 'fulfilled' ? 'ok' : 'falhou');
    });
    return () => {
      ativo = false;
    };
  }, []);

  const conferir = async (): Promise<boolean> => {
    try {
      const novo = await billingApi.getStatus();
      setStatus(novo);
      setCobrancaLida('ok');
    } catch {
      // A consulta do estado abaixo é o que decide.
    }
    const atual: EstadoConta | null = await recarregar();
    if (atual?.tipo === 'ativa') {
      irParaOPainel();
      return true;
    }
    return false;
  };

  const negocio = user?.businessName || 'seu negócio';
  const dona = user?.role === 'tenant_admin';
  const suporte = linkSuporteWhatsapp(`Olá! Preciso de ajuda para regularizar a assinatura do ${negocio} no EasyAgenda+.`);

  if (!estado) {
    return (
      <div className="mx-auto max-w-6xl space-y-4" aria-busy="true">
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (estado.tipo === 'ativa') {
    return (
      <div className="mx-auto max-w-3xl">
        <CartaoSituacao selo={<Selo tom="neutro">Assinatura em dia</Selo>} icone="check_circle" titulo="Sua assinatura está em dia">
          <p className="mt-1 text-[15px] text-muted">Todos os recursos do painel estão liberados.</p>
          <Link href="/dashboard" className={cn(buttonVariants({ variant: 'primary' }), 'mt-4')}>
            Ir para o painel
          </Link>
        </CartaoSituacao>
      </div>
    );
  }

  const cobranca = estado.tipo === 'carencia' || estado.motivo === 'cobranca';

  // A reativação cobra o plano agendado quando há troca marcada (`plano_agendado || plan`).
  const planoBruto = status?.planoAgendado ?? status?.plan ?? user?.plan ?? null;
  const planoCatalogo = catalogo?.planos.find((p) => p.id === planoBruto) ?? null;
  const nomePlano = planoCatalogo?.nome ?? (planoBruto && isPlanId(planoBruto) ? NOME_PLANO[planoBruto] : null);
  const preco = planoCatalogo?.preco ?? (planoCatalogo?.sobConsulta ? status?.valorSalao ?? null : null);
  const vencimento = dataLonga(status?.nextDueDate ?? status?.currentPeriodEnd ?? null);
  const plano = nomePlano ? ` (Plano ${nomePlano}${preco !== null ? ` · ${formatCurrency(preco)}` : ''})` : '';
  const mensalidade = vencimento
    ? `A mensalidade de ${negocio}${plano} venceu em ${vencimento}.`
    : `A mensalidade de ${negocio}${plano} está em aberto.`;
  // Sem a cobrança lida não dá para saber se é Pix ou cartão: nada de oferecer a forma errada.
  const formaPagamento = cobrancaLida === 'ok' ? (status?.paymentMethod === 'pix' ? 'pix' : 'cartao') : null;

  const situacao = cobranca ? (
    <CartaoSituacao
      selo={
        estado.tipo === 'carencia' ? <Selo tom="aviso">Modo contingência</Selo> : <Selo tom="perigo">Acesso pausado</Selo>
      }
      prazo={estado.tipo === 'carencia' ? diasRestantes(estado.diasRestantes) : null}
      icone="credit_card_off"
      titulo="Sua mensalidade está em aberto"
    >
      <p className="mt-1 text-[15px] text-muted">{mensalidade}</p>
      {estado.tipo === 'carencia' ? (
        <div className="mt-3 flex items-start gap-2 rounded-xl bg-surface-2 p-3">
          <Icon name="favorite" size={18} className="mt-0.5 shrink-0 text-brand-text" />
          <p className="text-[14px] font-medium text-ink">
            Fique tranquila: a agenda de hoje continua funcionando e seus dados continuam guardados.
          </p>
        </div>
      ) : (
        <p className="mt-3 text-[15px] font-semibold text-ink">Seu acesso está pausado até a regularização.</p>
      )}
    </CartaoSituacao>
  ) : (
    <CartaoSituacao
      selo={<Selo tom="perigo">Acesso pausado</Selo>}
      icone="lock_reset"
      titulo={estado.motivo === 'teste' ? 'Seu período de teste terminou' : 'Sua assinatura foi cancelada'}
    >
      <p className="mt-1 text-[15px] text-muted">
        {estado.motivo === 'teste'
          ? 'Escolha um plano para voltar a usar o painel. Seus dados continuam guardados.'
          : 'Assine um plano para voltar a usar o painel. Seus dados continuam guardados.'}
      </p>
      <Link href="/dashboard/planos/comparar" className={cn(buttonVariants({ variant: 'primary' }), 'mt-4')}>
        Ver planos
        <Icon name="arrow_forward" size={18} />
      </Link>
    </CartaoSituacao>
  );

  const backup = dona ? <CartaoBackup /> : null;
  const ajuda = suporte ? <CartaoSuporte link={suporte} /> : null;

  return (
    <div className="mx-auto max-w-6xl space-y-4 lg:space-y-6">
      {situacao}
      {cobranca ? (
        <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-12 lg:gap-6">
          <div className="space-y-4 lg:col-span-7 lg:space-y-6">
            {estado.tipo === 'carencia' && <OQueContinuaLiberado />}
            {cobrancaLida === 'carregando' ? (
              <Skeleton className="h-72 w-full" />
            ) : (
              <PagamentoContingencia
                forma={formaPagamento}
                valor={preco}
                onPagarComCartao={openBillingPortal}
                pagandoComCartao={portalLoading}
                onPago={irParaOPainel}
                onConferir={conferir}
              />
            )}
          </div>
          <div className="space-y-4 lg:col-span-5 lg:space-y-6">
            {backup}
            {ajuda}
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-2 lg:gap-6">
          {backup}
          {ajuda}
        </div>
      )}
    </div>
  );
}
