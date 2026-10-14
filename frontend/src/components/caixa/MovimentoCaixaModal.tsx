'use client';

import { useEffect, useState } from 'react';
import { Modal, Button, Field, Input, Icon } from '@/components/ui';
import { useToast } from '@/components/Toast';
import { cn } from '@/lib/cn';
import { registrarMovimento, type CashDay } from '@/lib/caixa';
import { getApiErrorMessage } from '@/utils/handleApiError';

export interface MovimentoCaixaModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSalvo: (dia: CashDay) => void;
}

type Tipo = 'sangria' | 'suprimento';

const TIPOS: Array<{ chave: Tipo; rotulo: string; legenda: string; icone: string }> = [
  { chave: 'sangria', rotulo: 'Sangria', legenda: 'Retirada de dinheiro da gaveta', icone: 'remove_circle_outline' },
  { chave: 'suprimento', rotulo: 'Suprimento', legenda: 'Reforço de troco na gaveta', icone: 'add_circle_outline' },
];

export function MovimentoCaixaModal({ isOpen, onClose, onSalvo }: MovimentoCaixaModalProps) {
  const { showToast } = useToast();
  const [tipo, setTipo] = useState<Tipo>('sangria');
  const [valor, setValor] = useState('');
  const [descricao, setDescricao] = useState('');
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    if (isOpen) { setTipo('sangria'); setValor(''); setDescricao(''); }
  }, [isOpen]);

  const numero = Number(valor.replace(',', '.'));
  const valido = Number.isFinite(numero) && numero > 0;

  const salvar = async () => {
    if (!valido) return;
    setSalvando(true);
    try {
      const dia = await registrarMovimento({ kind: tipo, amount: numero, description: descricao.trim() });
      showToast(tipo === 'sangria' ? 'Sangria registrada' : 'Suprimento registrado', 'success');
      onSalvo(dia);
      onClose();
    } catch (error) {
      showToast(getApiErrorMessage(error, 'Não foi possível registrar o movimento'), 'error');
    } finally {
      setSalvando(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Registrar sangria/suprimento"
      icon="swap_vert"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={salvando}>Cancelar</Button>
          <Button onClick={salvar} loading={salvando} disabled={!valido}>
            {salvando ? null : <Icon name="check" size={16} />}
            Registrar
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <fieldset>
          <legend className="mb-2 text-[13px] font-semibold text-ink">Tipo</legend>
          <div className="grid grid-cols-2 gap-3">
            {TIPOS.map((t) => {
              const ativo = tipo === t.chave;
              return (
                <label
                  key={t.chave}
                  className={cn(
                    'flex cursor-pointer flex-col gap-1 rounded-xl border p-3 transition-colors',
                    ativo ? 'border-brand bg-brand/10' : 'border-line bg-surface-2/60 hover:bg-surface-2',
                  )}
                >
                  <input
                    type="radio"
                    name="tipo-movimento"
                    value={t.chave}
                    checked={ativo}
                    onChange={() => setTipo(t.chave)}
                    className="sr-only"
                  />
                  <span className="flex items-center gap-1.5 text-[14px] font-bold text-ink">
                    <Icon name={t.icone} size={18} className={ativo ? 'text-brand-text' : 'text-muted'} />
                    {t.rotulo}
                  </span>
                  <span className="text-[12px] text-muted">{t.legenda}</span>
                </label>
              );
            })}
          </div>
        </fieldset>
        <Field id="movimento-valor" label="Valor">
          <Input id="movimento-valor" inputMode="decimal" value={valor} onChange={(e) => setValor(e.target.value)} placeholder="0,00" />
        </Field>
        <Field id="movimento-descricao" label="Descrição">
          <Input
            id="movimento-descricao"
            value={descricao}
            onChange={(e) => setDescricao(e.target.value)}
            placeholder={tipo === 'sangria' ? 'Ex.: depósito no banco' : 'Ex.: troco extra'}
          />
        </Field>
      </div>
    </Modal>
  );
}
