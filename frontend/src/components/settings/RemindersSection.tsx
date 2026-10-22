'use client';

import Link from 'next/link';
import { Card } from '@/components/ui';

/** O lembrete por WhatsApp é a regra "Lembrete" em WhatsApp › Automações (fonte única). */
export function RemindersSection() {
  return (
    <Card className="space-y-6">
      <div>
        <h2 className="text-lg font-bold text-ink">Lembretes e notificações</h2>
        <p className="mt-1 text-[15px] text-muted">
          Escolha como seu negócio se comunica com os clientes ao longo da agenda.
        </p>
      </div>

      <p className="text-[15px] text-muted">
        Os lembretes por WhatsApp agora ficam em Automações, junto com a confirmação e as outras mensagens automáticas.{' '}
        <Link href="/dashboard/whatsapp?aba=automacoes" className="font-semibold text-brand-text hover:underline">
          Abrir Automações
        </Link>
      </p>
    </Card>
  );
}
