'use client';

import { useEffect, useState } from 'react';
import { billingApi, type PreviaTroca, type ResultadoTroca } from '@/lib/billing';
import type { PlanId } from '@/lib/plans';
import { formatCurrency } from '@/lib/formatters';
import { NOME_PLANO, dataLonga, diaMes } from '@/lib/planoCobranca';
import { getApiErrorMessage } from '@/utils/handleApiError';
import { Button, Icon, Modal } from '@/components/ui';
import { PixPagamento } from './PixPagamento';

// Confirmação da troca de plano: prévia do valor, confirmação e, no Pix, o QR Code da
// diferença com a consulta a cada 5 s.

interface TrocaPlanoModalProps {
  plano: PlanId | null;
  onClose: () => void;
  onConcluido: (mensagem: string) => void;
}

type Etapa =
  | { tipo: 'carregando' }
  | { tipo: 'erro'; mensagem: string }
  | { tipo: 'previa'; previa: PreviaTroca }
  | { tipo: 'pix'; resultado: Extract<ResultadoTroca, { status: 'aguardando' }> };

export function TrocaPlanoModal({ plano, onClose, onConcluido }: TrocaPlanoModalProps) {
  const [etapa, setEtapa] = useState<Etapa>({ tipo: 'carregando' });
  const [enviando, setEnviando] = useState(false);
  const [erroEnvio, setErroEnvio] = useState<string | null>(null);

  useEffect(() => {
    if (!plano) return;
    let ativo = true;
    setEtapa({ tipo: 'carregando' });
    setErroEnvio(null);
    billingApi
      .previewPlanChange(plano)
      .then((previa) => ativo && setEtapa({ tipo: 'previa', previa }))
      .catch((error) => ativo && setEtapa({ tipo: 'erro', mensagem: getApiErrorMessage(error, 'Não foi possível calcular a troca de plano.') }));
    return () => {
      ativo = false;
    };
  }, [plano]);

  if (!plano) return null;
  const nome = NOME_PLANO[plano];

  const confirmar = async () => {
    setEnviando(true);
    setErroEnvio(null);
    try {
      const r = await billingApi.changePlan(plano);
      if (r.tipo === 'downgrade') {
        onConcluido(`Seu plano muda para ${nome} em ${diaMes(r.agendadoPara) ?? 'próxima renovação'}.`);
      } else if (r.status === 'pago') {
        onConcluido(`Pronto! Seu plano agora é o ${nome}.`);
      } else if (r.status === 'aguardando') {
        setEtapa({ tipo: 'pix', resultado: r });
      } else {
        setErroEnvio(r.motivo);
      }
    } catch (error) {
      setErroEnvio(getApiErrorMessage(error, 'Não foi possível trocar de plano.'));
    } finally {
      setEnviando(false);
    }
  };

  const titulo =
    etapa.tipo === 'pix'
      ? 'Pague a diferença no Pix'
      : etapa.tipo === 'previa' && etapa.previa.tipo === 'downgrade'
      ? `Mudar para o ${nome}`
      : `Fazer upgrade para o ${nome}`;

  let corpo: React.ReactNode = null;
  let rodape: React.ReactNode = null;

  if (etapa.tipo === 'carregando') {
    corpo = <p className="py-6 text-center text-muted">Calculando a troca...</p>;
  } else if (etapa.tipo === 'erro') {
    corpo = <p className="py-4 text-[14px] text-danger">{etapa.mensagem}</p>;
    rodape = (
      <Button variant="secondary" onClick={onClose}>
        Fechar
      </Button>
    );
  } else if (etapa.tipo === 'pix') {
    const r = etapa.resultado;
    corpo = (
      <div className="space-y-4">
        <p className="text-[14px] text-muted">
          O plano {nome} é liberado assim que o pagamento for confirmado. Você pode fechar esta janela e pagar depois:
          a cobrança fica em Plano e cobrança.
        </p>
        <PixPagamento
          paymentId={r.paymentId}
          valor={r.valor}
          qrCode={r.qrCode}
          pixCopyPaste={r.pixCopyPaste}
          acompanhar
          onPago={() => onConcluido(`Pagamento confirmado! Seu plano agora é o ${nome}.`)}
        />
      </div>
    );
    rodape = (
      <Button variant="secondary" onClick={onClose}>
        Pagar depois
      </Button>
    );
  } else {
    const p = etapa.previa;
    const pix = p.formaPagamento === 'pix';
    const aPartirDe = dataLonga(p.aPartirDe);
    corpo =
      p.tipo === 'upgrade' ? (
        <div className="space-y-4 text-[14px]">
          <div className="rounded-xl border border-line bg-surface-2 p-4">
            <div className="flex items-baseline justify-between gap-4">
              <span className="text-muted">Você paga hoje</span>
              <span className="text-xl font-bold text-ink">{formatCurrency(p.valorHoje)}</span>
            </div>
            <p className="mt-1 text-[13px] text-muted">
              {p.valorHoje > 0
                ? `Diferença proporcional de ${p.dias} ${p.dias === 1 ? 'dia' : 'dias'} até a próxima fatura.`
                : 'A diferença até a próxima fatura é pequena e não será cobrada.'}
            </p>
            <div className="mt-3 flex items-baseline justify-between gap-4 border-t border-line pt-3">
              <span className="text-muted">{aPartirDe ? `A partir de ${aPartirDe}` : 'Nas próximas mensalidades'}</span>
              <span className="font-semibold text-ink">{formatCurrency(p.valorMensalNovo)}/mês</span>
            </div>
          </div>
          <p className="flex items-start gap-2 text-muted">
            <Icon name={pix ? 'qr_code_2' : 'credit_card'} size={18} className="mt-0.5 shrink-0" />
            {pix
              ? 'No Pix, o plano é liberado quando o pagamento da diferença for confirmado.'
              : 'A diferença é cobrada no cartão da assinatura e o plano é liberado na hora.'}
          </p>
        </div>
      ) : (
        <div className="space-y-4 text-[14px]">
          {p.bloqueio ? (
            <div role="alert" className="flex items-start gap-2 rounded-xl bg-warning/12 p-4 text-warning-text">
              <Icon name="group" size={18} className="mt-0.5 shrink-0" />
              <span>{p.bloqueio.motivo}</span>
            </div>
          ) : (
            <div className="rounded-xl border border-line bg-surface-2 p-4">
              <p className="text-ink">
                Você continua com tudo do {NOME_PLANO[p.planoAtual]} até {aPartirDe ?? 'o fim do período'}. Depois disso, a
                mensalidade passa a ser {formatCurrency(p.valorMensalNovo)}.
              </p>
              <p className="mt-2 text-[13px] text-muted">Nada é cobrado agora. Dá para cancelar a mudança até lá.</p>
            </div>
          )}
        </div>
      );
    rodape = (
      <>
        <Button variant="secondary" onClick={onClose}>
          Voltar
        </Button>
        <Button onClick={confirmar} loading={enviando} disabled={Boolean(p.bloqueio)}>
          {p.tipo === 'upgrade' ? 'Confirmar upgrade' : 'Confirmar mudança'}
        </Button>
      </>
    );
  }

  return (
    <Modal isOpen={Boolean(plano)} onClose={onClose} title={titulo} icon="workspace_premium" footer={rodape}>
      {corpo}
      {erroEnvio && (
        <p role="alert" className="mt-4 text-[14px] text-danger">
          {erroEnvio}
        </p>
      )}
    </Modal>
  );
}
