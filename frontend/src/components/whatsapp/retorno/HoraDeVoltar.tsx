'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Icon, Skeleton } from '@/components/ui';
import { useAuth } from '@/contexts/AuthContext';
import { cn } from '@/lib/cn';
import { formatCurrency } from '@/lib/formatters';
import { buscarRetorno, type RetornoDto } from '@/lib/whatsappRetorno';
import { CartaoOportunidade, convidadaRecentemente } from './CartaoOportunidade';
import { PreviaConvite } from './PreviaConvite';

interface HoraDeVoltarProps {
  conectado: boolean;
}

type FiltroAtraso = 'todos' | 'encaixe';

// O envio, o modal "Ver texto" e o teste entram na tarefa seguinte; até lá os botões existem sem ação.
const semAcao = () => { /* sem ação */ };

const CAMPO = 'rounded-lg bg-surface-m3-low px-3 py-2 text-[13px] font-semibold text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand';

export function HoraDeVoltar({ conectado }: HoraDeVoltarProps) {
  const { user } = useAuth();
  const [professionalId, setProfessionalId] = useState<string | null>(null);
  const [atraso, setAtraso] = useState<FiltroAtraso>('todos');
  const [incluirLink, setIncluirLink] = useState(true);
  const [dados, setDados] = useState<RetornoDto | null>(null);
  const [erro, setErro] = useState(false);
  const [profissionais, setProfissionais] = useState<Array<{ id: string; nome: string }>>([]);
  const [selecionadas, setSelecionadas] = useState<ReadonlySet<string>>(new Set());
  const [escolhidaId, setEscolhidaId] = useState<string | null>(null);
  const pedido = useRef(0);

  const carregar = useCallback(async () => {
    const numero = ++pedido.current;
    try {
      const r = await buscarRetorno({
        ...(professionalId ? { professionalId } : {}),
        ...(atraso === 'encaixe' ? { somenteComEncaixe: true } : {}),
        incluirLink,
      });
      if (numero !== pedido.current) return;
      setDados(r);
      setErro(false);
      // As profissionais vêm da própria lista; ao filtrar, as já conhecidas continuam disponíveis.
      setProfissionais((atuais) => {
        const mapa = new Map(atuais.map((p) => [p.id, p.nome]));
        for (const i of r.itens) mapa.set(i.professionalId, i.profissional);
        return [...mapa].map(([id, nome]) => ({ id, nome })).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
      });
    } catch {
      if (numero === pedido.current) setErro(true);
    }
  }, [professionalId, atraso, incluirLink]);

  useEffect(() => { void carregar(); }, [carregar]);

  const itens = useMemo(() => dados?.itens ?? [], [dados]);
  const elegiveis = useMemo(() => itens.filter((i) => i.podeReceber && !convidadaRecentemente(i)), [itens]);
  const marcadas = useMemo(() => itens.filter((i) => selecionadas.has(i.cliente.id) && i.podeReceber), [itens, selecionadas]);
  const escolhida = itens.find((i) => i.cliente.id === escolhidaId) ?? itens[0] ?? null;
  const todasMarcadas = elegiveis.length > 0 && elegiveis.every((i) => selecionadas.has(i.cliente.id));

  const alternar = (id: string) => setSelecionadas((atual) => {
    const novo = new Set(atual);
    if (novo.has(id)) novo.delete(id); else novo.add(id);
    return novo;
  });
  const alternarTodas = () => setSelecionadas(todasMarcadas ? new Set() : new Set(elegiveis.map((i) => i.cliente.id)));

  const recuperacao = marcadas.length > 0
    ? marcadas.reduce((soma, i) => soma + i.valorUltimaVisita, 0)
    : (dados?.resumo.recuperacaoEstimada ?? 0);
  const filtrando = professionalId !== null || atraso !== 'todos';

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-muted">
            <span className="h-2.5 w-2.5 rounded-full bg-whatsapp" aria-hidden="true" />
            <span className="text-brand-text">Retenção ativa</span>
            <span className="h-1 w-1 rounded-full bg-line" aria-hidden="true" />
            <span className="normal-case tracking-normal">Sugestões de vagas em aberto</span>
          </div>
          <h2 className="text-[28px] font-bold leading-9 tracking-tight text-ink">Hora de voltar</h2>
          <p className="max-w-3xl text-[15px] leading-6 text-muted">
            Clientes com manutenção ou retorno recomendado vencido. Oportunidades para preencher horários vagos esta semana.
          </p>
        </div>
        <div className="flex items-center gap-2 self-start rounded-xl bg-surface-m3-low p-2 shadow-sm md:self-auto">
          <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-surface text-whatsapp shadow-sm">
            <Icon name="trending_up" size={24} />
          </span>
          <div className="flex flex-col pr-4" title="Soma do valor da última visita de cada cliente">
            <span className="text-[11px] font-semibold leading-none text-muted">Recuperação Estimada</span>
            <span className="mt-1 text-[20px] font-extrabold leading-7 text-ink">{formatCurrency(recuperacao)}</span>
          </div>
          <div className="mx-1 h-8 w-px bg-line" aria-hidden="true" />
          <div className="flex flex-col pl-1 pr-2">
            <span className="text-[11px] font-semibold leading-none text-muted">Oportunidades</span>
            <div className="mt-1 flex items-center gap-1">
              <span className="text-[20px] font-extrabold leading-7 text-brand-text">{dados?.resumo.oportunidades ?? 0}</span>
              <span className="text-[11px] font-semibold text-muted">ativas</span>
            </div>
          </div>
        </div>
      </div>

      {!conectado ? (
        <p role="status" className="flex items-center gap-2 rounded-control border border-warning/30 bg-warning/12 px-3 py-2 text-[13px] text-ink">
          <Icon name="link_off" size={18} className="text-warning-text" />
          WhatsApp desconectado. Reconecte na aba Conexão.
        </p>
      ) : null}

      <div className="flex flex-col justify-between gap-4 rounded-xl bg-surface p-4 shadow-sm lg:flex-row lg:items-center">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex flex-wrap items-center gap-1 rounded-lg bg-surface-m3-low px-2 py-1">
            <span className="text-[11px] font-semibold text-muted">Profissional:</span>
            <div className="inline-flex flex-wrap rounded-lg bg-surface-2 p-0.5">
              {[{ id: null, nome: 'Todas' }, ...profissionais].map((p) => {
                const ativo = p.id === professionalId;
                return (
                  <button
                    key={p.id ?? 'todas'}
                    type="button"
                    aria-pressed={ativo}
                    onClick={() => setProfessionalId(p.id)}
                    className={cn(
                      'min-h-8 rounded-md px-2 py-1 text-[11px] transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand',
                      ativo ? 'bg-surface font-bold text-ink shadow-sm' : 'font-semibold text-muted hover:text-ink',
                    )}
                  >
                    {p.nome}
                  </button>
                );
              })}
            </div>
          </div>
          <div className="flex items-center gap-1 rounded-lg bg-surface-m3-low px-2">
            <Icon name="tune" size={18} className="text-muted" />
            <label htmlFor="filtro-atraso" className="text-[13px] font-semibold text-muted">Atraso:</label>
            <select
              id="filtro-atraso"
              value={atraso}
              onChange={(e) => setAtraso(e.target.value as FiltroAtraso)}
              className={cn(CAMPO, 'bg-transparent px-1')}
            >
              <option value="todos">Todos os níveis</option>
              <option value="encaixe">Apenas com encaixe ideal</option>
            </select>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="hidden text-[11px] font-semibold text-muted sm:inline">
            {`${marcadas.length} ${marcadas.length === 1 ? 'selecionada' : 'selecionadas'}`}
          </span>
          <button
            type="button"
            disabled={!conectado || marcadas.length === 0}
            onClick={semAcao}
            className="flex min-h-11 items-center justify-center gap-2 rounded-xl bg-whatsapp px-6 py-2.5 text-[13px] font-bold text-surface shadow-sm transition-colors hover:bg-whatsapp/90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Icon name="send" size={20} />
            {`Enviar convites no WhatsApp (${marcadas.length})`}
          </button>
        </div>
      </div>

      {erro && !dados ? (
        <div role="alert" className="flex flex-col items-center gap-3 rounded-xl bg-surface p-8 text-center shadow-sm">
          <p className="text-[14px] text-muted">Não foi possível carregar as oportunidades.</p>
          <button
            type="button"
            onClick={() => void carregar()}
            className="min-h-11 rounded-xl bg-surface-m3-low px-4 text-[13px] font-bold text-ink hover:bg-surface-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand"
          >
            Tentar novamente
          </button>
        </div>
      ) : !dados ? (
        <Skeleton className="h-60 w-full" label="Carregando oportunidades..." />
      ) : (
        <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-12">
          <div className="flex flex-col gap-2 lg:col-span-8">
            <div className="flex items-center justify-between rounded-xl bg-surface p-4 shadow-sm">
              <label className="flex cursor-pointer items-center gap-2 text-[13px] font-bold text-ink">
                <input
                  type="checkbox"
                  checked={todasMarcadas}
                  disabled={elegiveis.length === 0}
                  onChange={alternarTodas}
                  aria-label={`Selecionar todas (${elegiveis.length})`}
                  className="h-4 w-4 cursor-pointer rounded accent-brand"
                />
                {`Selecionar todas (${elegiveis.length})`}
              </label>
              <span className="flex items-center gap-2 text-[11px] font-semibold text-muted">
                Ordenado por: <strong>Maior atraso</strong>
                <Icon name="sort" size={16} />
              </span>
            </div>

            {itens.length === 0 ? (
              <p className="rounded-xl bg-surface p-8 text-center text-[14px] text-muted shadow-sm">
                {filtrando
                  ? 'Nenhuma cliente com esses filtros agora.'
                  : 'Nenhuma cliente com retorno vencido agora. Quando alguém passar do ciclo, ela aparece aqui.'}
              </p>
            ) : (
              <div className="flex flex-col gap-2">
                {itens.map((item) => (
                  <CartaoOportunidade
                    key={item.cliente.id}
                    item={item}
                    selecionada={selecionadas.has(item.cliente.id)}
                    escolhida={escolhida?.cliente.id === item.cliente.id}
                    envioDesabilitado={!conectado}
                    onAlternarSelecao={() => alternar(item.cliente.id)}
                    onEscolher={() => setEscolhidaId(item.cliente.id)}
                    onVerTexto={semAcao}
                    onEnviar={semAcao}
                  />
                ))}
              </div>
            )}
          </div>

          <div className="hidden lg:col-span-4 lg:block">
            <PreviaConvite
              escolhida={escolhida}
              nomeNegocio={user?.businessName || 'Seu negócio'}
              incluirLink={incluirLink}
              linkDisponivel={!!dados.linkAgendamento}
              numeroNegocio={dados.numeroNegocio}
              conectado={conectado}
              onAlternarLink={() => setIncluirLink((v) => !v)}
              onTestar={semAcao}
            />
          </div>
        </div>
      )}
    </div>
  );
}
