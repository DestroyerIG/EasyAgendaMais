'use client';

import { useEffect, useState } from 'react';
import { useTheme } from 'next-themes';

export const THEME_COLOR_TOKENS = ['brand', 'success', 'danger', 'warning', 'muted', 'line', 'ink', 'surface', 'status-confirmed'] as const;
export type ThemeColorToken = (typeof THEME_COLOR_TOKENS)[number];
export type ThemeColors = Record<ThemeColorToken, string>;

const readFromDocument = (cssVar: string) => getComputedStyle(document.documentElement).getPropertyValue(cssVar);

// Gráficos (Recharts) precisam de cores concretas; esta função lê os tokens do tema ativo.
export function readThemeColors(getValue: (cssVar: string) => string = readFromDocument): ThemeColors {
  return Object.fromEntries(
    THEME_COLOR_TOKENS.map((token) => {
      const channels = getValue(`--color-${token}`).trim();
      return [token, channels ? `rgb(${channels})` : ''];
    }),
  ) as ThemeColors;
}

export function useThemeColors(): ThemeColors | null {
  const { resolvedTheme } = useTheme();
  const [colors, setColors] = useState<ThemeColors | null>(null);

  useEffect(() => {
    setColors(readThemeColors());
  }, [resolvedTheme]);

  return colors;
}
