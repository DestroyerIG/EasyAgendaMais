import type { PlanId } from '../types/domain.js';
import { AppError } from '../utils/errors.js';
import { PLAN_CATALOG, VALOR_SALAO_LEGADO } from './planCatalog.js';

// Valor mensal que um negócio paga em cada plano. Solo e Equipe têm preço fixo no catálogo; o Salão é
// sob consulta: vale o valor combinado com o dono da plataforma (metadata.valorMensalCombinado, definido
// pelo SuperAdmin). Quem já estava no Salão antes disso continua no valor antigo até ter um combinado.
export { VALOR_SALAO_LEGADO };

type NegocioComValor = { plan?: unknown; metadata?: unknown; [campo: string]: unknown };

export class SalaoSobConsultaError extends AppError {
  constructor() {
    super('O plano Salão é sob consulta. Fale com a gente para combinar o valor.', 409, 'SALAO_SOB_CONSULTA');
  }
}

export const valorCombinadoDe = (metadata: unknown): number | null => {
  const valor = (metadata as { valorMensalCombinado?: unknown } | null)?.valorMensalCombinado;
  const n = typeof valor === 'number' ? valor : Number(valor);
  return Number.isFinite(n) && n > 0 ? n : null;
};

export function valorMensal(negocio: NegocioComValor, plano: PlanId): number | null {
  const fixo = PLAN_CATALOG[plano]?.preco;
  if (typeof fixo === 'number') return fixo;
  return valorCombinadoDe(negocio.metadata) ?? (negocio.plan === plano ? VALOR_SALAO_LEGADO : null);
}

/** Valor mensal do plano ou o erro de "sob consulta" (assinar e fazer upgrade). */
export function valorMensalOuErro(negocio: NegocioComValor, plano: PlanId): number {
  const valor = valorMensal(negocio, plano);
  if (valor === null) throw new SalaoSobConsultaError();
  return valor;
}
