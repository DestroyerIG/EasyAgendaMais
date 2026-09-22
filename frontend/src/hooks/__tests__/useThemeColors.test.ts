import { describe, it, expect } from 'vitest';
import { THEME_COLOR_TOKENS, readThemeColors } from '../useThemeColors';

describe('readThemeColors', () => {
  it('converte as variáveis do tema em cores rgb', () => {
    const values: Record<string, string> = { '--color-brand': ' 255 122 0 ', '--color-success': '22 163 74' };
    const colors = readThemeColors((name) => values[name] ?? '');
    expect(colors.brand).toBe('rgb(255 122 0)');
    expect(colors.success).toBe('rgb(22 163 74)');
  });

  it('token ausente vira string vazia', () => {
    const colors = readThemeColors(() => '');
    expect(colors.danger).toBe('');
  });

  it('cobre os tokens usados pelos gráficos', () => {
    expect(THEME_COLOR_TOKENS).toEqual(['brand', 'success', 'danger', 'warning', 'muted', 'line', 'ink', 'surface', 'status-confirmed']);
  });
});
