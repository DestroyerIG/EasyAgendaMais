'use client';

import { useState } from 'react';
import { Modal, Button, Field, Input, Textarea } from '@/components/ui';

const MOTIVO_MINIMO = 3;
const MOTIVO_MAXIMO = 255;
const DIAS_MINIMO = 1;
const DIAS_MAXIMO = 30;

export interface AcaoComMotivoModalProps {
  titulo: string;
  descricao: string;
  rotuloConfirmar: string;
  /** Ação destrutiva: o botão de confirmar fica vermelho. */
  perigo?: boolean;
  /** Mostra o campo de dias (estender o teste grátis). */
  campoDias?: boolean;
  enviando?: boolean;
  onConfirmar: (motivo: string, dias?: number) => void;
  onFechar: () => void;
}

// Toda ação do SuperAdmin pede motivo (mínimo de 3 caracteres), gravado na auditoria.
// A tela monta o modal só quando a ação está aberta, então o estado começa limpo a cada vez.
export function AcaoComMotivoModal({
  titulo, descricao, rotuloConfirmar, perigo = false, campoDias = false, enviando = false, onConfirmar, onFechar,
}: AcaoComMotivoModalProps) {
  const [motivo, setMotivo] = useState('');
  const [dias, setDias] = useState('7');

  const motivoLimpo = motivo.trim();
  const diasNumero = Number(dias);
  const diasValidos = Number.isInteger(diasNumero) && diasNumero >= DIAS_MINIMO && diasNumero <= DIAS_MAXIMO;
  const podeConfirmar = motivoLimpo.length >= MOTIVO_MINIMO && (!campoDias || diasValidos);

  const confirmar = () => {
    if (!podeConfirmar) return;
    onConfirmar(motivoLimpo, campoDias ? diasNumero : undefined);
  };

  return (
    <Modal
      isOpen
      onClose={onFechar}
      title={titulo}
      icon={perigo ? 'warning' : 'edit_note'}
      footer={(
        <>
          <Button variant="secondary" onClick={onFechar} disabled={enviando}>
            Cancelar
          </Button>
          <Button variant={perigo ? 'danger' : 'primary'} onClick={confirmar} loading={enviando} disabled={!podeConfirmar}>
            {rotuloConfirmar}
          </Button>
        </>
      )}
    >
      <div className="flex flex-col gap-4">
        <p className="text-[15px] text-muted">{descricao}</p>

        {campoDias ? (
          <Field
            id="acao-dias"
            label="Dias"
            hint={`De ${DIAS_MINIMO} a ${DIAS_MAXIMO} dias.`}
            error={dias !== '' && !diasValidos ? `Use de ${DIAS_MINIMO} a ${DIAS_MAXIMO} dias.` : undefined}
            required
          >
            <Input
              id="acao-dias"
              type="number"
              inputMode="numeric"
              min={DIAS_MINIMO}
              max={DIAS_MAXIMO}
              value={dias}
              invalid={dias !== '' && !diasValidos}
              onChange={(event) => setDias(event.target.value)}
            />
          </Field>
        ) : null}

        <Field id="acao-motivo" label="Motivo" hint="Fica registrado na auditoria. Mínimo de 3 caracteres." required>
          <Textarea
            id="acao-motivo"
            value={motivo}
            maxLength={MOTIVO_MAXIMO}
            rows={4}
            placeholder="Descreva o motivo da ação"
            onChange={(event) => setMotivo(event.target.value)}
          />
        </Field>
      </div>
    </Modal>
  );
}
