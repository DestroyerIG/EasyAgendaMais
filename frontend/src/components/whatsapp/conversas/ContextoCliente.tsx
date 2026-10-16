'use client';

import type { ContextoClienteDto, ConversaResumoDto } from '@/lib/whatsappInbox';

interface ContextoClienteProps {
  contexto: ContextoClienteDto | null;
  conversa: ConversaResumoDto;
}

/** Coluna 3 da central. Fica vazia até a Task 11 trazer o contexto da cliente. */
export function ContextoCliente(_props: ContextoClienteProps) {
  return null;
}
