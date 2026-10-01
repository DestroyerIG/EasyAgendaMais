'use client';

/**
 * Tela Clientes (clientes-lista.html).
 *
 * Dado real, tudo de GET /clients: nome, telefone, e-mail, data de nascimento, "Última
 * Visita" (com o "(hoje)"/"(ontem)"/"(há N dias)" calculado de last_visit) e "LTV
 * Acumulado" (total_spent); o selo de aniversário aparece quando birth_date cai no mês
 * corrente. Busca, seleção, abertura da ficha e o formulário de cadastro/edição
 * continuam com os mesmos handlers de sempre (GET /clients/{id}/history, PUT
 * /clients/{id}, POST /clients) — a busca é filtro em memória sobre a lista já
 * carregada, nunca chamada nova.
 *
 * Dado de exemplo (conteudoDemo.clientes.exemplos): a "Fase CRM" e a etiqueta abaixo do
 * nome, "Ciclo Médio", "Retorno Previsto" (calculado a cada render a partir de uma
 * data-base fixa, nunca um texto gravado — correção I2 da revisão final) e a linha
 * "Serviço · Profissional" sob a Última Visita — nenhum clube de fidelidade, funil de
 * CRM ou histórico de serviço por atendimento existe no sistema hoje. "LTV Acumulado"
 * não tem uma contagem de atendimentos ao lado: a lista não carrega o histórico de cada
 * cliente (só a ficha carrega, ao abrir), então não há como mostrar um total real sem
 * uma chamada nova, e a versão anterior mostrava um número de exemplo fixo (correção I1).
 * Cada cliente real recebe um exemplo pela posição dele na lista carregada (nunca por
 * sorteio), para a fase não mudar entre dois desenhos da mesma tela.
 *
 * Fora da tela, por exigirem função que o sistema não tem: o item de menu "Funil CRM",
 * a fileira de chips que filtraria por fase, o alternador Lista/Fases, a ordenação, a
 * exportação e os selects de etiqueta/profissional do arquivo de referência. Nas "Ações
 * Rápidas" só entram os dois botões que funcionam de verdade — abrir o WhatsApp do
 * telefone real e editar o cadastro; "novo agendamento" e "mais opções" ficaram de fora
 * por não terem suporte aqui.
 */

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import api from '@/lib/api';
import { useToast } from './Toast';
import {
  PageHeader,
  Button,
  Card,
  EmptyState,
  Skeleton,
  Avatar,
  Input,
  Table,
  TableHead,
  TableBody,
  TableRow,
  TableHeaderCell,
  TableCell,
  SidePanel,
  Icon,
} from '@/components/ui';
import { ClientDetailPanel } from '@/components/clients/ClientDetailPanel';
import { ClientFormModal } from '@/components/clients/ClientFormModal';
import type { ClientFormData } from '@/components/clients/ClientFormModal';
import { getApiErrorMessage } from '@/utils/handleApiError';
import { cn } from '@/lib/cn';
import { formatCurrency, formatPhone } from '@/lib/formatters';
import { conteudoDemo } from '@/lib/conteudoDemo';
import { linkWhatsapp } from '@/lib/whatsapp';
import { materialIcon } from '@/lib/materialIconAdapter';
import { useRegisterTopBarSearch } from '@/components/shell/TopBarSearchContext';
import type { Client, Appointment } from '@/types';

const TAMANHO_PAGINA = 10;

// M1 da revisão final: Material Symbol no lugar do ícone lucide (EmptyState aceita os
// dois via o adaptador, e o resto da tela já é Material Symbols).
const ICONE_GRUPO = materialIcon('group');

// Cores da coluna "Fase CRM": as 5 fases do arquivo de referência mapeadas para tokens
// do DESIGN.md (o arquivo usa âmbar/verde/laranja/vermelho/azul soltos do Tailwind, que
// o teste de conformidade de tema reprova neste arquivo).
// Exportados porque ClientDetailPanel.tsx (que já importa `exemploParaIndice` daqui)
// usava uma cópia idêntica destes tokens — M3 da revisão final: um lugar só.
export const FASE_TOKENS: Record<string, { fundo: string; texto: string; ponto: string }> = {
  Novo: { fundo: 'bg-status-confirmed/12', texto: 'text-status-confirmed', ponto: 'bg-status-confirmed' },
  Recorrente: { fundo: 'bg-success/12', texto: 'text-success-text', ponto: 'bg-success' },
  Fiel: { fundo: 'bg-warning/12', texto: 'text-warning-text', ponto: 'bg-warning' },
  'Em risco': { fundo: 'bg-brand-text/12', texto: 'text-brand-text', ponto: 'bg-brand-text' },
  Perdido: { fundo: 'bg-danger/12', texto: 'text-danger', ponto: 'bg-danger' },
};
export const FASE_PADRAO = FASE_TOKENS.Novo;

/**
 * Exemplo de CRM ligado ao cliente pela posição dele na lista carregada — nunca por
 * sorteio, para a fase (e a etiqueta, o ciclo médio etc.) não mudarem entre dois
 * desenhos da mesma tela.
 */
export function exemploParaIndice(indice: number) {
  const exemplos = conteudoDemo.clientes.exemplos;
  return exemplos[indice % exemplos.length];
}

/** "12 de set" + "(hoje)"/"(ontem)"/"(há N dias)", calculado do last_visit real. */
export function descreverUltimaVisita(
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

/**
 * "Retorno previsto" de exemplo (clientes.exemplos[].retornoPrevisto): nunca um texto
 * gravado com data e "em N dias"/"há N dias" fixos (I2 da revisão final) — só a data-base
 * (dia do mês) e a direção (retorno futuro ou já vencido) são fixas; o texto e se está
 * vencido saem daqui, recalculados a cada render a partir de `agora`.
 */
export function calcularRetornoPrevisto(
  retorno: { tipo: 'data'; diaBase: number; direcao: 'futuro' | 'vencido' } | { tipo: 'texto'; texto: string },
  agora: Date = new Date(),
): { texto: string; vencido: boolean } {
  if (retorno.tipo === 'texto') return { texto: retorno.texto, vencido: false };

  const hojeSemHora = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate()).getTime();
  let data = new Date(agora.getFullYear(), agora.getMonth(), retorno.diaBase);
  if (retorno.direcao === 'futuro' && data.getTime() < hojeSemHora) {
    data = new Date(agora.getFullYear(), agora.getMonth() + 1, retorno.diaBase);
  } else if (retorno.direcao === 'vencido' && data.getTime() > hojeSemHora) {
    data = new Date(agora.getFullYear(), agora.getMonth() - 1, retorno.diaBase);
  }

  const dias = Math.round((data.getTime() - hojeSemHora) / 86_400_000);
  if (retorno.direcao === 'vencido') {
    return { texto: `Venceu há ${Math.abs(dias)} dias`, vencido: true };
  }
  const dataTexto = data.toLocaleDateString('pt-BR', { day: 'numeric', month: 'long' });
  if (dias === 0) return { texto: `${dataTexto} (hoje)`, vencido: false };
  return { texto: `${dataTexto} (em ${dias} dias)`, vencido: false };
}

/** Selo de aniversário: true só quando birth_date (real) cai no mês de "agora". */
export function fazAniversarioNoMes(birthDate: string | undefined, agora: Date = new Date()): boolean {
  if (!birthDate) return false;
  const data = new Date(birthDate);
  if (Number.isNaN(data.getTime())) return false;
  return data.getUTCMonth() === agora.getMonth();
}

function formatarDiaMes(dateString: string): string {
  const data = new Date(dateString);
  const dia = String(data.getUTCDate()).padStart(2, '0');
  const mes = String(data.getUTCMonth() + 1).padStart(2, '0');
  return `${dia}/${mes}`;
}

// Reexportado para quem já importava `linkWhatsapp` daqui (M3 da revisão final: a
// implementação agora mora só em '@/lib/whatsapp').
export { linkWhatsapp };

/**
 * Botões numéricos da paginação com reticências: sempre a 1ª, as 2 seguintes, as
 * vizinhas da página atual e a última — como em "1 2 3 … 25" do arquivo de referência.
 */
export function construirPaginas(atual: number, total: number): Array<number | '...'> {
  if (total <= 0) return [];
  const paginas = new Set<number>();
  [1, 2, 3, atual - 1, atual, atual + 1, total].forEach((pagina) => {
    if (pagina >= 1 && pagina <= total) paginas.add(pagina);
  });
  const ordenadas = [...paginas].sort((a, b) => a - b);
  const resultado: Array<number | '...'> = [];
  let anterior = 0;
  for (const pagina of ordenadas) {
    if (anterior && pagina - anterior > 1) resultado.push('...');
    resultado.push(pagina);
    anterior = pagina;
  }
  return resultado;
}

export const ClientModule = () => {
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingClient, setEditingClient] = useState<Client | null>(null);
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [history, setHistory] = useState<Appointment[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const { showToast } = useToast();
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Publica o filtro de busca já existente nesta tela para a barra superior do
  // painel controlar (Tarefa 3 da casca) — mesmo estado, sem chamada nova.
  useRegisterTopBarSearch({ value: searchTerm, onChange: setSearchTerm });

  const loadClients = useCallback(async () => {
    try {
      const response = await api.get('/clients');
      setClients(response.data);
    } catch {
      showToast('Erro ao carregar clientes', 'error');
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    loadClients();
  }, [loadClients]);

  const loadHistory = async (clientId: string) => {
    setLoadingHistory(true);
    try {
      const response = await api.get(`/clients/${clientId}/history`);
      setHistory(response.data);
    } catch {
      showToast('Erro ao carregar histórico', 'error');
    } finally {
      setLoadingHistory(false);
    }
  };

  const selectClient = (client: Client) => {
    setSelectedClient(client);
    loadHistory(client.id);
  };

  const closeClientDetail = () => {
    setSelectedClient(null);
  };

  const handleOpenModal = (client?: Client) => {
    setEditingClient(client || null);
    setIsModalOpen(true);
  };

  const handleSubmitClient = async (data: ClientFormData) => {
    // Mapeia birthDate → birth_date conforme esperado pelo backend
    const payload = {
      name: data.name,
      phone: data.phone,
      email: data.email || null,
      birth_date: data.birthDate || null,
      address: data.address || null,
      notes: data.notes || null,
    };

    try {
      if (editingClient) {
        await api.put(`/clients/${editingClient.id}`, payload);
        showToast('Cliente atualizado com sucesso', 'success');
      } else {
        await api.post('/clients', payload);
        showToast('Cliente cadastrado com sucesso', 'success');
      }
      await loadClients();
    } catch (error) {
      const fallback = editingClient
        ? 'Erro ao atualizar cliente'
        : 'Erro ao cadastrar cliente';
      showToast(getApiErrorMessage(error, fallback), 'error');
      throw error;
    }
  };

  // Índice de cada cliente na lista carregada (não na filtrada nem na paginada), para o
  // exemplo de CRM ficar estável enquanto a pessoa busca ou navega entre páginas.
  const indicePorId = useMemo(() => {
    const mapa = new Map<string, number>();
    clients.forEach((client, indice) => mapa.set(client.id, indice));
    return mapa;
  }, [clients]);

  const filteredClients = clients.filter(c =>
    c.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    c.phone.includes(searchTerm)
  );

  // Atalho de teclado "/" foca a busca (clientes-lista.html), exceto quando o foco já
  // está num campo de texto.
  useEffect(() => {
    function aoTeclar(evento: KeyboardEvent) {
      if (evento.key !== '/') return;
      const alvo = document.activeElement;
      const emCampoDeTexto =
        alvo instanceof HTMLInputElement ||
        alvo instanceof HTMLTextAreaElement ||
        (alvo instanceof HTMLElement && alvo.isContentEditable);
      if (emCampoDeTexto) return;
      evento.preventDefault();
      searchInputRef.current?.focus();
    }
    window.addEventListener('keydown', aoTeclar);
    return () => window.removeEventListener('keydown', aoTeclar);
  }, []);

  // Busca nova volta para a 1ª página, para não ficar numa página que a busca esvaziou.
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm]);

  const totalPaginas = Math.max(1, Math.ceil(filteredClients.length / TAMANHO_PAGINA));
  const paginaAtual = Math.min(currentPage, totalPaginas);
  const inicioDaPagina = filteredClients.length === 0 ? 0 : (paginaAtual - 1) * TAMANHO_PAGINA + 1;
  const fimDaPagina = Math.min(paginaAtual * TAMANHO_PAGINA, filteredClients.length);
  const clientesDaPagina = filteredClients.slice((paginaAtual - 1) * TAMANHO_PAGINA, paginaAtual * TAMANHO_PAGINA);
  const paginas = construirPaginas(paginaAtual, totalPaginas);

  const renderAcoesRapidas = (client: Client) => {
    const whatsapp = linkWhatsapp(client.phone);
    return (
      <div className="flex items-center justify-end gap-1">
        {whatsapp && (
          <a
            href={whatsapp}
            target="_blank"
            rel="noopener noreferrer"
            onClick={e => e.stopPropagation()}
            title="Conversar no WhatsApp"
            aria-label="Conversar no WhatsApp"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-control bg-whatsapp/12 text-whatsapp transition-colors hover:bg-whatsapp hover:text-surface"
          >
            <Icon name="chat" size={18} />
          </a>
        )}
        <button
          type="button"
          onClick={e => {
            e.stopPropagation();
            handleOpenModal(client);
          }}
          title="Editar cliente"
          aria-label="Editar cliente"
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-control text-muted transition-colors hover:bg-surface-2 hover:text-ink"
        >
          <Icon name="edit" size={18} />
        </button>
      </div>
    );
  };

  return (
    <div>
      <PageHeader
        title="Clientes"
        description={!loading ? `${clients.length} cliente${clients.length === 1 ? '' : 's'} cadastrado${clients.length === 1 ? '' : 's'}` : undefined}
        action={
          <Button onClick={() => handleOpenModal()}>
            <Icon name="person_add" size={18} />
            Nova cliente
          </Button>
        }
      />

      <div className="relative mb-4 max-w-md">
        <Icon name="search" size={18} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
        <Input
          ref={searchInputRef}
          type="text"
          placeholder="Buscar por nome ou telefone..."
          value={searchTerm}
          onChange={e => setSearchTerm(e.target.value)}
          className="pl-10 pr-10"
        />
        <kbd className="pointer-events-none absolute right-3 top-1/2 hidden h-6 -translate-y-1/2 items-center justify-center rounded border border-line bg-surface-2 px-1.5 text-[11px] font-semibold text-muted sm:inline-flex">
          /
        </kbd>
      </div>

      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full" label={i === 0 ? 'Carregando clientes...' : undefined} />
          ))}
        </div>
      ) : filteredClients.length === 0 ? (
        searchTerm ? (
          <EmptyState
            icon={ICONE_GRUPO}
            title="Nenhum cliente encontrado"
            description="Nenhum cliente corresponde à busca atual."
          />
        ) : (
          <EmptyState
            icon={ICONE_GRUPO}
            title="Nenhum cliente cadastrado ainda"
            action={{ label: 'Nova cliente', onClick: () => handleOpenModal() }}
            actionVariant="secondary"
          />
        )
      ) : (
        <>
          {/* Computador: tabela rica (clientes-lista.html) */}
          <div className="hidden lg:block">
            <Table minWidth={960}>
              <TableHead>
                <TableRow>
                  <TableHeaderCell className="text-[11px] uppercase tracking-wider">Cliente</TableHeaderCell>
                  <TableHeaderCell className="text-[11px] uppercase tracking-wider">Fase CRM</TableHeaderCell>
                  <TableHeaderCell className="text-[11px] uppercase tracking-wider">Última Visita</TableHeaderCell>
                  <TableHeaderCell className="text-[11px] uppercase tracking-wider">Ciclo Médio</TableHeaderCell>
                  <TableHeaderCell className="text-[11px] uppercase tracking-wider">Retorno Previsto</TableHeaderCell>
                  <TableHeaderCell className="text-[11px] uppercase tracking-wider">LTV Acumulado</TableHeaderCell>
                  <TableHeaderCell className="text-right text-[11px] uppercase tracking-wider">Ações Rápidas</TableHeaderCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {clientesDaPagina.map(client => {
                  const demo = exemploParaIndice(indicePorId.get(client.id) ?? 0);
                  const faseTokens = FASE_TOKENS[demo.fase] ?? FASE_PADRAO;
                  const ultimaVisita = descreverUltimaVisita(client.last_visit);
                  const aniversariante = fazAniversarioNoMes(client.birth_date);
                  const retorno = calcularRetornoPrevisto(demo.retornoPrevisto);
                  // Um retorno vencido (exemplo) ao lado de uma última visita real "(hoje)"
                  // seria uma contradição visível na mesma linha — omite a célula em vez de
                  // mostrar o aviso (I2 da revisão final).
                  const ocultarRetorno = retorno.vencido && ultimaVisita.relativo === '(hoje)';

                  return (
                    <TableRow
                      key={client.id}
                      tabIndex={0}
                      aria-label={`Ver ficha de ${client.name}`}
                      onClick={() => selectClient(client)}
                      onKeyDown={evento => {
                        if (evento.key === 'Enter' || evento.key === ' ') {
                          evento.preventDefault();
                          selectClient(client);
                        }
                      }}
                      className={cn(
                        'group cursor-pointer transition-colors hover:bg-surface-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-brand',
                        selectedClient?.id === client.id && 'bg-surface-2',
                      )}
                    >
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <Avatar name={client.name} size={36} />
                          <div className="flex min-w-0 flex-col">
                            <span className="truncate font-bold text-ink transition-colors group-hover:text-brand-text">
                              {client.name}
                            </span>
                            <span className="text-[13px] tabular-nums text-muted">{formatPhone(client.phone)}</span>
                            {(demo.etiqueta || aniversariante) && (
                              <div className="mt-1 flex flex-wrap items-center gap-1.5">
                                {demo.etiqueta && (
                                  <span className="inline-flex items-center rounded bg-surface-2 px-1.5 py-0.5 text-[10px] font-semibold text-muted">
                                    {demo.etiqueta}
                                  </span>
                                )}
                                {aniversariante && client.birth_date && (
                                  <span className="inline-flex items-center gap-0.5 rounded bg-brand/12 px-1.5 py-0.5 text-[10px] font-semibold text-brand-text">
                                    <Icon name="cake" size={12} />
                                    {formatarDiaMes(client.birth_date)}
                                  </span>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <span
                          className={cn(
                            'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[13px] font-semibold',
                            faseTokens.fundo,
                            faseTokens.texto,
                          )}
                        >
                          <span className={cn('h-1.5 w-1.5 rounded-full', faseTokens.ponto)} />
                          {demo.fase}
                        </span>
                      </TableCell>
                      <TableCell>
                        <div className="flex min-w-0 flex-col">
                          <span className="tabular-nums text-ink">
                            {ultimaVisita.texto}
                            {ultimaVisita.relativo && (
                              <span className="ml-1 text-[13px] font-normal text-muted">{ultimaVisita.relativo}</span>
                            )}
                          </span>
                          <span className="truncate text-[13px] text-muted">
                            {demo.servico} · {demo.profissional}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col">
                          <span className="flex items-baseline gap-1">
                            <span className="font-bold tabular-nums text-ink">{demo.cicloMedioDias ?? '—'}</span>
                            {demo.cicloMedioDias !== null && <span className="text-[13px] text-muted">dias</span>}
                          </span>
                          <span className="text-[11px] text-muted">{demo.cicloMedioLegenda}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        {!ocultarRetorno && (
                          <span className={cn('font-semibold text-ink', retorno.vencido && 'text-danger')}>
                            {retorno.texto}
                          </span>
                        )}
                      </TableCell>
                      <TableCell>
                        {/* Sem contador real de atendimentos por cliente na lista (só a
                            ficha tem histórico carregado) — mostra só o LTV real, sem
                            inventar uma contagem ao lado (correção I1). */}
                        <span className="font-bold tabular-nums text-ink">{formatCurrency(client.total_spent)}</span>
                      </TableCell>
                      <TableCell className="text-right">{renderAcoesRapidas(client)}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>

          {/* Celular: cartões */}
          <div className="space-y-3 lg:hidden">
            {clientesDaPagina.map(client => {
              const demo = exemploParaIndice(indicePorId.get(client.id) ?? 0);
              const faseTokens = FASE_TOKENS[demo.fase] ?? FASE_PADRAO;
              const ultimaVisita = descreverUltimaVisita(client.last_visit);

              return (
                <Card
                  key={client.id}
                  tabIndex={0}
                  role="button"
                  aria-label={`Ver ficha de ${client.name}`}
                  onClick={() => selectClient(client)}
                  onKeyDown={evento => {
                    if (evento.key === 'Enter' || evento.key === ' ') {
                      evento.preventDefault();
                      selectClient(client);
                    }
                  }}
                  className={cn(
                    'flex cursor-pointer flex-col gap-3',
                    selectedClient?.id === client.id && 'bg-surface-2',
                  )}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-3">
                      <Avatar name={client.name} />
                      <div className="min-w-0">
                        <p className="truncate font-semibold text-ink">{client.name}</p>
                        <p className="truncate text-[13px] text-muted">{formatPhone(client.phone)}</p>
                        <p className="tabular-nums text-[13px] text-muted">
                          {ultimaVisita.texto}
                          {ultimaVisita.relativo ? ` ${ultimaVisita.relativo}` : ''}
                        </p>
                        <p className="truncate text-[13px] text-muted">
                          {demo.servico} · {demo.profissional}
                        </p>
                      </div>
                    </div>
                    {renderAcoesRapidas(client)}
                  </div>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span
                      className={cn(
                        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[13px] font-semibold',
                        faseTokens.fundo,
                        faseTokens.texto,
                      )}
                    >
                      <span className={cn('h-1.5 w-1.5 rounded-full', faseTokens.ponto)} />
                      {demo.fase}
                    </span>
                    <span className="font-bold tabular-nums text-ink">{formatCurrency(client.total_spent)}</span>
                  </div>
                </Card>
              );
            })}
          </div>

          {/* Rodapé: paginação numérica com reticências (clientes-lista.html) */}
          <div className="mt-3 flex flex-col items-center justify-between gap-3 rounded-card border border-line bg-surface px-4 py-3 text-[13px] font-medium text-muted sm:flex-row">
            <span>
              Mostrando <span className="font-semibold text-ink">{inicioDaPagina}–{fimDaPagina}</span> de{' '}
              <span className="font-semibold text-ink">{filteredClients.length}</span> cliente
              {filteredClients.length === 1 ? '' : 's'}
            </span>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                disabled={paginaAtual === 1}
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                className="rounded-control bg-surface-2 px-3 py-1.5 font-semibold text-ink transition-colors hover:bg-line/60 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Anterior
              </button>
              {paginas.map((pagina, indice) =>
                pagina === '...' ? (
                  <span key={`reticencias-${indice}`} className="px-1 text-muted">
                    …
                  </span>
                ) : (
                  <button
                    key={pagina}
                    type="button"
                    onClick={() => setCurrentPage(pagina)}
                    aria-current={pagina === paginaAtual ? 'page' : undefined}
                    className={cn(
                      'flex h-8 w-8 items-center justify-center rounded-control font-semibold transition-colors',
                      pagina === paginaAtual ? 'bg-ink text-surface' : 'text-ink hover:bg-surface-2',
                    )}
                  >
                    {pagina}
                  </button>
                ),
              )}
              <button
                type="button"
                disabled={paginaAtual === totalPaginas}
                onClick={() => setCurrentPage(p => Math.min(totalPaginas, p + 1))}
                className="rounded-control bg-surface-2 px-3 py-1.5 font-semibold text-ink transition-colors hover:bg-line/60 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Próxima
              </button>
            </div>
          </div>
        </>
      )}

      <SidePanel
        open={!!selectedClient}
        onOpenChange={open => {
          if (!open) closeClientDetail();
        }}
        title={selectedClient?.name ?? ''}
        side="right"
      >
        {selectedClient ? (
          <ClientDetailPanel
            client={selectedClient}
            history={history}
            loadingHistory={loadingHistory}
            onEdit={() => handleOpenModal(selectedClient)}
            exemploIndice={indicePorId.get(selectedClient.id) ?? 0}
          />
        ) : null}
      </SidePanel>

      <ClientFormModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSubmit={handleSubmitClient}
        editingClient={editingClient}
      />
    </div>
  );
};
