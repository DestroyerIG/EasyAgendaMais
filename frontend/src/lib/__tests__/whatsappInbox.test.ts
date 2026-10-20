import { describe, it, expect, vi, beforeEach } from 'vitest';

const get = vi.fn();
vi.mock('@/lib/api', () => ({ default: { get: (...a: unknown[]) => get(...a), post: vi.fn() } }));

import { horaCurta, formatarTelefone, formatarTelefoneLocal, listarConversas } from '../whatsappInbox';

describe('horaCurta', () => {
  // 16/10/2026 15:00 UTC = 12:00 em São Paulo
  const agora = new Date('2026-10-16T15:00:00Z');

  it('mostra a hora no fuso de São Paulo quando é hoje', () => {
    expect(horaCurta('2026-10-16T13:42:00Z', agora)).toBe('10:42');
  });

  it('mostra "Ontem" para o dia anterior', () => {
    expect(horaCurta('2026-10-15T18:00:00Z', agora)).toBe('Ontem');
  });

  it('mostra dia/mês para datas mais antigas', () => {
    expect(horaCurta('2026-10-14T18:00:00Z', agora)).toBe('14/10');
  });

  it('converte para São Paulo antes de comparar o dia (02:00Z de 16/10 ainda é 15/10 lá)', () => {
    expect(horaCurta('2026-10-16T02:00:00Z', agora)).toBe('Ontem');
  });
});

describe('formatarTelefone', () => {
  it('formata celular com 55', () => {
    expect(formatarTelefone('5583998765432')).toBe('+55 (83) 99876-5432');
  });
  it('formata fixo/8 dígitos sem 55', () => {
    expect(formatarTelefone('8398765432')).toBe('+55 (83) 9876-5432');
  });
});

describe('formatarTelefoneLocal', () => {
  it('tira o +55', () => {
    expect(formatarTelefoneLocal('5583998765432')).toBe('(83) 99876-5432');
  });
  it('número fora do padrão volta como veio', () => {
    expect(formatarTelefoneLocal('123')).toBe('123');
  });
});

describe('listarConversas', () => {
  beforeEach(() => get.mockReset());

  it('chama a rota só com o filtro quando não há cursor', async () => {
    get.mockResolvedValue({ data: { itens: [] } });
    await listarConversas('aguardando');
    expect(get).toHaveBeenCalledWith('/whatsapp/conversations', { params: { filtro: 'aguardando' } });
  });

  it('inclui o cursor quando informado', async () => {
    get.mockResolvedValue({ data: { itens: [] } });
    await listarConversas('todas', '2026-10-16T10:00:00.000Z');
    expect(get).toHaveBeenCalledWith('/whatsapp/conversations', {
      params: { filtro: 'todas', cursor: '2026-10-16T10:00:00.000Z' },
    });
  });
});
