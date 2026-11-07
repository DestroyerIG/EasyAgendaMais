'use client';

import type { TextoDto } from '@/lib/roboTextos';
import { CampoMensagem } from './CampoMensagem';
import type { useRascunhoTextos } from './useRascunhoTextos';

interface OpcaoMenuProps {
  /** Mensagens do caminho da opção, na ordem da conversa. */
  textos: TextoDto[];
  rascunho: ReturnType<typeof useRascunhoTextos>;
}

/** As mensagens que o robô envia no caminho de uma opção do menu (dentro do editor da opção). */
export function OpcaoMenu({ textos, rascunho }: OpcaoMenuProps) {
  if (textos.length === 0) return null;
  return (
    <section aria-labelledby="opcao-mensagens-titulo" className="flex flex-col gap-4 border-t border-line pt-4">
      <div className="flex flex-col gap-1">
        <h4 id="opcao-mensagens-titulo" className="text-[15px] font-bold text-ink">Mensagens desta opção</h4>
        <p className="text-[13px] text-muted">Na ordem em que a conversa acontece.</p>
      </div>
      {textos.map((t) => (
        <CampoMensagem
          key={t.chave}
          texto={t}
          valor={rascunho.valorDe(t)}
          onMudar={(v) => rascunho.mudar(t, v)}
          onRestaurar={() => rascunho.restaurar(t)}
        />
      ))}
    </section>
  );
}
