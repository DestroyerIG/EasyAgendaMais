'use client';

/**
 * Lista de espera (painel lateral). Abre pela Agenda (botão do cabeçalho) e pela tela Hoje
 * (pendência de horários vagos à tarde, já filtrada pelo período e pela data da vaga).
 *
 * Dado real: GET /waitlist (inscrições ativas: aguardando e vaga oferecida). Inscrever usa
 * as clientes, os serviços e as profissionais do negócio, lidos só quando o formulário
 * abre. "Oferecer vaga" marca a inscrição como oferecida e abre o link wa.me que a API
 * devolve, com a mensagem pronta (editável no próprio WhatsApp, nada é enviado sozinho).
 * "Agendar" pede o agendamento a quem sabe criá-lo (a Agenda, via `onAgendar`) e, quando
 * ele é salvo, marca a inscrição como agendada com o id criado. Fora da Agenda, leva para
 * ela com `?espera=<id>`, que reabre este painel e o agendamento da inscrição.
 * Recusa por plano (403) aparece com a mensagem da própria API.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import api from '@/lib/api';
import { useToast } from '@/components/Toast';
import { Banner, Button, Field, Icon, Input, Select, SidePanel, Skeleton, Textarea } from '@/components/ui';
import { cn } from '@/lib/cn';
import {
  atualizarEspera,
  inscreverEspera,
  listarEspera,
  marcarAgendada,
  ofertarVaga,
  type InscreverEsperaInput,
  type PeriodoEspera,
  type StatusEspera,
  type WaitlistItem,
} from '@/lib/waitlist';
import type { Client, Professional, Service } from '@/types';
import { getApiErrorMessage } from '@/utils/handleApiError';
import { useVocabulario } from '@/hooks/useVocabulario';

export const PERIODO_ROTULO: Record<PeriodoEspera, string> = {
  manha: 'Manhã',
  tarde: 'Tarde',
  noite: 'Noite',
  qualquer: 'Qualquer período',
};

const STATUS_ROTULO: Partial<Record<StatusEspera, { texto: string; classe: string }>> = {
  aguardando: { texto: 'Aguardando', classe: 'bg-surface-2 text-muted' },
  oferecida: { texto: 'Vaga oferecida', classe: 'bg-warning/12 text-warning-text' },
};

/** "2026-10-15" → "15/10". */
const diaMes = (data: string) => {
  const [, mes, dia] = data.split('-');
  return `${dia}/${mes}`;
};

export interface FiltroEspera {
  period?: PeriodoEspera;
  date?: string;
}

/** A vaga que originou a abertura (tela Hoje): preenche a oferta. */
export interface VagaOferta {
  date: string;
  time: string;
  professionalId?: string;
}

export interface ListaEsperaPanelProps {
  aberto: boolean;
  onFechar: () => void;
  filtroInicial?: FiltroEspera;
  vagaInicial?: VagaOferta;
  /**
   * Abre o novo agendamento já preenchido e resolve com o agendamento criado (ou `null`
   * se a pessoa desistiu). Sem ele, "Agendar" leva para a Agenda.
   */
  onAgendar?: (item: WaitlistItem) => Promise<{ id: string } | null>;
  /** Inscrição cujo agendamento abre sozinho assim que a lista carrega (`?espera=<id>`). */
  agendarAoAbrir?: string | null;
  /** Chamado uma vez quando `agendarAoAbrir` é consumido (a Agenda limpa a URL). */
  onAgendarAoAbrirConsumido?: () => void;
}

const limparFiltro = (filtro: FiltroEspera): FiltroEspera => {
  const limpo: FiltroEspera = {};
  if (filtro.period) limpo.period = filtro.period;
  if (filtro.date) limpo.date = filtro.date;
  return limpo;
};

interface FormInscricao {
  clientId: string;
  serviceId: string;
  professionalId: string;
  desiredDate: string;
  period: PeriodoEspera;
  notes: string;
}
const FORM_VAZIO: FormInscricao = { clientId: '', serviceId: '', professionalId: '', desiredDate: '', period: 'qualquer', notes: '' };

function FormularioInscricao({ onInscrita, onCancelar }: { onInscrita: () => void; onCancelar: () => void }) {
  const { showToast } = useToast();
  const { prof, cli } = useVocabulario();
  const [clientes, setClientes] = useState<Client[]>([]);
  const [servicos, setServicos] = useState<Service[]>([]);
  const [profissionais, setProfissionais] = useState<Professional[]>([]);
  const [busca, setBusca] = useState('');
  const [form, setForm] = useState<FormInscricao>(FORM_VAZIO);
  const [salvando, setSalvando] = useState(false);
  const [carregandoDados, setCarregandoDados] = useState(true);
  const [erroDados, setErroDados] = useState<string | null>(null);

  useEffect(() => {
    let ativo = true;
    Promise.all([api.get('/clients'), api.get('/business/services'), api.get('/business/professionals')])
      .then(([c, s, p]) => {
        if (!ativo) return;
        setClientes(Array.isArray(c?.data) ? c.data : []);
        setServicos(Array.isArray(s?.data) ? s.data : []);
        setProfissionais(Array.isArray(p?.data) ? p.data : []);
      })
      .catch((error: unknown) => {
        if (ativo) setErroDados(getApiErrorMessage(error, `Não foi possível carregar ${cli.p}, serviços e ${prof.p}.`));
      })
      .finally(() => {
        if (ativo) setCarregandoDados(false);
      });
    return () => {
      ativo = false;
    };
  }, [cli.p, prof.p]);

  const termo = busca.trim().toLowerCase();
  const filtradas = clientes.filter((c) => c.name.toLowerCase().includes(termo) || c.phone.includes(termo));
  const mudar = <K extends keyof FormInscricao>(campo: K, valor: FormInscricao[K]) => setForm((f) => ({ ...f, [campo]: valor }));

  const salvar = async () => {
    if (!form.clientId || !form.serviceId) return;
    const dados: InscreverEsperaInput = { clientId: form.clientId, serviceId: form.serviceId };
    if (form.professionalId) dados.professionalId = form.professionalId;
    if (form.desiredDate) dados.desiredDate = form.desiredDate;
    dados.period = form.period;
    if (form.notes.trim()) dados.notes = form.notes.trim();
    setSalvando(true);
    try {
      await inscreverEspera(dados);
      showToast('Cliente inscrita na lista de espera.', 'success');
      onInscrita();
    } catch (error: unknown) {
      showToast(getApiErrorMessage(error, `Não foi possível inscrever ${cli.oS}.`), 'error');
    } finally {
      setSalvando(false);
    }
  };

  return (
    <div className="flex flex-col gap-4 rounded-card border border-line bg-surface-2/60 p-4">
      <h3 className="text-[15px] font-bold text-ink">Nova inscrição</h3>
      <Field id="espera-cliente" label="Cliente">
        <Input
          id="espera-cliente"
          type="text"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar por nome ou telefone"
        />
      </Field>
      <div className="-mt-2 max-h-36 space-y-1 overflow-y-auto">
        {carregandoDados ? (
          <div className="flex flex-col gap-1">
            <Skeleton className="h-9 w-full" label="Carregando clientes..." />
            <Skeleton className="h-9 w-full" />
          </div>
        ) : erroDados ? (
          <Banner tone="danger" variant="inline">
            <span className="text-[13px] text-ink">{erroDados}</span>
          </Banner>
        ) : filtradas.length === 0 ? (
          <p className="p-2 text-[13px] text-muted">{cli.g('Nenhuma', 'Nenhum')} {cli.s} {cli.g('encontrada', 'encontrado')}</p>
        ) : (
          filtradas.map((c) => (
            <button
              key={c.id}
              type="button"
              aria-pressed={form.clientId === c.id}
              onClick={() => mudar('clientId', c.id)}
              className={cn(
                'w-full rounded-control border px-3 py-2 text-left text-[14px] text-ink transition-colors',
                form.clientId === c.id ? 'border-brand bg-brand/10' : 'border-transparent hover:bg-surface',
              )}
            >
              <span className="font-semibold">{c.name}</span>
              <span className="ml-2 text-[12px] text-muted">{c.phone}</span>
            </button>
          ))
        )}
      </div>
      <Field id="espera-servico" label="Serviço">
        <Select id="espera-servico" value={form.serviceId} onChange={(e) => mudar('serviceId', e.target.value)}>
          <option value="">Selecione um serviço</option>
          {servicos.map((s) => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </Select>
      </Field>
      <Field id="espera-profissional" label={prof.S}>
        <Select id="espera-profissional" value={form.professionalId} onChange={(e) => mudar('professionalId', e.target.value)}>
          <option value="">Qualquer {prof.s}</option>
          {profissionais.map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </Select>
      </Field>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field id="espera-data" label="Data" hint="Vazio para qualquer dia">
          <Input id="espera-data" type="date" value={form.desiredDate} onChange={(e) => mudar('desiredDate', e.target.value)} />
        </Field>
        <Field id="espera-periodo" label="Período">
          <Select id="espera-periodo" value={form.period} onChange={(e) => mudar('period', e.target.value as PeriodoEspera)}>
            {(Object.keys(PERIODO_ROTULO) as PeriodoEspera[]).map((p) => (
              <option key={p} value={p}>{PERIODO_ROTULO[p]}</option>
            ))}
          </Select>
        </Field>
      </div>
      <Field id="espera-observacao" label="Observação">
        <Textarea id="espera-observacao" rows={2} maxLength={255} value={form.notes} onChange={(e) => mudar('notes', e.target.value)} />
      </Field>
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button variant="secondary" onClick={onCancelar} disabled={salvando}>Voltar</Button>
        <Button onClick={salvar} loading={salvando} disabled={!form.clientId || !form.serviceId}>
          Salvar inscrição
        </Button>
      </div>
    </div>
  );
}

function FormularioOferta({
  item,
  vagaInicial,
  onOfertada,
  onRecarregar,
  onVoltar,
}: {
  item: WaitlistItem;
  vagaInicial?: VagaOferta;
  /** Oferta concluída e conversa aberta: fecha o formulário e recarrega a lista. */
  onOfertada: () => void;
  /** Recarrega a lista sem fechar o formulário (pop-up bloqueado, link manual na tela). */
  onRecarregar: () => void;
  onVoltar: () => void;
}) {
  const { showToast } = useToast();
  const { cli } = useVocabulario();
  const [data, setData] = useState(vagaInicial?.date ?? item.desiredDate ?? '');
  const [hora, setHora] = useState(vagaInicial?.time ?? '');
  const [enviando, setEnviando] = useState(false);
  // Link da conversa quando o navegador bloqueou a janela: a dona abre com um toque.
  const [linkManual, setLinkManual] = useState<string | null>(null);

  const ofertar = async () => {
    if (!data || !hora) return;
    // A janela abre já no clique: aberta depois do await, o navegador (Safari do iOS,
    // principalmente) trata como pop-up e bloqueia. A URL entra quando a API responder.
    const janela = window.open('', '_blank');
    setEnviando(true);
    setLinkManual(null);
    try {
      const professionalId = vagaInicial?.professionalId ?? item.profissional?.id;
      const { whatsappUrl } = await ofertarVaga(item.id, { date: data, time: hora, ...(professionalId ? { professionalId } : {}) });
      if (!whatsappUrl) {
        janela?.close();
        showToast(`Vaga marcada como oferecida, mas ${cli.oS} não tem um WhatsApp válido.`, 'info');
        onOfertada();
      } else if (janela) {
        janela.opener = null;
        janela.location.href = whatsappUrl;
        showToast('Vaga oferecida. Confira a mensagem antes de enviar.', 'success');
        onOfertada();
      } else {
        setLinkManual(whatsappUrl);
        onRecarregar();
      }
    } catch (error: unknown) {
      janela?.close();
      showToast(getApiErrorMessage(error, 'Não foi possível oferecer a vaga.'), 'error');
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div className="mt-3 flex flex-col gap-3 rounded-control border border-line bg-surface p-3">
      <div className="grid grid-cols-2 gap-3">
        <Field id={`oferta-data-${item.id}`} label="Data da vaga">
          <Input id={`oferta-data-${item.id}`} type="date" value={data} onChange={(e) => setData(e.target.value)} />
        </Field>
        <Field id={`oferta-hora-${item.id}`} label="Horário da vaga">
          <Input id={`oferta-hora-${item.id}`} type="time" value={hora} onChange={(e) => setHora(e.target.value)} />
        </Field>
      </div>
      {linkManual ? (
        <Banner tone="success" variant="inline">
          <span className="text-[13px] text-ink">Vaga oferecida. O navegador bloqueou a nova aba:</span>
          <a
            href={linkManual}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-[13px] font-bold text-whatsapp hover:underline"
          >
            <Icon name="chat" size={15} />
            Abrir conversa no WhatsApp
          </a>
        </Banner>
      ) : null}
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button variant="secondary" size="sm" onClick={onVoltar} disabled={enviando}>Voltar</Button>
        <Button variant="whatsapp" size="sm" onClick={ofertar} loading={enviando} disabled={!data || !hora}>
          {!enviando && <Icon name="chat" size={16} />}
          Abrir WhatsApp
        </Button>
      </div>
    </div>
  );
}

export function ListaEsperaPanel({
  aberto,
  onFechar,
  filtroInicial,
  vagaInicial,
  onAgendar,
  agendarAoAbrir,
  onAgendarAoAbrirConsumido,
}: ListaEsperaPanelProps) {
  const router = useRouter();
  const { showToast } = useToast();
  const { prof } = useVocabulario();
  const periodoInicial = filtroInicial?.period;
  const dataInicial = filtroInicial?.date;
  const [filtro, setFiltro] = useState<FiltroEspera>(() => limparFiltro({ period: periodoInicial, date: dataInicial }));
  const [itens, setItens] = useState<WaitlistItem[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [carregada, setCarregada] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [inscrevendo, setInscrevendo] = useState(false);
  const [ofertandoId, setOfertandoId] = useState<string | null>(null);
  const [ocupadoId, setOcupadoId] = useState<string | null>(null);
  const pedido = useRef(0);
  const agendamentoAutomaticoFeito = useRef(false);

  // Cada abertura volta ao filtro de quem abriu (a vaga da Hoje ou a lista toda).
  useEffect(() => {
    if (!aberto) return;
    setFiltro(limparFiltro({ period: periodoInicial, date: dataInicial }));
    setInscrevendo(false);
    setOfertandoId(null);
  }, [aberto, periodoInicial, dataInicial]);

  const carregar = useCallback(async () => {
    const meu = ++pedido.current;
    setCarregando(true);
    setErro(null);
    try {
      const lista = await listarEspera(limparFiltro({ period: filtro.period, date: filtro.date }));
      if (meu !== pedido.current) return;
      setItens(lista);
      setCarregada(true);
    } catch (error: unknown) {
      if (meu !== pedido.current) return;
      setErro(getApiErrorMessage(error, 'Não foi possível carregar a lista de espera.'));
    } finally {
      if (meu === pedido.current) setCarregando(false);
    }
  }, [filtro.period, filtro.date]);

  useEffect(() => {
    if (aberto) carregar();
  }, [aberto, carregar]);

  const agendar = useCallback(
    async (item: WaitlistItem) => {
      if (!onAgendar) {
        router.push(`/agendamentos?espera=${item.id}`);
        return;
      }
      try {
        const criado = await onAgendar(item);
        if (!criado) return;
        setOcupadoId(item.id);
        await marcarAgendada(item.id, criado.id);
        showToast('Inscrição marcada como agendada.', 'success');
        carregar();
      } catch (error: unknown) {
        showToast(getApiErrorMessage(error, 'Não foi possível marcar a inscrição como agendada.'), 'error');
      } finally {
        setOcupadoId(null);
      }
    },
    [carregar, onAgendar, router, showToast],
  );

  // `?espera=<id>` (vindo da Hoje): uma vez, assim que a lista chega.
  useEffect(() => {
    if (!agendarAoAbrir || agendamentoAutomaticoFeito.current || !carregada) return;
    agendamentoAutomaticoFeito.current = true;
    onAgendarAoAbrirConsumido?.();
    const item = itens.find((i) => i.id === agendarAoAbrir);
    if (item) agendar(item);
    else showToast('Essa inscrição não está mais na lista de espera.', 'info');
  }, [agendar, agendarAoAbrir, carregada, itens, onAgendarAoAbrirConsumido, showToast]);

  const cancelar = async (item: WaitlistItem) => {
    setOcupadoId(item.id);
    try {
      await atualizarEspera(item.id, { status: 'cancelada' });
      showToast('Inscrição cancelada.', 'info');
      carregar();
    } catch (error: unknown) {
      showToast(getApiErrorMessage(error, 'Não foi possível cancelar a inscrição.'), 'error');
    } finally {
      setOcupadoId(null);
    }
  };

  const filtrado = Boolean(filtro.period || filtro.date);
  const descricaoFiltro = [filtro.period ? PERIODO_ROTULO[filtro.period] : null, filtro.date ? diaMes(filtro.date) : null]
    .filter(Boolean)
    .join(' · ');

  return (
    <SidePanel
      open={aberto}
      onOpenChange={(open) => { if (!open) onFechar(); }}
      title="Lista de espera"
      headerEnd={
        !inscrevendo ? (
          <Button size="sm" onClick={() => setInscrevendo(true)}>
            <Icon name="add" size={18} />
            Inscrever
          </Button>
        ) : null
      }
    >
      <div className="flex flex-col gap-4">
        {inscrevendo ? (
          <FormularioInscricao
            onCancelar={() => setInscrevendo(false)}
            onInscrita={() => {
              setInscrevendo(false);
              carregar();
            }}
          />
        ) : null}

        {filtrado ? (
          <div className="flex items-center justify-between gap-3 rounded-control bg-surface-2 px-3 py-2 text-[13px]">
            <span className="flex items-center gap-2 text-muted">
              <Icon name="filter_list" size={16} />
              <span>
                Mostrando <span className="font-semibold text-ink">{descricaoFiltro}</span>
              </span>
            </span>
            <button type="button" onClick={() => setFiltro({})} className="font-bold text-brand-text hover:underline">
              Ver todas
            </button>
          </div>
        ) : null}

        {erro ? (
          <Banner tone="danger" variant="inline">
            <span className="text-[14px] text-ink">{erro}</span>
          </Banner>
        ) : carregando && itens.length === 0 ? (
          <div className="flex flex-col gap-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-24 w-full" label={i === 0 ? 'Carregando lista de espera...' : undefined} />
            ))}
          </div>
        ) : itens.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-10 text-center">
            <Icon name="hourglass_empty" size={32} className="text-muted" />
            <p className="text-[15px] font-semibold text-ink">Ninguém na lista de espera</p>
            <p className="max-w-xs text-[13px] text-muted">
              Inscreva quem quer um horário que ainda não abriu e ofereça a vaga quando ela aparecer.
            </p>
          </div>
        ) : (
          <ul className="flex flex-col gap-3">
            {itens.map((item) => {
              const status = STATUS_ROTULO[item.status];
              const ocupado = ocupadoId === item.id;
              return (
                <li
                  key={item.id}
                  aria-label={item.cliente.name}
                  className="rounded-card border border-line bg-surface p-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 flex-col gap-0.5">
                      <span className="truncate text-[15px] font-bold text-ink">{item.cliente.name}</span>
                      <span className="text-[13px] text-muted">
                        {item.servico.name} · {item.profissional?.name ?? `Qualquer ${prof.s}`}
                      </span>
                      <span className="flex items-center gap-1 text-[13px] text-muted">
                        <Icon name="event" size={15} />
                        {item.desiredDate ? diaMes(item.desiredDate) : 'Qualquer dia'} · {PERIODO_ROTULO[item.period]}
                      </span>
                    </div>
                    {status ? (
                      <span className={cn('shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold', status.classe)}>
                        {status.texto}
                      </span>
                    ) : null}
                  </div>
                  {item.notes ? <p className="mt-2 text-[13px] italic text-muted">{item.notes}</p> : null}

                  {ofertandoId === item.id ? (
                    <FormularioOferta
                      item={item}
                      vagaInicial={vagaInicial}
                      onVoltar={() => setOfertandoId(null)}
                      onRecarregar={carregar}
                      onOfertada={() => {
                        setOfertandoId(null);
                        carregar();
                      }}
                    />
                  ) : (
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Button variant="secondary" size="sm" onClick={() => setOfertandoId(item.id)} disabled={ocupado}>
                        <Icon name="chat" size={16} className="text-whatsapp" />
                        Oferecer vaga
                      </Button>
                      <Button variant="secondary" size="sm" onClick={() => agendar(item)} disabled={ocupado}>
                        <Icon name="event_available" size={16} />
                        Agendar
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        aria-label="Cancelar inscrição"
                        className="text-danger"
                        onClick={() => cancelar(item)}
                        disabled={ocupado}
                      >
                        Cancelar
                      </Button>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </SidePanel>
  );
}
