'use client';

import { useState, type ReactNode } from 'react';
import Link from 'next/link';
import { Button, Card, Icon, buttonVariants } from '@/components/ui';
import { MensagemWhatsappModal } from '@/components/clientes/MensagemWhatsappModal';
import { cn } from '@/lib/cn';
import { formatCurrency } from '@/lib/formatters';
import type { Pendencia } from '@/lib/hoje';
import { MENSAGENS, preencherMensagem } from '@/lib/whatsappLink';

export interface PainelPendenciasProps {
  /** Pendências reais do dia (GET /dashboard/today), já na ordem em que aparecem. */
  pendencias: readonly Pendencia[];
  /** Nome do negócio, para as mensagens de WhatsApp ("… aqui no {negocio}"). */
  businessName: string;
  className?: string;
}

type Avaliacao = Extract<Pendencia, { tipo: 'avaliacao' }>['avaliacoes'][number];

interface Mensagem {
  telefone: string;
  nomeCliente: string;
  texto: string;
  contexto?: ReactNode;
}

const plural = (n: number, singular: string, pluralTexto: string) => (n === 1 ? singular : pluralTexto);
const primeiroNome = (nome: string) => nome.trim().split(/\s+/)[0] ?? nome;

const doisDigitos = (n: number) => String(n).padStart(2, '0');

// "Hoje às 18:30" / "Ontem às 18:30" / "12/10 às 18:30" — hora local da dona.
export function quandoFoi(iso: string, agora: Date = new Date()): string {
  const data = new Date(iso);
  const hora = `${doisDigitos(data.getHours())}:${doisDigitos(data.getMinutes())}`;
  const ontem = new Date(agora);
  ontem.setDate(agora.getDate() - 1);
  if (data.toDateString() === agora.toDateString()) return `Hoje às ${hora}`;
  if (data.toDateString() === ontem.toDateString()) return `Ontem às ${hora}`;
  return `${doisDigitos(data.getDate())}/${doisDigitos(data.getMonth() + 1)} às ${hora}`;
}

// Linha de pendência (hoje-desktop.html): ícone, título + descrição e a ação à direita.
function LinhaPendencia({
  icone,
  tomIcone,
  titulo,
  descricao,
  acao,
  children,
}: {
  icone: string;
  tomIcone: string;
  titulo: string;
  descricao: string;
  acao: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-line/50 bg-surface-2/60 p-3.5 transition-colors hover:bg-surface-2">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <div className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-surface-2', tomIcone)}>
            <Icon name={icone} size={20} />
          </div>
          <div className="flex min-w-0 flex-col">
            <span className="truncate text-[13px] font-bold text-ink">{titulo}</span>
            <span className="text-[12px] text-muted">{descricao}</span>
          </div>
        </div>
        <div className="shrink-0">{acao}</div>
      </div>
      {children}
    </div>
  );
}

function ContextoAvaliacao({ avaliacao }: { avaliacao: Avaliacao }) {
  return (
    <div className="flex flex-col gap-1 rounded-xl border border-line bg-surface-2 p-3">
      <span className="flex items-center gap-1 text-[13px] font-bold text-danger">
        <Icon name="star" size={15} filled />
        {`Nota ${avaliacao.nota} de 5`}
      </span>
      <p className="text-[13px] text-ink">{avaliacao.comentario ?? 'Sem comentário.'}</p>
    </div>
  );
}

export function PainelPendencias({ pendencias, businessName, className }: PainelPendenciasProps) {
  const [mensagem, setMensagem] = useState<Mensagem | null>(null);
  const [aberta, setAberta] = useState<'retorno_vencido' | 'avaliacao' | null>(null);

  const alternar = (tipo: 'retorno_vencido' | 'avaliacao') => setAberta((atual) => (atual === tipo ? null : tipo));

  const responderAvaliacao = (avaliacao: Avaliacao) =>
    setMensagem({
      telefone: avaliacao.phone,
      nomeCliente: avaliacao.cliente,
      texto: preencherMensagem(MENSAGENS.resposta_avaliacao, { nome: primeiroNome(avaliacao.cliente), negocio: businessName }),
      contexto: <ContextoAvaliacao avaliacao={avaliacao} />,
    });

  const renderizar = (pendencia: Pendencia) => {
    switch (pendencia.tipo) {
      case 'vagas_tarde':
        return (
          <LinhaPendencia
            key="vagas_tarde"
            icone="calendar_today"
            tomIcone="text-brand"
            titulo={`${pendencia.quantidade} ${plural(pendencia.quantidade, 'horário vago', 'horários vagos')} à tarde`}
            descricao={pendencia.vagas
              .slice(0, 3)
              .map((vaga) => `${vaga.inicio} com ${vaga.profissional}`)
              .join(', ')}
            acao={
              // Até o painel da lista de espera existir, leva para a Agenda.
              <Link href="/agendamentos" className={buttonVariants({ variant: 'secondary', size: 'sm' })}>
                Oferecer à lista de espera
              </Link>
            }
          />
        );
      case 'retorno_vencido':
        return (
          <LinhaPendencia
            key="retorno_vencido"
            icone="sync"
            tomIcone="text-whatsapp"
            titulo={`${pendencia.quantidade} ${plural(pendencia.quantidade, 'cliente', 'clientes')} com retorno vencido`}
            descricao="Passaram do prazo ideal de voltar"
            acao={
              <Button
                variant="whatsapp"
                size="sm"
                aria-expanded={aberta === 'retorno_vencido'}
                onClick={() => alternar('retorno_vencido')}
              >
                <Icon name="send" size={15} />
                Lembrar no WhatsApp
              </Button>
            }
          >
            {aberta === 'retorno_vencido' ? (
              <ul className="flex flex-col divide-y divide-line/60 rounded-xl border border-line/60 bg-surface">
                {pendencia.clientes.map((cliente) => (
                  <li key={cliente.id} className="flex items-center justify-between gap-3 px-3 py-2.5">
                    <div className="flex min-w-0 flex-col">
                      <span className="truncate text-[13px] font-bold text-ink">{cliente.name}</span>
                      <span className="text-[12px] text-muted">
                        {cliente.servico} · venceu há {cliente.venceuHa} {plural(cliente.venceuHa, 'dia', 'dias')}
                      </span>
                    </div>
                    <Button
                      variant="secondary"
                      size="sm"
                      aria-label={`Enviar mensagem para ${cliente.name}`}
                      onClick={() =>
                        setMensagem({
                          telefone: cliente.phone,
                          nomeCliente: cliente.name,
                          texto: preencherMensagem(MENSAGENS.retorno_vencido, {
                            nome: primeiroNome(cliente.name),
                            servico: cliente.servico,
                            negocio: businessName,
                          }),
                        })
                      }
                    >
                      <Icon name="chat" size={15} className="text-whatsapp" />
                      Enviar
                    </Button>
                  </li>
                ))}
              </ul>
            ) : null}
          </LinhaPendencia>
        );
      case 'sinais_pix':
        return (
          <LinhaPendencia
            key="sinais_pix"
            icone="qr_code_2"
            tomIcone="text-warning"
            titulo={`${pendencia.quantidade} ${plural(pendencia.quantidade, 'sinal Pix', 'sinais Pix')} aguardando pagamento`}
            descricao={`Expira em ${Math.max(0, pendencia.expiraEmMinutos)} min (${formatCurrency(pendencia.total)} pendentes)`}
            acao={
              <Link
                href="/agendamentos?aba=aguardando-pix"
                className={cn(buttonVariants({ variant: 'secondary', size: 'sm' }), 'text-warning-text hover:border-warning/50')}
              >
                Ver pendências
              </Link>
            }
          />
        );
      case 'avaliacao': {
        const [primeira] = pendencia.avaliacoes;
        const varias = pendencia.avaliacoes.length > 1;
        return (
          <LinhaPendencia
            key="avaliacao"
            icone="star_half"
            tomIcone="text-danger"
            titulo={`${pendencia.quantidade} ${plural(pendencia.quantidade, 'avaliação desfavorável', 'avaliações desfavoráveis')}`}
            descricao={primeira ? `Cliente ${primeira.cliente} · ${quandoFoi(primeira.data)}` : ''}
            acao={
              <Button
                variant="secondary"
                size="sm"
                className="text-danger hover:border-danger/40"
                aria-expanded={varias ? aberta === 'avaliacao' : undefined}
                onClick={() => (varias ? alternar('avaliacao') : primeira && responderAvaliacao(primeira))}
              >
                Ver e responder
              </Button>
            }
          >
            {varias && aberta === 'avaliacao' ? (
              <ul className="flex flex-col divide-y divide-line/60 rounded-xl border border-line/60 bg-surface">
                {pendencia.avaliacoes.map((avaliacao) => (
                  <li key={`${avaliacao.clientId}-${avaliacao.data}`} className="flex items-center justify-between gap-3 px-3 py-2.5">
                    <div className="flex min-w-0 flex-col">
                      <span className="truncate text-[13px] font-bold text-ink">{avaliacao.cliente}</span>
                      <span className="text-[12px] text-muted">
                        Nota {avaliacao.nota} · {quandoFoi(avaliacao.data)}
                      </span>
                    </div>
                    <Button
                      variant="secondary"
                      size="sm"
                      aria-label={`Responder ${avaliacao.cliente}`}
                      onClick={() => responderAvaliacao(avaliacao)}
                    >
                      Responder
                    </Button>
                  </li>
                ))}
              </ul>
            ) : null}
          </LinhaPendencia>
        );
      }
    }
  };

  return (
    <Card className={cn('flex flex-col gap-4', className)}>
      <div className="flex items-center justify-between gap-3 border-b border-line pb-3">
        <div className="flex items-center gap-2">
          <h2 className="text-[16px] font-bold text-ink">Precisa de você</h2>
          {/* hoje-desktop.html: pílula com a palavra "pendências"; hoje-mobile.html:
              círculo vermelho só com o número — cada breakpoint com o próprio estilo. */}
          <span className="hidden rounded-full bg-brand/15 px-2 py-0.5 text-[11px] font-bold text-ink lg:inline-flex">
            {`${pendencias.length} ${plural(pendencias.length, 'pendência', 'pendências')}`}
          </span>
          {pendencias.length > 0 ? (
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-danger text-[11px] font-bold text-surface lg:hidden">
              {pendencias.length}
            </span>
          ) : null}
        </div>
        <span className="text-[12px] font-medium text-muted">
          <span className="lg:hidden">Ações rápidas</span>
          <span className="hidden lg:inline">Ações de um clique</span>
        </span>
      </div>

      {pendencias.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-6 text-center">
          <Icon name="task_alt" size={28} className="text-success" />
          <p className="text-[13px] font-semibold text-ink">Tudo em dia por aqui</p>
          <p className="text-[12px] text-muted">Nenhuma pendência pedindo a sua atenção agora.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">{pendencias.map(renderizar)}</div>
      )}

      <MensagemWhatsappModal
        isOpen={mensagem !== null}
        onClose={() => setMensagem(null)}
        telefone={mensagem?.telefone ?? null}
        nomeCliente={mensagem?.nomeCliente ?? ''}
        mensagemInicial={mensagem?.texto ?? ''}
        contexto={mensagem?.contexto}
      />
    </Card>
  );
}
