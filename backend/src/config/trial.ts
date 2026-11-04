// Prazos do teste grátis, em dias. Fonte única do backend; o frontend (lib/constants.ts) tem um teste de igualdade.
// Sem cartão: 7 dias desde o cadastro. Com o cartão cadastrado: 14 dias desde o cadastro.
export const TESTE_SEM_CARTAO_DIAS = 7;
export const TESTE_COM_CARTAO_DIAS = 14;

const MS_DIA = 24 * 60 * 60 * 1000;

/** Fim do teste com cartão: 14 dias do cadastro, sem encurtar um teste já estendido (SuperAdmin). */
export function fimDoTesteComCartao(criadoEm: Date, fimAtual: Date | null): Date {
  const quatorze = new Date(criadoEm.getTime() + TESTE_COM_CARTAO_DIAS * MS_DIA);
  return fimAtual && fimAtual.getTime() > quatorze.getTime() ? fimAtual : quatorze;
}
