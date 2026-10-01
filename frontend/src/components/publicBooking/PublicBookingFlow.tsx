'use client';

import { useEffect, useRef, useState } from 'react';
import axios from 'axios';
import QRCode from 'qrcode';
import { publicBookingApi, type StorefrontDto, type ProfessionalDto } from '@/lib/publicBooking';
import { getApiErrorMessage } from '@/utils/handleApiError';

type Step = 'servico' | 'profissional' | 'horario' | 'dados' | 'pix';

/** Data de hoje no fuso do navegador, em YYYY-MM-DD (formato do <input type="date">). */
const todayLocalIso = (): string => {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

/** "HH:MM" no horário local a partir do ISO de expiração da reserva. */
const formatDeadline = (expiresAt: string): string =>
  new Date(expiresAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

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
  const [pixResult, setPixResult] = useState<{ pixPayload: string; depositAmount: number; expiresAt: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [qrCodeUrl, setQrCodeUrl] = useState<string | null>(null);
  const copiedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (copiedTimer.current) clearTimeout(copiedTimer.current);
  }, []);

  useEffect(() => {
    if (!pixResult) {
      setQrCodeUrl(null);
      return;
    }
    let cancelado = false;
    QRCode.toDataURL(pixResult.pixPayload, { margin: 1, width: 220 })
      .then((url) => { if (!cancelado) setQrCodeUrl(url); })
      .catch(() => { if (!cancelado) setQrCodeUrl(null); });
    return () => { cancelado = true; };
  }, [pixResult]);

  useEffect(() => {
    publicBookingApi
      .getStorefront(slug)
      .then(setStorefront)
      .catch(() => setError('Página não encontrada.'))
      .finally(() => setLoading(false));
  }, [slug]);

  const selectService = async (id: string) => {
    setError(null);
    try {
      const list = await publicBookingApi.getProfessionals(slug);
      setServiceId(id);
      setProfessionals(list);
      setStep('profissional');
    } catch {
      setError('Não foi possível carregar os profissionais. Tente novamente.');
    }
  };

  const selectProfessional = (id: string) => {
    setProfessionalId(id);
    setStep('horario');
  };

  const loadAvailability = async (selectedDate: string) => {
    setDate(selectedDate);
    setError(null);
    if (!serviceId || !professionalId || !selectedDate) return;
    try {
      const slots = await publicBookingApi.getAvailability(slug, { serviceId, professionalId, date: selectedDate });
      setAvailableSlots(slots);
    } catch {
      setAvailableSlots([]);
      setError('Não foi possível carregar os horários disponíveis. Tente novamente.');
    }
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
      setPixResult({ pixPayload: result.pixPayload, depositAmount: result.depositAmount, expiresAt: result.expiresAt });
      setStep('pix');
    } catch (err) {
      if (axios.isAxiosError(err) && err.response?.status === 409) {
        // Outra pessoa reservou este horário enquanto o cliente preenchia os dados:
        // volta para a escolha de horário com a lista atualizada.
        setTime(null);
        setStep('horario');
        await loadAvailability(date);
        setError('Este horário acabou de ser reservado por outra pessoa. Escolha outro horário.');
      } else {
        setError(getApiErrorMessage(err, 'Não foi possível criar a reserva. Tente novamente.'));
      }
    } finally {
      setSubmitting(false);
    }
  };

  const copyPixCode = async () => {
    if (!pixResult) return;
    try {
      await navigator.clipboard.writeText(pixResult.pixPayload);
      setCopied(true);
      if (copiedTimer.current) clearTimeout(copiedTimer.current);
      copiedTimer.current = setTimeout(() => setCopied(false), 3000);
    } catch {
      setError('Não foi possível copiar automaticamente. Selecione o código e copie manualmente.');
    }
  };

  if (loading) return <div className="p-8 text-center text-muted">Carregando...</div>;
  if (error && !storefront) return <div className="p-8 text-center text-danger">{error}</div>;
  if (!storefront) return null;

  return (
    <div className="mx-auto max-w-xl px-4 py-10">
      <h1 className="text-2xl font-extrabold text-ink">{storefront.name}</h1>

      {storefront.galleryPhotos.length > 0 && (
        <div className="mt-4 flex gap-2 overflow-x-auto">
          {storefront.galleryPhotos.map((url, index) => (
            // eslint-disable-next-line @next/next/no-img-element -- galeria vem de URL externa (Supabase Storage), sem domínio pré-configurado no next/image
            <img
              key={url}
              src={url}
              alt={`Trabalho realizado ${index + 1}`}
              className="h-20 w-20 shrink-0 rounded-control border border-line object-cover"
            />
          ))}
        </div>
      )}

      {error && (
        <p role="alert" className="mt-4 text-sm text-danger">
          {error}
        </p>
      )}

      {step === 'servico' && storefront.services.length === 0 && (
        <p className="mt-6 text-sm text-muted">
          Nenhum serviço disponível para agendamento online no momento. Entre em contato diretamente com o estabelecimento.
        </p>
      )}

      {step === 'servico' && storefront.services.length > 0 && (
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
            aria-label="Data do agendamento"
            min={todayLocalIso()}
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
          <p className="text-sm font-semibold text-ink">
            Pague até {formatDeadline(pixResult.expiresAt)} — depois disso o horário é liberado para outras pessoas.
          </p>
          {qrCodeUrl && (
            // eslint-disable-next-line @next/next/no-img-element -- data: URL gerado no cliente, sem domínio pro next/image otimizar
            <img
              src={qrCodeUrl}
              alt="QR Code do Pix"
              width={220}
              height={220}
              className="mx-auto rounded-lg border border-line bg-surface p-2"
            />
          )}
          <textarea
            readOnly
            aria-label="Código Pix copia e cola"
            value={pixResult.pixPayload}
            className="h-24 rounded-lg border border-line p-3 text-xs"
          />
          <button
            type="button"
            onClick={copyPixCode}
            className="rounded-lg bg-brand px-4 py-3 font-bold text-on-brand"
          >
            {copied ? 'Copiado!' : 'Copiar código'}
          </button>
          <p className="text-sm text-muted">
            Aguardando confirmação do estabelecimento. Você pode fechar esta página.
          </p>
        </div>
      )}
    </div>
  );
}
