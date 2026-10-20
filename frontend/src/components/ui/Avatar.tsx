'use client';

import { useEffect, useState } from 'react';
import { cn } from '@/lib/cn';

export function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  const first = parts[0][0];
  const last = parts.length > 1 ? parts[parts.length - 1][0] : '';
  return `${first}${last}`.toUpperCase();
}

export interface AvatarProps {
  name: string;
  src?: string | null;
  size?: number;
  className?: string;
}

export function Avatar({ name, src, size = 32, className }: AvatarProps) {
  const style = { width: size, height: size };
  const [falhou, setFalhou] = useState(false);
  // Endereço novo (ex.: foto renovada) volta a tentar a imagem.
  useEffect(() => { setFalhou(false); }, [src]);

  if (src && !falhou) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt={name}
        style={style}
        referrerPolicy="no-referrer"
        onError={() => setFalhou(true)}
        className={cn('shrink-0 rounded-full object-cover', className)}
      />
    );
  }

  return (
    <span
      role="img"
      aria-label={name}
      style={style}
      className={cn('inline-flex shrink-0 items-center justify-center rounded-full bg-surface-2 text-[13px] font-semibold text-ink', className)}
    >
      {getInitials(name)}
    </span>
  );
}
