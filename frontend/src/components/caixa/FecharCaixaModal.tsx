'use client';

import { useEffect, useState } from 'react';
import { Modal, Button, Field, Input, Textarea, Icon } from '@/components/ui';
import { useToast } from '@/components/Toast';
import { cn } from '@/lib/cn';
import { formatCurrency, parseValorBR } from '@/lib/formatters';
import { fecharCaixa, type CashDay } from '@/lib/caixa';
import { getApiErrorMessage } from '@/utils/handleApiError';

export interface FecharCaixaModalProps {
  isOpen: boolean;
  dia: CashDay;
  onClose: () => void;
  onFechado: (dia: CashDay) => void;
}

const round2 = (v: number) => Math.round(v * 100) / 100;

export function FecharCaixaModal({ isOpen, dia, onClose, onFechado }: FecharCaixaModalProps) {
  const { showToast } = useToast();
  const [contado, setContado] = useState('');
  const [notas, setNotas] = useState('');
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    if (isOpen) { setContado(''); setNotas(''); }
  }, [isOpen]);

  const esperado = dia.gaveta.esperado;
  const numero = parseValorBR(contado);
  const valido = numero !== null;
  const diferenca = numero !== null ? round2(numero - esperado) : null;

  const confirmar = async () => {
    if (numero === null) return;
    setSalvando(true);
    try {
      const fechado = await fecharCaixa({ countedBalance: numero, notes: notas.trim(), date: dia.date });
      showToast('Caixa fechado', 'success');
      onFechado(fechado);
      onClose();
    } catch (error) {
      showToast(getApiErrorMessage(error, 'Não foi possível fechar o caixa'), 'error');
    } finally {
      setSalvando(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Fechar caixa"
      icon="lock"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={salvando}>Cancelar</Button>
          <Button onClick={confirmar} loading={salvando} disabled={!valido}>
            {salvando ? null : <Icon name="lock" size={16} />}
            Confirmar fechamento
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <p className="rounded-xl border border-line bg-surface-2/60 p-3.5 text-[14px] text-muted">
          Total esperado na gaveta: <strong className="font-bold tabular-nums text-ink">{formatCurrency(esperado)}</strong>
        </p>
        <Field id="fechar-contado" label="Valor contado na gaveta">
          <Input id="fechar-contado" inputMode="decimal" value={contado} onChange={(e) => setContado(e.target.value)} placeholder="0,00" />
        </Field>
        {diferenca !== null && (
          <p
            aria-live="polite"
            className={cn(
              'text-[14px] font-bold tabular-nums',
              diferenca === 0 ? 'text-success-text' : diferenca < 0 ? 'text-danger' : 'text-warning-text',
            )}
          >
            Diferença: {formatCurrency(diferenca)}
          </p>
        )}
        <Field id="fechar-notas" label="Observações">
          <Textarea id="fechar-notas" value={notas} onChange={(e) => setNotas(e.target.value)} placeholder="Opcional" />
        </Field>
      </div>
    </Modal>
  );
}
