'use client';

import { useEffect, useState } from 'react';
import { depoimentosApi } from '@/lib/depoimentos';
import { AvaliarSistemaModal } from './AvaliarSistemaModal';

const MARCA_SESSAO = 'easyagenda:depoimentoVisto';

// Pede a avaliação do sistema à dona, no máximo uma consulta por sessão.
export function PedidoDepoimento() {
  const [aberto, setAberto] = useState(false);

  useEffect(() => {
    try {
      if (window.sessionStorage.getItem(MARCA_SESSAO) === '1') return;
    } catch {
      /* sem sessionStorage: consulta mesmo assim */
    }
    let cancelado = false;
    depoimentosApi
      .meu()
      .then((meu) => {
        if (cancelado) return;
        // A marca só vale depois de uma consulta concluída (o StrictMode roda o efeito 2x em dev).
        try {
          window.sessionStorage.setItem(MARCA_SESSAO, '1');
        } catch {
          /* ignora */
        }
        if (!meu.mostrarPopup) return;
        // Não atravessa outro diálogo aberto: não abre nesta sessão.
        if (document.querySelector('[role="dialog"]')) return;
        setAberto(true);
      })
      .catch(() => {});
    return () => { cancelado = true; };
  }, []);

  return aberto ? <AvaliarSistemaModal isOpen origem="popup" onClose={() => setAberto(false)} /> : null;
}
