'use client';

import { useState } from 'react';
import { formatCurrency } from '@/lib/formatters';
import { getApiErrorMessage } from '@/utils/handleApiError';
import { type FormaRepasse, type LinhaComissao, type Periodo, ROTULO_FORMA, relatoriosApi, rotuloPeriodo } from '@/lib/relatorios';
import { Button, Field, Modal, Select, Textarea } from '@/components/ui';

// Registra o repasse feito por fora (o sistema não faz o Pix): forma, observação e a foto
// dos valores do momento, com os adiantamentos abertos descontados.

interface PagarRepasseModalProps {
  linha: LinhaComissao;
  periodo: Periodo;
  onClose: () => void;
  onPago: () => void;
}

export function PagarRepasseModal({ linha, periodo, onClose, onPago }: PagarRepasseModalProps) {
  const [forma, setForma] = useState<FormaRepasse>('pix');
  const [observacao, setObservacao] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const confirmar = async () => {
    setEnviando(true);
    setErro(null);
    try {
      await relatoriosApi.pagar({ professionalId: linha.professional.id, ...periodo, forma, observacao: observacao.trim() || null });
      onPago();
    } catch (e) {
      setErro(getApiErrorMessage(e, 'Não foi possível marcar como pago.'));
    } finally {
      setEnviando(false);
    }
  };

  return (
    <Modal
      isOpen
      onClose={onClose}
      title={`Pagar ${linha.professional.nome}`}
      description={rotuloPeriodo(periodo)}
      icon="payments"
      footer={(
        <>
          <Button variant="secondary" onClick={onClose}>Voltar</Button>
          <Button onClick={confirmar} loading={enviando}>Confirmar pagamento</Button>
        </>
      )}
    >
      <div className="space-y-4 text-[14px]">
        <dl className="space-y-1 rounded-xl border border-line bg-surface-2 p-4">
          <div className="flex justify-between"><dt className="text-muted">Comissão</dt><dd className="tabular-nums">{formatCurrency(linha.comissao)}</dd></div>
          <div className="flex justify-between"><dt className="text-muted">Gorjetas</dt><dd className="tabular-nums">{formatCurrency(linha.gorjetas)}</dd></div>
          {linha.adiantamentos > 0 && (
            <div className="flex justify-between"><dt className="text-muted">Adiantamentos descontados</dt><dd className="tabular-nums text-danger">− {formatCurrency(linha.adiantamentos)}</dd></div>
          )}
          <div className="flex items-baseline justify-between border-t border-line pt-2">
            <dt className="font-semibold text-ink">Valor do repasse</dt>
            <dd className="text-xl font-bold tabular-nums text-ink">{formatCurrency(linha.aPagar)}</dd>
          </div>
        </dl>
        <Field id="forma-repasse" label="Como você pagou">
          <Select id="forma-repasse" value={forma} onChange={(e) => setForma(e.target.value as FormaRepasse)}>
            {(Object.keys(ROTULO_FORMA) as FormaRepasse[]).map((f) => <option key={f} value={f}>{ROTULO_FORMA[f]}</option>)}
          </Select>
        </Field>
        <Field id="obs-repasse" label="Observação (opcional)">
          <Textarea id="obs-repasse" rows={2} maxLength={500} value={observacao} onChange={(e) => setObservacao(e.target.value)} />
        </Field>
        <p className="text-[13px] text-muted">O EasyAgenda+ só registra o pagamento. A transferência você faz pelo seu banco.</p>
        {erro && <p role="alert" className="text-danger">{erro}</p>}
      </div>
    </Modal>
  );
}
