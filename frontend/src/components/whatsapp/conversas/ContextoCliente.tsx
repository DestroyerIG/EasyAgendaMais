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
      showToast(getApiErrorMessage(e, 'Erro ao cadastrar cliente'), 'error');
      throw e;
    }
    showToast('Cliente cadastrada!', 'success');
    onCadastrada();
  };
  return <ClientFormModal isOpen={aberto} onClose={onFechar} onSubmit={salvar} editingClient={null} initialPhone={formatarTelefone(telefone)} />;
}

function Agendamento({ ag, onAtualizar }: { ag: AgendamentoRelacionadoDto; onAtualizar: () => void }) {
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
    <section aria-label="Agendamento relacionado" className="flex flex-col gap-2">
      <h4 className="text-[11px] font-bold uppercase tracking-wider text-muted">Agendamento relacionado</h4>
      <div className="flex flex-col gap-2 rounded-xl bg-surface-2 p-3">
        <div className="flex items-start justify-between gap-2">
          <p className="text-[14px] font-bold text-ink">{ag.servico}</p>
          <span className={cn('shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold', status.classe)}>{status.rotulo}</span>
        </div>
        <p className="text-[13px] text-ink">{dataDoAgendamento(ag.data, ag.hora)}</p>
        <p className="text-[13px] text-muted">{formatCurrency(ag.valor)}</p>
        <p className="text-[13px] text-muted">{`Profissional: ${ag.profissional}`}</p>
        {ag.sinal != null ? <p className="text-[13px] text-muted">{`Sinal: ${formatCurrency(ag.sinal)}`}</p> : null}
        {aguardando ? (
          <>
            <p className="text-[12px] text-muted">
              {`O bot aguarda a confirmação deste sinal Pix de ${formatCurrency(ag.sinal ?? 0)} para travar a vaga na agenda de ${ag.profissional}.`}
            </p>
            <Button size="sm" loading={confirmando} onClick={() => void confirmar()}>Confirmar agendamento</Button>
          </>
        ) : null}
      </div>
    </section>
  );
}

/** Coluna 3 da central (e painel recolhível no celular): quem é a cliente e o que está em andamento. */
export function ContextoCliente({ contexto, conversa, onAtualizar, onCadastrarCliente }: ContextoClienteProps) {
  const [cadastrando, setCadastrando] = useState(false);

  if (!contexto) {
    if (conversa.clientId) return null; // contexto ainda carregando
    const abrir = onCadastrarCliente ?? (() => setCadastrando(true));
    return (
      <aside aria-label="Contexto da cliente" className="flex flex-col gap-3 rounded-xl bg-surface p-4 shadow-sm">
        <div className="flex flex-col gap-1">
          <h3 className="text-[14px] font-bold text-ink">Contato sem cadastro</h3>
          <p className="font-mono text-[12px] text-muted">{formatarTelefone(conversa.telefone)}</p>
        </div>
        <Button size="sm" variant="secondary" onClick={abrir}>Cadastrar cliente</Button>
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
    <aside aria-label="Contexto da cliente" className="flex flex-col gap-4 rounded-xl bg-surface p-4 shadow-sm">
      <div className="flex flex-col gap-2">
        {cores ? (
          <span className={cn('inline-flex w-fit items-center gap-1 rounded-full px-2.5 py-1 text-[12px] font-semibold', cores.fundo, cores.texto)}>
            <span className={cn('h-1.5 w-1.5 rounded-full', cores.ponto)} />
            {FASE_ROTULO[fase]}
          </span>
        ) : null}
        <h3 className="text-[16px] font-bold text-ink">{contexto.cliente.nome}</h3>
        <p className="text-[12px] text-muted">{cadastradaHa(contexto.cliente.desde)}</p>
      </div>

      <dl className="grid grid-cols-2 gap-3">
        <div className="rounded-xl bg-surface-2 p-3">
          <dt className="text-[11px] font-bold uppercase tracking-wider text-muted">LTV acumulado</dt>
          <dd className="text-[16px] font-bold text-ink">{formatCurrency(contexto.ltv, { cents: false })}</dd>
        </div>
        <div className="rounded-xl bg-surface-2 p-3">
          <dt className="text-[11px] font-bold uppercase tracking-wider text-muted">Ciclo médio</dt>
          <dd className="text-[16px] font-bold text-ink">{contexto.cicloMedio != null ? `${contexto.cicloMedio} dias` : '—'}</dd>
        </div>
      </dl>

      {contexto.agendamento ? <Agendamento ag={contexto.agendamento} onAtualizar={onAtualizar} /> : null}

      <section aria-label="Histórico recente" className="flex flex-col gap-2">
        <h4 className="text-[11px] font-bold uppercase tracking-wider text-muted">Histórico recente</h4>
        {visitas.length === 0 ? (
          <p className="text-[13px] text-muted">Nenhuma visita ainda.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {visitas.map((v) => {
              const [, m, d] = dataParte(v.data);
              return (
                <li key={`${v.data}-${v.servico}`} className="flex flex-col rounded-xl bg-surface-2 p-3">
                  <span className="text-[13px] font-bold text-ink">{`${doisDigitos(d)}/${doisDigitos(m)} • ${v.servico}`}</span>
                  <span className="flex items-center gap-1 text-[12px] text-muted">
                    <Icon name="check_circle" size={14} className="text-success-text" />
                    {`${formatCurrency(v.valor, { cents: false })} (Pago)`}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </aside>
  );
}
