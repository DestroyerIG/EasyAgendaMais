'use client';

import { useEffect, useState } from 'react';
import { publicBookingApi, type StorefrontDto, type ProfessionalDto } from '@/lib/publicBooking';

type Step = 'servico' | 'profissional' | 'horario' | 'dados' | 'pix';

export function PublicBookingFlow({ slug }: { slug: string }) {
  const [storefront, setStorefront] = useState<StorefrontDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState<Step>('servico');
  const [serviceId, setServiceId] = useState<string | null>(null);
  const [professionals, setProfessionals] = useState<ProfessionalDto[]>([]);
  const [professionalId, setProfessionalId] = useState<string | null>(null);
  const [date, setDate] = useState('');
  const [availableSlots, setAvailableSlots] = useState<string[]>([]);
  const [time, setTime] = useState<string | null>(null);
  const [clientName, setClientName] = useState('');
  const [clientPhone, setClientPhone] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [pixResult, setPixResult] = useState<{ pixPayload: string; depositAmount: number } | null>(null);

  useEffect(() => {
    publicBookingApi
      .getStorefront(slug)
      .then(setStorefront)
      .catch(() => setError('Página não encontrada.'))
      .finally(() => setLoading(false));
  }, [slug]);

  const selectService = async (id: string) => {
    setServiceId(id);
    const list = await publicBookingApi.getProfessionals(slug);
    setProfessionals(list);
    setStep('profissional');
  };

  const selectProfessional = (id: string) => {
    setProfessionalId(id);
    setStep('horario');
  };

  const loadAvailability = async (selectedDate: string) => {
    setDate(selectedDate);
    if (!serviceId || !professionalId) return;
    const slots = await publicBookingApi.getAvailability(slug, { serviceId, professionalId, date: selectedDate });
    setAvailableSlots(slots);
  };

  const selectTime = (slot: string) => {
    setTime(slot);
    setStep('dados');
  };

  const submit = async () => {
    if (!serviceId || !professionalId || !time) return;
    setSubmitting(true);
    setError(null);
    try {
      const result = await publicBookingApi.createAppointment(slug, {
        serviceId, professionalId, date, time, clientName, clientPhone,
      });
      setPixResult({ pixPayload: result.pixPayload, depositAmount: result.depositAmount });
      setStep('pix');
    } catch {
      setError('Não foi possível criar a reserva. Tente novamente.');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <div className="p-8 text-center text-muted">Carregando...</div>;
  if (error && !storefront) return <div className="p-8 text-center text-danger">{error}</div>;
  if (!storefront) return null;

  return (
    <div className="mx-auto max-w-xl px-4 py-10">
      <h1 className="text-2xl font-extrabold text-ink">{storefront.name}</h1>

      {step === 'servico' && (
        <div className="mt-6 flex flex-col gap-3">
          {storefront.services.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => selectService(s.id)}
              className="rounded-card border border-line bg-surface p-4 text-left hover:border-brand"
            >
              <p className="font-bold text-ink">{s.name}</p>
              <p className="text-sm text-muted">Sinal: R$ {s.depositAmount.toFixed(2)}</p>
            </button>
          ))}
        </div>
      )}

      {step === 'profissional' && (
        <div className="mt-6 flex flex-col gap-3">
          {professionals.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => selectProfessional(p.id)}
              className="rounded-card border border-line bg-surface p-4 text-left hover:border-brand"
            >
              {p.name}
            </button>
          ))}
        </div>
      )}

      {step === 'horario' && (
        <div className="mt-6 flex flex-col gap-4">
          <input
            type="date"
            value={date}
            onChange={(e) => loadAvailability(e.target.value)}
            className="rounded-lg border border-line p-3"
          />
          <div className="flex flex-wrap gap-2">
            {availableSlots.map((slot) => (
              <button
                key={slot}
                type="button"
                onClick={() => selectTime(slot)}
                className="rounded-lg border border-line px-4 py-2 hover:border-brand"
              >
                {slot}
              </button>
            ))}
          </div>
        </div>
      )}

      {step === 'dados' && (
        <div className="mt-6 flex flex-col gap-4">
          <input
            placeholder="Seu nome"
            value={clientName}
            onChange={(e) => setClientName(e.target.value)}
            className="rounded-lg border border-line p-3"
          />
          <input
            placeholder="Seu WhatsApp"
            value={clientPhone}
            onChange={(e) => setClientPhone(e.target.value)}
            className="rounded-lg border border-line p-3"
          />
          {error && <p className="text-sm text-danger">{error}</p>}
          <button
            type="button"
            disabled={submitting || !clientName || !clientPhone}
            onClick={submit}
            className="rounded-lg bg-brand px-4 py-3 font-bold text-on-brand disabled:opacity-60"
          >
            {submitting ? 'Reservando...' : 'Reservar e pagar sinal'}
          </button>
        </div>
      )}

      {step === 'pix' && pixResult && (
        <div className="mt-6 flex flex-col gap-4 rounded-card border border-line bg-surface-2 p-5">
          <p className="font-bold text-ink">Pague o sinal de R$ {pixResult.depositAmount.toFixed(2)} via Pix</p>
          <textarea readOnly value={pixResult.pixPayload} className="h-24 rounded-lg border border-line p-3 text-xs" />
          <p className="text-sm text-muted">
            Aguardando confirmação do estabelecimento. Você pode fechar esta página.
          </p>
        </div>
      )}
    </div>
  );
}
