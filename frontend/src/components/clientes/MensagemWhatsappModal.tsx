'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { Button, Icon, Modal, Textarea } from '@/components/ui';
import { linkWhatsapp } from '@/lib/whatsappLink';

export interface MensagemWhatsappModalProps {
  isOpen: boolean;
  onClose: () => void;
  telefone: string | null | undefined;
  nomeCliente: string;
  mensagemInicial: string;
  /** Contexto mostrado acima da mensagem (ex.: nota e comentário de uma avaliação). */
  contexto?: ReactNode;
}

// Mensagem pronta para o WhatsApp: a dona revisa/edita o texto e abre a conversa no
// WhatsApp dela (wa.me) — o sistema não envia nada sozinho.
export function MensagemWhatsappModal({
  isOpen,
  onClose,
  telefone,
  nomeCliente,
  mensagemInicial,
  contexto,
}: MensagemWhatsappModalProps) {
  const [texto, setTexto] = useState(mensagemInicial);

  // Cada abertura começa da mensagem pronta, não do rascunho de outra cliente.
  useEffect(() => {
    if (isOpen) setTexto(mensagemInicial);
  }, [isOpen, mensagemInicial]);

  const temTelefone = linkWhatsapp(telefone, 'x') !== null;

  const abrirConversa = () => {
    const url = linkWhatsapp(telefone, texto);
    if (!url) return;
    window.open(url, '_blank', 'noopener');
    onClose();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`Mensagem para ${nomeCliente}`}
      icon="chat"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="whatsapp" onClick={abrirConversa} disabled={!temTelefone}>
            <Icon name="send" size={16} />
            Abrir conversa no WhatsApp
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        {contexto}
        <label htmlFor="mensagem-whatsapp" className="text-[13px] font-semibold text-ink">
          Mensagem
        </label>
        <Textarea
          id="mensagem-whatsapp"
          value={texto}
          onChange={(evento) => setTexto(evento.target.value)}
          rows={5}
        />
        {temTelefone ? (
          <p className="text-[12px] text-muted">A conversa abre no seu WhatsApp para você revisar e enviar.</p>
        ) : (
          <p className="flex items-center gap-1.5 text-[12px] font-semibold text-warning-text">
            <Icon name="error" size={15} />
            Cadastre o telefone da cliente
          </p>
        )}
      </div>
    </Modal>
  );
}
