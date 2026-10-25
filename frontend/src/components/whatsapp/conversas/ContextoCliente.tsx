'use client';

import { useState } from 'react';
import { Button, Icon } from '@/components/ui';
import { ClientFormModal, type ClientFormData } from '@/components/clients/ClientFormModal';
import { FASE_CORES } from '@/components/clientes/ListaClientes';
import { useToast } from '@/components/Toast';
import api from '@/lib/api';
import { cn } from '@/lib/cn';
import { FASE_ROTULO, type Fase } from '@/lib/crm';
import { formatCurrency } from '@/lib/formatters';
import { formatarTelefone, type AgendamentoRelacionadoDto, type ContextoClienteDto, type ConversaResumoDto } from '@/lib/whatsappInbox';
import { getApiErrorMessage } from '@/utils/handleApiError';
import { Avatar } from '@/components/ui/Avatar';
import { useVocabulario } from '@/hooks/useVocabulario';

interface ContextoClienteProps {
  contexto: ContextoClienteDto | null;
  conversa: ConversaResumoDto;
  onAtualizar: () => void;
  /** Quando informado, o "Cadastrar cliente" daqui só avisa quem controla o cadastro (a central). */
  onCadastrarCliente?: () => void;
}

const DIAS_SEMANA = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];

const STATUS_AGENDAMENTO: Record<string, { rotulo: string; classe: string }> = {
  aguardando_pagamento: { rotulo: 'Sinal pendente', classe: 'bg-warning/12 text-warning-text' },
  confirmado: { rotulo: 'Confirmado', classe: 'bg-success/12 text-success-text' },
  em_atendimento: { rotulo: 'Em atendimento', classe: 'bg-brand/12 text-brand-text' },
};

const MESES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
const CARTAO = 'flex min-w-0 flex-col gap-2 rounded-xl bg-surface p-4 shadow-sm';

const dataParte = (iso: string) => iso.slice(0, 10).split('-').map(Number) as [number, number, number];
const doisDigitos = (n: number) => String(n).padStart(2, '0');

function dataDoAgendamento(data: string, hora: string): string {
  const [a, m, d] = dataParte(data);
  const dia = DIAS_SEMANA[new Date(Date.UTC(a, m - 1, d)).getUTCDay()];
  return `${dia}, ${doisDigitos(d)}/${doisDigitos(m)} • ${hora}`;
}

function cadastradaHa(desde: string, agora: Date = new Date()): string {
  const inicio = new Date(desde);
  let meses = (agora.getFullYear() - inicio.getFullYear()) * 12 + (agora.getMonth() - inicio.getMonth());
  if (agora.getDate() < inicio.getDate()) meses -= 1;
  if (meses >= 1) return `Cadastrada há ${meses} ${meses === 1 ? 'mês' : 'meses'}`;
  const dias = Math.max(0, Math.floor((agora.getTime() - inicio.getTime()) / 86400000));
  return `Cadastrada há ${dias} ${dias === 1 ? 'dia' : 'dias'}`;
}

/** Cadastro rápido a partir de uma conversa de número sem cliente (mesmo payload de ClientModule). */
export function CadastroRapidoCliente({ aberto, telefone, onFechar, onCadastrada }: {
  aberto: boolean; telefone: string; onFechar: () => void; onCadastrada: () => void;
}) {
  const { showToast } = useToast();
  const { cli } = useVocabulario();
  const salvar = async (data: ClientFormData) => {
    try {
      await api.post('/clients', {
        name: data.name,
        phone: data.phone,
        email: data.email || null,
        birth_date: data.birthDate || null,
        address: data.address || null,
        notes: data.notes || null,
      });
    } catch (e) {
      showToast(getApiErrorMessage(e, `Erro ao cadastrar ${cli.s}`), 'error');
      throw e;
    }
    showToast(`${cli.S} ${cli.g('cadastrada', 'cadastrado')}!`, 'success');
    onCadastrada();
  };
  return <ClientFormModal isOpen={aberto} onClose={onFechar} onSubmit={salvar} editingClient={null} initialPhone={formatarTelefone(telefone)} />;
}

function Agendamento({ ag, onAtualizar }: { ag: AgendamentoRelacionadoDto; onAtualizar: () => void }) {
  const { prof } = useVocabulario();
  const { showToast } = useToast();
  const [confirmando, setConfirmando] = useState(false);
  const status = STATUS_AGENDAMENTO[ag.status] ?? { rotulo: ag.status.replace(/_/g, ' '), classe: 'bg-surface-2 text-muted' };
  const aguardando = ag.status === 'aguardando_pagamento';

  const confirmar = async () => {
    setConfirmando(true);
    try {
      await api.put(`/appointments/${ag.id}/status`, { status: 'confirmado' });
      showToast('Pagamento confirmado!', 'success');
      onAtualizar();
    } catch (e) {
      showToast(getApiErrorMessage(e, 'Erro ao atualizar status'), 'error');
    } finally {
      setConfirmando(false);
    }
  };

  return (
    <section aria-label="Agendamento relacionado" className={CARTAO}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h4 className="min-w-0 text-[13px] font-bold text-ink">Agendamento Relacionado</h4>
        <span className={cn('shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold', status.classe)}>{status.rotulo}</span>
      </div>
      <div className="flex min-w-0 flex-col gap-1 rounded-lg bg-surface-m3-low p-2">
        <p className="flex min-w-0 items-center gap-2 break-words text-[15px] font-bold text-ink">
          <Icon name="calendar_month" size={18} className="shrink-0 text-brand-text" />
          {dataDoAgendamento(ag.data, ag.hora)}
        </p>
        <p className="min-w-0 break-words pl-6 text-[13px] text-muted">{ag.servico}</p>
        <p className="pl-6 font-mono text-[13px] font-bold text-muted">{formatCurrency(ag.valor)}</p>
        <p className="flex min-w-0 flex-wrap items-center justify-between gap-x-2 break-words pl-6 text-[11px] text-muted">
          <span>{`${prof.S}: ${ag.profissional}`}</span>
          {ag.sinal != null ? <span>{`Sinal: ${formatCurrency(ag.sinal)}`}</span> : null}
        </p>
      </div>
      {aguardando ? (
        <>
          <p className="flex items-start gap-2 rounded-lg bg-warning/10 p-2.5 text-[11px] leading-snug text-muted">
            <Icon name="info" size={16} className="mt-0.5 shrink-0 text-warning-text" />
            <span>
              {ag.sinal != null
                ? `O bot aguarda a confirmação deste sinal Pix de ${formatCurrency(ag.sinal)} para travar a vaga na agenda de ${ag.profissional}.`
                : `O bot aguarda a confirmação do sinal Pix para travar a vaga na agenda de ${ag.profissional}.`}
            </span>
          </p>
          <Button fullWidth loading={confirmando} onClick={() => void confirmar()} className="gap-2">
            {!confirmando ? <Icon name="verified" size={18} /> : null}
            Confirmar agendamento
          </Button>
        </>
      ) : null}
    </section>
  );
}

/** Coluna 3 da central (e painel recolhível no celular): quem é a cliente e o que está em andamento. */
export function ContextoCliente({ contexto, conversa, onAtualizar, onCadastrarCliente }: ContextoClienteProps) {
  const { cli } = useVocabulario();
  const [cadastrando, setCadastrando] = useState(false);

  if (!contexto) {
    if (conversa.clientId) return null; // contexto ainda carregando
    const abrir = onCadastrarCliente ?? (() => setCadastrando(true));
    return (
      <aside aria-label={`Contexto ${cli.doS}`} className="flex flex-col gap-3 bg-surface-m3-low p-4">
        <div className={CARTAO}>
          <h3 className="text-[14px] font-bold text-ink">Contato sem cadastro</h3>
          <p className="font-mono text-[12px] text-muted">{formatarTelefone(conversa.telefone)}</p>
          <Button size="sm" variant="secondary" onClick={abrir}>Cadastrar {cli.s}</Button>
        </div>
        {onCadastrarCliente ? null : (
          <CadastroRapidoCliente
            aberto={cadastrando}
            telefone={conversa.telefone}
            onFechar={() => setCadastrando(false)}
            onCadastrada={onAtualizar}
          />
        )}
      </aside>
    );
  }

  const fase = contexto.fase as Fase;
  const cores = FASE_CORES[fase];
  const visitas = contexto.ultimasVisitas.slice(0, 2);

  return (
    <aside aria-label={`Contexto ${cli.doS}`} className="flex min-w-0 flex-col gap-4 bg-surface-m3-low p-4">
      <div className="flex items-start justify-between gap-2">
        <h3 className="text-[13px] font-bold leading-5 text-ink">Contexto {cli.doS}</h3>
        {cores ? (
          <span className={cn('inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold', cores.fundo, cores.texto)}>
            <span className={cn('h-1.5 w-1.5 rounded-full', cores.ponto)} />
            {FASE_ROTULO[fase]}
          </span>
        ) : null}
      </div>

      <div className={CARTAO}>
        <div className="flex items-center gap-3">
          <Avatar name={contexto.cliente.nome} src={conversa.avatarUrl} size={48} className="text-[15px] font-bold text-muted" />
          <div className="flex min-w-0 flex-col">
            <p className="break-words text-[16px] font-bold leading-5 text-ink">{contexto.cliente.nome}</p>
            <p className="font-mono text-[11px] text-muted">{cadastradaHa(contexto.cliente.desde)}</p>
          </div>
        </div>
        <dl className="grid grid-cols-2 gap-2 pt-1">
          <div className="flex min-w-0 flex-col rounded-lg bg-surface-m3-low p-2">
            <dt className="text-[11px] text-muted">LTV Acumulado</dt>
            <dd className="break-words font-mono text-[14px] font-bold text-ink">{formatCurrency(contexto.ltv, { cents: false })}</dd>
          </div>
          <div className="flex min-w-0 flex-col rounded-lg bg-surface-m3-low p-2">
            <dt className="text-[11px] text-muted">Ciclo Médio</dt>
            <dd className="break-words font-mono text-[14px] font-bold text-ink">{contexto.cicloMedio != null ? `${contexto.cicloMedio} dias` : '—'}</dd>
          </div>
        </dl>
      </div>

      {contexto.agendamento ? <Agendamento ag={contexto.agendamento} onAtualizar={onAtualizar} /> : null}

      <section aria-label="Histórico recente" className={CARTAO}>
        <h4 className="text-[13px] font-bold text-ink">Histórico Recente</h4>
        {visitas.length === 0 ? (
          <p className="text-[13px] text-muted">Nenhuma visita ainda.</p>
        ) : (
          <ul className="flex flex-col gap-2 text-[13px]">
            {visitas.map((v) => {
              const [, m, d] = dataParte(v.data);
              return (
                <li key={`${v.data}-${v.servico}`} className="flex min-w-0 flex-wrap items-start justify-between gap-x-2 text-muted">
                  <span className="min-w-0 break-words">{`${doisDigitos(d)}/${MESES[m - 1]} • ${v.servico}`}</span>
                  <span className="shrink-0 font-mono font-bold text-success-text">{`${formatCurrency(v.valor, { cents: false })} (Pago)`}</span>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </aside>
  );
}
