'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Camera, CheckCircle2, Crown, Minus, Plus, Scissors, Search, Send, Trash2 } from 'lucide-react';
import { Banner, Button, EmptyState, Skeleton } from '@/components/ui';
import { useToast } from '@/components/Toast';
import { bancadaApi, primeiroNome, type BancadaComandaInput, type ComandaBancada } from '@/lib/bancada';
import { ROTULO_PAGAMENTO, type ComandaShortcut, type PaymentMethod } from '@/lib/comanda';
import { formatCurrency } from '@/lib/formatters';
import { getApiErrorMessage } from '@/utils/handleApiError';
import { cn } from '@/lib/cn';
import { ErroBancada } from './ErroBancada';
import { useVocabulario } from '@/hooks/useVocabulario';

// Fechar atendimento pela bancada. Sem a chave "a profissional cobra", ela monta a comanda e manda
// para a recepção; com a chave, também escolhe a forma e fecha (o caixa precisa estar aberto).

const semAcento = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const FORMAS: PaymentMethod[] = ['pix', 'debito', 'credito', 'dinheiro'];
const numero = (t: string) => {
  const v = Number(t.replace(/\./g, '').replace(',', '.'));
  return Number.isFinite(v) && v > 0 ? Math.round(v * 100) / 100 : 0;
};

function Linha({ rotulo, valor, forte = false }: { rotulo: string; valor: string; forte?: boolean }) {
  return (
    <div className={cn('flex items-center justify-between gap-3 text-[14px]', forte ? 'font-bold text-ink' : 'text-muted')}>
      <span>{rotulo}</span><span className="tabular-nums">{valor}</span>
    </div>
  );
}

export function AtendimentoBancada() {
  const params = useSearchParams();
  const router = useRouter();
  const { showToast } = useToast();
  const { adaptar } = useVocabulario();
  const comandaParam = params?.get('comanda') ?? null;
  const [comandaId, setComandaId] = useState<string | null>(comandaParam);
  const [dto, setDto] = useState<ComandaBancada | null>(null);
  const [vazio, setVazio] = useState(false);
  const [erro, setErro] = useState<unknown>(null);
  const [atalhos, setAtalhos] = useState<ComandaShortcut[]>([]);
  const [busca, setBusca] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [enviandoFoto, setEnviandoFoto] = useState(false);
  const [forma, setForma] = useState<PaymentMethod | null>(null);
  const [gorjeta, setGorjeta] = useState('');
  const [desconto, setDesconto] = useState('');
  const fotoRef = useRef<HTMLInputElement>(null);

  // Sem ?comanda=, abre o atendimento em andamento do dia (se houver).
  useEffect(() => {
    if (comandaParam) { setComandaId(comandaParam); return; }
    bancadaApi.hoje()
      .then((h) => {
        const atual = h.agenda.find((a) => a.status === 'em_atendimento' && a.comanda?.status === 'rascunho');
        if (atual?.comanda) setComandaId(atual.comanda.id);
        else setVazio(true);
      })
      .catch(setErro);
  }, [comandaParam]);

  const carregar = useCallback(() => {
    if (!comandaId) return;
    setErro(null);
    bancadaApi.comanda(comandaId)
      .then((c) => {
        setDto(c);
        setForma(c.paymentMethod);
        setGorjeta(c.tip ? String(c.tip).replace('.', ',') : '');
        setDesconto(c.discount ? String(c.discount).replace('.', ',') : '');
      })
      .catch(setErro);
  }, [comandaId]);

  useEffect(() => { carregar(); }, [carregar]);
  useEffect(() => { bancadaApi.atalhos().then(setAtalhos).catch(() => setAtalhos([])); }, []);

  const extras = useMemo(() => dto?.items.filter((i) => !i.isMain) ?? [], [dto]);
  const principal = dto?.items.find((i) => i.isMain) ?? null;
  const resultados = useMemo(() => {
    const termo = semAcento(busca.trim());
    if (!termo) return [];
    return atalhos.filter((a) => a.id !== principal?.refId && semAcento(a.name).includes(termo)).slice(0, 6);
  }, [atalhos, busca, principal]);

  if (erro) return <ErroBancada erro={erro} onRetry={carregar} />;
  if (vazio) {
    return (
      <EmptyState icon={Scissors} title="Nenhum atendimento em andamento"
        description={adaptar('Toque em Iniciar na agenda quando a cliente sentar na sua bancada.')}
        action={{ label: 'Ir para a agenda', onClick: () => router.push('/bancada') }} />
    );
  }
  if (!dto) {
    return <div className="flex flex-col gap-3" aria-busy="true"><Skeleton className="h-24 w-full" /><Skeleton className="h-48 w-full" /></div>;
  }

  const cobra = dto.profissionalCobra;
  const fechada = dto.status === 'fechada';
  const nome = primeiroNome(dto.client.name);
  const extrasInput = (lista = extras) =>
    lista.filter((i) => i.refId).map((i) => ({ kind: i.kind, id: i.refId as string, quantity: i.quantity }));
  const entrada = (lista = extras): BancadaComandaInput => ({
    extras: extrasInput(lista),
    ...(cobra ? { discount: numero(desconto), tip: numero(gorjeta), paymentMethod: forma } : {}),
    ...(dto.cobertura.disponivel ? { usarCobertura: dto.cobertura.usando } : {}),
  });

  const salvarItens = async (lista: typeof extras) => {
    setSalvando(true);
    try {
      setDto(await bancadaApi.salvarComanda(dto.id, entrada(lista)));
    } catch (e) {
      showToast(getApiErrorMessage(e, 'Não foi possível salvar a comanda.'), 'error');
    } finally {
      setSalvando(false);
    }
  };

  const adicionar = (a: ComandaShortcut) => {
    setBusca('');
    const existe = extras.find((e) => e.kind === a.kind && e.refId === a.id);
    const lista = existe
      ? extras.map((e) => (e === existe ? { ...e, quantity: e.quantity + 1 } : e))
      : [...extras, { id: null, kind: a.kind, refId: a.id, name: a.name, unitPrice: a.price, quantity: 1, durationMinutes: null, isMain: false, coveredValue: null }];
    void salvarItens(lista);
  };
  const mudarQtd = (k: number, delta: number) =>
    void salvarItens(extras.map((e, i) => (i === k ? { ...e, quantity: Math.max(1, e.quantity + delta) } : e)));
  const remover = (k: number) => void salvarItens(extras.filter((_, i) => i !== k));

  const enviarFoto = async (arquivo: File | undefined) => {
    if (!arquivo) return;
    setEnviandoFoto(true);
    try {
      await bancadaApi.enviarFoto(dto.client.id, arquivo, { appointmentId: dto.appointment.id, caption: principal?.name });
      showToast('Foto salva na galeria da cliente.', 'success');
    } catch (e) {
      showToast(e instanceof Error && !('isAxiosError' in e) ? e.message : getApiErrorMessage(e, 'Não foi possível enviar a foto.'), 'error');
    } finally {
      setEnviandoFoto(false);
      if (fotoRef.current) fotoRef.current.value = '';
    }
  };

  const enviarRecepcao = async () => {
    setSalvando(true);
    try {
      setDto(await bancadaApi.enviarParaRecepcao(dto.id, entrada()));
      showToast(`Comanda de ${nome} enviada para a recepção.`, 'success');
    } catch (e) {
      showToast(getApiErrorMessage(e, 'Não foi possível enviar.'), 'error');
    } finally {
      setSalvando(false);
    }
  };

  const fechar = async () => {
    setSalvando(true);
    try {
      const r = await bancadaApi.fecharComanda(dto.id, entrada());
      setDto(r);
      showToast(r.receiptSentAt ? `Comanda #${r.number} fechada · comprovante enviado` : `Comanda #${r.number} fechada`, 'success');
    } catch (e) {
      showToast(getApiErrorMessage(e, 'Não foi possível fechar a comanda.'), 'error');
    } finally {
      setSalvando(false);
    }
  };

  const c = dto.calc;
  const enviada = Boolean(dto.enviadaRecepcaoEm);
  const precisaForma = cobra && c.totalCharged > 0 && !forma;

  return (
    <div className="flex flex-col gap-4">
      <section className="rounded-card border border-line bg-surface p-4">
        <p className="text-[11px] font-bold uppercase tracking-wide text-brand-text">Comanda #{dto.number}</p>
        <h1 className="mt-0.5 text-lg font-bold text-ink">{dto.client.name}</h1>
        <Link href={`/bancada/clientes/${dto.client.id}`} className="text-[13px] font-semibold text-brand-text hover:underline">Ver ficha</Link>
      </section>

      {fechada && (
        <Banner tone="success" variant="inline">
          <span className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4" aria-hidden="true" /> Comanda fechada. Obrigada!</span>
        </Banner>
      )}
      {!fechada && enviada && !cobra && (
        <Banner tone="info" variant="inline">Enviada para a recepção. Se mudar algo, envie de novo.</Banner>
      )}

      <section className="rounded-card border border-line bg-surface p-4">
        <h2 className="text-[15px] font-bold text-ink">Itens</h2>
        <ul className="mt-2 divide-y divide-line">
          {principal && (
            <li className="flex items-center justify-between gap-3 py-2.5 text-[14px]">
              <span className="min-w-0">
                <span className="block truncate font-semibold text-ink">{principal.name}</span>
                {dto.cobertura.usando && dto.cobertura.disponivel && (
                  <span className="flex items-center gap-1 text-[12px] text-brand-text">
                    <Crown className="h-3.5 w-3.5" aria-hidden="true" /> Coberto por {dto.cobertura.disponivel.nome}
                  </span>
                )}
              </span>
              <span className="tabular-nums text-ink">{formatCurrency(principal.unitPrice)}</span>
            </li>
          )}
          {extras.map((e, k) => (
            <li key={`${e.kind}-${e.refId}`} className="flex items-center gap-2 py-2.5 text-[14px]">
              <span className="min-w-0 flex-1">
                <span className="block truncate text-ink">{e.name}</span>
                <span className="text-[12px] text-muted">{e.kind === 'produto' ? 'Produto' : 'Serviço'} · {formatCurrency(e.unitPrice)}</span>
              </span>
              {!fechada && (
                <span className="flex items-center gap-1">
                  <button type="button" aria-label={`Diminuir ${e.name}`} disabled={salvando || e.quantity <= 1} onClick={() => mudarQtd(k, -1)}
                    className="flex h-9 w-9 items-center justify-center rounded-control border border-line text-ink disabled:opacity-40">
                    <Minus className="h-4 w-4" aria-hidden="true" />
                  </button>
                  <span className="w-6 text-center tabular-nums text-ink">{e.quantity}</span>
                  <button type="button" aria-label={`Aumentar ${e.name}`} disabled={salvando} onClick={() => mudarQtd(k, 1)}
                    className="flex h-9 w-9 items-center justify-center rounded-control border border-line text-ink disabled:opacity-40">
                    <Plus className="h-4 w-4" aria-hidden="true" />
                  </button>
                  <button type="button" aria-label={`Remover ${e.name}`} disabled={salvando} onClick={() => remover(k)}
                    className="flex h-9 w-9 items-center justify-center rounded-control text-danger disabled:opacity-40">
                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                  </button>
                </span>
              )}
              {fechada && <span className="tabular-nums text-muted">{e.quantity}x</span>}
            </li>
          ))}
        </ul>

        {!fechada && (
          <div className="relative mt-3">
            <label className="relative block">
              <span className="sr-only">Adicionar serviço ou produto</span>
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden="true" />
              <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Adicionar serviço ou produto"
                className="h-11 w-full rounded-control border border-line bg-surface pl-9 pr-3 text-[15px] text-ink" />
            </label>
            {resultados.length > 0 && (
              <ul className="absolute inset-x-0 top-12 z-10 overflow-hidden rounded-control border border-line bg-surface shadow-lg">
                {resultados.map((r) => (
                  <li key={`${r.kind}-${r.id}`}>
                    <button type="button" onClick={() => adicionar(r)}
                      className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left text-[14px] hover:bg-surface-2">
                      <span className="truncate text-ink">{r.name}</span>
                      <span className="shrink-0 tabular-nums text-muted">{formatCurrency(r.price)}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </section>

      <section className="rounded-card border border-line bg-surface p-4">
        <input ref={fotoRef} type="file" accept="image/jpeg,image/png,image/webp" capture="environment" className="hidden"
          aria-label="Foto do trabalho" onChange={(e) => void enviarFoto(e.target.files?.[0])} />
        <Button variant="secondary" fullWidth onClick={() => fotoRef.current?.click()} loading={enviandoFoto}>
          <Camera className="h-4 w-4" aria-hidden="true" /> Foto do trabalho
        </Button>
        <p className="mt-1.5 text-[12px] text-muted">A foto vai para a galeria da cliente.</p>
      </section>

      {cobra && !fechada && (
        <section className="flex flex-col gap-3 rounded-card border border-line bg-surface p-4">
          <h2 className="text-[15px] font-bold text-ink">Pagamento</h2>
          <div className="grid grid-cols-2 gap-2">
            {FORMAS.map((f) => (
              <button key={f} type="button" aria-pressed={forma === f} onClick={() => setForma(f)}
                className={cn('h-11 rounded-control border text-[14px] font-semibold',
                  forma === f ? 'border-brand bg-brand/12 text-brand-text' : 'border-line bg-surface text-ink')}>
                {ROTULO_PAGAMENTO[f]}
              </button>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <label className="flex flex-col gap-1 text-[13px] font-semibold text-ink">
              Desconto (R$)
              <input inputMode="decimal" value={desconto} onChange={(e) => setDesconto(e.target.value)} onBlur={() => void salvarItens(extras)}
                className="h-11 rounded-control border border-line bg-surface px-3 text-[15px] tabular-nums text-ink" />
            </label>
            <label className="flex flex-col gap-1 text-[13px] font-semibold text-ink">
              Gorjeta (R$)
              <input inputMode="decimal" value={gorjeta} onChange={(e) => setGorjeta(e.target.value)} onBlur={() => void salvarItens(extras)}
                className="h-11 rounded-control border border-line bg-surface px-3 text-[15px] tabular-nums text-ink" />
            </label>
          </div>
        </section>
      )}

      <section className="flex flex-col gap-1.5 rounded-card border border-line bg-surface p-4">
        <h2 className="mb-1 text-[15px] font-bold text-ink">Demonstrativo</h2>
        <Linha rotulo="Subtotal" valor={formatCurrency(c.subtotal)} />
        {c.depositApplied > 0 && <Linha rotulo="Sinal Pix" valor={`− ${formatCurrency(c.depositApplied)}`} />}
        {c.discount > 0 && <Linha rotulo="Desconto" valor={`− ${formatCurrency(c.discount)}`} />}
        {c.tip > 0 && <Linha rotulo="Gorjeta" valor={formatCurrency(c.tip)} />}
        <Linha rotulo="Total a cobrar" valor={formatCurrency(c.totalCharged)} forte />
        <div className="mt-2 flex items-center justify-between rounded-control bg-success/12 px-3 py-2.5">
          <span className="text-[13px] font-semibold text-success-text">{fechada ? 'Sua comissão' : 'Sua comissão estimada'}</span>
          <span className="text-[16px] font-bold tabular-nums text-success-text">{formatCurrency(c.commissionTotal)}</span>
        </div>
      </section>

      {!fechada && (
        cobra ? (
          <div className="flex flex-col gap-2">
            <Button size="lg" fullWidth onClick={fechar} loading={salvando} disabled={precisaForma}>
              <CheckCircle2 className="h-5 w-5" aria-hidden="true" /> Fechar e cobrar {formatCurrency(c.totalCharged)}
            </Button>
            {precisaForma && <p className="text-center text-[12px] text-muted">Escolha a forma de pagamento.</p>}
          </div>
        ) : (
          <Button size="lg" fullWidth onClick={enviarRecepcao} loading={salvando}>
            <Send className="h-5 w-5" aria-hidden="true" /> {enviada ? 'Enviar de novo para a recepção' : 'Enviar para a recepção'}
          </Button>
        )
      )}
    </div>
  );
}
