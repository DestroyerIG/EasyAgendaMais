'use client';

import { Icon } from '@/components/ui';
import { useToast } from '@/components/Toast';
import { AVISO_RECURSO_A_CAMINHO } from './PainelPendencias';

// Botão flutuante "Cobrar Pix" (hoje-mobile.html): só existe no celular — o
// desktop não tem esse botão. Posição/tamanho do arquivo (bottom-20 right-4,
// h-12, z-40); somo a área segura do aparelho ao bottom-20 (a mesma
// env(safe-area-inset-bottom) que BottomNav.tsx já usa) para nunca encostar na
// barra inferior em aparelhos com notch — a barra inferior original do arquivo
// não soma essa folga, e é exatamente o tipo de sobreposição citado no pedido.
export function BotaoCobrarPix() {
  const { showToast } = useToast();

  return (
    <button
      type="button"
      onClick={() => showToast(AVISO_RECURSO_A_CAMINHO, 'info')}
      className="fixed bottom-[calc(5rem_+_env(safe-area-inset-bottom))] right-4 z-40 flex h-12 items-center gap-2 rounded-full bg-ink px-4 text-bg shadow-lg transition-transform active:scale-95 lg:hidden"
    >
      <Icon name="qr_code_scanner" size={20} className="text-brand" />
      <span className="text-[13px] font-bold">Cobrar Pix</span>
    </button>
  );
}
