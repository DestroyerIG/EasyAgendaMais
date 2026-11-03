import { describe, expect, it } from 'vitest';
import { CATALOGO_PLANOS, planoDoCatalogo, rotuloEquipe } from '@/lib/planCatalog';
// O build isolado do frontend (Docker) não tem a pasta backend; o teste roda com o repositório inteiro.
// eslint-disable-next-line @typescript-eslint/ban-ts-comment -- com o repositório inteiro não há erro, então @ts-expect-error quebraria
// @ts-ignore
import { getPlanCatalog } from '../../../../backend/src/config/planCatalog';

describe('catálogo de planos do frontend', () => {
  it('a cópia do frontend é igual ao catálogo do backend', () => {
    expect(CATALOGO_PLANOS).toEqual(getPlanCatalog());
  });

  it('rotuloEquipe', () => {
    expect(rotuloEquipe(null)).toBe('Profissionais ilimitadas');
    expect(rotuloEquipe(1)).toBe('1 profissional');
    expect(rotuloEquipe(5)).toBe('Até 5 profissionais');
  });

  it('nenhum plano promete suporte prioritário', () => {
    const textos = [
      ...CATALOGO_PLANOS.planos.flatMap((p) => [...p.destaques, ...p.emBreve]),
      ...CATALOGO_PLANOS.matriz.map((r) => r.titulo),
    ];
    expect(textos.some((t) => /Suporte prioritário/.test(t))).toBe(false);
  });

  it('lista de espera e campanhas aparecem no Solo', () => {
    expect(planoDoCatalogo('basico').destaques).toEqual(expect.arrayContaining(['Lista de espera', 'Campanhas']));
  });
});
