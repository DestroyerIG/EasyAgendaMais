'use client';

import { useEffect, useState } from 'react';
import { Modal } from '@/components/ui';

export const LIMITE_TEXTO = 4096;

interface TextoConviteModalProps {
  isOpen: boolean;
  nome: string;
  textoInicial: string;
  podeEnviar: boolean;
  onClose: () => void;
  onEnviar: (texto: string) => void;
}

/** Texto do convite de uma cliente, editável antes de enviar (não salva modelo). */
export function TextoConviteModal({ isOpen, nome, textoInicial, podeEnviar, onClose, onEnviar }: TextoConviteModalProps) {
  const [texto, setTexto] = useState(textoInicial);
  useEffect(() => { if (isOpen) setTexto(textoInicial); }, [isOpen, textoInicial]);
  const vazio = texto.trim().length === 0;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`Texto para ${nome}`}
      icon="chat"
      description="Ajuste a mensagem antes de enviar. A alteração vale só para este envio."
      size="md"
      footer={(
        <>
          <button
            type="button"
            onClick={onClose}
            className="min-h-11 rounded-xl bg-surface-m3-low px-4 text-[13px] font-bold text-ink hover:bg-surface-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand"
          >
            Cancelar
          </button>
          <button
            type="button"
            disabled={!podeEnviar || vazio}
            onClick={() => onEnviar(texto)}
            className="min-h-11 rounded-xl bg-whatsapp px-4 text-[13px] font-bold text-surface shadow-sm hover:bg-whatsapp/90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand disabled:cursor-not-allowed disabled:opacity-50"
          >
            Enviar este texto
          </button>
        </>
      )}
    >
      <label htmlFor="texto-convite" className="sr-only">Texto do convite</label>
      <textarea
        id="texto-convite"
        value={texto}
        maxLength={LIMITE_TEXTO}
        onChange={(e) => setTexto(e.target.value)}
        rows={12}
        className="w-full resize-y rounded-xl bg-surface-m3-low p-3 text-[14px] leading-relaxed text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand"
      />
      <p className="mt-1 text-right text-[11px] font-semibold text-muted">{`${texto.length}/${LIMITE_TEXTO}`}</p>
    </Modal>
  );
}
