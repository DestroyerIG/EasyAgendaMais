import { describe, expect, it } from 'vitest';
import { materialIcon } from '../materialIconAdapter';

describe('materialIcon', () => {
  it('devolve o mesmo componente para o mesmo nome/preenchimento (cache, M2 da revisão final)', () => {
    expect(materialIcon('group')).toBe(materialIcon('group'));
    expect(materialIcon('calendar_month', true)).toBe(materialIcon('calendar_month', true));
  });

  it('nome igual com preenchimento diferente não compartilha o cache', () => {
    expect(materialIcon('star', false)).not.toBe(materialIcon('star', true));
  });

  it('nomes diferentes nunca compartilham o cache', () => {
    expect(materialIcon('add')).not.toBe(materialIcon('group'));
  });
});
