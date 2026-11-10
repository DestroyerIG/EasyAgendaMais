'use client';

import { useMemo, useState } from 'react';
import { Icon, Modal } from '@/components/ui';
import { ComandaModal } from '@/components/comanda/ComandaModal';
import { useToast } from '@/components/Toast';
import { formatCurrency } from '@/lib/formatters';
import type { AgendamentoHoje } from '@/lib/hoje';

// Botão flutuante "Cobrar Pix" (hoje-mobile.html): só existe no celular — o
// desktop não tem esse botão. Posição/tamanho do arquivo (bottom-20 right-4,
// h-12, z-40); somo a área segura do aparelho ao bottom-20 (a mesma
// env(safe-area-inset-bottom) que BottomNav.tsx já usa) para nunca encostar na
// barra inferior em aparelhos com notch — a barra inferior original do arquivo
// não soma essa folga, e é exatamente o tipo de sobreposição citado no pedido.
//
// O toque leva à comanda do atendimento em andamento, onde o Pix é cobrado (QR Code e
// copia-e-cola). Com mais de um em andamento, pergunta qual cliente.

interface Props {
  /** Atendimentos de hoje (GET /dashboard/today → `proximas`), que já inclui quem está em atendimento. */
  agendamentos: AgendamentoHoje[];
  /** Chamado quando a comanda aberta muda, para o dashboard recarregar. */
  onAtualizada: () => void;
}

export function BotaoCobrarPix({ agendamentos, onAtualizada }: Props) {
  const { showToast } = useToast();
  const [escolhendo, setEscolhendo] = useState(false);
  const [comandaDe, setComandaDe] = useState<string | null>(null);

  // Em atendimento e com a conta ainda aberta (sem comanda ainda, ou em rascunho).
  const emAndamento = useMemo(
    () => agendamentos.filter((a) => a.status === 'em_atendimento' && a.comanda_status !== 'fechada'),
    [agendamentos],
  );

  const tocar = () => {
    if (emAndamento.length === 0) {
      showToast('Nenhum atendimento em andamento. Inicie o atendimento para cobrar.', 'info');
    } else if (emAndamento.length === 1) {
      setComandaDe(emAndamento[0]!.id);
    } else {
      setEscolhendo(true);
    }
  };

  const escolher = (id: string) => {
    setEscolhendo(false);
    setComandaDe(id);
  };

  return (
    <>
      <button
        type="button"
        onClick={tocar}
        className="fixed bottom-[calc(5rem_+_env(safe-area-inset-bottom))] right-4 z-40 flex h-12 items-center gap-2 rounded-full bg-ink px-4 text-bg shadow-lg transition-transform active:scale-95 lg:hidden"
      >
        <Icon name="qr_code_scanner" size={20} className="text-brand" />
        <span className="text-[13px] font-bold">Cobrar Pix</span>
      </button>

      <Modal isOpen={escolhendo} onClose={() => setEscolhendo(false)} title="Cobrar de qual cliente?">
        <ul className="flex flex-col gap-2 p-4">
          {emAndamento.map((a) => (
            <li key={a.id}>
              <button
                type="button"
                onClick={() => escolher(a.id)}
                className="flex w-full items-center justify-between gap-3 rounded-xl bg-surface-2 p-3 text-left"
              >
                <span className="min-w-0">
                  <span className="block truncate text-[15px] font-bold text-ink">{a.client_name}</span>
                  <span className="block truncate text-[12px] text-muted">
                    {[a.service_name, a.professional_name].filter(Boolean).join(' · ')}
                  </span>
                </span>
                <span className="shrink-0 text-[14px] font-bold tabular-nums text-ink">
                  {formatCurrency(Number(a.service_price || 0), { cents: false })}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </Modal>

      <ComandaModal appointmentId={comandaDe} onClose={() => setComandaDe(null)} onAtualizada={onAtualizada} />
    </>
  );
}
