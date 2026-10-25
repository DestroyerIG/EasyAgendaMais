import { describe, it, expect } from 'vitest';
import { iconeDoServico, ICONE_SERVICO_PADRAO } from '../iconeServico';

describe('ícone do serviço pelo nome', () => {
  it.each([
    ['Manicure', 'brush'],
    ['Esmaltação em gel', 'brush'],
    ['Extensão de cílios', 'visibility'],
    ['Design de sobrancelha com henna', 'face'],
    ['Barba', 'face_6'],
    ['Corte + barba', 'face_6'],
    ['Maquiagem social', 'palette'],
    ['Depilação a cera', 'self_care'],
    ['Limpeza de pele', 'spa'],
    ['Coloração', 'colorize'],
    ['Escova progressiva', 'air'],
    ['Corte feminino', 'content_cut'],
    ['Degradê', 'content_cut'],
  ])('%s', (nome, icone) => {
    expect(iconeDoServico(nome)).toBe(icone);
  });

  it('nome sem pista: ícone genérico', () => {
    expect(iconeDoServico('Pacote noiva')).toBe(ICONE_SERVICO_PADRAO);
  });
});
