'use client';

import { useRef, useState, type ChangeEvent } from 'react';
import Image from 'next/image';
import { useToast } from '@/components/Toast';
import { Button, Card } from '@/components/ui';
import { useAuth } from '@/contexts/AuthContext';
import { businessPublicPageApi } from '@/lib/businessPublicPage';
import { getApiErrorMessage } from '@/utils/handleApiError';

/**
 * Logo do negócio: a mesma da página pública, mostrada também no avatar do painel.
 * O envio já salva (sem botão extra) e atualiza a sessão para o avatar mudar na hora.
 */
export function LogoNegocioCard() {
  const { user, refreshMe } = useAuth();
  const { showToast } = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [enviando, setEnviando] = useState(false);
  const logoUrl = user?.logoUrl ?? null;

  const handleChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const arquivo = event.target.files?.[0];
    if (!arquivo) return;

    setEnviando(true);
    try {
      const url = await businessPublicPageApi.uploadImage(arquivo);
      await businessPublicPageApi.updateSettings({ logoUrl: url });
      await refreshMe();
      showToast('Logo atualizada.', 'success');
    } catch (error: unknown) {
      showToast(getApiErrorMessage(error, 'Falha ao enviar a imagem. Tente novamente.'), 'error');
    } finally {
      setEnviando(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  return (
    <Card className="flex flex-col gap-3">
      <div>
        <h2 className="text-lg font-bold text-ink">Logo ou foto do seu negócio</h2>
        <p className="mt-1 text-[15px] text-muted">
          Aparece no painel e na sua página de agendamento. É a mesma imagem nos dois lugares.
        </p>
      </div>
      <div className="flex items-center gap-4">
        <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-full border border-line bg-surface-2">
          {logoUrl ? (
            <Image src={logoUrl} alt="Logo do negócio" width={64} height={64} className="h-full w-full object-cover" unoptimized />
          ) : (
            <span className="text-xs text-muted">Logo</span>
          )}
        </div>
        <div className="flex flex-col gap-1">
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            className="hidden"
            aria-label="Enviar logo"
            onChange={handleChange}
          />
          <Button type="button" variant="secondary" size="sm" loading={enviando} onClick={() => inputRef.current?.click()}>
            {enviando ? 'Enviando...' : logoUrl ? 'Trocar foto' : 'Enviar logo'}
          </Button>
          <p className="text-[13px] text-muted">PNG, JPG ou WebP, até 4MB</p>
        </div>
      </div>
    </Card>
  );
}
