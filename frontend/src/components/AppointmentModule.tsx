'use client';

/**
 * Tela Agenda (agenda-desktop.html, agenda-mobile.html).
 *
 * Dado real: todos os agendamentos do período, com cliente, serviço, profissional,
 * valor, status e duração (service_duration_minutes), vindos de GET /appointments; o
 * horário de funcionamento do negócio, de GET /business/settings; as contagens, o
 * faturamento, a ocupação e as vagas livres são calculados desses mesmos agendamentos —
 * as contagens e o faturamento sobre o conjunto que a lista mostra, a ocupação e as
 * vagas sobre o dia do salão, que o filtro de status não muda; os filtros de dia, semana
 * e status e a criação de agendamento seguem exatamente como eram, e o filtro por
 * profissional é peneira local na lista já carregada (nenhuma chamada nova, nenhum
 * handler novo).
 * O almoço de cada profissional (breakStart/breakEnd de GET /business/professionals,
 * lido na montagem) é desenhado na grade e ocupa horário nas vagas livres.
 * O painel de detalhes abre sobre a agenda ao clicar no bloco da linha do tempo ou no
 * corpo do cartão. Bloco, cartão e painel disparam a mesma `handleAcao`: iniciar,
 * faltou, cancelar e voltar para confirmado mudam o status; concluir abre a comanda
 * (ComandaModal), que é quem conclui ao ser fechada. Clicar num horário livre abre o
 * novo agendamento com a profissional, a data e o horário da vaga. Remarcar, no painel,
 * abre o mesmo modal com a profissional, a data, a cliente e o serviço do agendamento, e
 * salvar faz PUT /appointments/:id; na reserva aguardando Pix, o painel confirma o Pix.
 * "Lista de espera", no cabeçalho, abre o painel da lista (ListaEsperaPanel); o "Agendar"
 * dele abre este mesmo modal preenchido e devolve ao painel o agendamento criado, para
 * marcar a inscrição como agendada. ?espera=<id> (vindo da Hoje) faz o mesmo ao abrir.
 * Fora da tela: "encaixe inteligente"/"encaixe rápido", faixa de "ação química",
 * cobrança de sinal por Pix e aviso de chegada prevista, todos do arquivo de referência
 * e todos sem função que os sustente.
 */

import { useEffect, useState, useCallback, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import api from '@/lib/api';
import { useToast } from '@/components/Toast';
import { useVocabulario } from '@/hooks/useVocabulario';
import { getToday } from '@/lib/dateUtils';
import { formatDate } from '@/lib/dateUtils';
import { formatCurrency } from '@/lib/formatters';
import { cn } from '@/lib/cn';
import {
  Button,
  EmptyState,
  Icon,
  Skeleton,
  STATUS_LABEL,
  STATUS_STRIPE_CLASS,
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
  type AppointmentStatus,
} from '@/components/ui';
import {
  ChipsProfissional,
  DateNavigationBar,
  primeiroNome,
  type ProfissionalChip,
} from '@/components/appointments/DateNavigationBar';
import { AppointmentCard } from '@/components/appointments/AppointmentCard';
import {
  LinhaDoTempo,
  agruparPorProfissional,
  calcularFaixaHoras,
  bloqueioDoIntervalo,
  calcularVagasLivres,
  chaveProfissional,
  duracaoReal,
  formatarDuracao,
  formatarHorarioFuncionamento,
  paraHoraTexto,
  paraMinutos,
  tomDoProfissional,
  type Bloqueio,
  type FaixaHoras,
  type HorarioFuncionamento,
  type InicialNovoAgendamento,
  type IntervalosPorProfissional,
  type VagaLivre,
} from '@/components/appointments/LinhaDoTempo';
import type { AcaoAgendamento } from '@/components/appointments/acoes';
import { ComandaModal } from '@/components/comanda/ComandaModal';
import { PainelDetalhesAgendamento } from '@/components/appointments/PainelDetalhesAgendamento';
import { PendingPaymentList } from '@/components/appointments/PendingPaymentList';
import { CreateAppointmentModal } from '@/components/appointments/CreateAppointmentModal';
import type { AppointmentFormData } from '@/components/appointments/CreateAppointmentModal';
import { useNewAppointmentParam } from '@/hooks/useNewAppointmentParam';
import { calcularOcupacaoPercentual } from '@/lib/agendaMetrics';
import { materialIcon } from '@/lib/materialIconAdapter';
import type { Appointment, AppointmentStatus as StatusDoAgendamento, Client, Professional, Service } from '@/types';
import { getApiErrorMessage } from '@/utils/handleApiError';
import { ListaEsperaPanel } from '@/components/waitlist/ListaEsperaPanel';
import type { WaitlistItem } from '@/lib/waitlist';

// M1 da revisão final: Material Symbols no lugar dos dois ícones lucide restantes deste
// arquivo (o resto da tela já usa o mesmo conjunto via o adaptador).
const ICONE_CALENDARIO = materialIcon('calendar_month');
const ICONE_ADICIONAR = materialIcon('add');

type ViewMode = 'day' | 'week';
type StatusFilter = 'todos' | 'confirmado' | 'concluido' | 'cancelado';

/** Legenda de status, com os seis itens e as palavras de agenda-desktop.html. */
const STATUS_DA_LEGENDA: readonly { status: AppointmentStatus; rotulo: string }[] = [
  { status: 'confirmado', rotulo: 'Confirmado' },
  // O status real é aguardando_pagamento (reserva pública esperando o sinal Pix): o
  // quadradinho pinta na cor do bloco dele e o texto é o mesmo do chip e da aba.
  { status: 'aguardando_pagamento', rotulo: STATUS_LABEL.aguardando_pagamento },
  { status: 'em_atendimento', rotulo: 'Em atendimento' },
  { status: 'concluido', rotulo: 'Concluído' },
  { status: 'faltou', rotulo: 'Faltou' },
  { status: 'cancelado', rotulo: 'Cancelado' },
];

/** Horário de funcionamento (GET /business/settings) em minutos desde a meia-noite. */
const lerHorarioFuncionamento = (dados: unknown): HorarioFuncionamento | null => {
  const payload = (dados ?? {}) as { openingTime?: unknown; closingTime?: unknown };
  if (typeof payload.openingTime !== 'string' || typeof payload.closingTime !== 'string') return null;
  const aberturaMinutos = paraMinutos(payload.openingTime);
  const fechamentoMinutos = paraMinutos(payload.closingTime);
  if (fechamentoMinutos <= aberturaMinutos) return null;
  return { aberturaMinutos, fechamentoMinutos };
};

type ItemDoDia =
  | { tipo: 'agendamento'; chave: string; inicioMinutos: number; agendamento: Appointment }
  | {
      tipo: 'vaga';
      chave: string;
      inicioMinutos: number;
      vaga: VagaLivre;
      profissional: string;
      professionalId?: string;
      data?: string;
    };

/** Almoço da coluna (por id de profissional) como bloqueio das vagas livres. */
const bloqueiosDe = (intervalos: IntervalosPorProfissional | undefined, id: string): Bloqueio[] => {
  const almoco = bloqueioDoIntervalo(intervalos?.[id]);
  return almoco ? [almoco] : [];
};

const STATUS_DA_ACAO: Record<Exclude<AcaoAgendamento, 'concluir'>, StatusDoAgendamento> = {
  iniciar: 'em_atendimento', faltou: 'faltou', cancelar: 'cancelado', desfazer_inicio: 'confirmado',
};
const MENSAGEM_DA_ACAO: Record<Exclude<AcaoAgendamento, 'concluir'>, string> = {
  iniciar: 'Atendimento iniciado', faltou: 'Falta registrada', cancelar: 'Agendamento cancelado', desfazer_inicio: 'Atendimento voltou para confirmado',
};

/**
 * Lista do celular: os atendimentos do dia e, entre eles, as linhas de horário livre
 * (agenda-mobile.html). A vaga é sempre de uma profissional — um buraco existe na
 * agenda de alguém, não na do salão —, então ela é calculada por coluna e traz o nome.
 *
 * São duas coleções: `agendamentos` é o que a lista mostra (conjunto filtrado) e
 * `doDia` é o dia de onde os buracos saem — filtro de profissional aplicado, filtro de
 * status não. Um horário livre é fato sobre o dia: se saísse do conjunto filtrado, um
 * filtro de status escreveria "Horário livre" em cima de um atendimento que existe e
 * está só escondido, que é afirmação falsa sobre o dia do salão.
 */
export function montarItensDoDia(
  agendamentos: Appointment[],
  doDia: Appointment[],
  faixa: FaixaHoras,
  duracaoMinutos: number,
  comVagas: boolean,
  intervalos?: IntervalosPorProfissional,
): ItemDoDia[] {
  const itens: ItemDoDia[] = agendamentos.map((agendamento) => ({
    tipo: 'agendamento',
    chave: agendamento.id,
    inicioMinutos: paraMinutos(agendamento.time),
    agendamento,
  }));

  if (comVagas) {
    agruparPorProfissional(doDia).forEach((coluna) => {
      calcularVagasLivres(
        coluna.agendamentos,
        faixa,
        duracaoMinutos,
        { apenasEntreAtendimentos: true },
        bloqueiosDe(intervalos, coluna.id),
      ).forEach((vaga) => {
        itens.push({
          tipo: 'vaga',
          chave: `vaga-${coluna.id}-${vaga.inicioMinutos}`,
          inicioMinutos: vaga.inicioMinutos,
          vaga,
          profissional: coluna.nome,
          professionalId: coluna.agendamentos[0]?.professional_id || undefined,
          data: coluna.agendamentos[0]?.date.substring(0, 10),
        });
      });
    });
  }

  return itens.sort((a, b) => a.inicioMinutos - b.inicioMinutos || a.chave.localeCompare(b.chave));
}

type AgendaTab = 'agenda' | 'aguardando-pix';

/** O pré-preenchimento do modal: o do horário livre e, ao remarcar, cliente e serviço. */
type InicialDoModal = InicialNovoAgendamento & { clientId?: string; serviceId?: string };

export function AppointmentModule() {
  const { prof } = useVocabulario();
  // ?aba=aguardando-pix (vindo do "Ver pendências" da tela Hoje) abre direto na aba do Pix.
  const searchParams = useSearchParams();
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<AgendaTab>(() =>
    searchParams.get('aba') === 'aguardando-pix' ? 'aguardando-pix' : 'agenda',
  );
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);
  // Inicia vazio: getToday() depende da hora local e divergiria entre SSR (UTC)
  // e cliente (BR), causando hydration mismatch (React #418). Definido no mount.
  const [selectedDate, setSelectedDate] = useState('');
  const [viewMode, setViewMode] = useState<ViewMode>('day');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('todos');
  const [showModal, setShowModal] = useState(false);
  // Painel de detalhes (agendamento-detalhes.html): guarda só o id. O agendamento
  // mostrado é sempre relido da lista carregada, então uma mudança de status aparece no
  // painel na mesma hora e o painel nunca fica afirmando um status que a lista já mudou.
  const [detalhesId, setDetalhesId] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  // Comanda aberta pelo "Concluir" (id do agendamento) e o pré-preenchimento do novo
  // agendamento vindo de um clique em horário livre.
  const [comandaDe, setComandaDe] = useState<string | null>(null);
  const [inicialNovo, setInicialNovo] = useState<InicialDoModal | undefined>();
  // Remarcar reaproveita o modal de novo agendamento; com um id aqui, salvar vira PUT.
  const [remarcandoId, setRemarcandoId] = useState<string | undefined>();
  const { showToast } = useToast();
  const newAppointment = useNewAppointmentParam();
  // Lista de espera: abre pelo botão do cabeçalho ou por ?espera=<id> (o "Agendar" da
  // lista aberta na tela Hoje), que também abre o agendamento daquela inscrição.
  const esperaParam = searchParams.get('espera');
  const [listaEsperaAberta, setListaEsperaAberta] = useState(() => Boolean(esperaParam));
  // Quem pediu o agendamento pela lista de espera aguarda aqui o agendamento criado
  // (ou null, se o modal fechar sem salvar).
  const aguardandoAgendamento = useRef<((criado: Appointment | null) => void) | null>(null);

  // Modal data
  const [clients, setClients] = useState<Client[]>([]);
  const [professionals, setProfessionals] = useState<Professional[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [availableSlots, setAvailableSlots] = useState<string[]>([]);
  const [slotsLoading, setSlotsLoading] = useState(false);

  // Peneira local da lista já carregada (chips de profissional) e horário de
  // funcionamento configurado do negócio, que define a faixa de horas desenhada.
  const [profissionalFiltro, setProfissionalFiltro] = useState<string | null>(null);
  const [horarioFuncionamento, setHorarioFuncionamento] = useState<HorarioFuncionamento | null>(null);

  const loadAppointments = useCallback(async () => {
    if (!selectedDate) return;
    try {
      setLoading(true);
      const params: Record<string, string> = { date: selectedDate, view: viewMode };
      const response = await api.get('/appointments', { params });
      setAppointments(response.data);
    } catch {
      showToast('Erro ao carregar agendamentos', 'error');
    } finally {
      setLoading(false);
    }
  }, [selectedDate, showToast, viewMode]);

  useEffect(() => {
    setSelectedDate(getToday());
  }, []);

  useEffect(() => {
    loadAppointments();
  }, [loadAppointments]);

  // Horário de funcionamento do negócio: uma leitura, no mount. Se a conta não tiver
  // acesso a /business/settings ou a resposta vier vazia, a régua cai na janela padrão
  // de desenho e a barra não afirma horário nenhum.
  useEffect(() => {
    let cancelado = false;
    api
      .get('/business/settings')
      .then((response) => {
        if (!cancelado) setHorarioFuncionamento(lerHorarioFuncionamento(response.data));
      })
      .catch(() => {
        if (!cancelado) setHorarioFuncionamento(null);
      });
    return () => {
      cancelado = true;
    };
  }, []);

  // Profissionais na montagem: o almoço (breakStart/breakEnd) de cada uma entra na grade
  // e nas vagas livres. Sem acesso, a agenda segue sem almoço desenhado.
  useEffect(() => {
    let cancelado = false;
    api
      .get('/business/professionals')
      .then((response) => {
        if (!cancelado && Array.isArray(response?.data)) setProfessionals(response.data);
      })
      .catch(() => {});
    return () => {
      cancelado = true;
    };
  }, []);

  const openModal = async (inicial?: InicialDoModal) => {
    setInicialNovo(inicial);
    setShowModal(true);
    setAvailableSlots([]);
    try {
      const [clientsRes, professionalsRes, servicesRes] = await Promise.all([
        api.get('/clients'),
        api.get('/business/professionals'),
        api.get('/business/services'),
      ]);
      setClients(clientsRes.data);
      setProfessionals(professionalsRes.data);
      setServices(servicesRes.data);
    } catch {
      showToast('Erro ao carregar dados do formulário', 'error');
    }
  };

  useEffect(() => {
    if (newAppointment.open) openModal(newAppointment.clienteId ? { clientId: newAppointment.clienteId } : undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [newAppointment.open]);

  const loadAvailableSlots = async (professionalId: string, date: string, serviceId: string) => {
    if (!professionalId || !date) return;
    try {
      setSlotsLoading(true);
      const params: Record<string, string> = { professionalId, date };
      if (serviceId) params.serviceId = serviceId;
      const response = await api.get('/appointments/available-slots', { params });
      setAvailableSlots(response.data);
    } catch {
      showToast('Erro ao carregar horários', 'error');
    } finally {
      setSlotsLoading(false);
    }
  };

  /** Salva o modal; devolve o agendamento criado (na remarcação, nada). */
  const handleSubmit = async (formData: AppointmentFormData): Promise<Appointment | undefined> => {
    let criado: Appointment | undefined;
    try {
      if (remarcandoId) {
        await api.put(`/appointments/${remarcandoId}`, formData);
        showToast('Agendamento remarcado!', 'success');
      } else {
        const response = await api.post<Appointment>('/appointments', formData);
        criado = response?.data;
        showToast('Agendamento criado com sucesso!', 'success');
      }
    } catch (error: unknown) {
      showToast(getApiErrorMessage(error, remarcandoId ? 'Erro ao remarcar' : 'Erro ao criar agendamento'), 'error');
      // Relança para o modal continuar aberto (ele só fecha quando salvar dá certo).
      throw error;
    }
    loadAppointments();
    return criado;
  };

  const resolverAgendamentoDaEspera = (criado: Appointment | null) => {
    const resolver = aguardandoAgendamento.current;
    aguardandoAgendamento.current = null;
    resolver?.(criado);
  };

  // O modal só sabe que salvar deu certo; quem espera o agendamento criado é a lista de espera.
  const salvarDoModal = async (formData: AppointmentFormData) => {
    const criado = await handleSubmit(formData);
    if (aguardandoAgendamento.current) resolverAgendamentoDaEspera(criado?.id ? criado : null);
  };

  // "Agendar" da lista de espera: fecha o painel, abre o novo agendamento com a cliente,
  // o serviço, a profissional e a data da inscrição e resolve com o que for criado.
  const agendarDaEspera = (item: WaitlistItem) =>
    new Promise<Appointment | null>((resolve) => {
      resolverAgendamentoDaEspera(null);
      aguardandoAgendamento.current = resolve;
      setListaEsperaAberta(false);
      setRemarcandoId(undefined);
      openModal({
        clientId: item.cliente.id,
        serviceId: item.servico.id,
        professionalId: item.profissional?.id,
        date: item.desiredDate ?? undefined,
      });
    });

  // Remarcar pelo painel: o modal abre com a profissional, a data, a cliente e o serviço
  // do agendamento; a pessoa escolhe o novo horário e o salvar faz PUT /appointments/:id.
  const handleRemarcar = (agendamento: Appointment) => {
    setDetalhesId(null);
    setRemarcandoId(agendamento.id);
    openModal({
      professionalId: agendamento.professional_id,
      date: agendamento.date.substring(0, 10),
      clientId: agendamento.client_id,
      serviceId: agendamento.service_id,
    });
  };

  const handleAcao = async (agendamento: Appointment, acao: AcaoAgendamento) => {
    if (acao === 'concluir') { setDetalhesId(null); setComandaDe(agendamento.id); return; }
    try {
      setActionLoading(agendamento.id);
      await api.put(`/appointments/${agendamento.id}/status`, { status: STATUS_DA_ACAO[acao] });
      showToast(MENSAGEM_DA_ACAO[acao], acao === 'cancelar' ? 'info' : 'success');
      loadAppointments();
    } catch (error: unknown) {
      showToast(getApiErrorMessage(error, 'Erro ao atualizar status'), 'error');
    } finally {
      setActionLoading(null);
    }
  };

  // Confirmar o Pix de uma reserva pelo painel de detalhes (aguardando_pagamento →
  // confirmado). Não é uma AcaoAgendamento; a aba "Aguardando Pix" faz o mesmo.
  const confirmarPagamento = async ({ id }: Appointment) => {
    try {
      setActionLoading(id);
      await api.put(`/appointments/${id}/status`, { status: 'confirmado' });
      showToast('Pagamento confirmado!', 'success');
      loadAppointments();
    } catch (error: unknown) {
      showToast(getApiErrorMessage(error, 'Erro ao atualizar status'), 'error');
    } finally {
      setActionLoading(null);
    }
  };

  const agendamentoDetalhado = detalhesId
    ? appointments.find(a => a.id === detalhesId) ?? null
    : null;

  const closeModal = () => {
    resolverAgendamentoDaEspera(null);
    setShowModal(false);
    setInicialNovo(undefined);
    setRemarcandoId(undefined);
    newAppointment.clear();
  };

  // Peneira de status (a de sempre) e, em cima dela, a de profissional dos chips.
  const porStatus = appointments.filter(
    a => statusFilter === 'todos' || a.status === statusFilter
  );

  // Chips: quem existe sai do conjunto do dia inteiro — nem a peneira de profissional
  // (senão escolher uma pessoa apagaria as outras e não daria para voltar) nem a de
  // status podem apagar uma pessoa da fileira. Só a contagem de cada chip segue o filtro
  // de status, porque ela descreve o que o clique vai mostrar; um chip pode ler "(0)".
  const chipsProfissional: ProfissionalChip[] = agruparPorProfissional(appointments, `Sem ${prof.s}`).map((coluna, indice) => ({
    id: coluna.id,
    nome: coluna.nome,
    total: porStatus.filter(a => chaveProfissional(a) === coluna.id).length,
    tom: tomDoProfissional(indice),
  }));

  // A ordem de quem existe no período, que dá o tom de cada pessoa. Sai do dia inteiro
  // para que o chip e a coluna da linha do tempo pintem a mesma pessoa da mesma cor,
  // qualquer que seja o filtro ligado.
  const ordemProfissionais = chipsProfissional.map(chip => chip.id);

  // Uma profissional escolhida que não atende no dia seguinte deixaria a tela vazia sem
  // explicação ao virar o dia; nesse caso a peneira simplesmente não vale. A lista de
  // chips é do dia inteiro, então isso dispara só quando ela realmente não atende no
  // período novo — nunca por mudança de filtro de status.
  const filtroProfissional = chipsProfissional.some(chip => chip.id === profissionalFiltro)
    ? profissionalFiltro
    : null;

  const filteredAppointments = porStatus.filter(
    a => filtroProfissional === null || chaveProfissional(a) === filtroProfissional
  );

  const groupedByDate = filteredAppointments.reduce<Record<string, Appointment[]>>((acc, appointment) => {
    const date = appointment.date.split('T')[0];
    if (!acc[date]) acc[date] = [];
    acc[date].push(appointment);
    return acc;
  }, {});

  // ── Números do cabeçalho ──
  // Contagem e Faturamento descrevem a lista na tela, então seguem o conjunto filtrado
  // inteiro. Ocupação e vagas livres são afirmações sobre o dia do salão: seguem o filtro
  // de profissional ("o dia da Camila está 84% ocupado" é verdade e é útil) e não o de
  // status, que é só controle de visualização — clicar em "Concluído" não desocupa o dia.
  // Fallback técnico: o DTO sempre traz service_duration_minutes (HorarioFuncionamento não
  // tem intervalo de grade para servir de fallback).
  const duracaoMinutos = 30;
  // Almoço por profissional, para a grade e para as vagas livres.
  const intervalos: IntervalosPorProfissional = Object.fromEntries(
    professionals
      .filter(p => p.breakStart && p.breakEnd)
      .map(p => [p.id, { inicio: p.breakStart!, fim: p.breakEnd! }]),
  );
  const ehDia = viewMode === 'day';
  const naoCancelados = filteredAppointments.filter(a => a.status !== 'cancelado');
  const confirmados = filteredAppointments.filter(a => a.status === 'confirmado').length;
  const concluidos = filteredAppointments.filter(a => a.status === 'concluido').length;
  // "Faturamento" do dia é o total previsto (a referência mostra o total do dia, não só
  // o que já foi concluído); cancelado não entra.
  const faturamento = naoCancelados.reduce((soma, a) => soma + Number(a.service_price || 0), 0);
  const doDia = appointments.filter(
    a => filtroProfissional === null || chaveProfissional(a) === filtroProfissional,
  );
  // O mesmo conjunto quebrado por data, porque no modo Semana cada dia desenha a sua
  // grade e não pode herdar as colunas nem a régua da semana inteira.
  const doDiaPorData = doDia.reduce<Record<string, Appointment[]>>((acc, agendamento) => {
    const data = agendamento.date.split('T')[0];
    if (!acc[data]) acc[data] = [];
    acc[data].push(agendamento);
    return acc;
  }, {});
  const faixa = calcularFaixaHoras(doDia, duracaoMinutos, horarioFuncionamento);
  const colunas = agruparPorProfissional(doDia, `Sem ${prof.s}`);
  // Duas larguras, dois números legítimos: a linha do tempo do computador desenha os
  // buracos das pontas, então o KPI dele conta o conjunto completo; a lista do celular
  // não desenha as pontas, então a linha dela conta pela mesma chamada, sobre o mesmo
  // conjunto, que a lista faz — os dois números são iguais por construção.
  const vagasLivres = ehDia
    ? colunas.flatMap(coluna =>
        calcularVagasLivres(coluna.agendamentos, faixa, duracaoMinutos, undefined, bloqueiosDe(intervalos, coluna.id)),
      )
    : [];
  const vagasDaLista = ehDia
    ? colunas.flatMap(coluna =>
        calcularVagasLivres(
          coluna.agendamentos,
          faixa,
          duracaoMinutos,
          { apenasEntreAtendimentos: true },
          bloqueiosDe(intervalos, coluna.id),
        ),
      )
    : [];
  const ocupacao = calcularOcupacaoPercentual(doDia, faixa, duracaoMinutos, colunas.length);
  const grupos = Object.entries(groupedByDate)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, dayAppointments]) => [
      date,
      [...dayAppointments].sort((a, b) => a.time.localeCompare(b.time)),
    ] as const);
  const temGesto = filteredAppointments.some(a => a.status === 'confirmado' || a.status === 'em_atendimento');

  return (
    <div className="flex flex-col gap-4 lg:gap-5">
      <h1 className="sr-only">Agenda</h1>

      <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as AgendaTab)}>
        <div className="flex items-center justify-between gap-3">
          <TabsList>
            <TabsTrigger value="agenda">Agenda</TabsTrigger>
            <TabsTrigger value="aguardando-pix">Aguardando Pix</TabsTrigger>
          </TabsList>
          <Button variant="secondary" size="sm" onClick={() => setListaEsperaAberta(true)}>
            <Icon name="hourglass_top" size={18} />
            Lista de espera
          </Button>
        </div>

        <TabsContent value="agenda" className="mt-0 flex flex-col gap-4 lg:gap-5">
        {selectedDate && (
          <DateNavigationBar
            selectedDate={selectedDate}
            viewMode={viewMode}
            statusFilter={statusFilter}
            profissionais={chipsProfissional}
            totalAgendamentos={porStatus.length}
            profissionalFiltro={filtroProfissional}
            onDateChange={setSelectedDate}
            onViewModeChange={setViewMode}
            onStatusFilterChange={setStatusFilter}
            onProfissionalFiltroChange={setProfissionalFiltro}
            onNovoAgendamento={() => openModal()}
          />
        )}

        {/* Fileira deslizante de chips do celular (agenda-mobile.html); no computador os
            mesmos chips ficam dentro da barra acima. A contagem é do dia, então no modo
            Semana ela sai. Sem foto: o DTO de /appointments só traz o nome, e o Avatar
            cai nas iniciais. */}
        <ChipsProfissional
          profissionais={chipsProfissional}
          totalGeral={porStatus.length}
          ativo={filtroProfissional}
          onChange={setProfissionalFiltro}
          mostrarContagem={ehDia}
          className="-mx-4 px-4 lg:hidden"
        />

        {/* Sub-cabeçalho operacional: KPIs do dia + legenda (agenda-desktop.html) e a
            linha de ocupação do celular (agenda-mobile.html). */}
        <div className="flex flex-col gap-3 rounded-card border border-line bg-surface px-4 py-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="hidden items-center gap-3 text-[14px] lg:flex">
            <div className="flex items-center gap-1.5 font-bold text-ink">
              <span className="h-2 w-2 rounded-full bg-brand" />
              <span className="tabular-nums">
                {filteredAppointments.length} agendamento{filteredAppointments.length === 1 ? '' : 's'}
              </span>
            </div>
            <span className="text-muted">·</span>
            <div className="flex items-center gap-1">
              <span className="text-muted">Faturamento:</span>
              <span className="font-bold tabular-nums text-success-text">
                {formatCurrency(faturamento, { cents: false })}
              </span>
            </div>
            {ehDia && (
              <>
                <span className="text-muted">·</span>
                <div className="flex items-center gap-1 text-muted">
                  <span className="font-bold tabular-nums text-tertiary">{vagasLivres.length}</span>
                  {vagasLivres.length === 1 ? ' horário livre' : ' horários livres'}
                </div>
              </>
            )}
          </div>

          <div className="flex items-center justify-between gap-2 lg:hidden">
            <div className="flex items-center gap-2">
              {ehDia ? (
                <>
                  <span className="h-2 w-2 rounded-full bg-success" />
                  <span className="text-[13px] font-semibold tabular-nums text-ink">{ocupacao}% de ocupação</span>
                  <span className="text-[14px] text-muted">·</span>
                  <span className="text-[14px] tabular-nums text-muted">
                    {vagasDaLista.length} {vagasDaLista.length === 1 ? 'vaga livre' : 'vagas livres'}
                  </span>
                </>
              ) : (
                <>
                  <span className="h-2 w-2 rounded-full bg-brand" />
                  <span className="text-[13px] font-semibold tabular-nums text-ink">
                    {filteredAppointments.length} agendamento{filteredAppointments.length === 1 ? '' : 's'} na semana
                  </span>
                </>
              )}
            </div>
            {horarioFuncionamento && (
              <span className="shrink-0 text-[11px] font-bold tabular-nums text-brand-text">
                {formatarHorarioFuncionamento(
                  horarioFuncionamento.aberturaMinutos,
                  horarioFuncionamento.fechamentoMinutos,
                )}
              </span>
            )}
          </div>

          <div className="hidden flex-wrap items-center gap-3 text-[11px] font-semibold text-muted lg:flex">
            {STATUS_DA_LEGENDA.map(item => (
              <div key={item.status} className="flex items-center gap-1.5">
                <span
                  className={cn(
                    'h-2.5 w-2.5 rounded-sm',
                    STATUS_STRIPE_CLASS[item.status],
                    item.status === 'cancelado' && 'opacity-70',
                  )}
                />
                <span className={item.status === 'cancelado' ? 'line-through' : undefined}>{item.rotulo}</span>
              </div>
            ))}
          </div>
        </div>

        {loading ? (
          <>
            <div className="flex flex-col gap-3 lg:hidden">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-24 w-full" label={i === 0 ? 'Carregando agendamentos...' : undefined} />
              ))}
            </div>
            <Skeleton className="hidden h-[480px] w-full lg:block" />
          </>
        ) : filteredAppointments.length === 0 ? (
          <EmptyState
            icon={ICONE_CALENDARIO}
            title="Nenhum agendamento"
            description={
              statusFilter !== 'todos'
                ? `Nenhum agendamento com este status neste período.`
                : 'Não há agendamentos para este período. Crie um novo agendamento para começar!'
            }
            action={{ label: 'Criar agendamento', icon: ICONE_ADICIONAR, onClick: () => openModal() }}
            actionVariant="secondary"
          />
        ) : (
          <>
            {/* Celular: lista de cartões com gesto (agenda-mobile.html) */}
            <div className="flex flex-col gap-3 lg:hidden">
              {temGesto && (
                <div className="flex items-center justify-center gap-1.5 self-center rounded-full bg-surface-2 px-3 py-1.5 text-[11px] font-semibold text-muted">
                  <Icon name="swipe" size={16} className="text-brand" />
                  <span>Deslize o cartão para ver as ações</span>
                </div>
              )}
              {grupos.map(([date, dayAppointments]) => (
                <div key={date} className="flex flex-col gap-2">
                  {!ehDia && (
                    <h3 className="flex items-center gap-2 text-[13px] font-semibold capitalize text-muted">
                      <Icon name="calendar_today" size={14} />
                      {formatDate(date)}
                    </h3>
                  )}
                  {montarItensDoDia(
                    dayAppointments,
                    doDiaPorData[date] ?? dayAppointments,
                    faixa,
                    duracaoMinutos,
                    ehDia,
                    intervalos,
                  ).map(item =>
                    item.tipo === 'agendamento' ? (
                      <AppointmentCard
                        key={item.chave}
                        appointment={item.agendamento}
                        actionLoading={actionLoading}
                        duracaoMinutos={duracaoReal(item.agendamento, duracaoMinutos)}
                        onAcao={handleAcao}
                        onAbrirDetalhes={a => setDetalhesId(a.id)}
                      />
                    ) : (
                      <button
                        key={item.chave}
                        type="button"
                        onClick={() =>
                          openModal({
                            professionalId: item.professionalId,
                            date: item.data,
                            time: paraHoraTexto(item.inicioMinutos),
                          })
                        }
                        aria-label={`Novo agendamento: ${paraHoraTexto(item.inicioMinutos)} com ${primeiroNome(item.profissional)}, ${formatarDuracao(item.vaga.duracaoMinutos)} livre`}
                        className="flex w-full items-center justify-between gap-3 rounded-card bg-surface-2 p-4 text-left transition-transform active:scale-[0.99] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
                      >
                        <span className="flex min-w-0 items-center gap-3">
                          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-control bg-surface text-brand-text shadow-sm">
                            <Icon name="add" size={20} />
                          </span>
                          <span className="flex min-w-0 flex-col">
                            <span className="flex items-center gap-2">
                              <span className="text-[24px] font-bold leading-none tracking-tight tabular-nums text-ink">
                                {paraHoraTexto(item.inicioMinutos)}
                              </span>
                              <span className="rounded-full bg-success/12 px-2 py-0.5 text-[11px] font-bold text-success-text">
                                Horário livre
                              </span>
                            </span>
                            <span className="mt-0.5 truncate text-[14px] text-muted">
                              {formatarDuracao(item.vaga.duracaoMinutos)} livre com {primeiroNome(item.profissional)}
                            </span>
                          </span>
                        </span>
                        <Icon name="bolt" size={20} className="shrink-0 text-muted" />
                      </button>
                    ),
                  )}
                </div>
              ))}
              {ehDia && (
                <div className="mt-1 flex items-center justify-between gap-3 rounded-card bg-surface-2 p-4">
                  <div className="flex items-center gap-3">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand/20 text-brand-text">
                      <Icon name="insights" size={22} />
                    </span>
                    <div className="flex min-w-0 flex-col">
                      <span className="text-[17px] font-semibold leading-tight text-ink">Total previsto hoje</span>
                      <span className="text-[14px] tabular-nums text-muted">
                        {confirmados} confirmados · {concluidos} concluídos
                      </span>
                    </div>
                  </div>
                  <span className="shrink-0 text-[24px] font-bold tabular-nums text-ink">
                    {formatCurrency(faturamento, { cents: false })}
                  </span>
                </div>
              )}
            </div>

            {/* Computador: linha do tempo por dia (agenda-desktop.html) */}
            <div className="hidden flex-col gap-5 lg:flex">
              {grupos.map(([date, dayAppointments]) => (
                <div key={date} className="flex flex-col gap-2">
                  {!ehDia && (
                    <h3 className="flex items-center gap-2 text-[13px] font-semibold capitalize text-muted">
                      <Icon name="calendar_today" size={14} />
                      {formatDate(date)}
                    </h3>
                  )}
                  <LinhaDoTempo
                    agendamentos={dayAppointments}
                    agendamentosDoDia={doDiaPorData[date] ?? dayAppointments}
                    ordemProfissionais={ordemProfissionais}
                    duracaoPadraoMinutos={duracaoMinutos}
                    horarioFuncionamento={horarioFuncionamento}
                    actionLoading={actionLoading}
                    mostrarAgora={date === getToday()}
                    onAcao={handleAcao}
                    onNovoAgendamento={openModal}
                    intervalos={intervalos}
                    onAbrirDetalhes={a => setDetalhesId(a.id)}
                  />
                </div>
              ))}
            </div>
          </>
        )}
        </TabsContent>

        <TabsContent value="aguardando-pix" className="mt-0">
          <PendingPaymentList />
        </TabsContent>
      </Tabs>

      <PainelDetalhesAgendamento
        agendamento={agendamentoDetalhado}
        actionLoading={actionLoading}
        onFechar={() => setDetalhesId(null)}
        onAcao={handleAcao}
        onRemarcar={handleRemarcar}
        onConfirmarPix={confirmarPagamento}
      />

      <CreateAppointmentModal
        isOpen={showModal}
        onClose={closeModal}
        clients={clients}
        professionals={professionals}
        services={services}
        availableSlots={availableSlots}
        slotsLoading={slotsLoading}
        onLoadSlots={loadAvailableSlots}
        onSubmit={salvarDoModal}
        inicial={inicialNovo}
        editandoId={remarcandoId}
      />

      <ListaEsperaPanel
        aberto={listaEsperaAberta}
        onFechar={() => setListaEsperaAberta(false)}
        onAgendar={agendarDaEspera}
        agendarAoAbrir={esperaParam}
        // Consumido o ?espera=<id>, a URL volta a ser só /agendamentos (mesmo padrão do ?novo=1).
        onAgendarAoAbrirConsumido={() => router.replace('/agendamentos', { scroll: false })}
      />

      <ComandaModal appointmentId={comandaDe} onClose={() => setComandaDe(null)} onAtualizada={loadAppointments} />
    </div>
  );
}
