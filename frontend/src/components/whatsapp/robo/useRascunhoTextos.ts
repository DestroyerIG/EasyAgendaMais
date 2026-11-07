import { useCallback, useMemo, useState } from 'react';
import type { TextoDto } from '@/lib/roboTextos';

/**
 * Edições ainda não salvas de uma lista de textos. Guarda só o que difere do valor salvo,
 * então `alteracoes` já sai pronto para o PUT: igual ao padrão vira `null`.
 */
export function useRascunhoTextos(textos: TextoDto[]) {
  const [edicoes, setEdicoes] = useState<Record<string, string>>({});

  const valorDe = useCallback((t: TextoDto) => edicoes[t.chave] ?? t.valor, [edicoes]);

  const mudar = useCallback((t: TextoDto, valor: string) => {
    setEdicoes((atual) => {
      const proximo = { ...atual };
      if (valor === t.valor) delete proximo[t.chave];
      else proximo[t.chave] = valor;
      return proximo;
    });
  }, []);

  const restaurar = useCallback((t: TextoDto) => mudar(t, t.padrao), [mudar]);

  const descartar = useCallback(() => setEdicoes({}), []);

  const alteradas = useMemo(() => textos.filter((t) => edicoes[t.chave] !== undefined), [textos, edicoes]);

  const alteracoes = useMemo(() => {
    const saida: Record<string, string | null> = {};
    for (const t of alteradas) saida[t.chave] = edicoes[t.chave] === t.padrao ? null : edicoes[t.chave];
    return saida;
  }, [alteradas, edicoes]);

  /** Campo que não pode ficar em branco foi esvaziado. */
  const invalido = alteradas.some((t) => !t.permiteVazio && edicoes[t.chave].trim() === '');

  return { valorDe, mudar, restaurar, descartar, alteracoes, temAlteracoes: alteradas.length > 0, invalido };
}
