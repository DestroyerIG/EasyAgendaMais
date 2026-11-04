'use client';

import { useEffect, useState } from 'react';
import { billingApi, type SubscriptionStatusResponse } from '@/lib/billing';
import { CATALOGO_PLANOS } from '@/lib/planCatalog';
import { TESTE_COM_CARTAO_DIAS, TESTE_SEM_CARTAO_DIAS } from '@/lib/constants';
import { useToast } from '@/components/Toast';
import { getApiErrorMessage } from '@/utils/handleApiError';
import { Button, Icon } from '@/components/ui';
import type { PlanId } from '@/lib/plans';

const diaMes = (iso: string | null | undefined): string | null => {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? null
    : new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', timeZone: 'America/Sao_Paulo' }).format(d);
};

const emTesteSemCartao = (s: SubscriptionStatusResponse | null): boolean => {
  if (!s || s.subscriptionStatus !== 'trialing' || s.paymentMethod === 'card') return false;
  const fim = s.currentPeriodEnd ? new Date(s.currentPeriodEnd).getTime() : 0;
  return fim > Date.now();
};

/**
 * Convite do teste sem cartão: cadastrar o cartão no Asaas leva o teste a 14 dias do cadastro.
 * A cobrança só acontece no fim do teste; cancelando antes, nada é cobrado.
 */
export function ConviteCartao() {
  const { showToast } = useToast();
  const [status, setStatus] = useState<SubscriptionStatusResponse | null>(null);
  const [plano, setPlano] = useState<PlanId>('profissional');
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    let ativo = true;
    billingApi
      .getStatus()
      .then((s) => ativo && setStatus(s))
      .catch(() => undefined);
    return () => {
      ativo = false;
    };
  }, []);

  if (!emTesteSemCartao(status)) return null;

  const cobrancaEm = diaMes(status?.cobrancaComCartaoEm);

  const cadastrar = async () => {
    setEnviando(true);
    try {
      const sessao = await billingApi.createCheckoutSession(plano, 'card');
      if ('checkoutUrl' in sessao) {
        window.location.assign(sessao.checkoutUrl);
        return;
      }
      showToast('Não foi possível abrir a página do cartão agora.', 'error');
    } catch (error) {
      showToast(getApiErrorMessage(error, 'Não foi possível abrir a página do cartão agora.'), 'error');
    } finally {
      setEnviando(false);
    }
  };

  return (
    <section className="rounded-card border border-brand/30 bg-brand/8 p-4 sm:p-5" aria-labelledby="convite-cartao">
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-surface text-brand-text shadow-sm">
          <Icon name="credit_card" size={20} />
        </span>
        <div className="flex-1 space-y-1">
          <h3 id="convite-cartao" className="text-[15px] font-bold text-ink">
            Ganhe mais {TESTE_COM_CARTAO_DIAS - TESTE_SEM_CARTAO_DIAS} dias de teste
          </h3>
          <p className="text-[14px] text-muted">
            Cadastre o cartão na página segura do Asaas e o teste vai a {TESTE_COM_CARTAO_DIAS} dias.
            {cobrancaEm ? ` A primeira cobrança só acontece em ${cobrancaEm}` : ' A primeira cobrança só acontece no fim do teste'};
            cancele antes e nada é cobrado.
          </p>
        </div>
      </div>
      <fieldset className="mt-4">
        <legend className="mb-2 text-[13px] font-semibold text-ink">Plano depois do teste</legend>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          {CATALOGO_PLANOS.planos.map((p) => (
            <label
              key={p.id}
              className={`flex cursor-pointer items-center gap-2 rounded-control border px-3 py-2 text-[14px] ${
                plano === p.id ? 'border-brand bg-surface font-semibold text-ink' : 'border-line bg-surface text-muted'
              }`}
            >
              <input
                type="radio"
                name="plano-cartao"
                value={p.id}
                checked={plano === p.id}
                onChange={() => setPlano(p.id)}
                className="accent-brand"
              />
              {p.nome}
            </label>
          ))}
        </div>
      </fieldset>
      <Button className="mt-4" fullWidth onClick={cadastrar} loading={enviando}>
        Cadastrar cartão e ganhar mais 7 dias
      </Button>
    </section>
  );
}
