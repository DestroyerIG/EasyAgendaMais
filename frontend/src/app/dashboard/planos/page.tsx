'use client';

/**
 * Ajustes › Plano e cobrança (Stitch `studio-aurora-ajustes-plano-e-cobranca-equipe-2026--cf22b5`).
 *
 * Tudo aqui é dado real (spec 2D): status e período de `billing/status`, recursos do
 * catálogo único (`billing/plans`), cartão ou cobrança Pix em aberto no Asaas
 * (`billing/payment-method`) e o histórico de `billing/invoices`. Sem dado, a tela diz que
 * não há, em vez de mostrar exemplo. "Mudar de plano" leva à comparação
 * (`/planos/comparar`); quem não tem assinatura paga escolhe o plano pelo checkout de
 * sempre (`PricingPlansSection`), que só aparece nesse caso.
 */

import { ConviteCartao } from '@/components/assinatura/ConviteCartao';
import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/components/Toast';
import { useDashboardBilling } from '@/hooks/useDashboardBilling';
import { PricingPlansSection } from '@/components/marketing/PricingPlansSection';
import { ForcedDark } from '@/components/theme/ForcedDark';
import { SettingsTabs } from '@/components/shell/SettingsTabs';
import { PixPagamento } from '@/components/planos/PixPagamento';
import { isPlanId, type PlanId } from '@/lib/plans';
import {
  billingApi,
  type CatalogoPlanos,
  type FaturasResponse,
  type FormaPagamento,
  type SubscriptionStatusResponse,
} from '@/lib/billing';
import { formatCurrency } from '@/lib/formatters';
import {
  NOME_PLANO,
  SEM_PAGAMENTO,
  STATUS_ASSINATURA,
  STATUS_FATURA,
  dataFatura,
  dataLonga,
  diaMes,
  diasAte,
  linkSuporteWhatsapp,
  periodoFatura,
  vespera,
} from '@/lib/planoCobranca';
import { getApiErrorMessage } from '@/utils/handleApiError';
import {
  Button,
  Card,
  Icon,
  Modal,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
} from '@/components/ui';

const FATURAS_INICIAIS = 4;

type PixAberto = { paymentId: string; valor: number; qrCode: string | null; pixCopyPaste: string | null };

const listaNomes = (nomes: string[]): string =>
  nomes.length <= 1 ? nomes.join('') : `${nomes.slice(0, -1).join(', ')} e ${nomes[nomes.length - 1]}`;

export default function PlanosPage() {
  const { user, refreshMe } = useAuth();
  const { showToast } = useToast();
  const { openBillingPortal, portalLoading } = useDashboardBilling();

  const [status, setStatus] = useState<SubscriptionStatusResponse | null>(null);
  const [catalogo, setCatalogo] = useState<CatalogoPlanos | null>(null);
  const [forma, setForma] = useState<FormaPagamento | null>(null);
  const [faturas, setFaturas] = useState<FaturasResponse | null>(null);
  const [ano, setAno] = useState<number | null>(null);
  const [verTodas, setVerTodas] = useState(false);
  const [carregando, setCarregando] = useState(true);
  const [pixAberto, setPixAberto] = useState<PixAberto | null>(null);
  const [confirmarCancelamento, setConfirmarCancelamento] = useState(false);
  const [acao, setAcao] = useState<null | 'cancelar' | 'reativar' | 'mudanca' | 'gerar'>(null);
  const [voltouDoCartao, setVoltouDoCartao] = useState(false);

  const carregar = useCallback(async () => {
    const [s, c, f] = await Promise.allSettled([
      billingApi.getStatus(),
      billingApi.getPlans(),
      billingApi.getPaymentMethod(),
    ]);
    if (s.status === 'fulfilled') setStatus(s.value);
    if (c.status === 'fulfilled') setCatalogo(c.value);
    setForma(f.status === 'fulfilled' ? f.value : null);
    setCarregando(false);
  }, []);

  const carregarFaturas = useCallback(async (filtro: number | null) => {
    try {
      setFaturas(await billingApi.getInvoices(filtro));
    } catch {
      setFaturas({ anos: [], itens: [] });
    }
  }, []);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  // Volta da página do Asaas (?cartao=retorno): o webhook confirma em instantes; acompanha por até 1 min.
  useEffect(() => {
    if (typeof window === 'undefined' || !new URLSearchParams(window.location.search).has('cartao')) return;
    setVoltouDoCartao(true);
    let vezes = 0;
    const id = window.setInterval(() => {
      vezes += 1;
      void carregar();
      if (vezes >= 12) window.clearInterval(id);
    }, 5000);
    return () => window.clearInterval(id);
  }, [carregar]);

  useEffect(() => {
    void carregarFaturas(ano);
  }, [ano, carregarFaturas]);

  const recarregarTudo = useCallback(async () => {
    await Promise.all([carregar(), carregarFaturas(ano), refreshMe()]);
  }, [ano, carregar, carregarFaturas, refreshMe]);

  const planoBruto = status?.plan ?? user?.plan ?? 'basico';
  const planId: PlanId = isPlanId(planoBruto) ? planoBruto : 'basico';
  const nome = NOME_PLANO[planId];
  const planoCatalogo = catalogo?.planos.find((p) => p.id === planId) ?? null;
  const preco = planoCatalogo?.preco ?? null;
  const statusAssinatura = status?.subscriptionStatus ?? user?.subscriptionStatus ?? null;
  const statusRotulo = statusAssinatura ? STATUS_ASSINATURA[statusAssinatura] : 'Plano atual';
  const provider = status?.provider ?? null;
  const fimPeriodo = status?.nextDueDate ?? status?.currentPeriodEnd ?? null;
  const noCartao = status?.paymentMethod === 'card';
  const assinaturaPaga = statusAssinatura === 'active' && provider === 'asaas';
  const canceladaNoFim = Boolean(status?.cancelAtPeriodEnd) && statusAssinatura === 'active';
  const semPagamento = statusAssinatura ? SEM_PAGAMENTO.includes(statusAssinatura) : false;
  const precisaEscolher = !assinaturaPaga && !semPagamento;
  const suporte = linkSuporteWhatsapp(`Olá! Tenho uma dúvida sobre a cobrança do ${user?.businessName || 'meu negócio'}.`);

  const recursos = useMemo(() => {
    if (!planoCatalogo) return [];
    const ativas = status?.nomesProfissionais ?? [];
    const limite = planoCatalogo.limiteProfissionais;
    const livres = limite === null ? null : Math.max(0, limite - ativas.length);
    const titulo =
      limite === null ? 'Profissionais ilimitadas na grade' : limite === 1 ? '1 profissional na grade' : `Até ${limite} profissionais na grade`;
    const vagas = livres ? [`${livres} ${livres === 1 ? 'vaga livre' : 'vagas livres'}`] : [];
    const descricao = ativas.length ? listaNomes([...ativas, ...vagas]) : 'Nenhuma profissional ativa ainda';
    return [
      { icone: 'badge', titulo, descricao },
      ...planoCatalogo.destaques
        .filter((d) => !/profissionais/i.test(d))
        .map((d) => ({ icone: /whatsapp/i.test(d) ? 'smart_toy' : 'check_circle', titulo: d, descricao: null as string | null })),
    ];
  }, [planoCatalogo, status?.nomesProfissionais]);

  const executar = async (tipo: NonNullable<typeof acao>, fn: () => Promise<void>) => {
    setAcao(tipo);
    try {
      await fn();
    } catch (error) {
      showToast(getApiErrorMessage(error, 'Não foi possível concluir. Tente de novo.'), 'error');
    } finally {
      setAcao(null);
    }
  };

  const cancelarAssinatura = () =>
    executar('cancelar', async () => {
      await billingApi.cancelSubscription();
      setConfirmarCancelamento(false);
      showToast('Assinatura cancelada. Nenhuma nova cobrança será feita.', 'success');
      await recarregarTudo();
    });

  const reativarOuPagar = () =>
    executar(canceladaNoFim ? 'reativar' : 'gerar', async () => {
      const r = await billingApi.reactivateSubscription();
      if ('reactivationMode' in r && r.reactivationMode === 'new_pix_checkout' && 'paymentId' in r && r.paymentId) {
        const planoCobrado = status?.planoAgendado ?? planId;
        const valor = catalogo?.planos.find((p) => p.id === planoCobrado)?.preco ?? preco ?? 0;
        setPixAberto({ paymentId: r.paymentId, valor, qrCode: r.qrCode, pixCopyPaste: r.pixCopyPaste });
      } else {
        showToast('Assinatura reativada.', 'success');
      }
      await recarregarTudo();
    });

  const cancelarMudanca = () =>
    executar('mudanca', async () => {
      const r = await billingApi.cancelPlanChange();
      showToast(r.cancelado === 'downgrade' ? 'Mudança de plano cancelada.' : 'Upgrade cancelado.', 'success');
      setPixAberto(null);
      await recarregarTudo();
    });

  const pagamentoConfirmado = () => {
    setPixAberto(null);
    showToast('Pagamento confirmado!', 'success');
    void recarregarTudo();
  };

  const proximaCobranca = dataLonga(fimPeriodo);
  const diasProxima = diasAte(fimPeriodo);
  const faturasVisiveis = faturas ? (verTodas ? faturas.itens : faturas.itens.slice(0, FATURAS_INICIAIS)) : [];
  const upgrade = status?.upgradePendente ?? null;

  return (
    <div>
      <SettingsTabs />

      <div className="mb-8 flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-[13px] font-semibold uppercase tracking-wider text-brand-text">
            <span
              className={`h-1.5 w-1.5 rounded-full ${statusAssinatura === 'active' ? 'bg-success' : 'bg-warning'}`}
              aria-hidden="true"
            />
            {statusRotulo}
            {user?.businessName && (
              <>
                <span aria-hidden="true">•</span>
                <span className="normal-case tracking-normal">{user.businessName}</span>
              </>
            )}
          </div>
          <h2 className="text-3xl font-bold text-ink">Plano e cobrança</h2>
          <p className="max-w-2xl text-muted">
            Gerencie sua assinatura, consulte a próxima renovação, a forma de pagamento e o histórico de faturas do seu negócio.
          </p>
        </div>
        {suporte && (
          <a href={suporte} target="_blank" rel="noreferrer" className="inline-flex">
            <span className="inline-flex h-11 items-center gap-2 rounded-control border border-line bg-surface-2 px-4 text-[15px] font-semibold text-ink hover:bg-line/60">
              <Icon name="help" size={18} />
              Dúvidas financeiras
            </span>
          </a>
        )}
      </div>

      {/* Faixas de estado: pagamento, teste, mudança agendada, upgrade aguardando Pix. */}
      <div className="mb-6 space-y-3">
        <ConviteCartao />
        {voltouDoCartao && (
          <div role="status" className="flex items-start gap-2 rounded-card border border-line bg-surface p-4 text-ink">
            <Icon name="credit_card" size={20} className="mt-0.5 shrink-0 text-success-text" />
            <span className="text-[14px]">Cartão recebido. Assim que o Asaas confirmar, sua assinatura aparece aqui.</span>
          </div>
        )}
        {semPagamento && (
          <div role="alert" className="flex flex-col gap-3 rounded-card border border-warning/40 bg-warning/12 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-2 text-warning-text">
              <Icon name="error" size={20} className="mt-0.5 shrink-0" />
              <span className="text-[14px] font-semibold">
                {statusRotulo}. Regularize para voltar a usar todos os recursos do painel.
              </span>
            </div>
            {noCartao ? (
              <Button onClick={openBillingPortal} loading={portalLoading}>
                Pagar a fatura com outro cartão
              </Button>
            ) : (
              <Button onClick={reativarOuPagar} loading={acao === 'gerar'}>
                Gerar cobrança Pix
              </Button>
            )}
          </div>
        )}

        {statusAssinatura === 'trialing' && (
          <div className="flex flex-col gap-3 rounded-card border border-line bg-surface p-4 sm:flex-row sm:items-center sm:justify-between">
            <span className="text-[14px] text-ink">
              <strong className="font-semibold">Período de teste</strong>
              {proximaCobranca ? ` · termina em ${proximaCobranca}` : ''}. Escolha um plano para continuar depois do teste.
            </span>
            <Link href="/planos/comparar" className="text-[14px] font-bold text-brand-text hover:underline">
              Escolher plano
            </Link>
          </div>
        )}

        {status?.planoAgendado && isPlanId(status.planoAgendado) && (
          <div className="flex flex-col gap-3 rounded-card border border-line bg-surface p-4 sm:flex-row sm:items-center sm:justify-between">
            <span className="flex items-center gap-2 text-[14px] text-ink">
              <Icon name="event_repeat" size={20} className="text-brand-text" />
              Seu plano muda para {NOME_PLANO[status.planoAgendado]} em {diaMes(status.planoAgendadoEm) ?? 'breve'}.
            </span>
            <Button variant="secondary" size="sm" onClick={cancelarMudanca} loading={acao === 'mudanca'}>
              Cancelar mudança
            </Button>
          </div>
        )}

        {upgrade && upgrade.plano && isPlanId(upgrade.plano) && (
          <div className="flex flex-col gap-3 rounded-card border border-brand/40 bg-brand/12 p-4 sm:flex-row sm:items-center sm:justify-between">
            <span className="flex items-center gap-2 text-[14px] text-ink">
              <Icon name="qr_code_2" size={20} className="text-brand-text" />
              Upgrade para {NOME_PLANO[upgrade.plano]} aguardando o pagamento de {formatCurrency(upgrade.valor)} no Pix.
            </span>
            <div className="flex gap-2">
              <Button variant="secondary" size="sm" onClick={cancelarMudanca} loading={acao === 'mudanca'}>
                Cancelar upgrade
              </Button>
              <Button
                size="sm"
                onClick={() =>
                  setPixAberto({ paymentId: upgrade.paymentId, valor: upgrade.valor, qrCode: upgrade.qrCode, pixCopyPaste: upgrade.pixCopyPaste })
                }
              >
                Ver Pix
              </Button>
            </div>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-12">
        <Card className="relative flex flex-col justify-between overflow-hidden lg:col-span-8">
          <div className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-brand/12 blur-3xl" aria-hidden="true" />

          <div className="relative flex flex-wrap items-start justify-between gap-4 border-b border-line pb-6">
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-3">
                <h3 className="text-xl font-bold text-ink">Plano {nome} (Mensal)</h3>
                <span
                  className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[13px] font-bold ${
                    statusAssinatura === 'active' && !canceladaNoFim ? 'bg-success/12 text-success-text' : 'bg-warning/12 text-warning-text'
                  }`}
                >
                  {canceladaNoFim ? 'Cancelada' : statusAssinatura === 'active' ? 'Ativo' : statusRotulo}
                </span>
              </div>
              <p className="text-[14px] text-muted">
                {noCartao
                  ? 'Ciclo mensal com renovação automática no cartão cadastrado.'
                  : provider === 'asaas'
                  ? 'Ciclo mensal pago por Pix a cada vencimento.'
                  : 'Ciclo mensal.'}
              </p>
            </div>
            <div className="text-right">
              {preco !== null && (
                <div className="text-2xl font-bold tracking-tight text-ink">
                  {formatCurrency(preco)}
                  <span className="ml-1 text-[14px] font-normal text-muted">/ mês</span>
                </div>
              )}
              {proximaCobranca && assinaturaPaga && !canceladaNoFim && (
                <div className="mt-1 text-[13px] font-semibold text-brand-text">
                  Próxima cobrança: {proximaCobranca}{' '}
                  {diasProxima !== null && <span className="font-normal text-muted">(em {diasProxima} dias)</span>}
                </div>
              )}
            </div>
          </div>

          <div className="relative py-6">
            <div className="mb-4 text-[13px] font-bold uppercase tracking-wider text-muted">Recursos inclusos no seu plano</div>
            {carregando ? (
              <p className="text-[14px] text-muted">Carregando...</p>
            ) : (
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
                      {recurso.descricao && <span className="text-[13px] text-muted">{recurso.descricao}</span>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="relative flex flex-wrap items-center justify-between gap-4 border-t border-line pt-6">
            <div className="flex items-center gap-2 text-[14px] text-muted">
              <Icon name="info" size={20} />
              Sem multas de fidelidade ou taxa de cancelamento.
            </div>
            <Link
              href="/planos/comparar"
              className="inline-flex h-11 items-center gap-2 rounded-control bg-brand px-4 text-[15px] font-semibold text-on-brand hover:bg-brand/90"
            >
              Mudar de plano
              <Icon name="arrow_forward" size={18} />
            </Link>
          </div>
        </Card>

        <Card className="flex flex-col justify-between gap-6 lg:col-span-4">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Icon name={forma?.tipo === 'pix' ? 'payments' : 'credit_card'} size={22} className="text-brand-text" />
                <h3 className="text-lg font-bold text-ink">Forma de pagamento</h3>
              </div>
              {forma && <span className="rounded-full bg-surface-2 px-2 py-0.5 text-[13px] text-muted">Padrão</span>}
            </div>

            {forma?.tipo === 'card' && (
              <>
                <div className="space-y-4 rounded-xl border border-line/70 bg-surface-2 p-4">
                  <div className="flex items-center justify-between">
                    <span className="text-[14px] font-semibold text-ink">{forma.bandeira ?? 'Cartão de crédito'}</span>
                    <span className="font-mono text-[13px] text-muted">Débito automático</span>
                  </div>
                  <div className="space-y-1">
                    <div className="font-mono text-[17px] tracking-wider text-ink">•••• •••• •••• {forma.final ?? '••••'}</div>
                  </div>
                </div>
                {assinaturaPaga && !canceladaNoFim && preco !== null && (
                  <div className="flex items-start gap-2.5 rounded-lg bg-success/12 p-3 text-ink">
                    <Icon name="verified_user" size={18} className="mt-0.5 shrink-0 text-success-text" />
                    <p className="text-[13px] leading-relaxed">
                      <strong className="font-semibold text-success-text">Débito automático ativo.</strong> A cobrança de{' '}
                      {formatCurrency(preco)} será processada automaticamente no vencimento, sem interrupção dos serviços.
                    </p>
                  </div>
                )}
              </>
            )}

            {forma?.tipo === 'pix' && (
              <div className="space-y-3">
                <div className="flex items-center gap-3 rounded-xl border border-line/70 bg-surface-2 p-4">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-surface text-success-text shadow-sm">
                    <Icon name="qr_code_2" size={20} />
                  </div>
                  <div className="flex flex-col">
                    <span className="text-[14px] font-semibold text-ink">Pix · cobrança mensal</span>
                    <span className="text-[13px] text-muted">
                      {forma.cobrancaAberta
                        ? `Cobrança de ${formatCurrency(forma.cobrancaAberta.valor)} em aberto${
                            forma.cobrancaAberta.vencimento ? `, vence em ${diaMes(forma.cobrancaAberta.vencimento)}` : ''
                          }.`
                        : 'A cobrança de cada mês é gerada aqui no vencimento.'}
                    </span>
                  </div>
                </div>
              </div>
            )}

            {!forma && !carregando && (
              <p className="rounded-xl border border-dashed border-line p-4 text-[14px] text-muted">
                Nenhuma forma de pagamento cadastrada. Ela aparece aqui depois do primeiro pagamento.
              </p>
            )}
          </div>

          {forma?.tipo === 'card' && forma.urlFatura && (
            <Button
              variant="secondary"
              fullWidth
              onClick={() => window.open(forma.urlFatura!, '_blank', 'noopener,noreferrer')}
            >
              <Icon name="credit_card" size={18} />
              Pagar a fatura com outro cartão
            </Button>
          )}
          {forma?.tipo === 'pix' && forma.cobrancaAberta && (
            <Button
              fullWidth
              onClick={() =>
                forma.cobrancaAberta &&
                setPixAberto({
                  paymentId: forma.cobrancaAberta.paymentId,
                  valor: forma.cobrancaAberta.valor,
                  qrCode: forma.cobrancaAberta.qrCode,
                  pixCopyPaste: forma.cobrancaAberta.pixCopyPaste,
                })
              }
            >
              <Icon name="qr_code_2" size={18} />
              Pagar com Pix
            </Button>
          )}
        </Card>
      </div>

      <div className="mt-6 overflow-hidden rounded-card border border-line bg-surface">
        <div className="flex flex-col gap-4 border-b border-line p-6 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="text-lg font-bold text-ink">Histórico de faturas e pagamentos</h3>
            <p className="mt-0.5 text-[14px] text-muted">Acesse as faturas e os comprovantes de cada cobrança.</p>
          </div>
          {faturas && faturas.anos.length > 1 && (
            <label className="inline-flex items-center gap-2 text-[14px] text-muted">
              <Icon name="filter_list" size={16} />
              <span className="sr-only">Filtrar por ano</span>
              <select
                value={ano ?? ''}
                onChange={(e) => setAno(e.target.value ? Number(e.target.value) : null)}
                className="h-9 rounded-control border border-line bg-surface-2 px-2 text-[14px] text-ink"
              >
                <option value="">Todos os anos</option>
                {faturas.anos.map((a) => (
                  <option key={a} value={a}>
                    {a}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>

        {faturasVisiveis.length === 0 ? (
          <p className="px-6 py-10 text-center text-muted">
            {faturas ? 'Nenhuma cobrança ainda. A primeira aparece aqui quando for gerada.' : 'Carregando faturas...'}
          </p>
        ) : (
          <>
            {/* Celular: lista de cartões. */}
            <ul className="divide-y divide-line md:hidden">
              {faturasVisiveis.map((f) => (
                <li key={f.id} className="flex items-start justify-between gap-3 p-4">
                  <div className="min-w-0">
                    <div className="font-semibold text-ink">{f.referencia}</div>
                    <div className="text-[13px] text-muted">
                      {dataFatura(f.data)} · {f.formaDetalhe}
                    </div>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <span className="font-mono font-semibold text-ink">{formatCurrency(f.valor)}</span>
                    <span className={`rounded-full px-2 py-0.5 text-[12px] font-semibold ${STATUS_FATURA[f.status].classe}`}>
                      {STATUS_FATURA[f.status].rotulo}
                    </span>
                    {f.url && (
                      <a href={f.url} target="_blank" rel="noreferrer" className="text-[13px] font-semibold text-brand-text hover:underline">
                        Fatura
                      </a>
                    )}
                  </div>
                </li>
              ))}
            </ul>

            <div className="hidden w-full overflow-x-auto md:block">
              <table className="w-full border-collapse text-left text-[15px]">
                <TableHead>
                  <TableRow>
                    <TableHeaderCell>Data</TableHeaderCell>
                    <TableHeaderCell>Referência / Período</TableHeaderCell>
                    <TableHeaderCell className="text-right">Valor</TableHeaderCell>
                    <TableHeaderCell>Forma de pagamento</TableHeaderCell>
                    <TableHeaderCell>Status</TableHeaderCell>
                    <TableHeaderCell className="text-center">Comprovante</TableHeaderCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {faturasVisiveis.map((f) => {
                    const periodo = periodoFatura(f.periodoInicio, f.periodoFim);
                    return (
                      <TableRow key={f.id}>
                        <TableCell className="whitespace-nowrap font-mono font-medium">{dataFatura(f.data)}</TableCell>
                        <TableCell>
                          <div className="flex flex-col">
                            <span className="font-semibold text-ink">{f.referencia}</span>
                            {periodo && <span className="text-[13px] text-muted">Período: {periodo}</span>}
                          </div>
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-right font-mono font-semibold">{formatCurrency(f.valor)}</TableCell>
                        <TableCell className="whitespace-nowrap">
                          <span className="inline-flex items-center gap-2">
                            <Icon name={f.forma === 'pix' ? 'payments' : 'credit_card'} size={18} className="text-muted" />
                            <span className="text-[13px]">{f.formaDetalhe}</span>
                          </span>
                        </TableCell>
                        <TableCell className="whitespace-nowrap">
                          <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[13px] font-semibold ${STATUS_FATURA[f.status].classe}`}>
                            <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden="true" />
                            {STATUS_FATURA[f.status].rotulo}
                          </span>
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-center">
                          {f.url ? (
                            <a
                              href={f.url}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-1 rounded border border-line bg-surface-2 px-2.5 py-1 text-[13px] hover:bg-line/60"
                            >
                              <Icon name="picture_as_pdf" size={16} className="text-danger" />
                              Fatura
                            </a>
                          ) : (
                            <span className="text-[13px] text-muted">—</span>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </table>
            </div>

            {faturas && faturas.itens.length > FATURAS_INICIAIS && (
              <div className="flex items-center justify-between bg-surface-2 p-4 text-[13px] text-muted">
                <span>
                  Exibindo {faturasVisiveis.length} de {faturas.itens.length} lançamentos
                </span>
                {!verTodas && (
                  <button type="button" onClick={() => setVerTodas(true)} className="font-semibold text-brand-text hover:underline">
                    Carregar histórico completo
                  </button>
                )}
              </div>
            )}
          </>
        )}
      </div>

      {(assinaturaPaga || canceladaNoFim) && (
        <Card className="mt-6 space-y-4">
          {canceladaNoFim ? (
            <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
              <div className="max-w-2xl space-y-1">
                <div className="flex items-center gap-2">
                  <Icon name="event_busy" size={18} className="text-muted" />
                  <span className="text-[15px] font-bold text-ink">Assinatura cancelada</span>
                </div>
                <p className="text-[14px] leading-relaxed text-muted">
                  Seu negócio mantém acesso a todos os recursos até{' '}
                  <span className="font-semibold text-ink">{vespera(fimPeriodo) ?? 'o fim do período'}</span>. Nenhuma nova
                  cobrança será feita.
                </p>
              </div>
              <Button onClick={reativarOuPagar} loading={acao === 'reativar'} className="shrink-0">
                Reativar assinatura
              </Button>
            </div>
          ) : (
            <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
              <div className="max-w-2xl space-y-1">
                <div className="flex items-center gap-2">
                  <Icon name="pause_circle" size={18} className="text-muted" />
                  <span className="text-[15px] font-bold text-ink">
                    Deseja cancelar a assinatura do {user?.businessName || 'seu negócio'}?
                  </span>
                </div>
                <p className="text-[14px] leading-relaxed text-muted">
                  Ao cancelar, seu negócio mantém acesso irrestrito a todos os recursos até{' '}
                  <span className="font-semibold text-ink">{vespera(fimPeriodo) ?? 'o fim do período pago'}</span>. Seus dados
                  de clientes e o histórico de agendamentos não são apagados.
                </p>
              </div>
              <Button variant="secondary" onClick={() => setConfirmarCancelamento(true)} className="shrink-0 text-danger">
                Cancelar assinatura
              </Button>
            </div>
          )}
          <div className="flex flex-wrap items-center justify-between gap-4 border-t border-line pt-4 text-[13px] text-muted">
            <div className="flex items-center gap-2">
              <Icon name="lock" size={16} className="text-success-text" />
              <span>
                {noCartao
                  ? 'Pagamento com cartão processado pelo Asaas.'
                  : 'Cobrança segura intermediada por Asaas Instituição de Pagamento S.A., regulada pelo Banco Central do Brasil.'}
              </span>
            </div>
            {suporte && (
              <div className="flex items-center gap-1.5">
                <span>Dúvidas com notas ou faturamento?</span>
                <a href={suporte} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-bold text-whatsapp hover:underline">
                  <Icon name="chat" size={14} />
                  Fale com nosso financeiro via WhatsApp
                </a>
              </div>
            )}
          </div>
        </Card>
      )}

      {precisaEscolher && !carregando && (
        <div id="assinar" className="mt-10 space-y-4">
          <h3 className="text-xl font-bold text-ink">Escolha seu plano</h3>
          <ForcedDark className="rounded-card p-4 sm:p-6">
            <PricingPlansSection showHeader={false} currentPlan={planId} subscriptionStatus={statusAssinatura} />
          </ForcedDark>
        </div>
      )}

      <Modal
        isOpen={confirmarCancelamento}
        onClose={() => setConfirmarCancelamento(false)}
        title="Cancelar assinatura"
        icon="event_busy"
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirmarCancelamento(false)}>
              Manter assinatura
            </Button>
            <Button variant="danger" onClick={cancelarAssinatura} loading={acao === 'cancelar'}>
              Cancelar assinatura
            </Button>
          </>
        }
      >
        <p className="text-[14px] text-ink">
          Você mantém acesso até <strong>{vespera(fimPeriodo) ?? 'o fim do período pago'}</strong>. Depois disso, o painel
          fica bloqueado até você assinar de novo. Seus dados não são apagados.
        </p>
      </Modal>

      <Modal isOpen={Boolean(pixAberto)} onClose={() => setPixAberto(null)} title="Pagar com Pix" icon="qr_code_2">
        {pixAberto && (
          <PixPagamento
            paymentId={pixAberto.paymentId}
            valor={pixAberto.valor}
            qrCode={pixAberto.qrCode}
            pixCopyPaste={pixAberto.pixCopyPaste}
            acompanhar
            onPago={pagamentoConfirmado}
          />
        )}
      </Modal>
    </div>
  );
}
