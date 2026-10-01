import { describe, it, expect } from 'vitest';
import { findColorViolations } from '../colorRules';

describe('findColorViolations', () => {
  it.each([
    'bg-black',
    'hover:bg-white/10',
    'text-white',
    'text-gray-400',
    'border-primary/30',
    'text-primary',
    'bg-dark-light',
    'from-dark-light',
    'from-emerald-500/10',
    'bg-[#FF7A00]',
    'text-[rgba(0,0,0,0.5)]',
    'bg-[radial-gradient(circle_at_top,_rgba(255,122,0,0.2),_transparent)]',
    'focus-visible:ring-offset-zinc-950',
  ])('aponta %s', (className) => {
    const result = findColorViolations(`<div className="p-4 ${className}" />`);
    expect(result.map((v) => v.match)).toContain(className.replace(/^[a-z-]+:/, ''));
  });

  it.each([
    'bg-bg',
    'bg-surface',
    'bg-surface-2',
    'text-ink',
    'text-muted',
    'border-line',
    'bg-brand/12',
    'text-on-brand',
    'text-brand-text',
    'bg-whatsapp',
    'text-status-confirmed',
    'bg-scrim/50',
    'rounded-card',
    'bg-surface-m3',
    'text-brand-text-m3',
    'text-tertiary',
    'bg-tertiary-container/30',
  ])('aceita %s', (className) => {
    expect(findColorViolations(`<div className="${className}" />`)).toEqual([]);
  });

  it('informa o número da linha', () => {
    const source = ['const a = 1;', '<p className="text-gray-500">x</p>'].join('\n');
    expect(findColorViolations(source)).toEqual([{ line: 2, match: 'text-gray-500' }]);
  });
});
