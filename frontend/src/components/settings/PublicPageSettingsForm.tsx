'use client';

import { useEffect, useState } from 'react';
import { businessPublicPageApi, type PublicPageSettings } from '@/lib/businessPublicPage';

const PIX_KEY_TYPES: { value: NonNullable<PublicPageSettings['pixKeyType']>; label: string }[] = [
  { value: 'cpf', label: 'CPF' },
  { value: 'cnpj', label: 'CNPJ' },
  { value: 'email', label: 'E-mail' },
  { value: 'telefone', label: 'Telefone' },
  { value: 'aleatoria', label: 'Chave aleatória' },
];

export function PublicPageSettingsForm() {
  const [settings, setSettings] = useState<PublicPageSettings | null>(null);
  const [slug, setSlug] = useState('');
  const [pixKey, setPixKey] = useState('');
  const [pixKeyType, setPixKeyType] = useState<PublicPageSettings['pixKeyType']>('telefone');
  const [saving, setSaving] = useState(false);
  const [savedMessage, setSavedMessage] = useState<string | null>(null);

  useEffect(() => {
    businessPublicPageApi.getSettings().then((data) => {
      setSettings(data);
      setSlug(data.slug ?? '');
      setPixKey(data.pixKey ?? '');
      setPixKeyType(data.pixKeyType ?? 'telefone');
    });
  }, []);

  const submit = async () => {
    setSaving(true);
    setSavedMessage(null);
    try {
      const updated = await businessPublicPageApi.updateSettings({ slug, pixKey, pixKeyType: pixKeyType ?? undefined });
      setSettings(updated);
      setSavedMessage('Configurações salvas.');
    } finally {
      setSaving(false);
    }
  };

  if (!settings) return <div className="p-6 text-muted">Carregando...</div>;

  return (
    <div className="flex max-w-lg flex-col gap-4 p-6">
      <label className="flex flex-col gap-1 text-sm font-semibold text-ink">
        Link da sua página
        <input
          id="public-page-slug"
          aria-label="Link da sua página"
          value={slug}
          onChange={(e) => setSlug(e.target.value)}
          placeholder="studio-aurora"
          className="rounded-lg border border-line p-3"
        />
      </label>

      <label className="flex flex-col gap-1 text-sm font-semibold text-ink">
        Tipo de chave
        <select
          aria-label="Tipo de chave"
          value={pixKeyType ?? 'telefone'}
          onChange={(e) => setPixKeyType(e.target.value as PublicPageSettings['pixKeyType'])}
          className="rounded-lg border border-line p-3"
        >
          {PIX_KEY_TYPES.map((t) => (
            <option key={t.value} value={t.value}>{t.label}</option>
          ))}
        </select>
      </label>

      <label className="flex flex-col gap-1 text-sm font-semibold text-ink">
        Chave Pix
        <input
          aria-label="Chave Pix"
          value={pixKey}
          onChange={(e) => setPixKey(e.target.value)}
          className="rounded-lg border border-line p-3"
        />
      </label>

      {savedMessage && <p className="text-sm text-whatsapp">{savedMessage}</p>}

      <button
        type="button"
        onClick={submit}
        disabled={saving}
        className="rounded-lg bg-brand px-4 py-3 font-bold text-on-brand disabled:opacity-60"
      >
        {saving ? 'Salvando...' : 'Salvar'}
      </button>
    </div>
  );
}
