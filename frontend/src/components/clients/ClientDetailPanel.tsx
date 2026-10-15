'use client';

/**
 * Ficha da cliente (cliente-ficha.html), aberta como painel lateral a partir da lista de
 * Clientes (ClientModule.tsx, que já carregou o cliente e o histórico antes de abrir este
 * painel — nenhuma chamada nova acontece aqui).
 *
 * O arquivo de referência é uma página inteira com 2 colunas (5/7). Aqui, dentro do
 * SidePanel padrão do kit (que a Tarefa 6 não alargou para esta tela — o arquivo não pede
 * outra largura), o corpo vira uma coluna única: as classes `lg:col-span-*` do arquivo não
 * fariam sentido dentro de um painel de largura fixa, então cada bloco é empilhado na mesma
 * ordem do arquivo.
 *
 * Dado real, de `client` (GET /clients) e `history` (GET /clients/{id}/history, já chamada
 * por ClientModule.tsx): nome, telefone, e-mail/nascimento (para o selo de aniversário,
 * calculado — nunca a contagem de dias fixa do arquivo, que contradiria um nascimento real
 * diferente), gasto acumulado (`total_spent`), cliente desde (`created_at`) e a própria
 * linha do tempo de atendimentos (cada agendamento do histórico vira um evento: confirmado
 * → tipo "agendamento", concluído → tipo "financeiro" com o valor pago, cancelado → tipo
 * "falta", já que o sistema não distingui falta de cancelamento). "Ticket médio" e
 * "Frequência presencial"/"Faltas e Cancelamentos" são contados a partir do mesmo
 * histórico, nunca do texto fixo do arquivo.
 *
 * Dado de exemplo (`conteudoDemo.clientes.perfilDestaque`, que a Tarefa 2 preparou para
 * esta tela): o bloco de consentimento LGPD (menos a data de autorização, que usa o
 * created_at real), a "Ficha técnica" (genérica — preferências de atendimento, nunca o
 * formato/curvatura de unha do arquivo, que é de um segmento só; sem alerta de
 * saúde/alergia, que o cadastro não tem campo para sustentar), a galeria de procedimentos
 * (a foto vira um bloco neutro com ícone — nenhuma chamada para fora, nenhum retrato
 * inventado de uma cliente real) e os 2 eventos da linha do tempo que o histórico real não
 * cobre (mensagem de WhatsApp, avaliação) — sempre os mesmos textos, para qualquer cliente
 * aberta, porque o CRM de relacionamento ainda não existe por cliente no sistema. O evento
 * de cadastro inicial da linha do tempo é real, calculado a partir de `client.created_at`.
 * E-mail e endereço reais aparecem num bloco de Contato, com fallback "Não informado"/"Não
 * cadastrado" quando o cliente não os tem cadastrados.
 *
 * "Fase" (Fiel/Recorrente/...), a etiqueta (Clube VIP) e "Prefere <profissional>" no
 * cabeçalho seguem a mesma ideia de `conteudoDemo.clientes.exemplos` que a lista de
 * clientes usa (Tarefa 7): ClientModule.tsx repassa `exemploIndice`, o mesmo índice
 * (posição na lista carregada) que decide o exemplo mostrado na linha da lista, então a
 * ficha mostra sempre a mesma fase que a lista mostrou para essa cliente. Sem a prop
 * (componente usado isolado, ex. teste/storybook), cai num hash estável do id do cliente —
 * só para não quebrar fora do fluxo normal, nunca o caminho a partir da lista.
 *
 * Botões sem suporte real (Novo agendamento, Mais opções, Editar/Atualizar ficha técnica,
 * Ver todas/Anexar foto da galeria, Carregar histórico anterior) avisam com o toast padrão
 * em vez de fingir que funcionam. Os filtros da linha do tempo (Tudo/Agendamentos/
 * Financeiro/WhatsApp/Avaliações) são filtro em memória de verdade, sem depender do banco.
 */

import { useMemo, useState, type ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { conteudoDemo } from '@/lib/conteudoDemo';
import { formatCurrency, formatPhone } from '@/lib/formatters';
import { useToast } from '@/components/Toast';
import { AVISO_RECURSO_A_CAMINHO, Avatar, Icon, StatusChip } from '@/components/ui';
import { linkWhatsapp } from '@/lib/whatsapp';
import type { Appointment, Client } from '@/types';

// Helpers que moravam em ClientModule.tsx até a lista virar CRM real (Tarefa 11); ficam
// aqui só até a ficha nova (Tarefa 13) substituir este painel.
const FASE_TOKENS: Record<string, { fundo: string; texto: string; ponto: string }> = {
  Novo: { fundo: 'bg-status-confirmed/12', texto: 'text-status-confirmed', ponto: 'bg-status-confirmed' },
  Recorrente: { fundo: 'bg-success/12', texto: 'text-success-text', ponto: 'bg-success' },
  Fiel: { fundo: 'bg-warning/12', texto: 'text-warning-text', ponto: 'bg-warning' },
  'Em risco': { fundo: 'bg-brand-text/12', texto: 'text-brand-text', ponto: 'bg-brand-text' },
  Perdido: { fundo: 'bg-danger/12', texto: 'text-danger', ponto: 'bg-danger' },
};
const FASE_PADRAO = FASE_TOKENS.Novo;

function exemploParaIndice(indice: number) {
  const exemplos = conteudoDemo.clientes.exemplos;
  return exemplos[indice % exemplos.length];
}

/** "12 de set" + "(hoje)"/"(ontem)"/"(há N dias)", calculado da data real. */
function descreverUltimaVisita(
  dateString: string | null,
  agora: Date = new Date(),
): { texto: string; relativo: string | null } {
  if (!dateString) return { texto: 'Nunca visitou', relativo: null };
  const data = new Date(dateString);
  if (Number.isNaN(data.getTime())) return { texto: 'Nunca visitou', relativo: null };
  const texto = data.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }).replace('.', '');
  const inicioDoDia = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const dias = Math.round((inicioDoDia(agora) - inicioDoDia(data)) / 86_400_000);
  if (dias === 0) return { texto, relativo: '(hoje)' };
  if (dias === 1) return { texto, relativo: '(ontem)' };
  if (dias > 1) return { texto, relativo: `(há ${dias} dias)` };
  return { texto, relativo: null };
}

// Reexportado para quem já importava `linkWhatsapp` daqui (M3 da revisão final).
export { linkWhatsapp };

/**
 * Escolhe um exemplo de `conteudoDemo.clientes.exemplos` por um hash estável do id do
 * cliente (o mesmo cliente sempre cai no mesmo exemplo; ids diferentes tendem a espalhar).
 */
export function indiceEstavelParaCliente(id: string, tamanho: number): number {
  if (tamanho <= 0) return 0;
  let soma = 0;
  for (let indice = 0; indice < id.length; indice += 1) soma += id.charCodeAt(indice);
  return soma % tamanho;
}

/**
 * Dias até o próximo aniversário (real, a partir de birth_date) e a data em "DD/MM". Sem
 * data de nascimento, ou com ela inválida, não há o que calcular.
 */
export function proximoAniversario(
  birthDate: string | undefined,
  agora: Date = new Date(),
): { dias: number; dataTexto: string } | null {
  if (!birthDate) return null;
  const nascimento = new Date(birthDate);
  if (Number.isNaN(nascimento.getTime())) return null;

  const hojeSemHora = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate()).getTime();
  let proxima = new Date(agora.getFullYear(), nascimento.getUTCMonth(), nascimento.getUTCDate());
  if (proxima.getTime() < hojeSemHora) {
    proxima = new Date(agora.getFullYear() + 1, nascimento.getUTCMonth(), nascimento.getUTCDate());
  }
  const dias = Math.round((proxima.getTime() - hojeSemHora) / 86_400_000);
  const dataTexto = `${String(nascimento.getUTCDate()).padStart(2, '0')}/${String(nascimento.getUTCMonth() + 1).padStart(2, '0')}`;
  return { dias, dataTexto };
}

/** "Aniversário hoje!"/"amanhã"/"em N dias", só até 30 dias de distância — não afirma o que está longe. */
export function textoAniversario(proximo: { dias: number; dataTexto: string } | null): string | null {
  if (!proximo || proximo.dias > 30) return null;
  if (proximo.dias === 0) return 'Aniversário hoje!';
  if (proximo.dias === 1) return `Aniversário amanhã (${proximo.dataTexto})`;
  return `Aniversário em ${proximo.dias} dias (${proximo.dataTexto})`;
}

/** "Cliente desde março de 2026", a partir do created_at real. */
export function clienteDesdeTexto(createdAt: string): string {
  const data = new Date(createdAt);
  if (Number.isNaN(data.getTime())) return 'Data de cadastro não informada';
  return `Cliente desde ${data.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}`;
}

type TipoEvento = 'agendamento' | 'whatsapp' | 'financeiro' | 'avaliacao' | 'falta' | 'cadastro';

const FILTROS_TIMELINE: Array<{ id: string; label: string; tipos: TipoEvento[] | null }> = [
  { id: 'tudo', label: 'Tudo', tipos: null },
  { id: 'agendamentos', label: 'Agendamentos', tipos: ['agendamento', 'falta', 'cadastro'] },
  { id: 'financeiro', label: 'Financeiro', tipos: ['financeiro'] },
  { id: 'whatsapp', label: 'WhatsApp', tipos: ['whatsapp'] },
  { id: 'avaliacoes', label: 'Avaliações', tipos: ['avaliacao'] },
];

const MARCADOR: Record<TipoEvento, { icone: string; fundo: string; texto: string }> = {
  agendamento: { icone: 'event_available', fundo: 'bg-status-confirmed', texto: 'text-surface' },
  whatsapp: { icone: 'chat', fundo: 'bg-whatsapp', texto: 'text-surface' },
  financeiro: { icone: 'check', fundo: 'bg-success', texto: 'text-surface' },
  avaliacao: { icone: 'star', fundo: 'bg-warning', texto: 'text-surface' },
  falta: { icone: 'schedule', fundo: 'bg-warning', texto: 'text-surface' },
  cadastro: { icone: 'flag', fundo: 'bg-brand', texto: 'text-on-brand' },
};

/** Confirmado → agendamento; concluído → financeiro (o valor pago); cancelado → falta (o sistema não distingue falta de cancelamento). */
export function tipoDoAgendamento(status: Appointment['status']): TipoEvento {
  if (status === 'concluido') return 'financeiro';
  if (status === 'cancelado') return 'falta';
  return 'agendamento';
}

interface EventoTimeline {
  chave: string;
  tipo: TipoEvento;
  dataLabel: string;
  /**
   * Instante real do evento, em ms — só para ordenar a linha do tempo (nunca exibido).
   * Sem isto, os dois eventos de exemplo entravam sempre depois de todos os reais,
   * mesmo quando a última visita real fosse de meses atrás e "ontem" devesse vir
   * primeiro (achado da varredura de telas por Stitch: "histórico cronológico" que não
   * era cronológico).
   */
  ordemMs: number;
  titulo: string;
  detalhe?: string;
  valor?: string;
  chip?: ReactNode;
  destaque?: boolean;
  corpo?: ReactNode;
}

/** Um agendamento real do histórico vira um evento da linha do tempo. */
function eventoDoAgendamento(agendamento: Appointment, agora: Date): EventoTimeline {
  const tipo = tipoDoAgendamento(agendamento.status);
  const visita = descreverUltimaVisita(agendamento.date, agora);
  const horaCurta = (agendamento.time || '').slice(0, 5);
  const hoje = visita.relativo === '(hoje)';
  const dataBase = `${visita.texto}${visita.relativo ? ` ${visita.relativo}` : ''}`;
  const dataLabelComHora = `${dataBase}${horaCurta ? ` às ${horaCurta}` : ''}`;
  const profissional = agendamento.professional_name;
  const servico = agendamento.service_name;
  const ordemBruta = new Date(`${agendamento.date?.slice(0, 10)}T${agendamento.time || '00:00:00'}`).getTime();
  const ordemMs = Number.isNaN(ordemBruta) ? 0 : ordemBruta;

  if (tipo === 'financeiro') {
    return {
      chave: agendamento.id,
      tipo,
      dataLabel: dataLabelComHora,
      ordemMs,
      titulo: `Atendimento concluído${profissional ? ` com ${profissional}` : ''}`,
      detalhe: servico || undefined,
      valor: formatCurrency(agendamento.service_price ?? 0),
    };
  }

  if (tipo === 'falta') {
    return {
      chave: agendamento.id,
      tipo,
      dataLabel: dataLabelComHora,
      ordemMs,
      titulo: `Agendamento cancelado${servico ? `: ${servico}` : ''}`,
      detalhe: profissional ? `Profissional: ${profissional}` : undefined,
      chip: <StatusChip status="cancelado" />,
    };
  }

  // Só o agendamento confirmado/futuro de hoje é "Em andamento" — concluído ou cancelado
  // hoje não está em andamento, mesmo que a visita tenha sido hoje.
  return {
    chave: agendamento.id,
    tipo,
    dataLabel: hoje ? `${dataBase} · Em andamento` : dataLabelComHora,
    ordemMs,
    titulo: `${servico || 'Agendamento'}${profissional ? ` com ${profissional}` : ''}`,
    detalhe: horaCurta ? `Horário previsto: ${horaCurta}` : undefined,
    chip: <StatusChip status="confirmado" />,
    destaque: hoje,
  };
}

const ROTULO_DEMO: Record<'whatsapp' | 'avaliacao' | 'cadastro', string> = {
  whatsapp: 'Mensagem de WhatsApp',
  avaliacao: 'Avaliação recebida',
  cadastro: 'Cadastro inicial',
};

/** Dias fixos de exemplo antes de `agora` para cada evento de exemplo — nunca uma
 *  data gravada, só o deslocamento; o texto/rótulo relativo e o instante para ordenar
 *  são sempre recalculados a partir de `agora` (mesmo padrão para os dois, achado da
 *  varredura de telas: a avaliação tinha uma data fixa que a mensagem de WhatsApp, ao
 *  lado, já não tinha). */
const DIAS_ATRAS_EXEMPLO: Record<'whatsapp' | 'avaliacao', number> = { whatsapp: 1, avaliacao: 3 };

/**
 * Os dois tipos que o histórico real não cobre (whatsapp, avaliação), sempre os mesmos
 * textos (conteudoDemo) — mas nunca uma data gravada: o rótulo relativo de cada um é
 * recalculado a cada render a partir de `agora`, com a mesma lógica de
 * `descreverUltimaVisita` que os eventos reais já usam. "Falta registrada" saiu daqui
 * porque contradizia a métrica real "Faltas / Cancelamentos: 0" desta mesma ficha; o
 * cadastro real vira `eventoDeCadastro`, a partir do `created_at` do cliente.
 */
function eventosDeExemplo(agora: Date): EventoTimeline[] {
  return conteudoDemo.clientes.perfilDestaque.linhaDoTempo
    .filter((item): item is typeof item & { tipo: 'whatsapp' | 'avaliacao' } =>
      item.tipo === 'whatsapp' || item.tipo === 'avaliacao',
    )
    .map((item, indice) => {
      const data = new Date(agora);
      data.setDate(agora.getDate() - DIAS_ATRAS_EXEMPLO[item.tipo]);
      const visita = descreverUltimaVisita(data.toISOString(), agora);
      return {
        chave: `exemplo-${item.tipo}-${indice}`,
        tipo: item.tipo,
        dataLabel: `${visita.texto}${visita.relativo ? ` ${visita.relativo}` : ''}`,
        ordemMs: data.getTime(),
        titulo: ROTULO_DEMO[item.tipo],
        detalhe: item.descricao,
      };
    });
}

/** "Cadastro inicial" real: a data vem de `client.created_at`, nunca de um texto fixo. */
function eventoDeCadastro(createdAt: string): EventoTimeline {
  const cadastroDemo = conteudoDemo.clientes.perfilDestaque.linhaDoTempo.find(item => item.tipo === 'cadastro');
  const data = new Date(createdAt);
  const invalida = Number.isNaN(data.getTime());
  const dataLabel = invalida
    ? 'Data de cadastro não informada'
    : data.toLocaleDateString('pt-BR', { day: 'numeric', month: 'long', year: 'numeric' });
  return {
    chave: 'cadastro-real',
    tipo: 'cadastro',
    dataLabel,
    // Sem data real, fica no fim da linha do tempo (mais antigo possível) em vez de
    // pular para o topo por acaso.
    ordemMs: invalida ? 0 : data.getTime(),
    titulo: ROTULO_DEMO.cadastro,
    detalhe: cadastroDemo?.descricao,
  };
}

/** "12/03/2026" a partir de created_at real, para a linha de autorização do LGPD. */
function criadoEmCurto(createdAt: string): string | null {
  const data = new Date(createdAt);
  if (Number.isNaN(data.getTime())) return null;
  const dia = String(data.getDate()).padStart(2, '0');
  const mes = String(data.getMonth() + 1).padStart(2, '0');
  return `${dia}/${mes}/${data.getFullYear()}`;
}

function CartaoEvento({ evento }: { evento: EventoTimeline }) {
  const marcador = MARCADOR[evento.tipo];
  return (
    <div className="relative pl-9">
      <span
        className={cn(
          'absolute left-0 top-0.5 flex h-6 w-6 items-center justify-center rounded-full ring-4 ring-surface',
          marcador.fundo,
          marcador.texto,
        )}
      >
        <Icon name={marcador.icone} size={13} />
      </span>
      <div className={cn('rounded-xl p-3', evento.destaque ? 'bg-surface-2' : 'bg-surface-2/60')}>
        <div className="flex items-center justify-between gap-2">
          <span
            className={cn(
              'text-[11px] font-semibold text-muted',
              evento.destaque && 'uppercase tracking-wide text-status-confirmed',
            )}
          >
            {evento.dataLabel}
          </span>
          {evento.valor ? (
            <span className="text-[14px] font-bold tabular-nums text-ink">{evento.valor}</span>
          ) : (
            evento.chip
          )}
        </div>
        <h3 className="mt-1 text-[14px] font-bold text-ink">{evento.titulo}</h3>
        {evento.detalhe && <p className="mt-0.5 text-[13px] text-muted">{evento.detalhe}</p>}
        {evento.corpo}
      </div>
    </div>
  );
}

export interface ClientDetailPanelProps {
  client: Client;
  history: Appointment[];
  loadingHistory: boolean;
  onEdit: () => void;
  /**
   * Índice do cliente na lista carregada (ClientModule.tsx), para o exemplo de CRM bater
   * com o mostrado na linha da lista. Sem a prop (teste isolado, storybook), cai no hash
   * estável do id como antes — nunca o caminho normal a partir da lista.
   */
  exemploIndice?: number;
}

export function ClientDetailPanel({
  client,
  history,
  loadingHistory,
  onEdit,
  exemploIndice,
}: ClientDetailPanelProps) {
  const { showToast } = useToast();
  const aCaminho = () => showToast(AVISO_RECURSO_A_CAMINHO, 'info');
  const [filtro, setFiltro] = useState('tudo');

  const exemplos = conteudoDemo.clientes.exemplos;
  const exemplo = exemploParaIndice(
    exemploIndice ?? indiceEstavelParaCliente(client.id, exemplos.length),
  );
  const faseTokens = FASE_TOKENS[exemplo.fase] ?? FASE_PADRAO;
  const perfil = conteudoDemo.clientes.perfilDestaque;

  const whatsapp = linkWhatsapp(client.phone);
  const aniversario = textoAniversario(proximoAniversario(client.birth_date));

  const totalConcluidos = history.filter(item => item.status === 'concluido').length;
  const totalCancelados = history.filter(item => item.status === 'cancelado').length;
  const ticketMedio = totalConcluidos > 0 ? client.total_spent / totalConcluidos : 0;

  const eventos = useMemo(() => {
    const agora = new Date();
    const reais = history.map(item => eventoDoAgendamento(item, agora));
    // Ordenados por instante real, não pela ordem em que cada fonte (real, exemplo,
    // cadastro) foi concatenada — sem isto, "ontem" (exemplo) sempre aparecia depois de
    // toda a agenda real, mesmo quando a última visita real fosse de meses atrás
    // (achado da varredura de telas: "histórico cronológico" que não era cronológico).
    return [...reais, ...eventosDeExemplo(agora), eventoDeCadastro(client.created_at)].sort(
      (a, b) => b.ordemMs - a.ordemMs,
    );
  }, [history, client.created_at]);

  const filtroAtivo = FILTROS_TIMELINE.find(item => item.id === filtro) ?? FILTROS_TIMELINE[0];
  const eventosFiltrados = filtroAtivo.tipos ? eventos.filter(evento => filtroAtivo.tipos!.includes(evento.tipo)) : eventos;

  return (
    <div className="flex flex-col gap-5">
      {/* Cabeçalho: perfil, tags e ações imediatas */}
      <div className="flex flex-col gap-4 rounded-card bg-surface-2 p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <span aria-hidden="true" className="relative flex shrink-0">
              <Avatar name={client.name} size={56} className="rounded-card bg-surface text-[17px] font-bold" />
              {whatsapp && (
                <span
                  title="Tem WhatsApp"
                  className="absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 rounded-full bg-whatsapp ring-2 ring-surface-2"
                />
              )}
            </span>
            <div className="flex min-w-0 flex-col gap-1">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="truncate text-[20px] font-bold leading-tight text-ink">{client.name}</h3>
                <span
                  className={cn(
                    'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold',
                    faseTokens.fundo,
                    faseTokens.texto,
                  )}
                >
                  <span className={cn('h-1.5 w-1.5 rounded-full', faseTokens.ponto)} />
                  {exemplo.fase}
                </span>
              </div>
              <span className="text-[14px] font-medium tabular-nums text-muted">{formatPhone(client.phone)}</span>
              <div className="flex flex-wrap items-center gap-1.5">
                {exemplo.etiqueta && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-surface px-2 py-0.5 text-[11px] font-semibold text-ink">
                    <Icon name="stars" size={12} className="text-brand-text" />
                    {exemplo.etiqueta}
                  </span>
                )}
                {aniversario && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-surface px-2 py-0.5 text-[11px] font-semibold text-ink">
                    <Icon name="cake" size={12} className="text-brand-text" />
                    {aniversario}
                  </span>
                )}
                <span className="inline-flex items-center gap-1 rounded-full bg-surface/60 px-2 py-0.5 text-[11px] font-semibold text-muted">
                  <Icon name="person_check" size={12} />
                  Prefere {exemplo.profissional}
                </span>
              </div>
            </div>
          </div>
          <button
            type="button"
            title="Editar cadastro"
            aria-label="Editar cadastro"
            onClick={onEdit}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-control text-muted transition-colors hover:bg-surface hover:text-ink"
          >
            <Icon name="edit" size={18} />
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {whatsapp && (
            <a
              href={whatsapp}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-10 items-center gap-2 rounded-control bg-whatsapp px-3.5 text-[13px] font-bold text-surface transition-opacity hover:opacity-90"
            >
              <Icon name="chat" size={16} />
              Conversar no WhatsApp
            </a>
          )}
          <button
            type="button"
            onClick={aCaminho}
            className="inline-flex h-10 items-center gap-2 rounded-control bg-brand px-3.5 text-[13px] font-bold text-on-brand transition-opacity hover:opacity-90"
          >
            <Icon name="add_circle" size={16} />
            Novo agendamento
          </button>
          <button
            type="button"
            onClick={aCaminho}
            title="Mais opções"
            aria-label="Mais opções"
            className="flex h-10 w-10 items-center justify-center rounded-control bg-surface text-ink transition-colors hover:bg-line/60"
          >
            <Icon name="more_vert" size={18} />
          </button>
        </div>

        {/* LGPD: exemplo (conteudoDemo), sem consentimento real registrado no sistema —
            só a data de autorização usa o created_at real, para não contradizer "Cliente
            desde" mais abaixo. */}
        <div className="flex flex-col gap-1 rounded-control bg-surface px-3.5 py-2.5 text-[13px]">
          <span className="flex items-start gap-2 text-ink">
            <Icon name="verified_user" size={16} className="mt-0.5 shrink-0 text-success-text" />
            <span>
              <strong className="font-semibold text-success-text">LGPD:</strong> {perfil.consentimentoLgpd.texto}
            </span>
          </span>
          <span className="pl-6 text-[11px] text-muted">
            Autorizado em {criadoEmCurto(client.created_at) ?? 'data não informada'} via {perfil.consentimentoLgpd.canal}
          </span>
        </div>
      </div>

      {/* 4 métricas: ticket médio, frequência e faltas/cancelamentos reais; ciclo médio do
          mesmo exemplo indexado por posição que a lista usa (Tarefa 7 / correção I1) */}
      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col justify-between rounded-card bg-surface-2 p-3.5">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold text-muted">Ciclo médio de retorno</span>
            <Icon name="sync" size={16} className="text-muted" />
          </div>
          <div className="mt-2 flex items-baseline gap-1.5">
            <span className="text-[26px] font-bold tabular-nums text-ink">{exemplo.cicloMedioDias ?? '—'}</span>
            {exemplo.cicloMedioDias !== null && <span className="text-[13px] text-muted">dias</span>}
          </div>
          <span className="mt-1 text-[11px] font-semibold text-success-text">
            {exemplo.cicloMedioLegenda}
          </span>
        </div>

        <div className="flex flex-col justify-between rounded-card bg-surface-2 p-3.5">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold text-muted">Ticket médio</span>
            <Icon name="payments" size={16} className="text-muted" />
          </div>
          <div className="mt-2 flex items-baseline gap-1.5">
            <span className="text-[26px] font-bold tabular-nums text-ink">{formatCurrency(ticketMedio)}</span>
          </div>
          <span className="mt-1 text-[11px] text-muted">
            Gasto acumulado: <span className="font-semibold text-ink">{formatCurrency(client.total_spent)}</span>
          </span>
        </div>

        <div className="flex flex-col justify-between rounded-card bg-surface-2 p-3.5">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold text-muted">Frequência presencial</span>
            <Icon name="check_circle" size={16} className="text-muted" />
          </div>
          <div className="mt-2 flex items-baseline gap-1.5">
            <span className="text-[26px] font-bold tabular-nums text-ink">{totalConcluidos}</span>
            <span className="text-[13px] text-muted">visita{totalConcluidos === 1 ? '' : 's'}</span>
          </div>
          <span className="mt-1 text-[11px] text-muted">{clienteDesdeTexto(client.created_at)}</span>
        </div>

        <div className="flex flex-col justify-between rounded-card bg-surface-2 p-3.5">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold text-muted">Faltas / Cancelamentos</span>
            <Icon name="event_busy" size={16} className="text-muted" />
          </div>
          <div className="mt-2 flex items-baseline gap-1.5">
            <span className="text-[26px] font-bold tabular-nums text-ink">{totalCancelados}</span>
            <span className="text-[13px] text-muted">cancelamento{totalCancelados === 1 ? '' : 's'}</span>
          </div>
          <span className="mt-1 text-[11px] text-muted">
            {totalCancelados === 0 ? 'Nenhum registrado no histórico' : 'Contados no histórico de atendimentos'}
          </span>
        </div>
      </div>

      {/* Ficha técnica — genérica (conteudoDemo), mesmo layout para qualquer segmento */}
      <div className="rounded-card bg-surface-2 p-4">
        <div className="mb-3 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-control bg-brand/15 text-brand-text">
              <Icon name="assignment" size={18} />
            </span>
            <h3 className="text-[15px] font-bold text-ink">{perfil.fichaTecnica.titulo}</h3>
          </div>
          <button type="button" onClick={aCaminho} className="flex items-center gap-1 text-[13px] font-bold text-brand-text hover:underline">
            <Icon name="edit" size={14} />
            Editar
          </button>
        </div>

        <div className="flex flex-col gap-2">
          {perfil.fichaTecnica.preferencias.map(pref => (
            <div key={pref.rotulo} className="rounded-control bg-surface p-3">
              <span className="block text-[11px] text-muted">{pref.rotulo}</span>
              <span className="font-semibold text-ink">{pref.valor}</span>
            </div>
          ))}
          <div className="rounded-control bg-surface p-3">
            <span className="block text-[11px] text-muted">Observações da profissional</span>
            <p className="mt-0.5 text-[13px] leading-relaxed text-ink">
              {client.notes || 'Nenhuma observação registrada'}
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={aCaminho}
          className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-control bg-surface py-2.5 text-[13px] font-semibold text-ink transition-colors hover:bg-line/60"
        >
          <Icon name="tune" size={16} />
          Atualizar ficha técnica
        </button>
      </div>

      {/* Contato — real (client), com os mesmos fallbacks de antes da migração para
          Stitch: "Não informado" e "Não cadastrado" em vez de escondido. */}
      <div className="rounded-card bg-surface-2 p-4">
        <div className="mb-3 flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-control bg-brand/15 text-brand-text">
            <Icon name="contact_page" size={18} />
          </span>
          <h3 className="text-[15px] font-bold text-ink">Contato</h3>
        </div>
        <div className="flex flex-col gap-2">
          <div className="rounded-control bg-surface p-3">
            <span className="block text-[11px] text-muted">E-mail</span>
            <span className="font-semibold text-ink">{client.email || 'Não informado'}</span>
          </div>
          <div className="rounded-control bg-surface p-3">
            <span className="block text-[11px] text-muted">Endereço</span>
            <span className="font-semibold text-ink">{client.address || 'Não cadastrado'}</span>
          </div>
        </div>
      </div>

      {/* Galeria — bloco neutro com ícone no lugar da foto (nenhuma chamada para fora, nenhum retrato inventado) */}
      <div className="rounded-card bg-surface-2 p-4">
        <div className="mb-3 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-control bg-surface text-ink">
              <Icon name="photo_library" size={18} />
            </span>
            <div>
              <h3 className="text-[15px] font-bold text-ink">Galeria de procedimentos</h3>
              <span className="text-[11px] text-muted">{perfil.galeria.length} fotos registradas</span>
            </div>
          </div>
          <button type="button" onClick={aCaminho} className="text-[13px] font-bold text-brand-text hover:underline">
            Ver todas
          </button>
        </div>

        <div className="grid grid-cols-2 gap-2.5">
          {perfil.galeria.map(item => (
            <div key={`${item.data}-${item.legenda}`} className="relative flex aspect-square flex-col items-center justify-center overflow-hidden rounded-xl bg-surface">
              <Icon name="image" size={28} className="text-muted" />
              <div className="absolute inset-x-0 bottom-0 bg-ink/70 p-1.5 text-surface">
                <p className="truncate text-[11px] font-bold leading-tight">
                  {item.data} - {item.legenda}
                </p>
                {/* A galeria é um bloco só, compartilhado por todas as clientes — usa o
                    mesmo profissional do selo "Prefere X" acima em vez do valor fixo
                    "Camila" que cada foto trazia, que contradizia o selo para as
                    clientes cujo exemplo indexado usa outra profissional (achado da
                    varredura de telas por Stitch). */}
                <p className="text-[10px] opacity-80">Por {exemplo.profissional}</p>
              </div>
            </div>
          ))}
        </div>

        <button
          type="button"
          onClick={aCaminho}
          className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-control bg-surface py-2.5 text-[13px] font-semibold text-ink transition-colors hover:bg-line/60"
        >
          <Icon name="add_a_photo" size={16} />+ Anexar foto da sessão
        </button>
      </div>

      {/* Linha do tempo: atendimentos reais + cadastro real + 2 eventos de exemplo (mensagem, avaliação) */}
      <div className="rounded-card bg-surface-2 p-4">
        <div className="mb-3 flex flex-col gap-2">
          <div>
            <h3 className="text-[15px] font-bold text-ink">Linha do tempo de relacionamento</h3>
            <p className="text-[12px] text-muted">Histórico cronológico de sessões, pagamentos e conversas</p>
          </div>
          <div className="flex items-center gap-1 overflow-x-auto rounded-control bg-surface p-1">
            {FILTROS_TIMELINE.map(item => (
              <button
                key={item.id}
                type="button"
                onClick={() => setFiltro(item.id)}
                aria-pressed={filtro === item.id}
                className={cn(
                  'shrink-0 rounded-control px-2.5 py-1 text-[12px] font-semibold transition-colors',
                  filtro === item.id ? 'bg-surface-2 text-ink shadow-sm' : 'text-muted hover:text-ink',
                )}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>

        {loadingHistory ? (
          <p className="py-6 text-center text-[13px] text-muted">Carregando histórico...</p>
        ) : eventosFiltrados.length === 0 ? (
          <p className="py-6 text-center text-[13px] text-muted">Nenhum evento para este filtro.</p>
        ) : (
          <div className="flex flex-col gap-4">
            {eventosFiltrados.map(evento => (
              <CartaoEvento key={evento.chave} evento={evento} />
            ))}
          </div>
        )}

        <div className="mt-4 text-center">
          <button type="button" onClick={aCaminho} className="text-[13px] font-semibold text-muted hover:text-ink">
            Carregar histórico anterior
          </button>
        </div>
      </div>
    </div>
  );
}
