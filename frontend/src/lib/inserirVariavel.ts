/**
 * Insere `{nome}` no lugar da seleção [inicio, fim) e devolve o texto novo e a posição do cursor
 * logo depois da variável. Devolve null quando o resultado passaria do limite.
 */
export function inserirVariavel(
  texto: string, inicio: number, fim: number, nome: string, limite: number,
): { texto: string; cursor: number } | null {
  const token = `{${nome}}`;
  const novo = texto.slice(0, inicio) + token + texto.slice(fim);
  if (novo.length > limite) return null;
  return { texto: novo, cursor: inicio + token.length };
}
