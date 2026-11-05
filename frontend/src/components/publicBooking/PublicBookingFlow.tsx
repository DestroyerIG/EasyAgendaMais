'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import axios from 'axios';
import QRCode from 'qrcode';
import { publicBookingApi, type StorefrontDto, type ProfessionalDto, type StorefrontServiceDto } from '@/lib/publicBooking';
import { getApiErrorMessage } from '@/utils/handleApiError';
import { Button, Icon } from '@/components/ui';
import { ClubeVitrine } from '@/components/clube/AdesaoClube';
import { cn } from '@/lib/cn';
import { termosDe } from '@/lib/vocabulario';
import { dataCurta, dataPorExtenso, formatarDuracao, hojeIso } from '@/lib/agendamentoPublico';
import {
  CabecalhoPublico, CascaPublica, MarcaPlataforma, NavegacaoPublica, ProgressoEtapas, type AbaPublica,
} from './CascaPublica';
import { EscolhaHorario } from './EscolhaHorario';
import { PerfilNegocio } from './PerfilNegocio';

type Step = 'perfil' | 'servico' | 'profissional' | 'horario' | 'pagamento';

const ABA_DA_ETAPA: Record<Exclude<Step, 'pagamento'>, AbaPublica> = {
  perfil: 'inicio', servico: 'servicos', profissional: 'servicos', horario: 'horario',
};

const SEM_SERVICOS = 'Nenhum serviço disponível para agendamento online no momento. Entre em contato diretamente com o estabelecimento.';

/** "HH:MM" no horário local a partir do ISO de expiração da reserva. */
const formatDeadline = (expiresAt: string): string =>
  new Date(expiresAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

const formatCurrency = (value: number): string =>
  value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const numeroWhatsapp = (whatsapp: string | null | undefined): string | null => {
  const digitos = (whatsapp ?? '').replace(/\D/g, '');
  if (!digitos) return null;
  return digitos.startsWith('55') && digitos.length >= 12 ? digitos : `55${digitos}`;
};

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
      className={cn(
        'flex items-start justify-between gap-3 rounded-card border bg-surface p-4 text-left shadow-sm transition-colors',
        selected ? 'border-brand' : 'border-transparent hover:border-brand/50',
      )}
    >
      <div className="min-w-0 flex-1">{children}</div>
      <span
        className={cn(
          'mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-lg',
          selected ? 'bg-brand text-on-brand' : 'bg-surface-2 text-transparent',
        )}
      >
        <Icon name="check" size={18} />
      </span>
    </button>
  );
}

function BarraAcao({ children }: { children: ReactNode }) {
  return <div className="border-t border-line bg-surface px-4 py-3">{children}</div>;
}

function Resumo({ rotulo, valor, destaque }: { rotulo: string; valor: string; destaque?: boolean }) {
  return (
    <div className={cn('flex flex-col justify-center rounded-control border p-2.5', destaque ? 'border-brand/30 bg-brand/10' : 'border-line bg-bg')}>
      <span className={cn('text-xs', destaque ? 'font-bold text-brand-text' : 'font-medium text-muted')}>{rotulo}</span>
      <span className={cn('text-[15px] tabular-nums', destaque ? 'font-extrabold text-brand-text' : 'font-bold text-ink')}>{valor}</span>
    </div>
  );
}

function TituloSecao({ numero, children }: { numero: number; children: ReactNode }) {
  return (
    <div className="flex items-center gap-2">
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand text-xs font-bold text-on-brand">{numero}</span>
      <h2 className="text-base font-bold text-ink">{children}</h2>
    </div>
  );
}

export function PublicBookingFlow({ slug }: { slug: string }) {
  const [storefront, setStorefront] = useState<StorefrontDto | null>(null);
  const { prof, segmento } = termosDe(storefront?.vocabulario);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState<Step>('perfil');
  const [serviceId, setServiceId] = useState<string | null>(null);
  const [loadingNext, setLoadingNext] = useState(false);
  const [professionals, setProfessionals] = useState<ProfessionalDto[]>([]);
  const [professionalId, setProfessionalId] = useState<string | null>(null);
  const [date, setDate] = useState('');
  const [availableSlots, setAvailableSlots] = useState<string[]>([]);
  const [loadingSlots, setLoadingSlots] = useState(false);
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
  // Só a última consulta de horários vale: trocar de dia rápido não pode mostrar a resposta antiga.
  const consultaHorarios = useRef(0);

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
    window.scrollTo(0, 0);
  }, [step]);

  useEffect(() => {
    publicBookingApi
      .getStorefront(slug)
      .then((dados) => {
        setStorefront(dados);
        // A contagem de etapas depende do tamanho da equipe. Se falhar aqui, "Continuar" tenta de novo.
        if (!dados.agendaPausada) publicBookingApi.getProfessionals(slug).then(setProfessionals).catch(() => undefined);
      })
      .catch(() => setError('Página não encontrada.'))
      .finally(() => setLoading(false));
  }, [slug]);

  const loadAvailability = async (selectedDate: string, profissional = professionalId) => {
    setDate(selectedDate);
    setTime(null);
    setError(null);
    if (!serviceId || !profissional || !selectedDate) return;
    const consulta = ++consultaHorarios.current;
    setLoadingSlots(true);
    try {
      const slots = await publicBookingApi.getAvailability(slug, { serviceId, professionalId: profissional, date: selectedDate });
      if (consulta === consultaHorarios.current) setAvailableSlots(slots);
    } catch {
      if (consulta !== consultaHorarios.current) return;
      setAvailableSlots([]);
      setError('Não foi possível carregar os horários disponíveis. Tente novamente.');
    } finally {
      if (consulta === consultaHorarios.current) setLoadingSlots(false);
    }
  };

  const goToHorario = (profissional: string) => {
    setStep('horario');
    void loadAvailability(date || hojeIso(), profissional);
  };

  const confirmService = async () => {
    if (!serviceId) return;
    setError(null);
    setLoadingNext(true);
    try {
      const list = professionals.length > 0 ? professionals : await publicBookingApi.getProfessionals(slug);
      setProfessionals(list);
      if (list.length === 0) {
        setError('O agendamento online está indisponível no momento. Entre em contato diretamente com o estabelecimento.');
      } else if (list.length === 1) {
        setProfessionalId(list[0].id);
        goToHorario(list[0].id);
      } else {
        setStep('profissional');
      }
    } catch {
      setError(`Não foi possível carregar ${prof.osP}. Tente novamente.`);
    } finally {
      setLoadingNext(false);
    }
  };

  const confirmProfessional = () => {
    if (professionalId) goToHorario(professionalId);
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

  if (loading) return <CascaPublica cor={null}><p className="p-8 text-center text-muted">Carregando...</p></CascaPublica>;
  if (error && !storefront) return <CascaPublica cor={null}><p className="p-8 text-center text-danger">{error}</p></CascaPublica>;
  if (!storefront) return null;

  const whatsapp = numeroWhatsapp(storefront.whatsapp);

  if (storefront.agendaPausada) {
    return (
      <CascaPublica cor={storefront.brandColor}>
        <CabecalhoPublico negocio={storefront.name} titulo="Agenda pausada" logoUrl={storefront.logoUrl} />
        <div className="flex flex-1 flex-col items-center justify-center gap-5 px-6 py-10 text-center">
          <p className="text-[15px] text-ink">
            A agenda online está pausada no momento. Fale direto com {storefront.name} pelo WhatsApp.
          </p>
          {whatsapp && (
            <a
              href={`https://wa.me/${whatsapp}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex min-h-11 items-center gap-2 rounded-control bg-whatsapp px-5 text-[14px] font-bold text-surface"
            >
              <Icon name="chat" size={18} />
              Chamar no WhatsApp
            </a>
          )}
        </div>
        <MarcaPlataforma />
      </CascaPublica>
    );
  }

  const selectedService: StorefrontServiceDto | undefined = storefront.services.find((s) => s.id === serviceId);
  const selectedProfessional = professionals.find((p) => p.id === professionalId);
  const totalEtapas = professionals.length >= 2 ? 4 : 3;
  const semServicos = storefront.services.length === 0;
  const tituloEtapa: Record<Step, string> = {
    perfil: 'Perfil', servico: 'Serviços', profissional: prof.S, horario: 'Horário', pagamento: 'Pagamento',
  };

  return (
    <CascaPublica cor={storefront.brandColor}>
      <CabecalhoPublico
        negocio={storefront.name}
        titulo={tituloEtapa[step]}
        logoUrl={storefront.logoUrl}
        onVoltar={step === 'pagamento' && !pixResult ? () => setStep('horario') : undefined}
      />

      <main className={cn('flex-1', step !== 'perfil' && 'px-4 pb-6 pt-4')}>
        {error && (
          <p role="alert" className={cn('mb-4 text-sm text-danger', step === 'perfil' && 'px-4 pt-4')}>
            {error}
          </p>
        )}

        {step === 'perfil' && (
          <PerfilNegocio
            storefront={storefront}
            especialidade={segmento === 'outro' ? null : prof.S}
            semServicos={semServicos ? SEM_SERVICOS : null}
          />
        )}

        {step === 'servico' && (
          <>
            <ProgressoEtapas etapa={1} total={totalEtapas} rotulo="Serviços" />
            <h1 className="text-[22px] font-bold text-ink">Selecione o serviço</h1>
            <p className="mb-4 text-sm text-muted">Escolha o serviço desejado para verificar os horários disponíveis.</p>
            {semServicos ? (
              <p className="text-sm text-muted">{SEM_SERVICOS}</p>
            ) : (
              <>
                <div className="flex flex-col gap-3">
                  {storefront.services.map((s) => (
                    <SelectableCard key={s.id} selected={serviceId === s.id} onClick={() => setServiceId(s.id)}>
                      <span className="mb-1 flex flex-wrap items-center gap-2">
                        <span className="text-[17px] font-bold text-ink">{s.name}</span>
                        <span className="inline-flex rounded-full bg-brand/12 px-2 py-0.5 text-[12px] font-bold text-brand-text">
                          Sinal de {formatCurrency(s.depositAmount)}
                        </span>
                      </span>
                      <span className="block text-[13px] text-muted">
                        <span className="font-bold tabular-nums text-ink">{formatCurrency(s.price)}</span>
                        {' · '}
                        <span className="tabular-nums">{formatarDuracao(s.durationMinutes)}</span>
                      </span>
                    </SelectableCard>
                  ))}
                </div>
                <div className="mt-5 flex items-center gap-3 rounded-card bg-surface-2 p-4">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-surface text-brand-text">
                    <Icon name="info" size={20} />
                  </span>
                  <p className="text-sm text-muted">
                    O sinal confirma seu horário na agenda e é descontado do valor do serviço no dia do atendimento.
                  </p>
                </div>
              </>
            )}
            <ClubeVitrine slug={slug} />
          </>
        )}

        {step === 'profissional' && (
          <>
            <ProgressoEtapas etapa={2} total={totalEtapas} rotulo={prof.S} />
            <h1 className="mb-4 text-[22px] font-bold text-ink">Escolha {prof.oS}</h1>
            <div className="flex flex-col gap-3">
              {professionals.map((p) => (
                <SelectableCard key={p.id} selected={professionalId === p.id} onClick={() => setProfessionalId(p.id)}>
                  <span className="font-bold text-ink">{p.name}</span>
                </SelectableCard>
              ))}
            </div>
          </>
        )}

        {step === 'horario' && selectedService && (
          <>
            <ProgressoEtapas etapa={totalEtapas - 1} total={totalEtapas} rotulo="Data e horário" />
            <EscolhaHorario
              servico={selectedService}
              profissional={selectedProfessional?.name}
              data={date}
              horarios={availableSlots}
              carregando={loadingSlots}
              horario={time}
              onData={(dia) => void loadAvailability(dia)}
              onHorario={setTime}
            />
          </>
        )}

        {step === 'pagamento' && selectedService && (
          <>
            <ProgressoEtapas etapa={totalEtapas} total={totalEtapas} rotulo="Finalização segura" />
            <div className="flex flex-col gap-4">
              <section className="flex flex-col gap-3.5 rounded-card border border-line bg-surface p-4 shadow-sm">
                <div>
                  <span className="text-xs font-bold uppercase tracking-wide text-brand-text">Agendamento selecionado</span>
                  <h1 className="mt-0.5 text-xl font-bold text-ink">{selectedService.name}</h1>
                </div>
                <div className="flex flex-col gap-2.5 rounded-control border border-line/60 bg-bg p-3">
                  <div className="flex items-start gap-2.5">
                    <Icon name="calendar_today" className="mt-0.5 shrink-0 text-brand-text" />
                    <div className="flex min-w-0 flex-col">
                      <span className="text-sm font-semibold text-ink">{dataPorExtenso(date)} às {time}</span>
                      <span className="text-xs text-muted">Duração estimada: {formatarDuracao(selectedService.durationMinutes)}</span>
                    </div>
                  </div>
                  {selectedProfessional && (
                    <div className="flex items-center gap-2.5">
                      <Icon name="person" className="shrink-0 text-brand-text" />
                      <span className="text-sm font-medium text-ink">{selectedProfessional.name}</span>
                    </div>
                  )}
                  {storefront.address && (
                    <div className="flex items-start gap-2.5">
                      <Icon name="location_on" className="mt-0.5 shrink-0 text-brand-text" />
                      <span className="text-sm leading-snug text-muted">{storefront.address}</span>
                    </div>
                  )}
                </div>
                <div className="grid grid-cols-3 gap-2 text-center">
                  <Resumo rotulo="Total" valor={formatCurrency(selectedService.price)} />
                  <Resumo rotulo="Sinal Pix" valor={formatCurrency(selectedService.depositAmount)} destaque />
                  <Resumo rotulo="No atendimento" valor={formatCurrency(selectedService.price - selectedService.depositAmount)} />
                </div>
              </section>

              {!pixResult && (
                <section className="flex flex-col gap-3.5 rounded-card border border-line bg-surface p-4 shadow-sm">
                  <TituloSecao numero={1}>Seus dados rápidos</TituloSecao>
                  <label className="flex flex-col gap-1 text-xs font-semibold text-muted">
                    Seu nome completo
                    <input
                      placeholder="Seu nome"
                      value={clientName}
                      onChange={(e) => setClientName(e.target.value)}
                      className="h-11 rounded-control border border-line bg-bg px-3.5 text-[15px] font-normal text-ink focus:border-brand focus:bg-surface focus:outline-none"
                    />
                  </label>
                  <label className="flex flex-col gap-1 text-xs font-semibold text-muted">
                    WhatsApp (com DDD)
                    <input
                      type="tel"
                      placeholder="Seu WhatsApp"
                      value={clientPhone}
                      onChange={(e) => setClientPhone(e.target.value)}
                      className="h-11 rounded-control border border-line bg-bg px-3.5 text-[15px] font-normal text-ink focus:border-brand focus:bg-surface focus:outline-none"
                    />
                  </label>
                  <label className="flex items-start gap-3 pt-1">
                    <input
                      type="checkbox"
                      checked={whatsappConsent}
                      onChange={(e) => setWhatsappConsent(e.target.checked)}
                      aria-labelledby="consentimento-whatsapp"
                      aria-describedby="consentimento-whatsapp-ajuda"
                      className="mt-0.5 h-5 w-5 shrink-0 accent-brand"
                    />
                    <span className="flex flex-col gap-0.5">
                      <span id="consentimento-whatsapp" className="text-[13px] font-medium text-ink">
                        Quero receber lembretes e novidades pelo WhatsApp de {storefront.name}
                      </span>
                      <span id="consentimento-whatsapp-ajuda" className="text-xs text-muted">
                        Você pode cancelar quando quiser, é só avisar o estabelecimento.
                      </span>
                    </span>
                  </label>
                </section>
              )}

              <section className="flex flex-col gap-3.5 rounded-card border border-line bg-surface p-4 shadow-sm">
                <TituloSecao numero={pixResult ? 1 : 2}>Pagamento do sinal Pix</TituloSecao>
                {!pixResult ? (
                  <p className="text-sm text-muted">
                    O sinal é descontado no dia do atendimento. O código Pix aparece assim que você confirmar.
                  </p>
                ) : (
                  <>
                    <p className="text-sm font-semibold text-ink">
                      Pague até {formatDeadline(pixResult.expiresAt)}. Depois disso, o horário é liberado para outras pessoas.
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
                      className="h-24 rounded-control border border-line bg-bg p-3 text-xs text-ink"
                    />
                    <Button type="button" onClick={copyPixCode}>
                      {copied ? 'Copiado!' : 'Copiar código'}
                    </Button>
                    <p className="text-sm text-muted">Aguardando confirmação do estabelecimento. Você pode fechar esta página.</p>
                  </>
                )}
              </section>
            </div>
          </>
        )}
      </main>

      <div className="sticky bottom-0 z-20 shadow-lg">
        {step === 'perfil' && (!semServicos || whatsapp) && (
          <BarraAcao>
            <div className="flex flex-col gap-1">
              {!semServicos && (
                <Button type="button" size="lg" fullWidth onClick={() => setStep('servico')}>
                  <Icon name="calendar_month" />
                  Agendar horário
                </Button>
              )}
              {whatsapp && (
                <a
                  href={`https://wa.me/${whatsapp}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex min-h-11 items-center justify-center gap-2 text-[13px] font-bold text-whatsapp"
                >
                  <Icon name="chat" />
                  Tirar dúvidas no WhatsApp
                </a>
              )}
            </div>
          </BarraAcao>
        )}

        {step === 'servico' && !semServicos && (
          <BarraAcao>
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                {selectedService ? (
                  <>
                    <p className="truncate text-xs text-muted">{selectedService.name}</p>
                    <p className="text-[15px] font-bold tabular-nums text-ink">Total: {formatCurrency(selectedService.price)}</p>
                    <p className="truncate text-xs font-bold text-brand-text">Sinal necessário: {formatCurrency(selectedService.depositAmount)}</p>
                  </>
                ) : (
                  <p className="text-[13px] text-muted">Nenhum serviço selecionado</p>
                )}
              </div>
              <Button type="button" size="lg" disabled={!serviceId} loading={loadingNext} onClick={confirmService}>
                Continuar
              </Button>
            </div>
          </BarraAcao>
        )}

        {step === 'profissional' && (
          <BarraAcao>
            <Button type="button" size="lg" fullWidth disabled={!professionalId} onClick={confirmProfessional}>
              Continuar
            </Button>
          </BarraAcao>
        )}

        {step === 'horario' && (
          <BarraAcao>
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-xs text-muted">Agendamento</p>
                <p className="truncate text-[14px] font-bold text-ink">
                  {time ? `${dataCurta(date)} às ${time}` : 'Escolha um horário'}
                </p>
              </div>
              <Button type="button" size="lg" disabled={!time} onClick={confirmTime}>
                Continuar
              </Button>
            </div>
          </BarraAcao>
        )}

        {step === 'pagamento' && !pixResult && (
          <BarraAcao>
            <Button type="button" size="lg" fullWidth disabled={submitting || !clientName || !clientPhone} loading={submitting} onClick={submit}>
              Confirmar agendamento
            </Button>
            <p className="mt-1.5 text-center text-xs text-muted">Sem necessidade de cadastro com senha</p>
          </BarraAcao>
        )}

        {step !== 'pagamento' && (
          <NavegacaoPublica
            ativa={ABA_DA_ETAPA[step]}
            iconeServicos={segmento === 'barbearia' ? 'content_cut' : 'spa'}
            horarioDisponivel={Boolean(serviceId) && (step !== 'profissional' || Boolean(professionalId))}
            onInicio={() => setStep('perfil')}
            onServicos={() => setStep('servico')}
            onHorario={() => (step === 'profissional' ? confirmProfessional() : void confirmService())}
          />
        )}
        <MarcaPlataforma />
      </div>
    </CascaPublica>
  );
}
