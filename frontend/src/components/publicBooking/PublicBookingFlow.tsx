'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import axios from 'axios';
import QRCode from 'qrcode';
import { MapPin, Check } from 'lucide-react';
import { publicBookingApi, type StorefrontDto, type ProfessionalDto, type StorefrontServiceDto } from '@/lib/publicBooking';
import { getApiErrorMessage } from '@/utils/handleApiError';
import { Button, Icon } from '@/components/ui';
import { ClubeVitrine } from '@/components/clube/AdesaoClube';
import { termosDe } from '@/lib/vocabulario';

type Step = 'servico' | 'profissional' | 'horario' | 'pagamento';

const STEP_NUMBER: Record<Step, number> = { servico: 1, profissional: 2, horario: 3, pagamento: 4 };
const TOTAL_STEPS = 4;

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

const formatCurrency = (value: number): string =>
  value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

/** Horários antes do meio-dia em "Manhã", os demais em "Tarde" — mesmo agrupamento do mockup. */
const groupByPeriod = (slots: string[]): { manha: string[]; tarde: string[] } => ({
  manha: slots.filter((s) => Number(s.slice(0, 2)) < 12),
  tarde: slots.filter((s) => Number(s.slice(0, 2)) >= 12),
});

function StepHeader({ title, subtitle, step }: { title: string; subtitle?: string; step: Step }) {
  return (
    <div className="mb-5">
      <p className="text-[11px] font-bold uppercase tracking-wide text-brand">
        Etapa {STEP_NUMBER[step]} de {TOTAL_STEPS}
      </p>
      <h2 className="mt-1 text-xl font-bold text-ink">{title}</h2>
      {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
    </div>
  );
}

function SelectableCard({
  selected,
  onClick,
  children,
}: {
  selected: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={`flex items-center justify-between gap-3 rounded-card border p-4 text-left transition-colors ${
        selected ? 'border-brand bg-brand/5' : 'border-line bg-surface hover:border-brand/50'
      }`}
    >
      <div className="flex-1">{children}</div>
      <div
        className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 ${
          selected ? 'border-brand bg-brand' : 'border-line'
        }`}
      >
        {selected && <Check className="h-4 w-4 text-on-brand" aria-hidden="true" />}
      </div>
    </button>
  );
}

function BottomBar({ summary, children }: { summary?: ReactNode; children: ReactNode }) {
  return (
    <div className="sticky bottom-0 mt-6 flex items-center justify-between gap-3 border-t border-line bg-surface px-4 py-3">
      <div className="min-w-0 flex-1 text-sm text-ink">{summary}</div>
      {children}
    </div>
  );
}

export function PublicBookingFlow({ slug }: { slug: string }) {
  const [storefront, setStorefront] = useState<StorefrontDto | null>(null);
  const { prof } = termosDe(storefront?.vocabulario);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState<Step>('servico');
  const [serviceId, setServiceId] = useState<string | null>(null);
  const [loadingNext, setLoadingNext] = useState(false);
  const [professionals, setProfessionals] = useState<ProfessionalDto[]>([]);
  const [professionalId, setProfessionalId] = useState<string | null>(null);
  const [date, setDate] = useState('');
  const [availableSlots, setAvailableSlots] = useState<string[]>([]);
  const [time, setTime] = useState<string | null>(null);
  const [clientName, setClientName] = useState('');
  const [clientPhone, setClientPhone] = useState('');
  // LGPD: consentimento pré-marcado não vale — a caixa começa desmarcada.
  const [whatsappConsent, setWhatsappConsent] = useState(false);
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

  const confirmService = async () => {
    if (!serviceId) return;
    setError(null);
    setLoadingNext(true);
    try {
      const list = await publicBookingApi.getProfessionals(slug);
      setProfessionals(list);
      setStep('profissional');
    } catch {
      setError(`Não foi possível carregar ${prof.osP}. Tente novamente.`);
    } finally {
      setLoadingNext(false);
    }
  };

  const confirmProfessional = () => {
    if (professionalId) setStep('horario');
  };

  const loadAvailability = async (selectedDate: string) => {
    setDate(selectedDate);
    setTime(null);
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

  const confirmTime = () => {
    if (time) setStep('pagamento');
  };

  const submit = async () => {
    if (!serviceId || !professionalId || !time) return;
    setSubmitting(true);
    setError(null);
    try {
      const result = await publicBookingApi.createAppointment(slug, {
        serviceId, professionalId, date, time, clientName, clientPhone, whatsappConsent,
      });
      setPixResult({ pixPayload: result.pixPayload, depositAmount: result.depositAmount, expiresAt: result.expiresAt });
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

  if (storefront.agendaPausada) {
    const digitos = (storefront.whatsapp ?? '').replace(/\D/g, '');
    const numero = digitos ? (digitos.startsWith('55') ? digitos : `55${digitos}`) : null;
    return (
      <div className="mx-auto flex min-h-screen max-w-xl flex-col">
        <div className="flex items-center gap-2 border-b border-line bg-surface px-4 py-3">
          <p className="truncate font-bold text-ink">{storefront.name}</p>
        </div>
        <div className="flex flex-1 flex-col items-center justify-center gap-5 px-6 py-10 text-center">
          <p className="text-[15px] text-ink">
            A agenda online está pausada no momento. Fale direto com {storefront.name} pelo WhatsApp.
          </p>
          {numero && (
            <a
              href={`https://wa.me/${numero}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex min-h-11 items-center gap-2 rounded-control bg-whatsapp px-5 text-[14px] font-bold text-surface"
            >
              <Icon name="chat" size={18} />
              Chamar no WhatsApp
            </a>
          )}
        </div>
      </div>
    );
  }

  const selectedService: StorefrontServiceDto | undefined = storefront.services.find((s) => s.id === serviceId);
  const selectedProfessional = professionals.find((p) => p.id === professionalId);
  const { manha, tarde } = groupByPeriod(availableSlots);

  return (
    <div className="mx-auto flex min-h-screen max-w-xl flex-col">
      <div className="sticky top-0 z-10 flex items-center gap-2 border-b border-line bg-surface px-4 py-3">
        {storefront.logoUrl && (
          // eslint-disable-next-line @next/next/no-img-element -- URL externa (Supabase Storage), sem domínio pro next/image otimizar
          <img src={storefront.logoUrl} alt="" className="h-8 w-8 rounded-full border border-line object-cover" />
        )}
        <p className="truncate font-bold text-ink">{storefront.name}</p>
      </div>

      <div className="flex-1 px-4 pb-4 pt-5">
        {step === 'servico' && (
          <>
            {storefront.galleryPhotos.length > 0 && (
              <div className="mb-4 flex gap-2 overflow-x-auto">
                {storefront.galleryPhotos.map((url, index) => (
                  // eslint-disable-next-line @next/next/no-img-element -- galeria vem de URL externa (Supabase Storage), sem domínio pro next/image otimizar
                  <img
                    key={url}
                    src={url}
                    alt={`Trabalho realizado ${index + 1}`}
                    className="h-20 w-20 shrink-0 rounded-control border border-line object-cover"
                  />
                ))}
              </div>
            )}

            {storefront.address && (
              <div className="mb-4 overflow-hidden rounded-card border border-line">
                <iframe
                  title="Localização do negócio"
                  src={`https://maps.google.com/maps?q=${encodeURIComponent(storefront.address)}&output=embed`}
                  className="h-36 w-full border-0"
                  loading="lazy"
                />
                <p className="flex items-center gap-1.5 p-3 text-sm text-muted">
                  <MapPin className="h-4 w-4 shrink-0" aria-hidden="true" />
                  {storefront.address}
                </p>
              </div>
            )}
          </>
        )}

        {error && (
          <p role="alert" className="mb-4 text-sm text-danger">
            {error}
          </p>
        )}

        {step === 'servico' && (
          <>
            <StepHeader step="servico" title="Selecione o serviço" subtitle="Escolha o procedimento desejado para ver os horários disponíveis." />
            {storefront.services.length === 0 ? (
              <p className="text-sm text-muted">
                Nenhum serviço disponível para agendamento online no momento. Entre em contato diretamente com o estabelecimento.
              </p>
            ) : (
              <div className="flex flex-col gap-3">
                {storefront.services.map((s) => (
                  <SelectableCard key={s.id} selected={serviceId === s.id} onClick={() => setServiceId(s.id)}>
                    <p className="font-bold text-ink">{s.name}</p>
                    <p className="text-sm text-muted">
                      {formatCurrency(s.price)} · {s.durationMinutes} min
                    </p>
                    <p className="mt-1 inline-block rounded-full bg-brand/12 px-2 py-0.5 text-[12px] font-bold text-brand">
                      Sinal de {formatCurrency(s.depositAmount)}
                    </p>
                  </SelectableCard>
                ))}
              </div>
            )}
            <ClubeVitrine slug={slug} />
          </>
        )}

        {step === 'profissional' && (
          <>
            <StepHeader step="profissional" title={`Escolha ${prof.oS}`} />
            <div className="flex flex-col gap-3">
              {professionals.map((p) => (
                <SelectableCard key={p.id} selected={professionalId === p.id} onClick={() => setProfessionalId(p.id)}>
                  <p className="font-bold text-ink">{p.name}</p>
                </SelectableCard>
              ))}
            </div>
          </>
        )}

        {step === 'horario' && (
          <>
            <StepHeader step="horario" title="Escolha o dia e horário" />
            <label className="flex flex-col gap-1.5 text-[13px] font-semibold text-ink">
              Data
              <input
                type="date"
                aria-label="Data do agendamento"
                min={todayLocalIso()}
                value={date}
                onChange={(e) => loadAvailability(e.target.value)}
                className="h-11 rounded-control border border-line bg-surface px-3 text-[15px] text-ink"
              />
            </label>

            {date && availableSlots.length === 0 && (
              <p className="mt-4 text-sm text-muted">Nenhum horário livre nesta data. Tente outro dia.</p>
            )}

            {manha.length > 0 && (
              <div className="mt-4">
                <p className="mb-2 text-[13px] font-bold text-muted">Manhã</p>
                <div className="flex flex-wrap gap-2">
                  {manha.map((slot) => (
                    <button
                      key={slot}
                      type="button"
                      aria-pressed={time === slot}
                      onClick={() => setTime(slot)}
                      className={`rounded-control border px-4 py-2 text-sm font-semibold ${
                        time === slot ? 'border-brand bg-brand text-on-brand' : 'border-line bg-surface text-ink hover:border-brand/50'
                      }`}
                    >
                      {slot}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {tarde.length > 0 && (
              <div className="mt-4">
                <p className="mb-2 text-[13px] font-bold text-muted">Tarde</p>
                <div className="flex flex-wrap gap-2">
                  {tarde.map((slot) => (
                    <button
                      key={slot}
                      type="button"
                      aria-pressed={time === slot}
                      onClick={() => setTime(slot)}
                      className={`rounded-control border px-4 py-2 text-sm font-semibold ${
                        time === slot ? 'border-brand bg-brand text-on-brand' : 'border-line bg-surface text-ink hover:border-brand/50'
                      }`}
                    >
                      {slot}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </>
        )}

        {step === 'pagamento' && !pixResult && (
          <>
            <StepHeader step="pagamento" title="Seus dados" />
            {selectedService && (
              <div className="mb-4 rounded-card border border-line bg-surface-2 p-4 text-sm">
                <p className="font-bold text-ink">{selectedService.name}</p>
                <p className="text-muted">
                  {selectedProfessional?.name} · {new Date(`${date}T00:00:00`).toLocaleDateString('pt-BR')} às {time}
                </p>
                <div className="mt-2 flex justify-between border-t border-line pt-2">
                  <span className="text-muted">Total do serviço</span>
                  <span className="font-semibold text-ink">{formatCurrency(selectedService.price)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted">Sinal via Pix (agora)</span>
                  <span className="font-semibold text-ink">{formatCurrency(selectedService.depositAmount)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted">Restante no atendimento</span>
                  <span className="font-semibold text-ink">
                    {formatCurrency(selectedService.price - selectedService.depositAmount)}
                  </span>
                </div>
              </div>
            )}
            <div className="flex flex-col gap-3">
              <label className="flex flex-col gap-1.5 text-[13px] font-semibold text-ink">
                Seu nome
                <input
                  placeholder="Seu nome"
                  value={clientName}
                  onChange={(e) => setClientName(e.target.value)}
                  className="h-11 rounded-control border border-line bg-surface px-3 text-[15px] text-ink"
                />
              </label>
              <label className="flex flex-col gap-1.5 text-[13px] font-semibold text-ink">
                Seu WhatsApp
                <input
                  placeholder="Seu WhatsApp"
                  value={clientPhone}
                  onChange={(e) => setClientPhone(e.target.value)}
                  className="h-11 rounded-control border border-line bg-surface px-3 text-[15px] text-ink"
                />
              </label>
              <label className="mt-1 flex items-start gap-3 rounded-card border border-line bg-surface-2 p-3">
                <input
                  type="checkbox"
                  checked={whatsappConsent}
                  onChange={(e) => setWhatsappConsent(e.target.checked)}
                  aria-labelledby="consentimento-whatsapp"
                  aria-describedby="consentimento-whatsapp-ajuda"
                  className="mt-0.5 h-5 w-5 shrink-0 accent-brand"
                />
                <span className="flex flex-col gap-0.5">
                  <span id="consentimento-whatsapp" className="text-[14px] font-semibold text-ink">
                    Quero receber lembretes e novidades pelo WhatsApp de {storefront.name}
                  </span>
                  <span id="consentimento-whatsapp-ajuda" className="text-[13px] text-muted">
                    Você pode cancelar quando quiser, é só avisar o estabelecimento.
                  </span>
                </span>
              </label>
            </div>
          </>
        )}

        {step === 'pagamento' && pixResult && (
          <>
            <StepHeader step="pagamento" title="Pagamento do sinal via Pix" />
            <div className="flex flex-col gap-4 rounded-card border border-line bg-surface-2 p-5">
              <p className="font-bold text-ink">Pague o sinal de {formatCurrency(pixResult.depositAmount)} via Pix</p>
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
                className="h-24 rounded-lg border border-line bg-surface p-3 text-xs text-ink"
              />
              <Button type="button" onClick={copyPixCode}>
                {copied ? 'Copiado!' : 'Copiar código'}
              </Button>
              <p className="text-sm text-muted">
                Aguardando confirmação do estabelecimento. Você pode fechar esta página.
              </p>
            </div>
          </>
        )}
      </div>

      {step === 'servico' && storefront.services.length > 0 && (
        <BottomBar
          summary={serviceId && <>Serviço selecionado: <span className="font-semibold">{selectedService?.name}</span></>}
        >
          <Button type="button" disabled={!serviceId} loading={loadingNext} onClick={confirmService}>
            Continuar
          </Button>
        </BottomBar>
      )}

      {step === 'profissional' && (
        <BottomBar>
          <Button type="button" disabled={!professionalId} onClick={confirmProfessional}>
            Continuar
          </Button>
        </BottomBar>
      )}

      {step === 'horario' && (
        <BottomBar
          summary={time && (
            <>Agendamento: <span className="font-semibold">{new Date(`${date}T00:00:00`).toLocaleDateString('pt-BR')} às {time}</span></>
          )}
        >
          <Button type="button" disabled={!time} onClick={confirmTime}>
            Continuar
          </Button>
        </BottomBar>
      )}

      {step === 'pagamento' && !pixResult && (
        <BottomBar>
          <Button type="button" fullWidth disabled={submitting || !clientName || !clientPhone} loading={submitting} onClick={submit}>
            Confirmar agendamento
          </Button>
        </BottomBar>
      )}
    </div>
  );
}
