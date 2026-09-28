'use client';

/**
 * Tela Ajustes › Plano e Cobrança (ajustes-plano.html).
 *
 * Dado real: nome, preço e ciclo do plano atual vêm de PLAN_MAP a partir do plano do
 * usuário logado (o mesmo dado que a tela já usava); o nome exibido usa o rótulo curto
 * Solo/Equipe/Salão do rodapé da barra lateral, nunca o nome comercial nem "Pro". Status
 * da assinatura e "Gerenciar assinatura"/"Gerar nova cobrança Pix" continuam vindo de
 * useDashboardBilling, com o mesmo handler de sempre. Quando o backend informa
 * subscriptionCurrentPeriodEnd (TrialBanner já usa o mesmo campo), a data e os dias da
 * "Próxima cobrança" vêm dele; sem esse dado, caem no exemplo abaixo. "Mudar de plano"
 * rola até a seção de planos disponíveis (PricingPlansSection), real e com checkout de
 * verdade — não duplicamos aquele componente aqui.
 *
 * Dado de exemplo (`conteudoDemo.plano`): cartão de crédito salvo, débito automático e
 * Pix automático como formas de cobrança, o histórico de faturas com download de PDF e
 * NFS-e, e a data de próxima cobrança quando o backend não a informa — nada disso o
 * sistema expõe hoje nesta tela. Para o histórico de faturas não repetir um nome e um
 * valor de plano diferentes dos mostrados no cartão "Plano Atual" da mesma tela, a
 * referência e o valor de cada lançamento usam o plano e o preço reais; só a data, o
 * período, a forma de pagamento e o status de cada lançamento são do exemplo. Pelo mesmo
 * motivo, o acesso após cancelamento é sempre a véspera da próxima cobrança real, nunca
 * uma data solta.
 *
 * Botões sem suporte real ("Relatório de Gastos", "Dúvidas Financeiras", "Trocar para
 * anual", "Atualizar método de pagamento", "Fatura"/"NFS-e", "Filtrar por ano",
 * "Carregar histórico completo", "Cancelar assinatura", "Fale com nosso financeiro via
 * WhatsApp") mostram o aviso padrão em vez de fingir que funcionaram.
 */

import { useMemo, useRef } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/components/Toast';
import { useDashboardBilling } from '@/hooks/useDashboardBilling';
import { PricingPlansSection } from '@/components/marketing/PricingPlansSection';
import { ForcedDark } from '@/components/theme/ForcedDark';
import { SettingsTabs } from '@/components/shell/SettingsTabs';
import { isPlanId, PLAN_MAP, getPlanShellLabel, type PlanId } from '@/lib/plans';
import { conteudoDemo } from '@/lib/conteudoDemo';
import { formatCurrency } from '@/lib/formatters';
import {
  AVISO_RECURSO_A_CAMINHO,
  Button,
  Card,
  Icon,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
} from '@/components/ui';

// Rótulo da assinatura por status (mesmos status de src/lib/billing.ts). Sem status
// conhecido (billing pode não estar configurado em ambiente local), a tela não afirma
// "ativa" à toa.
const STATUS_ROTULO: Record<string, string> = {
  active: 'Assinatura ativa',
  trialing: 'Período de teste',
  pending: 'Pagamento pendente',
  past_due: 'Pagamento atrasado',
  unpaid: 'Pagamento em atraso',
  canceled: 'Assinatura cancelada',
  incomplete: 'Cadastro incompleto',
};

// "Até 5 profissionais na grade" etc.: o único item de "recursos inclusos" que varia por
// plano (os outros três — bot, clube, sinal Pix — valem para qualquer plano).
const PROFISSIONAIS_POR_PLANO: Record<PlanId, string> = {
  basico: '1 profissional incluído no plano',
  profissional: 'Até 5 profissionais na grade',
  premium: 'Profissionais ilimitados, em várias unidades',
};

const formatarDataLonga = (date: Date): string =>
  new Intl.DateTimeFormat('pt-BR', { day: 'numeric', month: 'long', year: 'numeric' }).format(date);

export default function PlanosPage() {
  const { user } = useAuth();
  const { subscriptionStatus, openBillingPortal, portalLoading, billingProvider } = useDashboardBilling();
  const { showToast } = useToast();
  const pricingRef = useRef<HTMLDivElement>(null);

  const planId: PlanId = user?.plan && isPlanId(user.plan) ? user.plan : 'basico';
  const plan = PLAN_MAP[planId];
  const nomeExibicao = getPlanShellLabel(planId);
  const demo = conteudoDemo.plano;

  const aCaminho = () => showToast(AVISO_RECURSO_A_CAMINHO, 'info');
  const statusRotulo = subscriptionStatus ? STATUS_ROTULO[subscriptionStatus] ?? subscriptionStatus : 'Plano atual';
  const scrollToPricing = () => pricingRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });

  const { proximaCobrancaData, proximaCobrancaDias } = useMemo(() => {
    if (user?.subscriptionCurrentPeriodEnd) {
      const fim = new Date(user.subscriptionCurrentPeriodEnd);
      return {
        proximaCobrancaData: formatarDataLonga(fim),
        proximaCobrancaDias: Math.max(0, Math.ceil((fim.getTime() - Date.now()) / (1000 * 60 * 60 * 24))),
        proximaCobrancaDate: fim,
      };
    }
    return {
      proximaCobrancaData: demo.atual.proximaCobranca.data,
      proximaCobrancaDias: demo.atual.proximaCobranca.diasRestantes,
      proximaCobrancaDate: null as Date | null,
    };
  }, [user?.subscriptionCurrentPeriodEnd, demo.atual.proximaCobranca]);

  const acessoAte = useMemo(() => {
    if (user?.subscriptionCurrentPeriodEnd) {
      const vespera = new Date(user.subscriptionCurrentPeriodEnd);
      vespera.setDate(vespera.getDate() - 1);
      return formatarDataLonga(vespera);
    }
    return demo.cancelamento.acessoAte;
  }, [user?.subscriptionCurrentPeriodEnd, demo.cancelamento.acessoAte]);

  const recursos = [
    { icone: 'badge', titulo: PROFISSIONAIS_POR_PLANO[planId], descricao: 'Vagas ativas na sua grade de horários.' },
    ...demo.atual.recursosInclusos.slice(1),
  ];

  const faturas = demo.faturas.map((fatura) => ({
    ...fatura,
    referencia: `Mensalidade EasyAgenda+ ${nomeExibicao}`,
    valor: plan.price,
  }));

  return (
    <div>
      <SettingsTabs />

      <div className="mb-8 flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-[13px] font-semibold text-brand-text">
            <span className="h-1.5 w-1.5 rounded-full bg-success" aria-hidden="true" />
            {statusRotulo}
          </div>
          <h2 className="text-3xl font-bold text-ink">Plano e Cobrança</h2>
          <p className="max-w-2xl text-muted">
            Gerencie sua assinatura, consulte a próxima renovação, a forma de pagamento e as notas fiscais do seu negócio.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Button variant="secondary" onClick={aCaminho}>
            <Icon name="receipt_long" size={18} />
            Relatório de gastos
          </Button>
          <Button variant="secondary" onClick={aCaminho}>
            <Icon name="help" size={18} />
            Dúvidas financeiras
          </Button>
          <Button variant="secondary" onClick={openBillingPortal} loading={portalLoading}>
            {!portalLoading && <Icon name="shield" size={16} />}
            {portalLoading
              ? 'Abrindo...'
              : billingProvider === 'asaas' || billingProvider === 'coupon'
              ? 'Gerar nova cobrança Pix'
              : 'Gerenciar assinatura'}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-12">
        <Card className="relative flex flex-col justify-between overflow-hidden lg:col-span-8">
          <div className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-brand/12 blur-3xl" aria-hidden="true" />

          <div className="relative flex flex-wrap items-start justify-between gap-4 border-b border-line pb-6">
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-3">
                <h3 className="text-xl font-bold text-ink">Plano {nomeExibicao} (Mensal)</h3>
                <span className="inline-flex items-center gap-1.5 rounded-full bg-success/12 px-3 py-1 text-[13px] font-bold text-success-text">
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-success" aria-hidden="true" />
                  {statusRotulo}
                </span>
              </div>
              <p className="text-[14px] text-muted">Ciclo mensal com renovação automática debitada na forma de pagamento cadastrada.</p>
            </div>
            <div className="text-right">
              <div className="text-2xl font-bold tracking-tight text-ink">
                {formatCurrency(plan.price)}
                <span className="ml-1 text-[14px] font-normal text-muted">/mês</span>
              </div>
              <div className="mt-1 text-[13px] font-semibold text-brand-text">
                Próxima cobrança: {proximaCobrancaData}{' '}
                <span className="font-normal text-muted">(em {proximaCobrancaDias} dias)</span>
              </div>
            </div>
          </div>

          <div className="relative py-6">
            <div className="mb-4 text-[13px] font-bold text-muted">Recursos inclusos no seu plano</div>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              {recursos.map((recurso) => (
                <div key={recurso.titulo} className="flex items-start gap-3 rounded-xl border border-line/60 bg-surface-2 p-3.5">
                  <div
                    className={
                      'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-surface shadow-sm ' +
                      (recurso.icone === 'smart_toy' ? 'text-whatsapp' : 'text-brand-text')
                    }
                  >
                    <Icon name={recurso.icone} size={20} />
                  </div>
                  <div className="flex flex-col">
                    <span className="text-[14px] font-semibold text-ink">{recurso.titulo}</span>
                    <span className="text-[13px] text-muted">{recurso.descricao}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="relative flex flex-wrap items-center justify-between gap-4 border-t border-line pt-6">
            <div className="flex items-center gap-2 text-[14px] text-muted">
              <Icon name="info" size={20} />
              Sem multas de fidelidade ou taxa de cancelamento.
            </div>
            <div className="flex items-center gap-3">
              <Button variant="secondary" onClick={aCaminho}>
                Trocar para anual
              </Button>
              <Button onClick={scrollToPricing}>
                Mudar de plano
                <Icon name="arrow_forward" size={18} />
              </Button>
            </div>
          </div>
        </Card>

        <Card className="flex flex-col justify-between gap-6 lg:col-span-4">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Icon name="credit_card" size={22} className="text-brand-text" />
                <h3 className="text-lg font-bold text-ink">Forma de pagamento</h3>
              </div>
              <span className="rounded-full bg-surface-2 px-2 py-0.5 text-[13px] text-muted">Padrão</span>
            </div>

            <div className="space-y-4 rounded-xl border border-line/70 bg-surface-2 p-4">
              <div className="flex items-center justify-between">
                <span className="text-[14px] font-semibold text-ink">{demo.formaPagamento.bandeira}</span>
                <span className="font-mono text-[13px] text-muted">Débito automático</span>
              </div>
              <div className="space-y-1">
                <div className="font-mono text-[17px] tracking-wider text-ink">•••• •••• •••• {demo.formaPagamento.final}</div>
                <div className="flex items-center justify-between text-muted">
                  <span className="text-[13px] uppercase">{demo.formaPagamento.titular}</span>
                  <span className="text-[13px]">Exp: {demo.formaPagamento.validade}</span>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between rounded-lg border border-line/70 bg-surface-2 p-3">
              <div className="flex items-center gap-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-surface shadow-sm">
                  <Icon name="payments" size={18} className="text-success-text" />
                </div>
                <div className="flex flex-col">
                  <span className="text-[14px] font-semibold text-ink">Pix automático</span>
                  <span className="text-[13px] text-muted">Chave ativa para cobrança recorrente</span>
                </div>
              </div>
              <Icon name="check_circle" size={20} className="text-success-text" />
            </div>

            <div className="flex items-start gap-2.5 rounded-lg bg-success/12 p-3 text-ink">
              <Icon name="verified_user" size={18} className="mt-0.5 shrink-0 text-success-text" />
              <p className="text-[13px] leading-relaxed">
                <strong className="font-semibold text-success-text">Débito automático ativo.</strong> A cobrança de{' '}
                {formatCurrency(plan.price)} será processada automaticamente no vencimento, sem interrupção dos serviços.
              </p>
            </div>
          </div>

          <Button variant="secondary" fullWidth onClick={aCaminho}>
            <Icon name="edit" size={18} />
            Atualizar método de pagamento
          </Button>
        </Card>
      </div>

      <div className="mt-6 overflow-hidden rounded-card border border-line bg-surface">
        <div className="flex flex-col gap-4 border-b border-line p-6 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="text-lg font-bold text-ink">Histórico de faturas e pagamentos</h3>
            <p className="mt-0.5 text-[14px] text-muted">
              Acesse os comprovantes de quitação e baixe as notas fiscais de serviço (NFS-e).
            </p>
          </div>
          <Button variant="secondary" size="sm" onClick={aCaminho}>
            <Icon name="filter_list" size={16} />
            Filtrar por ano (2026)
          </Button>
        </div>

        <div className="w-full overflow-x-auto">
          <table className="w-full border-collapse text-left text-[15px]" style={{ minWidth: 760 }}>
            <TableHead>
              <TableRow>
                <TableHeaderCell>Data</TableHeaderCell>
                <TableHeaderCell>Referência / Período</TableHeaderCell>
                <TableHeaderCell className="text-right">Valor</TableHeaderCell>
                <TableHeaderCell>Forma de pagamento</TableHeaderCell>
                <TableHeaderCell>Status</TableHeaderCell>
                <TableHeaderCell className="text-center">Comprovante / NF</TableHeaderCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {faturas.map((fatura) => (
                <TableRow key={fatura.data}>
                  <TableCell className="whitespace-nowrap font-mono font-medium">{fatura.data}</TableCell>
                  <TableCell>
                    <div className="flex flex-col">
                      <span className="font-semibold text-ink">{fatura.referencia}</span>
                      <span className="text-[13px] text-muted">Período: {fatura.periodo}</span>
                    </div>
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-right font-mono font-semibold">{formatCurrency(fatura.valor)}</TableCell>
                  <TableCell className="whitespace-nowrap">
                    <div className="inline-flex items-center gap-2">
                      <Icon
                        name={fatura.formaPagamento.startsWith('Pix') ? 'payments' : 'credit_card'}
                        size={18}
                        className="text-muted"
                      />
                      <span className="font-mono text-[13px]">{fatura.formaPagamento}</span>
                    </div>
                  </TableCell>
                  <TableCell className="whitespace-nowrap">
                    <span className="inline-flex items-center gap-1 rounded-full bg-success/12 px-2.5 py-0.5 text-[13px] font-semibold text-success-text">
                      <span className="h-1.5 w-1.5 rounded-full bg-success" aria-hidden="true" />
                      {fatura.status}
                    </span>
                  </TableCell>
                  <TableCell className="whitespace-nowrap">
                    <div className="flex items-center justify-center gap-2">
                      <button
                        type="button"
                        onClick={aCaminho}
                        title="Baixar PDF da fatura"
                        className="inline-flex items-center gap-1 whitespace-nowrap rounded bg-surface-2 border border-line px-2.5 py-1 text-[13px] transition-colors hover:bg-line/60"
                      >
                        <Icon name="picture_as_pdf" size={16} className="text-danger" />
                        Fatura
                      </button>
                      <button
                        type="button"
                        onClick={aCaminho}
                        title="Baixar nota fiscal NFS-e"
                        className="inline-flex items-center gap-1 whitespace-nowrap rounded bg-surface-2 border border-line px-2.5 py-1 text-[13px] transition-colors hover:bg-line/60"
                      >
                        <Icon name="description" size={16} className="text-brand-text" />
                        NFS-e
                      </button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </table>
        </div>

        <div className="flex items-center justify-between bg-surface-2 p-4 text-[13px] text-muted">
          <span>Exibindo os últimos {faturas.length} lançamentos</span>
          <button type="button" onClick={aCaminho} className="font-semibold text-brand-text hover:underline">
            Carregar histórico completo (2026)
          </button>
        </div>
      </div>

      <Card className="mt-6 space-y-4">
        <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
          <div className="max-w-2xl space-y-1">
            <div className="flex items-center gap-2">
              <Icon name="pause_circle" size={18} className="text-muted" />
              <span className="text-[15px] font-bold text-ink">
                Deseja pausar ou cancelar a assinatura do {user?.businessName || 'seu negócio'}?
              </span>
            </div>
            <p className="text-[14px] leading-relaxed text-muted">
              Ao cancelar, seu negócio mantém acesso irrestrito a todos os recursos até{' '}
              <span className="font-semibold text-ink">{acessoAte}</span>. {demo.cancelamento.mensagem}
            </p>
          </div>
          <Button variant="secondary" onClick={aCaminho} className="shrink-0 text-danger">
            Cancelar assinatura
          </Button>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-4 border-t border-line pt-4 text-[13px] text-muted">
          <div className="flex items-center gap-2">
            <Icon name="lock" size={16} className="text-success-text" />
            <span>Cobrança segura processada por Stripe (cartão) ou Asaas (Pix), instituições regulamentadas pelo Banco Central do Brasil.</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span>Dúvidas com notas ou faturamento?</span>
            <button type="button" onClick={aCaminho} className="inline-flex items-center gap-1 font-bold text-whatsapp hover:underline">
              <Icon name="chat" size={14} />
              Fale com nosso financeiro via WhatsApp
            </button>
          </div>
        </div>
      </Card>

      <div ref={pricingRef} className="mt-10">
        <ForcedDark className="rounded-card p-4 sm:p-6">
          <PricingPlansSection showHeader={false} currentPlan={user?.plan || 'basico'} subscriptionStatus={subscriptionStatus} />
        </ForcedDark>
      </div>
    </div>
  );
}
