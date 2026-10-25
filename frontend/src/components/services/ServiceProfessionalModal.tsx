'use client';

import { useState, useEffect, useRef } from 'react';
import { Modal, ModalFooter, Field, Input, Button } from '@/components/ui';
import { Scissors, Camera, Save, X, Loader2 } from 'lucide-react';
import type { Service, Professional } from '@/types';
import { getSupabaseClient } from '@/lib/supabase/client';
import { useToast } from '@/components/Toast';
import { isValidCnpj } from '@/utils/cpfCnpj';
import { AcessoAppProfissional } from './AcessoAppProfissional';
import { useVocabulario } from '@/hooks/useVocabulario';

export interface ServiceFormData {
  name: string;
  price: string;
  duration_minutes: string;
  deposit_percentage: string;
}

export interface ProfessionalFormData {
  name: string;
  photo: string;
  breakStart: string | null;
  breakEnd: string | null;
  commissionServicePct: number | null;
  commissionProductPct: number | null;
  especialidade: string | null;
  cnpj: string | null;
}

// Estado do formulário: os campos novos ficam como texto até o envio.
interface ProfessionalFormState {
  name: string;
  photo: string;
  breakStart: string;
  breakEnd: string;
  commissionServicePct: string;
  commissionProductPct: string;
  especialidade: string;
  cnpj: string;
}

const EMPTY_PROFESSIONAL: ProfessionalFormState = {
  name: '', photo: '', breakStart: '', breakEnd: '', commissionServicePct: '', commissionProductPct: '', especialidade: '', cnpj: '',
};

// Máscara 00.000.000/0000-00 enquanto digita.
const mascaraCnpj = (v: string) => {
  const d = v.replace(/\D/g, '').slice(0, 14);
  return d
    .replace(/^(\d{2})(\d)/, '$1.$2')
    .replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3')
    .replace(/\.(\d{3})(\d)/, '.$1/$2')
    .replace(/(\d{4})(\d)/, '$1-$2');
};

const pctOuNull = (v: string) => (v.trim() === '' || Number.isNaN(parseFloat(v)) ? null : parseFloat(v));

interface ServiceProfessionalModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmitService: (data: ServiceFormData) => Promise<void>;
  onSubmitProfessional: (data: ProfessionalFormData) => Promise<void>;
  activeTab: 'servicos' | 'profissionais';
  editingItem: Service | Professional | null;
}

const BUCKET = 'professional-photos';

export const ServiceProfessionalModal = ({
  isOpen,
  onClose,
  onSubmitService,
  onSubmitProfessional,
  activeTab,
  editingItem,
}: ServiceProfessionalModalProps) => {
  const [serviceForm, setServiceForm] = useState<ServiceFormData>({ name: '', price: '', duration_minutes: '', deposit_percentage: '' });
  const [professionalForm, setProfessionalForm] = useState<ProfessionalFormState>(EMPTY_PROFESSIONAL);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string>('');
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { showToast } = useToast();
  const { prof } = useVocabulario();

  useEffect(() => {
    if (!isOpen) return;
    setPhotoFile(null);
    setPhotoPreview('');
    if (activeTab === 'servicos') {
      if (editingItem && 'price' in editingItem) {
        setServiceForm({
          name: editingItem.name,
          price: editingItem.price.toString(),
          duration_minutes: editingItem.duration_minutes.toString(),
          deposit_percentage: editingItem.deposit_percentage != null ? editingItem.deposit_percentage.toString() : '',
        });
      } else {
        setServiceForm({ name: '', price: '', duration_minutes: '', deposit_percentage: '' });
      }
    } else {
      if (editingItem && 'photo' in editingItem) {
        const existingPhoto = (editingItem as Professional).photo || '';
        const prof = editingItem as Professional;
        setProfessionalForm({
          name: editingItem.name,
          photo: existingPhoto,
          breakStart: prof.breakStart ?? '',
          breakEnd: prof.breakEnd ?? '',
          commissionServicePct: prof.commissionServicePct != null ? String(prof.commissionServicePct) : '',
          commissionProductPct: prof.commissionProductPct != null ? String(prof.commissionProductPct) : '',
          especialidade: prof.especialidade ?? '',
          cnpj: prof.cnpj ? mascaraCnpj(prof.cnpj) : '',
        });
        setPhotoPreview(existingPhoto);
      } else {
        setProfessionalForm(EMPTY_PROFESSIONAL);
      }
    }
  }, [isOpen, editingItem, activeTab]);

  const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      showToast('Foto deve ter no máximo 5 MB.', 'error');
      return;
    }

    setPhotoFile(file);
    const reader = new FileReader();
    reader.onload = () => setPhotoPreview(reader.result as string);
    reader.readAsDataURL(file);
  };

  const clearPhoto = () => {
    setPhotoFile(null);
    setPhotoPreview('');
    setProfessionalForm(prev => ({ ...prev, photo: '' }));
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const uploadPhoto = async (file: File): Promise<string> => {
    const supabase = getSupabaseClient();
    const ext = file.name.split('.').pop() ?? 'jpg';
    const path = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;

    setUploading(true);
    try {
      const { error: uploadError } = await supabase.storage
        .from(BUCKET)
        .upload(path, file, { upsert: true, contentType: file.type });

      if (uploadError) {
        throw new Error(uploadError.message);
      }

      const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
      return data.publicUrl;
    } finally {
      setUploading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (activeTab === 'profissionais') {
      const { breakStart, breakEnd } = professionalForm;
      if (Boolean(breakStart) !== Boolean(breakEnd) || (breakStart && breakEnd && breakEnd <= breakStart)) {
        showToast(
          breakStart && breakEnd ? 'O fim do intervalo deve ser depois do início' : 'Informe início e fim do intervalo',
          'error',
        );
        return;
      }
      const invalida = [professionalForm.commissionServicePct, professionalForm.commissionProductPct].some(v => {
        const n = pctOuNull(v);
        return n !== null && (n < 0 || n > 100);
      });
      if (invalida) {
        showToast('Comissão deve ficar entre 0% e 100%', 'error');
        return;
      }
      if (professionalForm.cnpj.trim() && !isValidCnpj(professionalForm.cnpj)) {
        showToast('CNPJ inválido', 'error');
        return;
      }
    }
    setSubmitting(true);
    try {
      if (activeTab === 'servicos') {
        await onSubmitService(serviceForm);
      } else {
        let photoUrl = professionalForm.photo;

        if (photoFile) {
          try {
            photoUrl = await uploadPhoto(photoFile);
          } catch (err) {
            const msg = err instanceof Error ? err.message : 'Erro desconhecido';
            showToast(`Falha no upload da foto: ${msg}`, 'error');
            return;
          }
        }

        await onSubmitProfessional({
          name: professionalForm.name,
          photo: photoUrl,
          breakStart: professionalForm.breakStart || null,
          breakEnd: professionalForm.breakEnd || null,
          commissionServicePct: pctOuNull(professionalForm.commissionServicePct),
          commissionProductPct: pctOuNull(professionalForm.commissionProductPct),
          especialidade: professionalForm.especialidade.trim() || null,
          cnpj: professionalForm.cnpj.replace(/\D/g, '') || null,
        });
      }
      onClose();
    } finally {
      setSubmitting(false);
    }
  };

  const title = activeTab === 'servicos'
    ? (editingItem ? 'Editar Serviço' : 'Novo Serviço')
    : (editingItem ? `Editar ${prof.s}` : `${prof.g('Nova', 'Novo')} ${prof.s}`);

  const isLoading = submitting || uploading;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={title}
      icon={activeTab === 'servicos' ? Scissors : undefined}
      footer={
        <ModalFooter
          onCancel={onClose}
          onSubmit={() => {
            const form = document.getElementById('service-professional-form') as HTMLFormElement;
            form?.requestSubmit();
          }}
          submitLabel={uploading ? 'Enviando foto...' : 'Salvar'}
          submitIcon={uploading ? Loader2 : Save}
          submitting={isLoading}
        />
      }
    >
      <form id="service-professional-form" onSubmit={handleSubmit} method="post" className="space-y-6">
        {activeTab === 'servicos' ? (
          <>
            <Field id="service-name" label="Nome do Serviço">
              <Input
                id="service-name"
                required
                type="text"
                value={serviceForm.name}
                onChange={e => setServiceForm({ ...serviceForm, name: e.target.value })}
                placeholder="Ex: Corte Degradê"
              />
            </Field>
            <div className="grid grid-cols-2 gap-4">
              <Field id="service-price" label="Preço (R$)">
                <Input
                  id="service-price"
                  required
                  type="number"
                  step="0.01"
                  value={serviceForm.price}
                  onChange={e => setServiceForm({ ...serviceForm, price: e.target.value })}
                  placeholder="50.00"
                />
              </Field>
              <Field id="service-duration" label="Duração (Min)">
                <Input
                  id="service-duration"
                  required
                  type="number"
                  value={serviceForm.duration_minutes}
                  onChange={e => setServiceForm({ ...serviceForm, duration_minutes: e.target.value })}
                  placeholder="30"
                />
              </Field>
            </div>
            <Field id="service-deposit-percentage" label="Sinal (%)">
              <Input
                id="service-deposit-percentage"
                type="number"
                min={0}
                max={100}
                value={serviceForm.deposit_percentage}
                onChange={e => setServiceForm({ ...serviceForm, deposit_percentage: e.target.value })}
                placeholder="Opcional — ex: 30"
              />
            </Field>
          </>
        ) : (
          <>
            <Field id="professional-name" label={`Nome ${prof.doS}`}>
              <Input
                id="professional-name"
                required
                type="text"
                value={professionalForm.name}
                onChange={e => setProfessionalForm({ ...professionalForm, name: e.target.value })}
                placeholder="Ex: Gabriel Souza"
              />
            </Field>

            <Field id="professional-especialidade" label="Especialidade (opcional)">
              <Input
                id="professional-especialidade"
                type="text"
                maxLength={80}
                value={professionalForm.especialidade}
                onChange={e => setProfessionalForm({ ...professionalForm, especialidade: e.target.value })}
                placeholder="Ex: Nail designer"
              />
            </Field>

            <Field id="professional-photo" label="Foto (Opcional)">
              <input
                ref={fileInputRef}
                id="professional-photo"
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handlePhotoChange}
              />

              {photoPreview ? (
                <div className="relative flex items-center gap-4">
                  <div className="h-20 w-20 shrink-0 overflow-hidden rounded-full border border-line bg-surface-2">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={photoPreview}
                      alt="Prévia da foto"
                      className="h-full w-full object-cover"
                    />
                  </div>
                  <div className="flex flex-col gap-2">
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      onClick={() => fileInputRef.current?.click()}
                    >
                      <Camera className="h-3.5 w-3.5" aria-hidden="true" /> Trocar foto
                    </Button>
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      className="text-danger"
                      onClick={clearPhoto}
                    >
                      <X className="h-3.5 w-3.5" aria-hidden="true" /> Remover foto
                    </Button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="flex w-full cursor-pointer flex-col items-center justify-center gap-2 rounded-control border border-dashed border-line py-8 text-muted transition hover:border-brand/40 hover:text-brand-text"
                >
                  <Camera className="h-7 w-7" aria-hidden="true" />
                  <span className="text-[15px]">Clique para selecionar uma foto</span>
                  <span className="text-[13px] text-muted">JPG, PNG ou WEBP · máx. 5 MB</span>
                </button>
              )}
            </Field>

            <fieldset className="space-y-3">
              <legend className="text-[13px] font-semibold text-ink">Intervalo</legend>
              <div className="grid grid-cols-2 gap-4">
                <Field id="professional-break-start" label="Início do almoço">
                  <Input
                    id="professional-break-start"
                    type="time"
                    value={professionalForm.breakStart}
                    onChange={e => setProfessionalForm({ ...professionalForm, breakStart: e.target.value })}
                  />
                </Field>
                <Field id="professional-break-end" label="Fim do almoço">
                  <Input
                    id="professional-break-end"
                    type="time"
                    value={professionalForm.breakEnd}
                    onChange={e => setProfessionalForm({ ...professionalForm, breakEnd: e.target.value })}
                  />
                </Field>
              </div>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => setProfessionalForm({ ...professionalForm, breakStart: '', breakEnd: '' })}
              >
                Sem intervalo
              </Button>
            </fieldset>

            <fieldset className="space-y-3">
              <legend className="text-[13px] font-semibold text-ink">Comissão própria</legend>
              <div className="grid grid-cols-2 gap-4">
                <Field id="professional-commission-service" label="% sobre serviços">
                  <Input
                    id="professional-commission-service"
                    type="number"
                    step="0.01"
                    value={professionalForm.commissionServicePct}
                    onChange={e => setProfessionalForm({ ...professionalForm, commissionServicePct: e.target.value })}
                  />
                </Field>
                <Field id="professional-commission-product" label="% sobre produtos">
                  <Input
                    id="professional-commission-product"
                    type="number"
                    step="0.01"
                    value={professionalForm.commissionProductPct}
                    onChange={e => setProfessionalForm({ ...professionalForm, commissionProductPct: e.target.value })}
                  />
                </Field>
              </div>
              <p className="text-[13px] text-muted">Deixe em branco para usar a comissão padrão de Ajustes</p>
            </fieldset>

            <Field id="professional-cnpj" label="CNPJ do MEI (opcional)" hint="Usado no salão-parceiro e no comprovante de repasse">
              <Input
                id="professional-cnpj"
                inputMode="numeric"
                value={professionalForm.cnpj}
                onChange={e => setProfessionalForm({ ...professionalForm, cnpj: mascaraCnpj(e.target.value) })}
                placeholder="00.000.000/0000-00"
              />
            </Field>

            {editingItem && 'photo' in editingItem && (
              <AcessoAppProfissional professionalId={editingItem.id} ativa={(editingItem as Professional).active !== false} />
            )}
          </>
        )}
      </form>
    </Modal>
  );
};
