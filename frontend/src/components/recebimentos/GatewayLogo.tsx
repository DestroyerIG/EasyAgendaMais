/* eslint-disable @next/next/no-img-element -- logo estática dos kits de marca, sem otimização */
'use client';

import { useState } from 'react';
import { cn } from '@/lib/cn';

// Logo oficial do gateway. Se a imagem faltar ou falhar, mostra o nome em texto.
export function GatewayLogo({ nome, logo, className }: { nome: string; logo: string; className?: string }) {
  const [falhou, setFalhou] = useState(false);
  if (falhou) return <span className={cn('text-[15px] font-bold text-ink', className)}>{nome}</span>;
  // Fundo branco fixo: as logos oficiais são feitas para fundo claro, mesmo no tema escuro.
  return (
    <img
      src={logo}
      alt={nome}
      className={cn('h-10 w-auto max-w-[10rem] rounded-control bg-white object-contain px-2 py-1', className)}
      onError={() => setFalhou(true)}
    />
  );
}
