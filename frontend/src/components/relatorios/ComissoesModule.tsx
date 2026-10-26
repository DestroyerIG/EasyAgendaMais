'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/components/Toast';
import { formatCurrency } from '@/lib/formatters';
import { getApiErrorMessage } from '@/utils/handleApiError';
import { cn } from '@/lib/cn';
import {
  type ApuracaoComissoes, type LinhaComissao, type ModeloRepasse, type Periodo,
  AVISO_SALAO_PARCEIRO, ROTULO_FORMA, formatarCnpj, hojeLocal, quinzenaDe, relatoriosApi,
} from '@/lib/relatorios';
import { pdfComissoes, pdfComprovante } from '@/lib/relatoriosPdf';
import { Avatar, Banner, Button, Card, Icon, Skeleton } from '@/components/ui';
import { SeletorPeriodo } from './SeletorPeriodo';
import { PagarRepasseModal } from './PagarRepasseModal';
import { AdiantamentoModal } from './AdiantamentoModal';
import { useVocabulario } from '@/hooks/useVocabulario';

// Comissões e salão-parceiro (sub-projeto 3): apuração por profissional no período,
// adiantamentos, "Marcar como pago", comprovante e exportação para o contador.

interface ComissoesModuleProps {
  onUpgrade: (recurso: string) => void;
}

const STATUS: Record<LinhaComissao['status'], { rotulo: string; classe: string }> = {
  pendente: { rotulo: 'Pendente', classe: 'bg-warning/12 text-warning-text' },
  pago: { rotulo: 'Pago', classe: 'bg-success/12 text-success-text' },
  sem_valor: { rotulo: 'Sem valor', classe: 'bg-surface-2 text-muted' },
};

const r$ = (v: number) => formatCurrency(v);

export function ComissoesModule({ onUpgrade }: ComissoesModuleProps) {
  const { user } = useAuth();
  const { showToast } = useToast();
  const termos = useVocabulario();
  const { prof } = termos;
  const dona = user?.role === 'tenant_admin';
  const [periodo, setPeriodo] = useState<Periodo>(() => quinzenaDe(hojeLocal()));
  const [dados, setDados] = useState<ApuracaoComissoes | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [pagando, setPagando] = useState<LinhaComissao | null>(null);
  const [adiantamento, setAdiantamento] = useState(false);
  const [exportando, setExportando] = useState(false);
  const [desfazendo, setDesfazendo] = useState<string | null>(null);

  const carregar = useCallback(async (p: Periodo) => {
    setErro(null);
    try {
      setDados(await relatoriosApi.comissoes(p));
    } catch (e) {
      setErro(getApiErrorMessage(e, 'Não foi possível carregar as comissões.'));
    }
  }, []);

  useEffect(() => {
    void carregar(periodo);
  }, [carregar, periodo]);

  const trocarModelo = async (modelo: ModeloRepasse) => {
    if (!dados || modelo === dados.modelo) return;
    if (modelo === 'salao_parceiro' && !dados.salaoParceiroLiberado) return onUpgrade('salao_parceiro');
    try {
      await relatoriosApi.salvarModelo(modelo);
      await carregar(periodo);
    } catch (e) {
      showToast(getApiErrorMessage(e, 'Não foi possível mudar o modelo de repasse.'), 'error');
    }
  };

  const exportarCsv = async () => {
    setExportando(true);
    try {
      await relatoriosApi.exportarCsv(periodo);
    } catch (e) {
      showToast(getApiErrorMessage(e, 'Não foi possível exportar.'), 'error');
    } finally {
      setExportando(false);
    }
  };

  const desfazer = async (l: LinhaComissao) => {
    if (!l.repasse || !window.confirm(`Desfazer o pagamento de ${l.professional.nome}? Os adiantamentos descontados voltam a ficar em aberto.`)) return;
    setDesfazendo(l.repasse.id);
    try {
      await relatoriosApi.desfazerPagamento(l.repasse.id);
      showToast('Pagamento desfeito.', 'success');
      await carregar(periodo);
    } catch (e) {
      showToast(getApiErrorMessage(e, 'Não foi possível desfazer o pagamento.'), 'error');
    } finally {
      setDesfazendo(null);
    }
  };

  const parceiro = dados?.modelo === 'salao_parceiro';
  const negocio = user?.businessName ?? 'EasyAgenda+';

  return (
    <div className="space-y-6 pb-10">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-bold text-ink">Comissões</h1>
          <SeletorPeriodo periodo={periodo} onChange={setPeriodo} opcoes={['quinzena', 'mes', 'mes_anterior', 'livre']} setasQuinzena />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div role="radiogroup" aria-label="Modelo de repasse" className="flex rounded-control border border-line bg-surface-2 p-1">
            {(['comissao', 'salao_parceiro'] as const).map((m) => {
              const ativo = dados?.modelo === m;
              const bloqueado = m === 'salao_parceiro' && dados !== null && !dados.salaoParceiroLiberado;
              return (
                <button
                  key={m}
                  type="button"
                  role="radio"
                  aria-checked={ativo}
                  disabled={!dados || (!dona && !bloqueado)}
                  onClick={() => trocarModelo(m)}
                  className={cn(
                    'flex items-center gap-1 rounded-[8px] px-3 py-1.5 text-[13px] font-semibold transition-colors',
                    ativo ? 'bg-surface text-ink shadow-sm' : 'text-muted hover:text-ink',
                  )}
                >
                  {bloqueado && <Icon name="lock" size={14} />}
                  {m === 'comissao' ? 'Comissão tradicional' : 'Salão-parceiro'}
                </button>
              );
            })}
          </div>
          {dona && (
            <Button variant="secondary" size="sm" onClick={() => setAdiantamento(true)}>
              <Icon name="payments" size={18} />
              Lançar adiantamento
            </Button>
          )}
          <Button variant="secondary" size="sm" onClick={exportarCsv} loading={exportando} disabled={!dados?.itens.length}>
            <Icon name="ios_share" size={18} />
            Exportar CSV
          </Button>
          <Button size="sm" onClick={() => dados && pdfComissoes(dados, negocio, termos)} disabled={!dados?.itens.length}>
            <Icon name="picture_as_pdf" size={18} />
            PDF para o contador
          </Button>
        </div>
      </div>

      {erro && (
        <Banner tone="danger" variant="inline" action={<Button size="sm" variant="secondary" onClick={() => carregar(periodo)}>Tentar de novo</Button>}>
          {erro}
        </Banner>
      )}

      {!dados && !erro ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Card key={i} className="space-y-2"><Skeleton className="h-4 w-28" /><Skeleton className="h-8 w-32" /></Card>
          ))}
        </div>
      ) : dados ? (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Total rotulo="Faturamento produzido" valor={r$(dados.totais.faturamento)} legenda="Total faturado no período, sem gorjetas" />
            <Total
              rotulo={parceiro ? 'Cota-parte do salão' : 'Fica com o salão'}
              valor={r$(dados.totais.cotaSalao)}
              legenda={dados.totais.retencaoMedia === null ? '—' : `Retenção média de ${dados.totais.retencaoMedia}%`}
            />
            <Total
              rotulo={parceiro ? `Cota-parte ${prof.dosP}` : `Comissões ${prof.dosP}`}
              valor={r$(dados.totais.cotaProfissionais)}
              legenda={`A pagar: ${r$(dados.totais.aPagar)}`}
            />
            <Total rotulo="Gorjetas" valor={r$(dados.totais.gorjetas)} legenda={`100% repassado ${prof.g('às', 'aos')} ${prof.p}`} />
          </div>

          <Card className="space-y-4 p-0">
            <h2 className="px-5 pt-5 text-lg font-bold text-ink">
              {parceiro ? `Apuração por ${prof.s} (Lei do Salão-Parceiro)` : `Apuração por ${prof.s}`}
            </h2>
            {dados.itens.length === 0 ? (
              <p className="px-5 pb-6 text-[14px] text-muted">Nenhuma comanda fechada neste período.</p>
            ) : (
              <>
                <div className="hidden overflow-x-auto lg:block">
                  <table className="w-full min-w-[960px] text-[14px]">
                    <thead className="border-y border-line bg-surface-2 text-left text-[12px] font-semibold uppercase tracking-wide text-muted">
                      <tr>
                        <th scope="col" className="px-5 py-3">{prof.S}</th>
                        <th scope="col" className="px-3 py-3 text-right">Atend.</th>
                        <th scope="col" className="px-3 py-3 text-right">Serviços</th>
                        <th scope="col" className="px-3 py-3 text-right">Produtos</th>
                        <th scope="col" className="px-3 py-3 text-right">{parceiro ? 'Cota do salão' : 'Fica no salão'}</th>
                        <th scope="col" className="px-3 py-3 text-right">{parceiro ? 'Cota da prof.' : 'Comissão'}</th>
                        <th scope="col" className="px-3 py-3 text-right">Gorjetas</th>
                        <th scope="col" className="px-3 py-3 text-right">Adiant.</th>
                        <th scope="col" className="px-3 py-3 text-right">A pagar</th>
                        <th scope="col" className="px-5 py-3">Status / ação</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-line">
                      {dados.itens.map((l) => (
                        <tr key={l.professional.id}>
                          <td className="px-5 py-3"><Profissional l={l} parceiro={parceiro} /></td>
                          <td className="px-3 py-3 text-right tabular-nums">{l.atendimentos}</td>
                          <td className="px-3 py-3 text-right tabular-nums">{r$(l.servicos)}</td>
                          <td className="px-3 py-3 text-right tabular-nums">{r$(l.produtos)}</td>
                          <td className="px-3 py-3 text-right tabular-nums">{r$(l.cotaSalao)}</td>
                          <td className="px-3 py-3 text-right tabular-nums">{r$(l.comissao)}</td>
                          <td className="px-3 py-3 text-right tabular-nums text-success-text">{l.gorjetas ? `+ ${r$(l.gorjetas)}` : '—'}</td>
                          <td className="px-3 py-3 text-right tabular-nums text-danger">{l.adiantamentos ? `− ${r$(l.adiantamentos)}` : '—'}</td>
                          <td className="px-3 py-3 text-right font-bold tabular-nums text-ink">{r$(l.aPagar)}</td>
                          <td className="px-5 py-3">
                            <Acoes l={l} dona={dona} desfazendo={desfazendo === l.repasse?.id}
                              onPagar={() => setPagando(l)} onDesfazer={() => desfazer(l)} onComprovante={() => pdfComprovante(dados, l, negocio, termos)} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <ul className="divide-y divide-line lg:hidden">
                  {dados.itens.map((l) => (
                    <li key={l.professional.id} className="space-y-3 px-5 py-4">
                      <Profissional l={l} parceiro={parceiro} />
                      <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-[13px]">
                        <dt className="text-muted">Atendimentos</dt><dd className="text-right tabular-nums">{l.atendimentos}</dd>
                        <dt className="text-muted">Serviços + produtos</dt><dd className="text-right tabular-nums">{r$(l.servicos + l.produtos)}</dd>
                        <dt className="text-muted">{parceiro ? `Cota ${prof.doS}` : 'Comissão'}</dt><dd className="text-right tabular-nums">{r$(l.comissao)}</dd>
                        <dt className="text-muted">Gorjetas</dt><dd className="text-right tabular-nums">{r$(l.gorjetas)}</dd>
                        <dt className="text-muted">Adiantamentos</dt><dd className="text-right tabular-nums">{l.adiantamentos ? `− ${r$(l.adiantamentos)}` : '—'}</dd>
                        <dt className="font-semibold text-ink">A pagar</dt><dd className="text-right font-bold tabular-nums text-ink">{r$(l.aPagar)}</dd>
                      </dl>
                      <Acoes l={l} dona={dona} desfazendo={desfazendo === l.repasse?.id}
                        onPagar={() => setPagando(l)} onDesfazer={() => desfazer(l)} onComprovante={() => pdfComprovante(dados, l, negocio, termos)} />
                    </li>
                  ))}
                </ul>
              </>
            )}
          </Card>

          {parceiro ? (
            <p className="flex items-start gap-2 rounded-card border border-line bg-surface-2 p-4 text-[13px] text-muted">
              <Icon name="info" size={18} className="mt-0.5 shrink-0" />
              {termos.adaptar(AVISO_SALAO_PARCEIRO)}
            </p>
          ) : (
            <p className="text-[13px] text-muted">
              A comissão de cada item é a que a comanda gravou no fechamento. Os percentuais ficam em{' '}
              <Link href="/servicos" className="font-semibold text-brand-text underline">Serviços e equipe</Link>.
            </p>
          )}
        </>
      ) : null}

      {pagando && (
        <PagarRepasseModal
          linha={pagando}
          periodo={periodo}
          onClose={() => setPagando(null)}
          onPago={async () => {
            setPagando(null);
            showToast('Repasse marcado como pago.', 'success');
            await carregar(periodo);
          }}
        />
      )}
      {adiantamento && (
        <AdiantamentoModal
          profissionais={(dados?.itens ?? []).map((l) => l.professional)}
          onClose={() => setAdiantamento(false)}
          onSalvo={async () => {
            setAdiantamento(false);
            showToast('Adiantamento lançado.', 'success');
            await carregar(periodo);
          }}
        />
      )}
    </div>
  );
}

function Total({ rotulo, valor, legenda }: { rotulo: string; valor: string; legenda: string }) {
  return (
    <Card className="flex flex-col gap-1">
      <p className="text-[13px] font-semibold text-muted">{rotulo}</p>
      <p className="text-[26px] font-bold leading-tight tabular-nums text-ink">{valor}</p>
      <p className="text-[13px] text-muted">{legenda}</p>
    </Card>
  );
}

function Profissional({ l, parceiro }: { l: LinhaComissao; parceiro: boolean }) {
  const cnpj = formatarCnpj(l.professional.cnpj);
  return (
    <div className="flex items-center gap-3">
      <Avatar name={l.professional.nome} src={l.professional.foto} size={36} />
      <div className="min-w-0">
        <p className="flex flex-wrap items-center gap-2 font-semibold text-ink">
          {l.professional.nome}
          {!l.professional.ativa && <span className="rounded-full bg-surface-2 px-2 py-0.5 text-[11px] font-semibold text-muted">Inativa</span>}
        </p>
        <p className="text-[12px] text-muted">
          {[l.professional.especialidade, parceiro ? (cnpj ? `MEI ${cnpj}` : null) : null].filter(Boolean).join(' · ') || ' '}
        </p>
        {parceiro && !cnpj && (
          <Link href="/servicos" className="text-[12px] font-semibold text-warning-text underline">Sem CNPJ: cadastrar</Link>
        )}
      </div>
    </div>
  );
}

interface AcoesProps {
  l: LinhaComissao; dona: boolean; desfazendo: boolean;
  onPagar: () => void; onDesfazer: () => void; onComprovante: () => void;
}

function Acoes({ l, dona, desfazendo, onPagar, onDesfazer, onComprovante }: AcoesProps) {
  const s = STATUS[l.status];
  return (
    <div className="space-y-1">
      <div className="flex flex-wrap items-center gap-2">
        <span className={cn('rounded-full px-2.5 py-1 text-[12px] font-semibold', s.classe)}>{s.rotulo}</span>
        {l.status === 'pendente' && dona && (
          <Button size="sm" onClick={onPagar}>Marcar como pago</Button>
        )}
        {l.status === 'pago' && (
          <>
            <Button size="sm" variant="secondary" onClick={onComprovante}>
              <Icon name="receipt_long" size={16} />
              Comprovante
            </Button>
            {dona && (
              <Button size="sm" variant="ghost" onClick={onDesfazer} loading={desfazendo}>Desfazer</Button>
            )}
          </>
        )}
      </div>
      {l.repasse && (
        <p className="text-[12px] text-muted">
          {ROTULO_FORMA[l.repasse.forma]} em {new Date(l.repasse.pagoEm).toLocaleDateString('pt-BR')}
        </p>
      )}
      {l.status === 'pago' && l.diferencaDesdePagamento !== 0 && (
        <p role="status" className="text-[12px] font-semibold text-warning-text">
          Diferença de {formatCurrency(Math.abs(l.diferencaDesdePagamento))} desde o pagamento
        </p>
      )}
    </div>
  );
}
