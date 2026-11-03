'use client';

/**
 * Ajustes › Plano e cobrança › Comparação e upgrade
 * (Stitch `studio-aurora-comparacao-e-upgrade-de-planos-corrigida--9b0ac9`).
 *
 * Planos, preços e matriz vêm do catálogo único (`billing/plans`). Recursos que ainda não
 * existem aparecem com o selo "Em breve" (decisão do dono, spec 2D). Sem o ciclo anual.
 * A faixa "Recurso exclusivo" só aparece quando a tela é aberta com `?recurso=`.
 */

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/components/Toast';
import { SettingsTabs } from '@/components/shell/SettingsTabs';
import { TrocaPlanoModal } from '@/components/planos/TrocaPlanoModal';
import { billingApi, type CatalogoPlanos, type DisponibilidadeRecurso, type SubscriptionStatusResponse } from '@/lib/billing';
import { isPlanId, type PlanId } from '@/lib/plans';
import { rotuloEquipe } from '@/lib/planCatalog';
import { formatCurrency } from '@/lib/formatters';
import { NOME_PLANO, ORDEM_PLANOS, SEM_PAGAMENTO, nivelPlano } from '@/lib/planoCobranca';
import { cn } from '@/lib/cn';
import { Button, Icon } from '@/components/ui';

const ICONE_PLANO: Record<PlanId, string> = { basico: 'person', profissional: 'diversity_3', premium: 'workspace_premium' };

const INTRO_RECURSOS: Record<PlanId, string> = {
  basico: 'O que está incluso:',
  profissional: 'Tudo do Solo, e mais:',
  premium: 'Tudo do Equipe, e mais:',
};

interface RecursoExclusivo {
  icone: string;
  titulo: (plano: string) => string;
  texto: (atual: string, plano: string) => string;
  plano: (atual: PlanId) => PlanId | null;
}

const proximoPlano = (atual: PlanId): PlanId | null => ORDEM_PLANOS[nivelPlano(atual) + 1] ?? null;

// Gatilhos que mandam para esta tela (`?recurso=`): FeatureGate e limite de profissionais.
const RECURSOS_EXCLUSIVOS: Record<string, RecursoExclusivo> = {
  reports: {
    icone: 'analytics',
    titulo: (p) => `Relatórios fazem parte do plano ${p}`,
    texto: (a, p) => `Você tentou abrir os relatórios gerenciais. Faça upgrade do plano ${a} para o ${p} para liberar relatórios, exportação e comissões da equipe.`,
    plano: (a) => (nivelPlano(a) < 1 ? 'profissional' : null),
  },
  exports: {
    icone: 'download',
    titulo: (p) => `Exportação faz parte do plano ${p}`,
    texto: (a, p) => `Você tentou exportar dados do painel. Faça upgrade do plano ${a} para o ${p} para liberar a exportação e os relatórios.`,
    plano: (a) => (nivelPlano(a) < 1 ? 'profissional' : null),
  },
  salao_parceiro: {
    icone: 'handshake',
    titulo: (p) => `Salão-parceiro faz parte do plano ${p}`,
    texto: (a, p) => `Você tentou ativar o modo salão-parceiro nas comissões. Faça upgrade do plano ${a} para o ${p} para apurar a cota-parte do salão e das profissionais, conforme a Lei 13.352.`,
    plano: (a) => (nivelPlano(a) < 2 ? 'premium' : null),
  },
  clube: {
    icone: 'loyalty',
    titulo: (p) => `Clube e pacotes fazem parte do plano ${p}`,
    texto: (a, p) => `Você tentou abrir o Clube e pacotes. Faça upgrade do plano ${a} para o ${p} para vender assinaturas mensais e pacotes de sessões, com a cobrança por Pix.`,
    plano: (a) => (nivelPlano(a) < 2 ? 'premium' : null),
  },
  app_profissional: {
    icone: 'smartphone',
    titulo: (p) => `O app da profissional faz parte do plano ${p}`,
    texto: (a, p) => `Você tentou convidar uma profissional para o app. Faça upgrade do plano ${a} para o ${p} para que cada profissional veja a agenda, a ficha das clientes e os próprios números no celular.`,
    plano: (a) => (nivelPlano(a) < 1 ? 'profissional' : null),
  },
  profissionais: {
    icone: 'group_add',
    titulo: (p) => `Mais profissionais no plano ${p}`,
    texto: (a, p) => `O plano ${a} chegou ao limite de profissionais na grade. Faça upgrade para o ${p} para cadastrar mais profissionais.`,
    plano: proximoPlano,
  },
};

const FAQ = [
  {
    icone: 'calendar_clock',
    pergunta: 'Como funciona a cobrança proporcional?',
    resposta:
      'No upgrade, você paga só a diferença proporcional pelos dias que faltam até a próxima fatura. O valor cheio do novo plano só vem nas mensalidades seguintes.',
  },
  {
    icone: 'speed',
    pergunta: 'A liberação dos recursos é imediata?',
    resposta:
      'No cartão, sim: os recursos são liberados assim que a diferença é cobrada. No Pix, a liberação acontece quando o pagamento da diferença é confirmado, normalmente em poucos segundos.',
  },
  {
    icone: 'history',
    pergunta: 'Posso voltar para um plano menor?',
    resposta:
      'Sim, sem fidelidade. A mudança para um plano menor vale a partir da próxima renovação, e até lá você continua com tudo do plano atual. Dá para cancelar a mudança antes disso.',
  },
];

function Disponibilidade({ valor, destaque }: { valor: DisponibilidadeRecurso; destaque: boolean }) {
  if (valor === true) {
    return (
      <>
        <Icon name="check_circle" size={22} filled className={destaque ? 'text-brand-text' : 'text-success-text'} />
        <span className="sr-only">Incluso</span>
      </>
    );
  }
  if (valor === false) {
    return (
      <>
        <Icon name="remove" size={22} className="text-muted/60" />
        <span className="sr-only">Indisponível</span>
      </>
    );
  }
  if (valor === 'em_breve') {
    return <span className="rounded-full bg-tertiary-container px-2 py-0.5 text-[12px] font-bold text-ink">Em breve</span>;
  }
  return <span className="text-[14px] font-semibold text-ink">{valor}</span>;
}

function CompararPlanos() {
  const { user, refreshMe } = useAuth();
  const { showToast } = useToast();
  const router = useRouter();
  const params = useSearchParams();
  const cartoesRef = useRef<HTMLDivElement>(null);

  const [catalogo, setCatalogo] = useState<CatalogoPlanos | null>(null);
  const [status, setStatus] = useState<SubscriptionStatusResponse | null>(null);
  const [erro, setErro] = useState(false);
  const [trocarPara, setTrocarPara] = useState<PlanId | null>(null);

  useEffect(() => {
    billingApi.getPlans().then(setCatalogo).catch(() => setErro(true));
    billingApi.getStatus().then(setStatus).catch(() => undefined);
  }, []);

  const planoBruto = status?.plan ?? user?.plan ?? 'basico';
  const atual: PlanId = isPlanId(planoBruto) ? planoBruto : 'basico';
  const statusAssinatura = status?.subscriptionStatus ?? user?.subscriptionStatus ?? null;
  const assinaturaPaga =
    statusAssinatura === 'active' && status?.provider === 'asaas';
  const podeTrocar = user?.role !== 'employee';
  const recomendado = proximoPlano(atual);
  const negocio = user?.businessName || 'seu negócio';

  const recurso = RECURSOS_EXCLUSIVOS[params.get('recurso') ?? ''] ?? null;
  const planoDoRecurso = recurso ? recurso.plano(atual) : null;

  const grupos = useMemo(() => {
    const mapa = new Map<string, CatalogoPlanos['matriz']>();
    for (const linha of catalogo?.matriz ?? []) {
      mapa.set(linha.grupo, [...(mapa.get(linha.grupo) ?? []), linha]);
    }
    return [...mapa.entries()];
  }, [catalogo]);

  const concluido = useCallback(
    async (mensagem: string) => {
      setTrocarPara(null);
      showToast(mensagem, 'success');
      await refreshMe();
      router.push('/planos');
    },
    [refreshMe, router, showToast]
  );

  const verCartoes = () => cartoesRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });

  const acaoDoPlano = (id: PlanId) => {
    const nome = NOME_PLANO[id];
    if (id === atual && assinaturaPaga) {
      return (
        <Button variant="secondary" fullWidth disabled>
          Plano atual (Ativo)
        </Button>
      );
    }
    if (!assinaturaPaga) {
      // Sem assinatura paga: o checkout de sempre, na tela de Plano e cobrança.
      const pagar = statusAssinatura && SEM_PAGAMENTO.includes(statusAssinatura) && id === atual;
      return (
        <Link
          href={pagar ? '/planos' : '/planos#assinar'}
          className="inline-flex h-11 w-full items-center justify-center rounded-control bg-brand px-4 text-[15px] font-semibold text-on-brand hover:bg-brand/90"
        >
          {pagar ? 'Regularizar pagamento' : `Assinar o ${nome}`}
        </Link>
      );
    }
    if (status?.planoAgendado === id) {
      return (
        <Button variant="secondary" fullWidth disabled>
          Mudança agendada
        </Button>
      );
    }
    if (!podeTrocar) {
      return <p className="text-center text-[13px] text-muted">Só a administradora da conta pode trocar de plano.</p>;
    }
    const sobe = nivelPlano(id) > nivelPlano(atual);
    return (
      <Button variant={sobe ? 'primary' : 'secondary'} fullWidth onClick={() => setTrocarPara(id)}>
        {sobe ? `Fazer upgrade para ${nome}` : `Mudar para ${nome}`}
      </Button>
    );
  };

  if (erro) {
    return (
      <div>
        <SettingsTabs />
        <p className="py-10 text-center text-muted">Não foi possível carregar os planos. Recarregue a página.</p>
      </div>
    );
  }

  return (
    <div className="space-y-10">
      <SettingsTabs />

      <Link href="/planos" className="-mt-4 inline-flex items-center gap-1 text-[14px] font-semibold text-brand-text hover:underline">
        <Icon name="arrow_back" size={18} />
        Plano e cobrança
      </Link>

      {recurso && planoDoRecurso && (
        <section className="relative overflow-hidden rounded-card border border-brand/30 bg-brand/12 p-6 md:p-8">
          <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
            <div className="max-w-2xl space-y-3">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-surface px-3 py-1 text-[12px] font-bold uppercase tracking-wider text-brand-text">
                <Icon name={recurso.icone} size={16} />
                Recurso exclusivo
              </span>
              <h2 className="text-2xl font-bold text-ink">{recurso.titulo(NOME_PLANO[planoDoRecurso])}</h2>
              <p className="text-[15px] text-muted">{recurso.texto(NOME_PLANO[atual], NOME_PLANO[planoDoRecurso])}</p>
              <p className="flex items-center gap-2 text-[14px] font-semibold text-ink">
                <Icon name="price_change" size={18} className="text-brand-text" />
                Você paga só a diferença proporcional até a próxima fatura.
              </p>
            </div>
            <Button size="lg" onClick={verCartoes} className="shrink-0">
              Ver plano {NOME_PLANO[planoDoRecurso]}
              <Icon name="arrow_downward" size={18} />
            </Button>
          </div>
        </section>
      )}

      <section ref={cartoesRef} className="scroll-mt-6 space-y-8">
        <div className="text-center">
          <h2 className="text-3xl font-bold text-ink">Planos flexíveis para a escala do {negocio}</h2>
          <p className="mt-2 text-muted">Troque ou evolua seu plano a qualquer momento, sem travas contratuais.</p>
        </div>

        {!catalogo ? (
          <p className="py-10 text-center text-muted">Carregando planos...</p>
        ) : (
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            {catalogo.planos.map((plano) => {
              const ehAtual = plano.id === atual;
              const ehRecomendado = plano.id === recomendado;
              return (
                <article
                  key={plano.id}
                  className={cn(
                    // Subgrid: preço, recursos e botão na mesma altura nos três cards.
                    'relative flex flex-col gap-6 rounded-card border bg-surface p-6 lg:row-span-3 lg:grid lg:grid-rows-subgrid',
                    ehRecomendado ? 'border-brand shadow-lg' : ehAtual ? 'border-brand/50' : 'border-line'
                  )}
                >
                  {ehRecomendado && (
                    <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-brand px-3 py-1 text-[12px] font-bold text-on-brand">
                      Recomendado
                    </span>
                  )}
                  <div className="flex flex-col gap-3">
                    <div className="flex items-center justify-between">
                      <span className="text-[12px] font-bold uppercase tracking-wider text-muted">{plano.publico}</span>
                      {ehAtual && (
                        <span className="rounded-full bg-success/12 px-2.5 py-0.5 text-[12px] font-bold text-success-text">Plano atual</span>
                      )}
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand/12 text-brand-text">
                        <Icon name={ICONE_PLANO[plano.id]} size={22} />
                      </div>
                      <h3 className="text-2xl font-bold text-ink">{plano.nome}</h3>
                    </div>
                    <p className="flex-1 text-[14px] text-muted">{plano.descricao}</p>
                    <div className="text-3xl font-bold tracking-tight text-ink">
                      {formatCurrency(plano.preco)}
                      <span className="ml-1 text-[14px] font-normal text-muted">/mês</span>
                    </div>
                  </div>

                  <div className="flex-1 space-y-3">
                    <div className="text-[13px] font-bold text-ink">{INTRO_RECURSOS[plano.id]}</div>
                    <ul className="space-y-2">
                      {/* O filtro cobre o backend antigo, que ainda mandava a equipe nos destaques. */}
                      {[rotuloEquipe(plano.limiteProfissionais), ...plano.destaques.filter((d) => !/profissionais/i.test(d))].map((d) => (
                        <li key={d} className="flex items-center gap-2 text-[14px] text-ink">
                          <Icon name="check_circle" size={18} filled className="text-success-text" />
                          {d}
                        </li>
                      ))}
                      {plano.emBreve.map((d) => (
                        <li key={d} className="flex items-center gap-2 text-[14px] text-muted">
                          <Icon name="schedule" size={18} />
                          {d}
                          <span className="rounded-full bg-tertiary-container px-2 py-0.5 text-[11px] font-bold text-ink">Em breve</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  {acaoDoPlano(plano.id)}
                </article>
              );
            })}
          </div>
        )}
      </section>

      {catalogo && (
        <section className="overflow-hidden rounded-card border border-line bg-surface">
          <div className="flex flex-col gap-3 border-b border-line p-6 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h3 className="flex items-center gap-2 text-lg font-bold text-ink">
                <Icon name="bolt" size={20} className="text-brand-text" />
                Matriz comparativa de recursos
              </h3>
              <p className="mt-0.5 text-[14px] text-muted">Conheça exatamente o que cada plano inclui.</p>
            </div>
            <div className="flex items-center gap-4 text-[13px] text-muted">
              <span className="inline-flex items-center gap-1">
                <Icon name="check_circle" size={16} filled className="text-success-text" />
                Incluso
              </span>
              <span className="inline-flex items-center gap-1">
                <Icon name="remove" size={16} />
                Indisponível
              </span>
            </div>
          </div>
          <div className="w-full overflow-x-auto">
            <table className="w-full min-w-[640px] border-collapse text-left text-[14px]">
              <thead>
                <tr className="border-b border-line">
                  <th className="p-4 font-semibold text-muted">Recursos</th>
                  {ORDEM_PLANOS.map((id) => (
                    <th key={id} className={cn('p-4 text-center font-bold text-ink', id === atual && 'bg-brand/12')}>
                      {NOME_PLANO[id]}
                      {id === atual && <span className="block text-[12px] font-semibold text-brand-text">(atual)</span>}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {grupos.map(([grupo, linhas], i) => (
                  <GrupoMatriz key={grupo} titulo={`${i + 1}. ${grupo}`} linhas={linhas} atual={atual} />
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <section className="flex flex-col gap-4 rounded-card border border-line bg-surface p-6 md:flex-row md:items-center">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-success/12 text-success-text">
          <Icon name="verified_user" size={26} />
        </div>
        <div className="space-y-1">
          <h3 className="flex flex-wrap items-center gap-2 text-lg font-bold text-ink">
            Segurança jurídica para o Salão-parceiro
          </h3>
          <p className="text-[14px] text-muted">
            No plano Salão, as comissões mostram a cota-parte do salão e da profissional, com o CNPJ do MEI e o comprovante de
            cada repasse, conforme a Lei 13.352 (Salão-parceiro).
          </p>
        </div>
      </section>

      <section className="space-y-6">
        <div className="text-center">
          <h3 className="text-2xl font-bold text-ink">Perguntas frequentes sobre a troca de plano</h3>
          <p className="mt-1 text-muted">Tudo o que você precisa saber antes de mudar.</p>
        </div>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          {FAQ.map((item) => (
            <div key={item.pergunta} className="space-y-2 rounded-card border border-line bg-surface p-5">
              <Icon name={item.icone} size={24} className="text-brand-text" />
              <h4 className="font-bold text-ink">{item.pergunta}</h4>
              <p className="text-[14px] text-muted">{item.resposta}</p>
            </div>
          ))}
        </div>
      </section>

      {recomendado && assinaturaPaga && podeTrocar && status?.planoAgendado !== recomendado && (
        <section className="flex flex-col items-center gap-4 rounded-card bg-brand/12 p-8 text-center">
          <Icon name="price_check" size={32} className="text-brand-text" />
          <h3 className="text-2xl font-bold text-ink">Pronta para crescer com o {NOME_PLANO[recomendado]}?</h3>
          <Button size="lg" onClick={() => setTrocarPara(recomendado)}>
            Fazer upgrade para {NOME_PLANO[recomendado]}
            <Icon name="chevron_right" size={18} />
          </Button>
        </section>
      )}

      <TrocaPlanoModal plano={trocarPara} onClose={() => setTrocarPara(null)} onConcluido={concluido} />
    </div>
  );
}

function GrupoMatriz({ titulo, linhas, atual }: { titulo: string; linhas: CatalogoPlanos['matriz']; atual: PlanId }) {
  return (
    <>
      <tr className="bg-surface-2">
        <td colSpan={4} className="px-4 py-2 text-[13px] font-bold uppercase tracking-wider text-muted">
          {titulo}
        </td>
      </tr>
      {linhas.map((linha) => (
        <tr key={linha.id} className="border-b border-line/60">
          <td className="p-4 text-ink">{linha.titulo}</td>
          {ORDEM_PLANOS.map((id) => (
            <td key={id} className={cn('p-4 text-center', id === atual && 'bg-brand/12')}>
              <span className="inline-flex justify-center">
                <Disponibilidade valor={linha[id]} destaque={id === atual} />
              </span>
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}

export default function CompararPlanosPage() {
  return (
    <Suspense fallback={null}>
      <CompararPlanos />
    </Suspense>
  );
}
