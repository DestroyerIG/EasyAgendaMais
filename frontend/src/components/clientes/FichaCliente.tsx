'use client';

/**
 * Ficha da cliente (Stitch "Ajustada" 96f71e no desktop, e3b0b0 no celular). Tudo vem de
 * GET /clients/:id/profile: fase, etiquetas, indicadores, consentimento LGPD e ficha
 * técnica do segmento. Galeria e linha do tempo carregam à parte (GaleriaCliente e
 * LinhaDoTempoCliente). No celular vira coluna única, indicadores 2×2 e seções recolhíveis.
 */

import { useCallback, useEffect, useState, type ReactNode } from 'react';
import Link from 'next/link';
import api from '@/lib/api';
import {
  Avatar,
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Icon,
  Modal,
  Skeleton,
} from '@/components/ui';
import { useToast } from '@/components/Toast';
import { MensagemWhatsappModal } from '@/components/clientes/MensagemWhatsappModal';
import { ETIQUETA_CORES, EtiquetasClienteModal, FASE_CORES, primeiroNome } from '@/components/clientes/ListaClientes';
import { FichaTecnica } from '@/components/clientes/FichaTecnica';
import { GaleriaCliente } from '@/components/clientes/GaleriaCliente';
import { LinhaDoTempoCliente } from '@/components/clientes/LinhaDoTempoCliente';
import { ClientFormModal, type ClientFormData } from '@/components/clients/ClientFormModal';
import { cn } from '@/lib/cn';
import { anoAtualNegocio, formatCurrency, formatDataNegocio, formatPhone } from '@/lib/formatters';
import {
  buscarPerfil,
  FASE_ROTULO,
  registrarConsentimento,
  type ClientProfileDto,
  type ConsentimentoDto,
} from '@/lib/crm';
import { listarEtiquetas, type Etiqueta } from '@/lib/tags';
import { linkWhatsapp, MENSAGENS, preencherMensagem } from '@/lib/whatsappLink';
import { getApiErrorMessage } from '@/utils/handleApiError';
import type { Client } from '@/types';

const ROTULO_CANAL: Record<NonNullable<ConsentimentoDto['canal']>, string> = {
  painel: 'Painel',
  publico: 'Página pública',
  whatsapp: 'WhatsApp',
};

const statusDoErro = (e: unknown): number | undefined =>
  (e as { response?: { status?: number } } | null)?.response?.status;

export interface FichaClienteProps {
  clienteId: string;
  nomeNegocio?: string;
}

type Estado = 'carregando' | 'pronto' | 'nao_encontrada' | 'erro';

export function FichaCliente({ clienteId, nomeNegocio }: FichaClienteProps) {
  const { showToast } = useToast();
  const [perfil, setPerfil] = useState<ClientProfileDto | null>(null);
  const [estado, setEstado] = useState<Estado>('carregando');

  const [whatsappAberto, setWhatsappAberto] = useState(false);
  const [confirmacao, setConfirmacao] = useState<'registrar' | 'revogar' | null>(null);
  const [registrando, setRegistrando] = useState(false);
  const [etiquetas, setEtiquetas] = useState<Etiqueta[]>([]);
  // Objeto estável enquanto o modal está aberto (o modal reinicia a seleção quando ele muda).
  const [etiquetasDe, setEtiquetasDe] = useState<{ id: string; name: string; tags: ClientProfileDto['etiquetas'] } | null>(null);
  const [cadastro, setCadastro] = useState<Client | null>(null);

  const carregar = useCallback(
    async (silencioso = false) => {
      if (!silencioso) setEstado('carregando');
      try {
        const p = await buscarPerfil(clienteId);
        // Recarga silenciosa (depois de etiquetas/cadastro) mantém a mesma ficha técnica,
        // para não apagar o que está sendo editado nela sem salvar.
        setPerfil((anterior) => (silencioso && anterior ? { ...p, fichaTecnica: anterior.fichaTecnica } : p));
        setEstado('pronto');
      } catch (e) {
        if (silencioso) {
          showToast('Erro ao atualizar a ficha', 'error');
          return;
        }
        setEstado(statusDoErro(e) === 404 ? 'nao_encontrada' : 'erro');
      }
    },
    [clienteId, showToast],
  );

  useEffect(() => {
    carregar();
  }, [carregar]);

  if (estado === 'nao_encontrada') {
    return (
      <div className="flex flex-col items-center gap-3 rounded-2xl bg-surface px-4 py-16 text-center shadow-sm">
        <Icon name="person_off" size={40} className="text-muted" />
        <p className="text-[16px] font-bold text-ink">Cliente não encontrada</p>
        <p className="max-w-sm text-[14px] text-muted">Ela pode ter sido removida ou o link está incorreto.</p>
        <Link href="/clientes" className="mt-1 text-[14px] font-bold text-brand-text hover:underline">
          Voltar para clientes
        </Link>
      </div>
    );
  }

  if (estado === 'erro') {
    return (
      <div className="flex flex-col items-center gap-3 rounded-2xl bg-surface px-4 py-16 text-center shadow-sm">
        <Icon name="error" size={40} className="text-muted" />
        <p className="text-[16px] font-bold text-ink">Não foi possível carregar a ficha</p>
        <Button variant="secondary" onClick={() => carregar()}>
          Tentar de novo
        </Button>
      </div>
    );
  }

  if (estado === 'carregando' || !perfil) {
    return (
      <div className="flex flex-col gap-6">
        <Skeleton className="h-36 w-full" label="Carregando ficha da cliente..." />
        <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-28 w-full" />
          ))}
        </div>
        <Skeleton className="h-80 w-full" />
      </div>
    );
  }

  const { cliente, indicadores, consentimento } = perfil;
  const temTelefone = linkWhatsapp(cliente.phone, 'x') !== null;

  const mensagemWhatsapp = preencherMensagem(MENSAGENS.pos_atendimento, {
    nome: primeiroNome(cliente.name),
    servico: indicadores.ultimaVisita?.servico,
    negocio: nomeNegocio,
  });

  const abrirEtiquetas = async () => {
    try {
      setEtiquetas(await listarEtiquetas());
    } catch {
      setEtiquetas([]);
    }
    setEtiquetasDe({ id: cliente.id, name: cliente.name, tags: perfil.etiquetas });
  };

  // O perfil não traz endereço: edita a partir do cadastro completo para não apagá-lo ao salvar.
  const abrirCadastro = async () => {
    try {
      const { data } = await api.get<Client[]>('/clients');
      const completo = Array.isArray(data) ? data.find((c) => c.id === cliente.id) : undefined;
      if (!completo) {
        showToast('Cliente não encontrada', 'error');
        return;
      }
      setCadastro(completo);
    } catch {
      showToast('Erro ao carregar cliente', 'error');
    }
  };

  const salvarCadastro = async (data: ClientFormData) => {
    try {
      await api.put(`/clients/${cliente.id}`, {
        name: data.name,
        phone: data.phone,
        email: data.email || null,
        birth_date: data.birthDate || null,
        address: data.address || null,
        notes: data.notes || null,
      });
      showToast('Cliente atualizada com sucesso', 'success');
      carregar(true);
    } catch (error) {
      showToast(getApiErrorMessage(error, 'Erro ao atualizar cliente'), 'error');
      throw error;
    }
  };

  const confirmarConsentimento = async () => {
    if (!confirmacao) return;
    setRegistrando(true);
    try {
      const novo = await registrarConsentimento(cliente.id, confirmacao === 'registrar');
      setPerfil((p) => (p ? { ...p, consentimento: novo } : p));
      showToast(confirmacao === 'registrar' ? 'Consentimento registrado' : 'Consentimento revogado', 'success');
      setConfirmacao(null);
    } catch {
      showToast('Erro ao salvar o consentimento', 'error');
    } finally {
      setRegistrando(false);
    }
  };

  const faixaLgpd = (): ReactNode => {
    if (consentimento.estado === 'consentido') {
      const detalhe = [
        consentimento.desde ? `Autorizado em ${formatDataNegocio(consentimento.desde)}` : 'Autorizado',
        consentimento.canal ? ROTULO_CANAL[consentimento.canal] : null,
      ]
        .filter(Boolean)
        .join(' · ');
      return (
        <>
          <div className="flex items-center gap-2">
            <Icon name="verified_user" size={18} className="shrink-0 text-success-text" />
            <span className="text-[13px] text-ink">
              <strong className="font-semibold text-success-text">LGPD:</strong>{' '}
              <span>Consentimento ativo para WhatsApp e lembretes</span>
            </span>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-[12px] text-muted">{detalhe}</span>
            <button type="button" onClick={() => setConfirmacao('revogar')} className="text-[12px] font-bold text-danger hover:underline">
              Revogar
            </button>
          </div>
        </>
      );
    }
    if (consentimento.estado === 'revogado') {
      return (
        <>
          <div className="flex items-center gap-2">
            <Icon name="block" size={18} className="shrink-0 text-danger" />
            <span className="text-[13px] text-ink">
              {consentimento.desde ? `Consentimento revogado em ${formatDataNegocio(consentimento.desde)}` : 'Consentimento revogado'}
            </span>
          </div>
          <Button variant="secondary" size="sm" onClick={() => setConfirmacao('registrar')}>
            Registrar novo consentimento
          </Button>
        </>
      );
    }
    return (
      <>
        <div className="flex items-center gap-2">
          <Icon name="shield" size={18} className="shrink-0 text-warning-text" />
          <span className="text-[13px] text-ink">Consentimento não informado</span>
        </div>
        <Button variant="secondary" size="sm" onClick={() => setConfirmacao('registrar')}>
          Registrar consentimento
        </Button>
      </>
    );
  };

  const indicador = (testId: string, rotulo: string, icone: string, valor: ReactNode, legenda?: ReactNode) => (
    <div data-testid={testId} className="flex min-h-[96px] flex-col justify-between rounded-2xl bg-surface p-4 shadow-sm">
      <div className="mb-2 flex items-start justify-between gap-2">
        <span className="text-[12px] font-semibold text-muted sm:text-[13px]">{rotulo}</span>
        <div className="hidden h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-surface-2 text-ink sm:flex">
          <Icon name={icone} size={16} />
        </div>
      </div>
      <div>
        <div className="flex items-baseline gap-1.5 text-ink">{valor}</div>
        {legenda ? <div className="mt-1 text-[12px] text-muted">{legenda}</div> : null}
      </div>
    </div>
  );

  const numeroGrande = 'text-[24px] font-bold tabular-nums sm:text-[28px]';
  const ano = anoAtualNegocio();

  return (
    <div className="flex w-full flex-col">
      <nav aria-label="Navegação estrutural" className="mb-4 flex select-none items-center gap-2 text-[13px]">
        <Link href="/clientes" className="flex items-center gap-1 font-semibold text-muted transition-colors hover:text-ink">
          <Icon name="group" size={16} />
          Clientes
        </Link>
        <span className="text-muted" aria-hidden="true">
          ›
        </span>
        <span className="truncate font-bold text-ink" aria-current="page">
          {cliente.name}
        </span>
      </nav>

      {/* Cabeçalho da cliente */}
      <section className="mb-6 rounded-2xl bg-surface p-4 shadow-sm sm:p-6">
        <div className="flex flex-col justify-between gap-5 lg:flex-row lg:items-center">
          <div className="flex items-start gap-4 md:items-center">
            <Avatar name={cliente.name} size={64} className="text-[22px]" />
            <div className="flex min-w-0 flex-col gap-1">
              <div className="flex flex-wrap items-center gap-2.5">
                <h1 className="text-[24px] font-bold tracking-tight text-ink">{cliente.name}</h1>
                <span
                  className={cn(
                    'inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-1 text-[12px] font-bold',
                    FASE_CORES[perfil.fase].fundo,
                    FASE_CORES[perfil.fase].texto,
                  )}
                >
                  <span className={cn('h-1.5 w-1.5 rounded-full', FASE_CORES[perfil.fase].ponto)} />
                  {FASE_ROTULO[perfil.fase]}
                </span>
              </div>
              <span className="text-[13px] tabular-nums text-muted">{cliente.phone ? formatPhone(cliente.phone) : 'Sem telefone'}</span>
              {(perfil.etiquetas.length > 0 || perfil.etiquetasAuto.length > 0) && (
                <div className="mt-1 flex flex-wrap items-center gap-2">
                  {perfil.etiquetas.map((t) => (
                    <span
                      key={t.id}
                      className={cn('inline-flex items-center rounded-full px-2.5 py-0.5 text-[12px] font-semibold', ETIQUETA_CORES[t.color] ?? ETIQUETA_CORES.muted)}
                    >
                      {t.name}
                    </span>
                  ))}
                  {perfil.etiquetasAuto.map((nome) => (
                    <span key={nome} className="inline-flex items-center rounded-full bg-surface-2 px-2.5 py-0.5 text-[12px] font-semibold text-muted">
                      {nome}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="grid shrink-0 grid-cols-[1fr_1fr_auto] items-center gap-2 sm:flex sm:flex-wrap">
            <Button
              variant="whatsapp"
              onClick={() => setWhatsappAberto(true)}
              disabled={!temTelefone}
              title={temTelefone ? undefined : 'Cadastre o telefone da cliente'}
              className="rounded-xl px-3 sm:px-4"
            >
              <Icon name="chat" size={18} />
              <span className="sm:hidden">WhatsApp</span>
              <span className="hidden sm:inline">Conversar no WhatsApp</span>
            </Button>
            <Link
              href={`/agendamentos?novo=1&cliente=${cliente.id}`}
              className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-brand px-3 text-[15px] font-bold text-on-brand shadow-sm transition-colors hover:bg-brand/90 sm:px-5"
            >
              <Icon name="add_circle" size={18} />
              Novo agendamento
            </Link>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  aria-label="Mais opções da cliente"
                  className="flex h-11 w-11 items-center justify-center rounded-xl bg-surface-2 text-ink transition-colors hover:bg-line/60"
                >
                  <Icon name="more_vert" size={20} />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onSelect={abrirCadastro}>
                  <Icon name="edit" size={18} className="text-muted" />
                  Editar cadastro
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={abrirEtiquetas}>
                  <Icon name="sell" size={18} className="text-muted" />
                  Etiquetas
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {/* Faixa LGPD */}
        <div className="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-xl bg-surface-2/60 px-4 py-2.5">{faixaLgpd()}</div>
      </section>

      {/* Indicadores: 2×2 no celular, 4 em linha no desktop largo */}
      <section aria-label="Indicadores da cliente" className="mb-6 grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        {indicador(
          'indicador-ciclo',
          'Ciclo médio de retorno',
          'sync',
          indicadores.cicloMedio === null ? (
            <span className={cn(numeroGrande, 'text-muted')}>—</span>
          ) : (
            <>
              <span className={numeroGrande}>{indicadores.cicloMedio}</span>
              <span className="text-[15px] font-medium"> dias</span>
            </>
          ),
          indicadores.retornoPrevisto.data ? `Retorno previsto: ${indicadores.retornoPrevisto.texto}` : undefined,
        )}
        {indicador(
          'indicador-ticket',
          'Ticket médio',
          'payments',
          indicadores.ticketMedio === null ? (
            <span className={cn(numeroGrande, 'text-muted')}>—</span>
          ) : (
            <span className={numeroGrande}>{formatCurrency(indicadores.ticketMedio)}</span>
          ),
        )}
        {indicador(
          'indicador-frequencia',
          'Frequência presencial',
          'check_circle',
          <>
            <span className={numeroGrande}>{indicadores.visitasNoAno}</span>
            <span className="text-[15px] font-medium">
              {' '}
              {indicadores.visitasNoAno === 1 ? 'visita' : 'visitas'} em {ano}
            </span>
          </>,
        )}
        {indicador(
          'indicador-faltas',
          'Faltas / cancelamentos',
          'event_busy',
          <span className={numeroGrande}>{indicadores.faltasECancelamentos}</span>,
        )}
      </section>

      {/* Corpo: ficha técnica e galeria à esquerda, linha do tempo à direita */}
      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-12">
        <div className="flex flex-col gap-6 lg:col-span-5">
          <FichaTecnica
            clienteId={cliente.id}
            ficha={perfil.fichaTecnica}
            onSalva={(ficha) => setPerfil((p) => (p ? { ...p, fichaTecnica: ficha } : p))}
          />
          <GaleriaCliente clienteId={cliente.id} />
        </div>
        <LinhaDoTempoCliente clienteId={cliente.id} className="lg:col-span-7" />
      </div>

      <MensagemWhatsappModal
        isOpen={whatsappAberto}
        onClose={() => setWhatsappAberto(false)}
        telefone={cliente.phone}
        nomeCliente={cliente.name}
        mensagemInicial={mensagemWhatsapp}
      />

      <Modal
        isOpen={confirmacao !== null}
        onClose={() => setConfirmacao(null)}
        title={confirmacao === 'revogar' ? 'Revogar consentimento' : 'Registrar consentimento'}
        icon={confirmacao === 'revogar' ? 'block' : 'verified_user'}
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirmacao(null)}>
              Cancelar
            </Button>
            {confirmacao === 'revogar' ? (
              <Button variant="danger" onClick={confirmarConsentimento} loading={registrando}>
                Revogar consentimento
              </Button>
            ) : (
              <Button onClick={confirmarConsentimento} loading={registrando}>
                Sim, autorizou
              </Button>
            )}
          </>
        }
      >
        <p className="text-[14px] text-ink">
          {confirmacao === 'revogar'
            ? 'A cliente deixa de receber mensagens e lembretes pelo WhatsApp.'
            : 'A cliente autorizou receber mensagens e lembretes pelo WhatsApp?'}
        </p>
      </Modal>

      <EtiquetasClienteModal
        cliente={etiquetasDe}
        etiquetas={etiquetas}
        onClose={() => setEtiquetasDe(null)}
        onSalvo={() => {
          setEtiquetasDe(null);
          carregar(true);
        }}
      />

      <ClientFormModal
        isOpen={cadastro !== null}
        onClose={() => setCadastro(null)}
        onSubmit={salvarCadastro}
        editingClient={cadastro}
      />
    </div>
  );
}
