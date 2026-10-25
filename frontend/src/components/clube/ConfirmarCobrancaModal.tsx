'use client';

import { useState } from 'react';
import { formatCurrency } from '@/lib/formatters';
import { getApiErrorMessage } from '@/utils/handleApiError';
import { type Contrato, type FormaPagamentoClube, ROTULO_FORMA_CLUBE, clubeApi, dataCurta } from '@/lib/clube';
import { Button, Field, Modal, Select } from '@/components/ui';

// A dona confirma que o Pix (ou outra forma) caiu. Confirmar duas vezes não duplica.

interface Props { contrato: Contrato; onClose: () => void; onConfirmado: () => void }

export function ConfirmarCobrancaModal({ contrato, onClose, onConfirmado }: Props) {
  const cobranca = contrato.cobrancaPendente!;
  const [forma, setForma] = useState<FormaPagamentoClube>('pix');
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const confirmar = async () => {
    setEnviando(true);
    setErro(null);
    try {
      await clubeApi.confirmar(cobranca.id, forma);
      onConfirmado();
    } catch (e) {
      setErro(getApiErrorMessage(e, 'Não foi possível confirmar o pagamento.'));
    } finally {
      setEnviando(false);
    }
  };

  return (
    <Modal
      isOpen
      onClose={onClose}
      title="Confirmar pagamento"
      description={`${contrato.cliente.nome} · ${contrato.oferta.nome}`}
      icon="task_alt"
      footer={(
        <>
          <Button variant="secondary" onClick={onClose}>Voltar</Button>
          <Button onClick={confirmar} loading={enviando}>Confirmar recebimento</Button>
        </>
      )}
    >
      <div className="space-y-4 text-[14px]">
        <dl className="space-y-1 rounded-xl border border-line bg-surface-2 p-4">
          <div className="flex justify-between"><dt className="text-muted">Vencimento</dt><dd>{dataCurta(cobranca.vencimento)}</dd></div>
          <div className="flex items-baseline justify-between border-t border-line pt-2">
            <dt className="font-semibold text-ink">Valor</dt>
            <dd className="text-xl font-bold tabular-nums text-ink">{formatCurrency(cobranca.valor)}</dd>
          </div>
        </dl>
        <Field id="forma-cobranca" label="Como a cliente pagou">
          <Select id="forma-cobranca" value={forma} onChange={(e) => setForma(e.target.value as FormaPagamentoClube)}>
            {(Object.keys(ROTULO_FORMA_CLUBE) as FormaPagamentoClube[]).map((f) => <option key={f} value={f}>{ROTULO_FORMA_CLUBE[f]}</option>)}
          </Select>
        </Field>
        <p className="text-[13px] text-muted">
          {contrato.status === 'aguardando_pagamento'
            ? 'O plano começa hoje. O recebimento entra no Caixa do dia.'
            : 'As sessões do novo ciclo ficam liberadas. O recebimento entra no Caixa do dia.'}
        </p>
        {erro && <p role="alert" className="text-danger">{erro}</p>}
      </div>
    </Modal>
  );
}
