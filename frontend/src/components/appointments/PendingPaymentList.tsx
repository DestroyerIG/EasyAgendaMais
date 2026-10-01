'use client';

import { useEffect, useState } from 'react';
import api from '@/lib/api';
import { getApiErrorMessage } from '@/utils/handleApiError';

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
  const [error, setError] = useState<string | null>(null);

  const load = async (): Promise<boolean> => {
    try {
      const response = await api.get('/appointments/pending-payment');
      setItems(response.data);
      return true;
    } catch (err) {
      setError(getApiErrorMessage(err, 'Não foi possível carregar as reservas aguardando Pix.'));
      return false;
    }
  };

  useEffect(() => {
    load();
  }, []);

  const confirm = async (id: string) => {
    setConfirmingId(id);
    setError(null);
    try {
      await api.put(`/appointments/${id}/status`, { status: 'confirmado' });
      await load();
    } catch (err) {
      // Ex.: a reserva expirou (ou foi cancelada) entre a listagem e o clique — o
      // backend responde 409. Mostra o motivo e recarrega para refletir o estado real.
      const message = getApiErrorMessage(err, 'Não foi possível confirmar o pagamento.');
      await load();
      setError(message);
    } finally {
      setConfirmingId(null);
    }
  };

  const errorBanner = error ? (
    <p role="alert" className="px-4 pt-4 text-sm text-danger">
      {error}
    </p>
  ) : null;

  if (items.length === 0) {
    return (
      <>
        {errorBanner}
        <p className="p-4 text-sm text-muted">Nenhuma reserva aguardando pagamento.</p>
      </>
    );
  }

  return (
    <div className="flex flex-col gap-3 p-4">
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
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
