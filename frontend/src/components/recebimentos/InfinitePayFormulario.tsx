'use client';

import { useState, type FormEvent } from 'react';
import { Banner, Button, Input } from '@/components/ui';
import { recebimentosApi, type EstadoRecebimentos } from '@/lib/recebimentos';
import { getApiErrorMessage } from '@/utils/handleApiError';

// Formulário da InfinitePay (InfiniteTag + chave de API + aceite), usado em Recebimentos e no onboarding.

const rotulo = 'block text-[14px] font-semibold text-ink';

export function InfinitePayFormulario({ onConectado }: { onConectado: (estado: EstadoRecebimentos) => void }) {
  const [handle, setHandle] = useState('');
  const [chave, setChave] = useState('');
  const [aceite, setAceite] = useState(false);
  const [conectando, setConectando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const conectar = async (e: FormEvent) => {
    e.preventDefault();
    setConectando(true);
    setErro(null);
    try {
      const novo = await recebimentosApi.conectarChave({ handle: handle.trim(), chave: chave.trim(), aceite: true });
      setChave('');
      setHandle('');
      setAceite(false);
      onConectado(novo);
    } catch (err) {
      setErro(getApiErrorMessage(err, 'Não foi possível conectar a InfinitePay. Tente de novo.'));
    } finally {
      setConectando(false);
    }
  };

  return (
    <form onSubmit={conectar} className="space-y-3">
      <div className="space-y-1">
        <label htmlFor="infinitepay-handle" className={rotulo}>InfiniteTag</label>
        <Input
          id="infinitepay-handle"
          value={handle}
          onChange={(e) => setHandle(e.target.value)}
          placeholder="$sua-infinitetag"
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
        />
      </div>
      <div className="space-y-1">
        <label htmlFor="infinitepay-chave" className={rotulo}>Chave de API</label>
        <Input
          id="infinitepay-chave"
          type="password"
          value={chave}
          onChange={(e) => setChave(e.target.value)}
          autoComplete="off"
          spellCheck={false}
        />
      </div>
      <label className="flex min-h-11 items-start gap-2 text-[14px] text-ink">
        <input type="checkbox" checked={aceite} onChange={(e) => setAceite(e.target.checked)} className="mt-1 h-4 w-4 shrink-0" />
        <span>Li os avisos acima e entendo as taxas, o parcelamento e que o cliente pode contestar a compra no cartão.</span>
      </label>
      {erro ? <Banner tone="danger" variant="inline">{erro}</Banner> : null}
      <Button type="submit" disabled={!aceite || !handle.trim() || !chave.trim()} loading={conectando}>Conectar</Button>
    </form>
  );
}
