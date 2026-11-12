import { buildPixPayload } from '../../utils/pixPayload.js';
import logger from '../../utils/logger.js';

type PixKeyType = Parameters<typeof buildPixPayload>[0]['pixKeyType'];

/** Código Pix manual (chave do negócio). Nulo se o negócio não tem chave ou o valor não vale. */
export const pixManual = (
  business: { name: string; pixKey: string | null; pixKeyType: string | null },
  valor: number,
  servico: string,
): string | null => {
  if (!business.pixKey || !business.pixKeyType || valor <= 0) return null;
  try {
    return buildPixPayload({
      pixKey: business.pixKey, pixKeyType: business.pixKeyType as PixKeyType,
      merchantName: business.name, merchantCity: 'BRASIL', amount: valor, description: `Sinal - ${servico}`,
    });
  } catch (err) {
    logger.warn({ err }, 'Falha ao montar o código Pix manual');
    return null;
  }
};

export interface SinalPadrao { ativo: boolean; pct: number | null }

/**
 * Porcentagem de sinal que vale para o serviço: a do próprio serviço prevalece (inclusive 0, que é
 * "este serviço não pede sinal"); sem porcentagem própria (null) vale a geral do negócio, se ligada.
 */
export const percentualDoSinal = (servicoPct: number | null | undefined, padrao: SinalPadrao): number => {
  if (servicoPct !== null && servicoPct !== undefined) return servicoPct;
  return padrao.ativo && padrao.pct && padrao.pct > 0 ? padrao.pct : 0;
};

export const calcDeposit = (price: number, depositPercentage: number): number =>
  Math.round(price * (depositPercentage / 100) * 100) / 100;
