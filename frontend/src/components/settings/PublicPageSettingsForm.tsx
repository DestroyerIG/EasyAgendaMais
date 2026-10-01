'use client';

import { useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import { Check, Loader2, Plus, X } from 'lucide-react';
import { businessPublicPageApi, type PublicPageSettings } from '@/lib/businessPublicPage';
import { getApiErrorMessage } from '@/utils/handleApiError';
import { useAuth } from '@/contexts/AuthContext';
import { Card, Field, Input, Select, Textarea, Button } from '@/components/ui';

const MAX_GALLERY_PHOTOS = 6;
const SLUG_CHECK_DEBOUNCE_MS = 500;

const PIX_KEY_TYPES: { value: NonNullable<PublicPageSettings['pixKeyType']>; label: string }[] = [
  { value: 'cpf', label: 'CPF' },
  { value: 'cnpj', label: 'CNPJ' },
  { value: 'email', label: 'E-mail' },
  { value: 'telefone', label: 'Telefone' },
  { value: 'aleatoria', label: 'Chave aleatória' },
];

const BRAND_COLOR_SWATCHES = ['#FF7A00', '#DC2626', '#16A34A', '#2563EB', '#9333EA', '#111827'];

const DEFAULT_BRAND_COLOR = '#FF7A00';

type SlugStatus = 'idle' | 'checking' | 'available' | 'taken' | 'invalid';

// Upload passa pelo backend (businessPublicPageApi.uploadImage), nunca direto do
// navegador pro Supabase Storage: o cliente Supabase do navegador não tem sessão
// autenticada própria (o login do app é por cookie/JWT nosso), então RLS sempre
// rejeitaria o upload com "row-level security policy".
const uploadImage = (file: File): Promise<string> => businessPublicPageApi.uploadImage(file);

export function PublicPageSettingsForm() {
  const { user } = useAuth();
  const [settings, setSettings] = useState<PublicPageSettings | null>(null);
  const [slug, setSlug] = useState('');
  const [pixKey, setPixKey] = useState('');
  const [pixKeyType, setPixKeyType] = useState<PublicPageSettings['pixKeyType']>('telefone');
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [brandColor, setBrandColor] = useState(DEFAULT_BRAND_COLOR);
  const [galleryPhotos, setGalleryPhotos] = useState<string[]>([]);
  const [address, setAddress] = useState('');

  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [uploadingGallery, setUploadingGallery] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedMessage, setSavedMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [slugStatus, setSlugStatus] = useState<SlugStatus>('idle');

  const originalSlugRef = useRef('');
  const logoInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    businessPublicPageApi
      .getSettings()
      .then((data) => {
        setSettings(data);
        setSlug(data.slug ?? '');
        originalSlugRef.current = data.slug ?? '';
        setPixKey(data.pixKey ?? '');
        setPixKeyType(data.pixKeyType ?? 'telefone');
        setLogoUrl(data.logoUrl);
        setBrandColor(data.brandColor ?? DEFAULT_BRAND_COLOR);
        setGalleryPhotos(data.galleryPhotos ?? []);
        setAddress(data.address ?? '');
      })
      .catch((err) => {
        setErrorMessage(getApiErrorMessage(err, 'Não foi possível carregar as configurações.'));
      });
  }, []);

  useEffect(() => {
    if (!slug || slug === originalSlugRef.current) {
      setSlugStatus('idle');
      return;
    }
    if (!/^[a-z0-9-]{3,100}$/.test(slug)) {
      setSlugStatus('invalid');
      return;
    }

    setSlugStatus('checking');
    const handle = setTimeout(() => {
      businessPublicPageApi
        .checkSlugAvailability(slug)
        .then((available) => setSlugStatus(available ? 'available' : 'taken'))
        .catch(() => setSlugStatus('idle'));
    }, SLUG_CHECK_DEBOUNCE_MS);

    return () => clearTimeout(handle);
  }, [slug]);

  const handleLogoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadingLogo(true);
    setErrorMessage(null);
    try {
      setLogoUrl(await uploadImage(file));
    } catch (err) {
      setErrorMessage(getApiErrorMessage(err, 'Falha ao enviar a imagem. Tente novamente.'));
    } finally {
      setUploadingLogo(false);
      if (logoInputRef.current) logoInputRef.current.value = '';
    }
  };

  const handleGalleryAdd = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (!files.length) return;

    const room = MAX_GALLERY_PHOTOS - galleryPhotos.length;
    const toUpload = files.slice(0, room);

    setUploadingGallery(true);
    setErrorMessage(null);
    try {
      const urls = await Promise.all(toUpload.map(uploadImage));
      setGalleryPhotos((prev) => [...prev, ...urls].slice(0, MAX_GALLERY_PHOTOS));
    } catch (err) {
      setErrorMessage(getApiErrorMessage(err, 'Falha ao enviar as fotos. Tente novamente.'));
    } finally {
      setUploadingGallery(false);
      if (galleryInputRef.current) galleryInputRef.current.value = '';
    }
  };

  const removeGalleryPhoto = (url: string) => {
    setGalleryPhotos((prev) => prev.filter((photo) => photo !== url));
  };

  const submit = async () => {
    setSaving(true);
    setSavedMessage(null);
    setErrorMessage(null);
    try {
      const updated = await businessPublicPageApi.updateSettings({
        slug,
        pixKey,
        pixKeyType: pixKeyType ?? undefined,
        logoUrl: logoUrl ?? undefined,
        brandColor,
        galleryPhotos,
        address,
      });
      setSettings(updated);
      originalSlugRef.current = updated.slug ?? '';
      setSlugStatus('idle');
      setSavedMessage('Configurações salvas.');
    } catch (err) {
      // Ex.: link já usado por outro negócio (409) ou chave Pix em formato inválido (400).
      setErrorMessage(getApiErrorMessage(err, 'Não foi possível salvar as configurações. Tente novamente.'));
    } finally {
      setSaving(false);
    }
  };

  if (!settings) return <div className="p-6 text-muted">Carregando...</div>;

  const businessName = user?.businessName ?? '';
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const domainLabel = origin.replace(/^https?:\/\//, '');
  const publicPath = `/agendar/${slug || '...'}`;

  return (
    <div className="flex flex-col gap-6 p-4 sm:p-6 lg:flex-row lg:items-start">
      <div className="flex flex-1 flex-col gap-4">
        <div>
          <h1 className="text-2xl font-bold text-ink">Personalize a página pública que seus clientes verão</h1>
          <p className="mt-1 text-[15px] text-muted">
            Essas informações aparecem na sua vitrine de agendamento online — pagamento do sinal incluído.
          </p>
        </div>

        <Card className="flex flex-col gap-3">
          <h2 className="text-[15px] font-bold text-ink">Logo ou foto do seu negócio</h2>
          <div className="flex items-center gap-4">
            <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-full border border-line bg-surface-2">
              {logoUrl ? (
                <Image src={logoUrl} alt="" width={64} height={64} className="h-full w-full object-cover" unoptimized />
              ) : (
                <span className="text-xs text-muted">Logo</span>
              )}
            </div>
            <div className="flex flex-col gap-1">
              <input
                ref={logoInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                aria-label="Enviar logo"
                onChange={handleLogoChange}
              />
              <Button type="button" variant="secondary" size="sm" loading={uploadingLogo} onClick={() => logoInputRef.current?.click()}>
                {uploadingLogo ? 'Enviando...' : 'Trocar foto'}
              </Button>
              <p className="text-[13px] text-muted">PNG ou JPG, até 2MB</p>
            </div>
          </div>
        </Card>

        <Card className="flex flex-col gap-3">
          <h2 className="text-[15px] font-bold text-ink">Cor de destaque</h2>
          <div className="flex flex-wrap items-center gap-2">
            {BRAND_COLOR_SWATCHES.map((color) => (
              <button
                key={color}
                type="button"
                aria-label={`Usar cor ${color}`}
                aria-pressed={brandColor.toLowerCase() === color.toLowerCase()}
                onClick={() => setBrandColor(color)}
                className="relative h-9 w-9 rounded-full border border-line"
                style={{ backgroundColor: color }}
              >
                {brandColor.toLowerCase() === color.toLowerCase() && (
                  <Check className="absolute inset-0 m-auto h-4 w-4 text-on-brand" aria-hidden="true" />
                )}
              </button>
            ))}
            <label className="flex items-center gap-2 text-[13px] text-muted">
              Outra cor
              <input
                type="color"
                aria-label="Cor de destaque personalizada"
                value={/^#[0-9A-Fa-f]{6}$/.test(brandColor) ? brandColor : DEFAULT_BRAND_COLOR}
                onChange={(e) => setBrandColor(e.target.value)}
                className="h-9 w-9 cursor-pointer rounded-full border border-line bg-transparent p-0"
              />
            </label>
          </div>
        </Card>

        <Card className="flex flex-col gap-3">
          <h2 className="text-[15px] font-bold text-ink">Galeria de fotos dos seus trabalhos</h2>
          <p className="text-[13px] text-muted">Clientes veem isso antes de agendar. Até {MAX_GALLERY_PHOTOS} fotos.</p>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
            {galleryPhotos.map((url) => (
              <div key={url} className="relative aspect-square overflow-hidden rounded-control border border-line">
                <Image src={url} alt="" fill unoptimized className="object-cover" />
                <button
                  type="button"
                  aria-label="Remover foto"
                  onClick={() => removeGalleryPhoto(url)}
                  className="absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded-full bg-ink/70 text-surface"
                >
                  <X className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
              </div>
            ))}
            {galleryPhotos.length < MAX_GALLERY_PHOTOS && (
              <label className="flex aspect-square cursor-pointer items-center justify-center rounded-control border border-dashed border-line text-muted hover:border-brand hover:text-brand">
                {uploadingGallery ? (
                  <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
                ) : (
                  <Plus className="h-5 w-5" aria-hidden="true" />
                )}
                <input
                  ref={galleryInputRef}
                  type="file"
                  accept="image/*"
                  multiple
                  className="hidden"
                  aria-label="Adicionar fotos à galeria"
                  onChange={handleGalleryAdd}
                  disabled={uploadingGallery}
                />
              </label>
            )}
          </div>
        </Card>

        <Card className="flex flex-col gap-3">
          <h2 className="text-[15px] font-bold text-ink">Localização</h2>
          <Field id="public-page-address" label="Endereço" hint="Aparece com um mapa na sua página pública.">
            <Textarea
              id="public-page-address"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="Rua Exemplo, 123 - Bairro, Cidade - UF"
              rows={2}
            />
          </Field>
        </Card>

        <Card className="flex flex-col gap-3">
          <h2 className="text-[15px] font-bold text-ink">Nome da página / link exclusivo</h2>
          <Field id="public-page-slug" label="Link da sua página">
            <div className="flex items-center gap-1">
              <span className="whitespace-nowrap text-[13px] text-muted">{domainLabel}/agendar/</span>
              <Input
                id="public-page-slug"
                value={slug}
                onChange={(e) => setSlug(e.target.value.toLowerCase())}
                placeholder="studio-aurora"
              />
            </div>
          </Field>
          {slugStatus === 'checking' && <p className="text-[13px] text-muted">Verificando disponibilidade...</p>}
          {slugStatus === 'available' && (
            <p className="flex items-center gap-1 text-[13px] font-semibold text-success">
              <Check className="h-4 w-4" aria-hidden="true" /> Disponível
            </p>
          )}
          {slugStatus === 'taken' && <p className="text-[13px] font-semibold text-danger">Este link já está em uso</p>}
          {slugStatus === 'invalid' && (
            <p className="text-[13px] font-semibold text-danger">Use apenas letras minúsculas, números e hífen (mín. 3 caracteres)</p>
          )}
        </Card>

        <Card className="flex flex-col gap-3">
          <h2 className="text-[15px] font-bold text-ink">Recebimento do sinal via Pix</h2>
          <Field id="pix-key-type" label="Tipo de chave">
            <Select
              id="pix-key-type"
              value={pixKeyType ?? 'telefone'}
              onChange={(e) => setPixKeyType(e.target.value as PublicPageSettings['pixKeyType'])}
            >
              {PIX_KEY_TYPES.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </Select>
          </Field>
          <Field id="pix-key" label="Chave Pix">
            <Input id="pix-key" value={pixKey} onChange={(e) => setPixKey(e.target.value)} />
          </Field>
        </Card>

        {savedMessage && <p className="text-sm text-whatsapp">{savedMessage}</p>}
        {errorMessage && (
          <p role="alert" className="text-sm text-danger">
            {errorMessage}
          </p>
        )}

        <Button type="button" onClick={submit} loading={saving} className="self-start">
          {saving ? 'Salvando...' : 'Salvar alterações'}
        </Button>
      </div>

      <Card className="w-full shrink-0 lg:w-80">
        <p className="mb-3 text-[13px] font-semibold text-muted">PRÉVIA AO VIVO</p>
        <div className="overflow-hidden rounded-control border border-line">
          <div className="flex flex-col items-center gap-2 p-5 text-center" style={{ backgroundColor: `${brandColor}1a` }}>
            <div className="flex h-14 w-14 items-center justify-center overflow-hidden rounded-full border border-line bg-surface">
              {logoUrl ? (
                <Image src={logoUrl} alt="" width={56} height={56} className="h-full w-full object-cover" unoptimized />
              ) : (
                <span className="text-xs text-muted">Logo</span>
              )}
            </div>
            <p className="font-bold text-ink">{businessName || 'Seu negócio'}</p>
            <span
              className="rounded-full px-3 py-1 text-[13px] font-bold text-on-brand"
              style={{ backgroundColor: brandColor }}
            >
              Agendar horário
            </span>
          </div>
          {galleryPhotos.length > 0 && (
            <div className="grid grid-cols-3 gap-0.5 p-0.5">
              {galleryPhotos.slice(0, 3).map((url) => (
                <div key={url} className="relative aspect-square">
                  <Image src={url} alt="" fill unoptimized className="object-cover" />
                </div>
              ))}
            </div>
          )}
          <p className="p-3 text-center text-[13px] text-muted">{domainLabel}{publicPath}</p>
        </div>
      </Card>
    </div>
  );
}
