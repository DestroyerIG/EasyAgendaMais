'use client';

import { useEffect, useState } from 'react';
import api from '@/lib/api';

interface PendingAppointment {
  id: string;
  client: { name: string; phone: string };
  service: { name: string };
  date: string;
  time: string;
}

export function PendingPaymentList() {
  const [items, setItems] = useState<PendingAppointment[]>([]);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);

  const load = async () => {
    const response = await api.get('/appointments/pending-payment');
    setItems(response.data);
  };

  useEffect(() => {
    load();
  }, []);

  const confirm = async (id: string) => {
    setConfirmingId(id);
    try {
      await api.put(`/appointments/${id}/status`, { status: 'confirmado' });
      await load();
    } finally {
      setConfirmingId(null);
    }
  };

  if (items.length === 0) {
    return <p className="p-4 text-sm text-muted">Nenhuma reserva aguardando pagamento.</p>;
  }

  return (
    <div className="flex flex-col gap-3 p-4">
      {items.map((item) => (
        <div key={item.id} className="flex items-center justify-between rounded-card border border-line bg-surface p-4">
          <div>
            <p className="font-bold text-ink">{item.client.name}</p>
            <p className="text-sm text-muted">{item.service.name} · {item.date} {item.time}</p>
          </div>
          <button
            type="button"
            disabled={confirmingId === item.id}
            onClick={() => confirm(item.id)}
            className="rounded-lg bg-whatsapp px-4 py-2 text-sm font-bold text-on-brand disabled:opacity-60"
          >
            Confirmar recebimento do Pix
          </button>
        </div>
      ))}
    </div>
  );
}
